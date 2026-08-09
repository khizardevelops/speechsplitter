/**
 * Recovering character offsets from a byte-level BPE tokenizer.
 *
 * Every span langchunk emits must index the user's original text exactly, so the
 * subword tokens have to be mapped back to character ranges. transformers.js
 * does not expose an offset mapping, which leaves two candidate strategies.
 *
 * **Decoding each token individually and summing the lengths does not work**, and
 * fails in a way that is easy to miss: it is exact for English and silently
 * corrupt for Russian. A byte-level BPE splits multi-byte characters across
 * tokens — Cyrillic "и" becomes two tokens holding one UTF-8 byte each — and
 * decoding either half alone produces U+FFFD. Every Russian span would have been
 * wrong by a drifting amount.
 *
 * What does work is staying in bytes. `tokenize()` returns the byte-level
 * alphabet form of each token, where **one character stands for exactly one UTF-8
 * byte**. Verified on both models: the sum of token string lengths equals the
 * UTF-8 byte length of the input, for English and Russian alike. So byte offsets
 * accumulate exactly, and a single table converts them to the UTF-16 offsets JS
 * strings are indexed by.
 */

export interface TokenSpan {
  /** Offset into the original text, in UTF-16 code units. */
  readonly start: number;
  /** Exclusive. */
  readonly end: number;
}

/**
 * Byte offset -> the UTF-16 offset of the first character *starting at or after*
 * that byte. Length is `utf8ByteLength + 1`.
 *
 * That definition is the important part, and it took a failing test to arrive
 * at. A byte-level BPE can split one character across two tokens — Cyrillic "и"
 * becomes two tokens of one byte each — and the obvious mapping (byte -> the
 * character containing it) then lets both tokens claim the character, producing
 * overlapping spans, or neither, producing a lost one.
 *
 * Anchoring on character *starts* settles it: a character belongs to whichever
 * token contains its first byte, and the following token begins after it. The
 * trailing fragment collapses to an empty span and the caller drops it, which is
 * the correct outcome — the fragment carries no text of its own.
 */
export function buildByteToCharTable(text: string): Int32Array {
  const byteLength = new TextEncoder().encode(text).length;
  const table = new Int32Array(byteLength + 1);
  table[byteLength] = text.length;

  // Where each character begins, in both byte space and UTF-16 space.
  const startByte: number[] = [];
  const startChar: number[] = [];
  for (let charIndex = 0, byteIndex = 0; charIndex < text.length; ) {
    const codePoint = text.codePointAt(charIndex)!;
    startByte.push(byteIndex);
    startChar.push(charIndex);
    byteIndex += utf8Width(codePoint);
    charIndex += codePoint > 0xffff ? 2 : 1;
  }

  // Backwards, so a byte inside a character inherits the *following* character's
  // start rather than its own. That is what stops two tokens claiming one
  // character when a byte-level BPE splits it.
  let next = text.length;
  let boundary = startByte.length - 1;
  for (let byteIndex = byteLength - 1; byteIndex >= 0; byteIndex--) {
    if (boundary >= 0 && startByte[boundary] === byteIndex) {
      next = startChar[boundary]!;
      boundary--;
    }
    table[byteIndex] = next;
  }

  return table;
}

function utf8Width(codePoint: number): number {
  if (codePoint < 0x80) return 1;
  if (codePoint < 0x800) return 2;
  if (codePoint < 0x10000) return 3;
  return 4;
}

/**
 * Character spans for byte-level tokens, in order.
 *
 * `pieces` must be the tokenizer's own byte-level strings — the `Ġ`-prefixed
 * form from `tokenize()`, not decoded text.
 */
export function spansForPieces(
  pieces: readonly string[],
  byteToChar: Int32Array,
  text: string,
): TokenSpan[] {
  const spans: TokenSpan[] = [];
  let byteOffset = 0;

  for (const piece of pieces) {
    const start = byteOffset;
    const end = byteOffset + piece.length;
    byteOffset = end;

    let from = byteToChar[Math.min(start, byteToChar.length - 1)]!;
    const to = byteToChar[Math.min(end, byteToChar.length - 1)]!;

    // A byte-level BPE folds the preceding space into the token, so " dog" is
    // one token. The space is not part of the word: leaving it in would make
    // every Word, phrase, and clause span start one character early and render
    // with stray leading whitespace. HF's own offset mapping excludes it, and
    // the reference implementation relies on that.
    while (from < to && /\s/.test(text[from]!)) from++;

    spans.push({ start: from, end: to });
  }

  return spans;
}

/**
 * Does the tokenization account for every byte of the text?
 *
 * A mismatch means the tokenizer normalised the input — stripped an accent,
 * folded a character — and byte offsets no longer describe the original string.
 * Worth failing loudly on, because the alternative is spans that are subtly and
 * invisibly wrong.
 */
export function coversText(pieces: readonly string[], text: string): boolean {
  const expected = new TextEncoder().encode(text).length;
  let total = 0;
  for (const piece of pieces) total += piece.length;
  return total === expected;
}
