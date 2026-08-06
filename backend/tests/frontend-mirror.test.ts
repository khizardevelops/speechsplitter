/**
 * The frontend's hand-copied files, checked against the originals.
 *
 * `frontend/` is outside the pnpm workspace deliberately: joining the two
 * package managers to share a handful of declarations would couple the web
 * app's install to the workspace. The price is three files that are copies —
 * `csv.ts`, `jsonl.ts`, and `types.ts` — and a copy nobody checks is a copy
 * that has already drifted; you simply do not know when.
 *
 * These tests are the check. The originals now come from the published
 * `langchunk` package (the engine repo); the frontend's files are imported
 * directly by path, which vitest can do and the frontend's own bundler never
 * has to. The CSV and JSONL checks compare **behaviour**, not text —
 * comparing source would fail on the frontend's tabs and single quotes, which
 * would train everyone to ignore it.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import type { ParsedDocument } from "langchunk/schema";
import { SCHEMA_VERSION } from "langchunk/schema";
import { csvFilename, jsonlFilename, toCsv, toJsonl } from "langchunk/export";
import { AWKWARD, documentFrom, ENGLISH, RUSSIAN } from "./fixtures.js";

/**
 * The mirror files are imported dynamically, and the suite skips — loudly —
 * when the frontend tree has never been synced. `frontend/tsconfig.json`
 * extends the generated `.svelte-kit/tsconfig.json`, so transforming any
 * frontend source fails at *collection* in a tree where `bun install` has
 * never run. A static import would therefore break `pnpm test` for someone
 * who only touches the workspace side. CI still runs the guard for real: its
 * frontend job syncs the tree, and this file's skip is conditioned on that
 * sync artifact, not on convenience.
 */
const FRONTEND_SYNCED = existsSync(
  fileURLToPath(new URL("../../frontend/.svelte-kit/tsconfig.json", import.meta.url)),
);

interface Mirror {
  csvFilename: typeof csvFilename;
  toCsv: typeof toCsv;
  jsonlFilename: typeof jsonlFilename;
  toJsonl: typeof toJsonl;
}

let mirror: Mirror;

beforeAll(async () => {
  if (!FRONTEND_SYNCED) return;
  const csv = await import("../../frontend/src/lib/langchunk/csv.js");
  const jsonl = await import("../../frontend/src/lib/langchunk/jsonl.js");
  mirror = {
    csvFilename: csv.csvFilename,
    toCsv: csv.toCsv,
    jsonlFilename: jsonl.jsonlFilename,
    toJsonl: jsonl.toJsonl,
  };
});

/** Units carrying every character that has ever broken a delimited format. */
const HOSTILE = documentFrom(
  "en",
  'A|DET|det|2 quote|NOUN|nsubj|3 ~,|PUNCT|punct|2 breaks|VERB|root|0 things|NOUN|obj|3',
);

/**
 * A unit whose text runs across a line break and a run of spaces.
 *
 * Both writers collapse internal whitespace so a wrapped unit stays on one row
 * or one line. Nothing else here exercises that: `parseSpec` joins tokens with
 * single spaces, so every other fixture is already flat — which meant a mirror
 * that stopped collapsing whitespace passed every check. Found by deliberately
 * breaking the frontend copy and watching the suite not notice.
 */
const WRAPPED: ParsedDocument = {
  ...ENGLISH,
  sentences: [{ ...ENGLISH.sentences[0]!, text: "one line\n  and   another" }],
  clauses: [{ ...ENGLISH.clauses[0]!, text: "wrapped\ttab" }],
};

const DOCUMENTS: ReadonlyArray<readonly [string, ParsedDocument]> = [
  ["english", ENGLISH],
  ["russian", RUSSIAN],
  ["awkward", AWKWARD],
  ["hostile", HOSTILE],
  ["wrapped", WRAPPED],
  ["empty", { ...ENGLISH, sentences: [], clauses: [], phrases: [], words: [] }],
];

describe.skipIf(!FRONTEND_SYNCED)("frontend/src/lib/langchunk/csv.ts mirrors langchunk/export", () => {
  for (const [name, document] of DOCUMENTS) {
    it(`produces byte-identical CSV for the ${name} document`, () => {
      expect(mirror.toCsv(document as never)).toBe(toCsv(document));
    });
  }

  it("names the file the same way", () => {
    const now = new Date("2026-08-05T10:00:00Z");
    expect(mirror.csvFilename(RUSSIAN as never, now)).toBe(csvFilename(RUSSIAN, now));
  });

  it("says in its own header that it is a mirror", () => {
    // The test can only catch drift that has already happened. The header is
    // what stops someone editing the copy in the first place.
    const source = readFileSync(
      fileURLToPath(new URL("../../frontend/src/lib/langchunk/csv.ts", import.meta.url)),
      "utf8",
    );
    expect(source).toMatch(/MIRROR of `packages\/export\/src\/csv\.ts`/);
  });
});

describe.skipIf(!FRONTEND_SYNCED)("frontend/src/lib/langchunk/jsonl.ts mirrors langchunk/export", () => {
  for (const [name, document] of DOCUMENTS) {
    it(`produces byte-identical JSONL for the ${name} document`, () => {
      expect(mirror.toJsonl(document as never)).toBe(toJsonl(document));
    });
  }

  it("names the file the same way", () => {
    const now = new Date("2026-08-05T10:00:00Z");
    expect(mirror.jsonlFilename(RUSSIAN as never, now)).toBe(jsonlFilename(RUSSIAN, now));
  });

  it("says in its own header that it is a mirror", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../../frontend/src/lib/langchunk/jsonl.ts", import.meta.url)),
      "utf8",
    );
    expect(source).toMatch(/MIRROR of `packages\/export\/src\/jsonl\.ts`/);
  });
});

/**
 * The schema mirror.
 *
 * Compared by field name rather than by importing both types, because vitest
 * does not typecheck and a structural assertion would be erased. Names are
 * enough to catch the failure that actually happens: a field added to the
 * schema and not mirrored, so the web app silently cannot see it.
 *
 * The schema's declarations now come from the installed package's bundled
 * `.d.ts`. The chunk carrying them has a content-hashed name, so it is found
 * by content, not by name.
 */
describe("frontend/src/lib/langchunk/types.ts mirrors langchunk/schema", () => {
  const read = (relative: string): string =>
    readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

  /** The bundled declaration file that carries the document interfaces. */
  function schemaDeclarations(): string {
    const require = createRequire(import.meta.url);
    const dist = path.dirname(require.resolve("langchunk/schema"));
    for (const file of readdirSync(dist)) {
      if (!file.endsWith(".d.ts")) continue;
      const source = readFileSync(path.join(dist, file), "utf8");
      if (/interface\s+LangWord\s*\{/.test(source)) return source;
    }
    throw new Error("no .d.ts in the langchunk package declares LangWord");
  }

  /**
   * `{ interfaceName -> field names }`, ignoring comments and optionality.
   *
   * Walks brace depth rather than regexing to the first `}`: the bundled
   * `.d.ts` expands nested object types (`connector?: { text; span }`) across
   * lines, and a flat regex would count their members as interface fields.
   */
  function interfaces(source: string): Map<string, string[]> {
    const out = new Map<string, string[]>();
    const stripped = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const heads = /(?:export\s+)?(?:declare\s+)?interface\s+(\w+)\s*\{/g;

    let match: RegExpExecArray | null;
    while ((match = heads.exec(stripped)) !== null) {
      const fields: string[] = [];
      let depth = 1;
      let lineStartDepth = 1;
      let line = "";
      for (let i = heads.lastIndex; i < stripped.length && depth > 0; i++) {
        const char = stripped[i]!;
        const closesInterface = char === "}" && depth === 1;
        if (char === "\n" || closesInterface) {
          // A field of the interface itself STARTS on a depth-1 line; a
          // nested object type's members start deeper and are not fields.
          if (lineStartDepth === 1) {
            const field = /^\s*(?:readonly\s+)?(\w+)\??\s*:/.exec(line);
            if (field !== null) fields.push(field[1]!);
          }
          line = "";
          if (closesInterface) break;
          lineStartDepth = depth;
          continue;
        }
        if (char === "{") depth++;
        else if (char === "}") depth--;
        line += char;
      }
      out.set(match[1]!, fields.sort());
    }
    return out;
  }

  const schema = interfaces(schemaDeclarations());
  const mirror = interfaces(read("../../frontend/src/lib/langchunk/types.ts"));

  for (const name of ["LangWord", "LangPhrase", "LangClause", "LangSentence", "Confidence", "Span"]) {
    it(`${name} has the same fields on both sides`, () => {
      expect(schema.get(name), `${name} is missing from the schema`).toBeDefined();
      expect(mirror.get(name), `${name} is missing from the frontend mirror`).toEqual(
        schema.get(name),
      );
    });
  }

  it("declares the same schema version", () => {
    // Either quote style: the frontend's formatter prefers single, and that is
    // a difference in appearance rather than in contract.
    const version = /schemaVersion:\s*['"]([\d.]+)['"]/;
    const declared = version.exec(read("../../frontend/src/lib/langchunk/types.ts"))?.[1];
    expect(declared).toBe(SCHEMA_VERSION);
    expect(declared).toBeDefined();
  });
});
