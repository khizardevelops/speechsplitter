#!/usr/bin/env node
/**
 * The `speechsplitter` command, powered by the `langchunk` package.
 *
 * docs/UpdatedPlan.md §14 Stage 2: "the first point you have a tool you actually
 * use. Dogfooding on real text is where accuracy bugs surface that no fixture
 * anticipates."
 *
 * Argument parsing is `commander` rather than hand-rolled — help text, error
 * messages, and subcommand plumbing are solved problems and this is a Node-only
 * binary with no bundle budget to protect.
 */

import { readFile, writeFile } from "node:fs/promises";
import { Command } from "commander";
import { listPacks, resolveLanguage } from "langchunk/lang";
import { installLanguagePlugins } from "langchunk/lang-node";
import { checkIntegrity } from "langchunk/validators";
import type { Analyzer } from "langchunk/schema";
import { StanzaAnalyzer } from "langchunk/analyzers/stanza";
import { AgreementAnalyzer } from "langchunk/analyzers/agreement";
import { OnnxAnalyzer } from "langchunk/analyzers/onnx";
import { resolve } from "node:path";
import { parseText } from "langchunk/pipeline";
import { render, type Format } from "./render.js";

const FORMATS: readonly Format[] = [
  "text",
  "outline",
  "json",
  "conllu",
  "csv",
  "jsonl",
  "anki",
  "anki-clauses",
  "anki-sentences",
];

const program = new Command();

program
  .name("speechsplitter")
  .description(
    "Break text into sentences, clauses, phrases, and words — with every unit " +
      "traceable back to the exact characters it came from.",
  )
  .version("4.0.0");

program
  .command("parse", { isDefault: true })
  .argument("[file]", "file to parse; omit to read standard input")
  .option("-l, --lang <code>", "BCP-47 language code; detected from script if omitted")
  .option("-f, --format <format>", `output format (${FORMATS.join(", ")})`, "text")
  .option("-o, --out <file>", "write to a file instead of standard output")
  .option("--no-cache", "re-run the analyzer instead of reusing cached output")
  .option("--check", "verify the result against the schema and report violations")
  .option(
    "--confidence <mode>",
    "'none' (default) or 'agreement' — a second analyzer supplies calibrated confidence",
    "none",
  )
  .option("--models <dir>", "directory of converted ONNX models", "models")
  .action(async (file: string | undefined, options: ParseCommandOptions) => {
    const format = options.format;
    if (!FORMATS.includes(format)) {
      fail(`unknown format ${JSON.stringify(format)}; expected one of ${FORMATS.join(", ")}`);
    }

    const text = file !== undefined ? await readFile(file, "utf8") : await readStdin();
    if (text.trim().length === 0) fail("no input text");

    let analyzer: Analyzer = new StanzaAnalyzer({ cache: options.cache });

    if (options.confidence === "agreement") {
      // Stanza reports no per-token probability, so without a second opinion
      // every unit renders as `high` regardless of how uncertain it is. This
      // costs one extra parse and makes the number mean something.
      const code = options.lang ?? resolveLanguage(text)?.pack.code;
      if (code === undefined) fail("could not determine the language for --confidence agreement");
      const secondary = await OnnxAnalyzer.load({
        modelDir: resolve(options.models, code),
      });
      analyzer = new AgreementAnalyzer({ primary: analyzer, secondary });
    } else if (options.confidence !== "none") {
      fail(`unknown --confidence ${JSON.stringify(options.confidence)}; expected none or agreement`);
    }

    const result = await parseText({
      text,
      analyzer,
      ...(options.lang !== undefined ? { lang: options.lang } : {}),
    });

    if (options.check === true) {
      const violations = checkIntegrity(result.document);
      if (violations.length > 0) {
        process.stderr.write(`${violations.length} integrity violation(s):\n`);
        for (const violation of violations.slice(0, 20)) {
          process.stderr.write(`  [${violation.rule}] ${violation.subject}: ${violation.detail}\n`);
        }
        process.exitCode = 1;
      } else {
        process.stderr.write("integrity: ok\n");
      }
    }

    // JSON Lines already ends every record with a newline; adding another would
    // put a blank line at the end of the file, which line-oriented consumers
    // read as a malformed record.
    const output = render(result.document, format);
    const terminated = output.endsWith("\n") ? output : `${output}\n`;
    if (options.out !== undefined) {
      await writeFile(options.out, terminated, "utf8");
      process.stderr.write(`wrote ${options.out}\n`);
    } else {
      process.stdout.write(terminated);
    }
  });

program
  .command("languages")
  .description("list the installed language packs, built-in and plugin alike")
  .action(() => {
    for (const pack of listPacks()) {
      // The source column is the point of the command once plugins exist: two
      // packs can claim one code, and knowing which file won is the difference
      // between a five-minute fix and an afternoon.
      process.stdout.write(
        `${pack.code.padEnd(6)} ${pack.name.padEnd(14)} ${pack.tier.padEnd(22)} ` +
          `${pack.scripts.join(",").padEnd(6)} ${pack.source}\n`,
      );
    }
  });

program
  .command("detect")
  .argument("[file]", "file to inspect; omit to read standard input")
  .description("report which language pack would be used, and why")
  .action(async (file: string | undefined) => {
    const text = file !== undefined ? await readFile(file, "utf8") : await readStdin();
    // No fallback here: `detect` answers "what did the script tell you", and a
    // fallback pack would answer a question that was not asked.
    const resolution = resolveLanguage(text, undefined, { fallback: false });
    if (resolution === undefined) {
      fail("could not detect a language from the script; pass --lang");
    }
    process.stdout.write(
      `${resolution.pack.code} (${resolution.pack.name}, ${resolution.resolution}, tier ${resolution.pack.tier})\n`,
    );
    if (resolution.alternatives !== undefined && resolution.alternatives.length > 0) {
      process.stdout.write(
        `  ambiguous: ${resolution.alternatives.join(", ")} share the ` +
          `${resolution.script ?? "same"} script\n`,
      );
    }
  });

program
  .command("doctor")
  .description("check that the analyzer backend is usable")
  .action(async () => {
    const analyzer = new StanzaAnalyzer({ cache: false });
    process.stdout.write(`analyzer: ${analyzer.id} ${analyzer.version}\n`);
    try {
      const sentences = await analyzer.analyzeSegmented(
        "This is a test.",
        [{ start: 0, end: 15 }],
        "en",
      );
      const tokens = sentences[0]?.tokens.length ?? 0;
      process.stdout.write(`ok — parsed a probe sentence into ${tokens} tokens\n`);
    } catch (error) {
      process.stderr.write(`${(error as Error).message}\n`);
      process.exitCode = 1;
    }
  });

interface ParseCommandOptions {
  readonly lang?: string;
  readonly confidence: string;
  readonly models: string;
  readonly format: Format;
  readonly out?: string;
  readonly cache: boolean;
  readonly check?: boolean;
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY === true) {
    fail("no file given and standard input is a terminal; pass a file or pipe text in");
  }
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

function fail(message: string): never {
  process.stderr.write(`speechsplitter: ${message}\n`);
  process.exit(2);
}

// Plugin packs are installed before the command runs, so `--lang de` and
// `languages` see the same registry. Failures are reported and skipped: a
// half-written pack of your own is not a reason for the tool to stop working
// for the languages that do load.
await installLanguagePlugins();

program.parseAsync(process.argv).catch((error: unknown) => {
  process.stderr.write(`speechsplitter: ${(error as Error).message}\n`);
  process.exit(1);
});
