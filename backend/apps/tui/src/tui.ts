#!/usr/bin/env node
/**
 * `langchunk-tui` — an interactive session for looking at how text breaks down.
 *
 * Built because typing a long `langchunk parse --lang en --format outline` for
 * every experiment is friction in exactly the wrong place: the point of Stage 2
 * was to make the system dogfoodable, and accuracy bugs surface when trying
 * things is cheap.
 *
 * The analyzer is held open across inputs. Loading a Stanza pipeline costs about
 * five seconds; the persistent bridge makes every input after the first take
 * roughly a tenth of a second, which is the difference between exploring and
 * waiting.
 */

import { createInterface } from "node:readline";
import { readFile } from "node:fs/promises";
import pc from "picocolors";
import { parseText } from "@speechsplitter/pipeline";
import { listPacks, packFor, resolveLanguage } from "langchunk/lang";
import { installLanguagePlugins } from "langchunk/lang-node";
import { StanzaAnalyzer } from "@speechsplitter/tier1-stanza";
import { AgreementAnalyzer } from "@speechsplitter/tier1-agreement";
import { OnnxAnalyzer } from "@speechsplitter/tier1-onnx";
import type { Analyzer } from "langchunk/schema";
import { legend, renderDocument, summarise } from "./view.js";

interface Session {
  /** BCP-47, or undefined to detect from the text each time. */
  lang: string | undefined;
  showLegend: boolean;
  /** Consult a second analyzer so confidence means something. */
  agreement: boolean;
}

const session: Session = { lang: undefined, showLegend: false, agreement: false };

const stanza = new StanzaAnalyzer({ persistent: true });

/**
 * The second opinion, loaded on demand.
 *
 * Off by default because it costs a second parse. On, every unit's confidence
 * becomes a measured probability instead of a placeholder 1.0 — which is the
 * difference between a display that can warn you and one that cannot.
 */
const secondOpinions = new Map<string, Analyzer>();

async function analyzerFor(code: string): Promise<Analyzer> {
  if (!session.agreement) return stanza;
  let secondary = secondOpinions.get(code);
  if (secondary === undefined) {
    secondary = await OnnxAnalyzer.load({ modelDir: `models/${code}` });
    secondOpinions.set(code, secondary);
  }
  return new AgreementAnalyzer({ primary: stanza, secondary });
}

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  historySize: 200,
});

/** Every installed language, built-in or dropped in as a plugin file. */
function installedCodes(): string {
  return listPacks().map((pack) => pack.code).join(", ");
}

function prompt(): void {
  const where = session.lang ?? "auto";
  rl.setPrompt(`${pc.dim(`[${where}]`)} ${pc.bold(pc.cyan("›"))} `);
  rl.prompt();
}

function help(): void {
  process.stdout.write(
    [
      "",
      pc.bold("  Type or paste text and press enter."),
      "",
      `  ${pc.cyan(":lang <code>")}   set the language (${installedCodes()}), or ${pc.cyan(":lang auto")}`,
      `  ${pc.cyan(":file <path>")}   analyze a file`,
      `  ${pc.cyan(":legend")}        toggle the colour legend`,
      `  ${pc.cyan(":confidence")}    toggle the second opinion — slower, but confidence becomes real`,
      `  ${pc.cyan(":help")}          this`,
      `  ${pc.cyan(":quit")}          leave (ctrl-d also works)`,
      "",
    ].join("\n") + "\n",
  );
}

async function analyze(text: string): Promise<void> {
  if (text.trim().length === 0) return;

  const started = Date.now();
  try {
    const code = session.lang ?? resolveLanguage(text)?.pack.code;
    if (code === undefined) throw new Error("could not detect a language; try :lang en");
    const { document, pack } = await parseText({
      text,
      analyzer: await analyzerFor(code),
      lang: code,
    });
    const elapsed = Date.now() - started;

    process.stdout.write("\n");
    if (session.lang === undefined) {
      process.stdout.write(pc.dim(`  detected ${pack.name} (${pack.code})\n`));
    }
    process.stdout.write(renderDocument(document) + "\n");
    process.stdout.write(summarise(document, elapsed) + "\n");
    if (session.showLegend) process.stdout.write(legend() + "\n");
    process.stdout.write("\n");
  } catch (error) {
    process.stdout.write(`\n${pc.red((error as Error).message)}\n\n`);
  }
}

async function handleCommand(line: string): Promise<boolean> {
  const [command, ...rest] = line.slice(1).trim().split(/\s+/);
  const argument = rest.join(" ");

  switch (command) {
    case "q":
    case "quit":
    case "exit":
      return false;

    case "h":
    case "help":
      help();
      return true;

    case "confidence":
      session.agreement = !session.agreement;
      process.stdout.write(
        session.agreement
          ? pc.dim("  second opinion on — confidence is measured, first parse per language is slow\n")
          : pc.dim("  second opinion off — every unit will read as high confidence\n"),
      );
      return true;

    case "legend":
      session.showLegend = !session.showLegend;
      process.stdout.write(
        session.showLegend ? `\n${legend()}\n\n` : pc.dim("  legend off\n"),
      );
      return true;

    case "lang": {
      if (argument === "auto" || argument === "") {
        session.lang = undefined;
        process.stdout.write(pc.dim("  language will be detected from the text\n"));
        return true;
      }
      const pack = packFor(argument);
      if (pack === undefined) {
        process.stdout.write(
          pc.red(`  no pack for ${JSON.stringify(argument)}; have ${installedCodes()}\n`),
        );
        return true;
      }
      session.lang = pack.code;
      process.stdout.write(pc.dim(`  ${pack.name} (${pack.code}, ${pack.tier})\n`));
      return true;
    }

    case "file": {
      if (argument === "") {
        process.stdout.write(pc.red("  usage: :file <path>\n"));
        return true;
      }
      try {
        await analyze(await readFile(argument, "utf8"));
      } catch (error) {
        process.stdout.write(pc.red(`  ${(error as Error).message}\n`));
      }
      return true;
    }

    default:
      process.stdout.write(pc.red(`  unknown command ${JSON.stringify(command ?? "")}; try :help\n`));
      return true;
  }
}

process.stdout.write(
  [
    "",
    pc.bold("  speechsplitter") + pc.dim("  ·  sentences, clauses, phrases, words"),
    pc.dim("  the first input loads the parser and takes a few seconds; the rest are instant"),
    pc.dim("  :help for commands"),
    "",
  ].join("\n") + "\n",
);
await installLanguagePlugins();
prompt();

// Serialised: readline can deliver another line while one is still parsing, and
// interleaved output would be unreadable.
let pending: Promise<void> = Promise.resolve();

rl.on("line", (line) => {
  pending = pending.then(async () => {
    const trimmed = line.trim();
    if (trimmed.startsWith(":")) {
      if (!(await handleCommand(trimmed))) {
        rl.close();
        return;
      }
    } else {
      await analyze(line);
    }
    prompt();
  });
});

rl.on("close", () => {
  void pending.finally(() => {
    stanza.close();
    process.stdout.write(pc.dim("\n  bye\n"));
    process.exit(0);
  });
});
