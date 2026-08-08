/**
 * Byte-level offset recovery.
 *
 * These run without a model, because the thing they guard is not the model — it
 * is the arithmetic that maps subword tokens back to characters. That arithmetic
 * failed silently once already: decoding tokens individually is exact for
 * English and produces U+FFFD for Russian, where a byte-level BPE splits one
 * Cyrillic character across two tokens. Nothing in the output would have looked
 * wrong; the spans would simply have drifted.
 *
 * Hence the emphasis on non-ASCII: a test suite in English alone would have
 * passed on the broken implementation.
 */

import { describe, expect, it } from "vitest";
import { buildByteToCharTable, coversText, spansForPieces } from "../src/offsets.js";

/** How a byte-level BPE writes a string: one character per UTF-8 byte. */
function toByteLevel(text: string): string {
  return Array.from(new TextEncoder().encode(text))
    .map((byte) => String.fromCharCode(byte))
    .join("");
}

describe("buildByteToCharTable", () => {
  it("maps every byte boundary of ASCII text", () => {
    const table = buildByteToCharTable("abc");
    expect(Array.from(table)).toEqual([0, 1, 2, 3]);
  });

  it("points a mid-character byte at the NEXT character start", () => {
    // "и" is two UTF-8 bytes. Byte 0 starts it; byte 1 is inside it and must
    // point past it, so a token beginning there claims nothing. Mapping byte 1
    // back to character 0 would let two tokens claim the same character.
    expect(Array.from(buildByteToCharTable("иx"))).toEqual([0, 1, 1, 2]);
  });

  it("handles characters outside the basic plane", () => {
    // An emoji is four UTF-8 bytes and two UTF-16 code units.
    const text = "a😀b";
    const table = buildByteToCharTable(text);
    expect(table[0]).toBe(0);
    expect(table[1]).toBe(1); // emoji starts here
    expect(table[2]).toBe(3); // inside the emoji -> next start, which is "b"
    expect(table[5]).toBe(3); // "b" starts at UTF-16 index 3
    expect(table[table.length - 1]).toBe(text.length);
  });
});

describe("spansForPieces", () => {
  const spansFor = (text: string, pieces: readonly string[]) =>
    spansForPieces(pieces, buildByteToCharTable(text), text).map((span) =>
      text.slice(span.start, span.end),
    );

  it("recovers ASCII words", () => {
    const text = "the dog barked";
    const pieces = [toByteLevel("the"), toByteLevel(" dog"), toByteLevel(" barked")];
    expect(spansFor(text, pieces)).toEqual(["the", "dog", "barked"]);
  });

  it("recovers Cyrillic words split across byte boundaries", () => {
    // The case that broke per-token decoding: one character, two tokens.
    const text = "Погода и мы";
    const pieces = [
      toByteLevel("По"),
      toByteLevel("года"),
      toByteLevel(" и").slice(0, 2), // " " + first byte of "и"
      toByteLevel("и").slice(1), //     second byte of "и"
      toByteLevel(" мы"),
    ];
    expect(coversText(pieces, text)).toBe(true);
    const spans = spansForPieces(pieces, buildByteToCharTable(text), text);
    // "и" belongs to the token holding its FIRST byte; the trailing fragment
    // collapses to empty and the caller drops it.
    expect(text.slice(spans[2]!.start, spans[2]!.end)).toBe("и");
    expect(spans[3]!.end).toBe(spans[3]!.start);
    expect(text.slice(spans[4]!.start, spans[4]!.end)).toBe("мы");
    // No two spans may claim the same character.
    for (let i = 1; i < spans.length; i++) {
      expect(spans[i]!.start).toBeGreaterThanOrEqual(spans[i - 1]!.end);
    }
  });

  it("excludes the leading space a byte-level BPE folds into the token", () => {
    const text = "a dog";
    const spans = spansForPieces(
      [toByteLevel("a"), toByteLevel(" dog")],
      buildByteToCharTable(text),
      text,
    );
    expect(spans[1]!.start).toBe(2); // "dog", not " dog"
    expect(text.slice(spans[1]!.start, spans[1]!.end)).toBe("dog");
  });

  it("collapses a whitespace-only token to an empty span", () => {
    // The caller drops these before building the mask batch; a zero-width token
    // left in would shift every prediction by one position.
    const text = "a  b";
    const spans = spansForPieces(
      [toByteLevel("a"), toByteLevel(" "), toByteLevel(" b")],
      buildByteToCharTable(text),
      text,
    );
    expect(spans[1]!.end).toBe(spans[1]!.start);
  });

  it("produces spans that slice back to the original text in order", () => {
    const text = "Дом, где мы жили — a house.";
    const pieces = Array.from(new TextEncoder().encode(text)).map((b) =>
      String.fromCharCode(b),
    );
    const spans = spansForPieces(pieces, buildByteToCharTable(text), text);
    expect(spans).toHaveLength(pieces.length);
    for (let i = 1; i < spans.length; i++) {
      expect(spans[i]!.start).toBeGreaterThanOrEqual(spans[i - 1]!.start);
    }
    // Concatenating the non-empty spans reproduces the text without whitespace.
    const joined = spans.map((s) => text.slice(s.start, s.end)).join("");
    expect(joined.replace(/\s/g, "")).toBe(text.replace(/\s/g, ""));
  });
});

describe("coversText", () => {
  it("accepts a tokenization that accounts for every byte", () => {
    expect(coversText([toByteLevel("Привет")], "Привет")).toBe(true);
  });

  it("rejects one that does not", () => {
    // A normalising tokenizer would land here, and byte offsets would silently
    // describe a string the user never supplied.
    expect(coversText([toByteLevel("Привет")], "Привет!")).toBe(false);
  });
});
