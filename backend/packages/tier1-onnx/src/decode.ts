/**
 * Turning the model's logits into a dependency tree — docs/UpdatedPlan.md §6.2.
 *
 * These models do not predict a parse in one pass. For an N-token sentence the
 * caller submits N sequences, masking token *i* in sequence *i* and appending the
 * original token at the end, which produces an N×N×L block of logits where
 * `logits[head][dependent][label]` scores the claim "dependent's head is head,
 * with this relation". The diagonal is reserved: `head === dependent` means root.
 *
 * This file is a faithful re-implementation of the author's own `ud.py`, and
 * every constraint below is there because that implementation has it. Two are
 * easy to omit and quietly wrong to omit:
 *
 * - **Root labels live only on the diagonal.** Off it, both the `|root` labels
 *   and label 0 are forbidden. Without this the decoder can pick "root" for an
 *   arc between two different tokens, which is not a statement the taxonomy can
 *   represent.
 * - **`goeswith` is positional.** A word fragment may only attach to the token
 *   immediately before it, or continue an unbroken `goeswith` chain back to one.
 *   Without the restriction the relation is free to fire between arbitrary
 *   tokens and shatter unrelated words.
 *
 * The maximum spanning arborescence itself is `@langchunk/grammar`'s, which was
 * written in Stage 1 and verified against brute-force enumeration. This is where
 * that pays off: the one part of Stage 3 that could have been subtly wrong under
 * a model's noisy scores was already known to be right.
 */

import { chuLiuEdmonds } from "langchunk/grammar";

export interface DecodeInput {
  /** Flat `[token][token][label]` logits, length `n * n * labelCount`. */
  readonly logits: Float32Array;
  readonly tokenCount: number;
  readonly labelCount: number;
  /** Ids of every label ending in `|root`. */
  readonly rootLabelIds: readonly number[];
  /** Id of `X|_|goeswith`, or undefined if the model has no such label. */
  readonly goeswithLabelId: number | undefined;
}

export interface DecodedToken {
  /** 0-based index of the head token; equal to the token's own index for root. */
  readonly head: number;
  readonly labelId: number;
  /** Softmax probability of the chosen head among all candidate heads. */
  readonly headProbability: number;
  /** Softmax probability of the chosen label at the chosen arc. */
  readonly labelProbability: number;
}

export function decodeTree(input: DecodeInput): DecodedToken[] {
  const { tokenCount: n, labelCount: l, logits } = input;
  if (n === 0) return [];

  const at = (head: number, dependent: number, label: number): number =>
    logits[(head * n + dependent) * l + label]!;

  const rootLabels = new Set(input.rootLabelIds);

  /** Is this label legal for this arc? */
  const legal = (head: number, dependent: number, label: number): boolean => {
    if (head === dependent) return rootLabels.has(label);
    return label !== 0 && !rootLabels.has(label);
  };

  const goeswithAllowed = computeGoeswithMask(input, at);

  // Best legal label per arc, and the arc score that follows from it.
  const arcScore = new Float32Array(n * n).fill(-Infinity);
  const arcLabel = new Int32Array(n * n).fill(-1);

  for (let head = 0; head < n; head++) {
    for (let dep = 0; dep < n; dep++) {
      let best = -Infinity;
      let bestLabel = -1;
      for (let label = 0; label < l; label++) {
        if (!legal(head, dep, label)) continue;
        if (label === input.goeswithLabelId && !goeswithAllowed[head * n + dep]) continue;
        const score = at(head, dep, label);
        if (score > best) {
          best = score;
          bestLabel = label;
        }
      }
      arcScore[head * n + dep] = best;
      arcLabel[head * n + dep] = bestLabel;
    }
  }

  const heads = solve(arcScore, n);

  const out: DecodedToken[] = [];
  for (let dep = 0; dep < n; dep++) {
    const head = heads[dep]!;
    const labelId = arcLabel[head * n + dep]!;

    // Head confidence is over the competing heads for this dependent; label
    // confidence is over the labels legal at the arc that won. They answer
    // different questions and the caller combines them.
    const headScores: number[] = [];
    for (let candidate = 0; candidate < n; candidate++) {
      headScores.push(arcScore[candidate * n + dep]!);
    }
    const labelScores: number[] = [];
    for (let label = 0; label < l; label++) {
      labelScores.push(legal(head, dep, label) ? at(head, dep, label) : -Infinity);
    }

    out.push({
      head,
      labelId: labelId >= 0 ? labelId : 0,
      headProbability: softmaxAt(headScores, head),
      labelProbability: labelId >= 0 ? softmaxAt(labelScores, labelId) : 0,
    });
  }

  return out;
}

/**
 * Which arcs may carry `goeswith`.
 *
 * The relation exists to reattach a word the tokenizer split, so it is only
 * meaningful backwards and adjacently. An arc from `head` to `head + 1` is
 * always allowed; anything further is allowed only if every step back to the
 * head is itself the model's best guess at `goeswith`, which is what lets a word
 * broken into three or more pieces reassemble.
 */
function computeGoeswithMask(
  input: DecodeInput,
  at: (head: number, dependent: number, label: number) => number,
): Uint8Array {
  const { tokenCount: n, labelCount: l, goeswithLabelId } = input;
  const allowed = new Uint8Array(n * n);
  if (goeswithLabelId === undefined) return allowed;

  const bestLabel = (head: number, dep: number): number => {
    let best = -Infinity;
    let bestIndex = 0;
    for (let label = 0; label < l; label++) {
      const score = at(head, dep, label);
      if (score > best) {
        best = score;
        bestIndex = label;
      }
    }
    return bestIndex;
  };

  const bestHeadFor = (dep: number): number => {
    let best = -Infinity;
    let bestIndex = 0;
    for (let head = 0; head < n; head++) {
      let rowMax = -Infinity;
      for (let label = 0; label < l; label++) {
        const score = at(head, dep, label);
        if (score > rowMax) rowMax = score;
      }
      if (rowMax > best) {
        best = rowMax;
        bestIndex = head;
      }
    }
    return bestIndex;
  };

  for (let head = 0; head < n; head++) {
    if (head + 1 < n) allowed[head * n + head + 1] = 1;
    for (let dep = head + 2; dep < n; dep++) {
      const chainContinues =
        bestLabel(head, dep - 1) === goeswithLabelId && bestHeadFor(dep - 1) === head;
      allowed[head * n + dep] = chainContinues ? allowed[head * n + dep - 1]! : 0;
    }
  }

  return allowed;
}

/**
 * Maximum spanning arborescence, with exactly one root.
 *
 * `@langchunk/grammar`'s decoder works with an artificial root node, so the
 * self-loop convention is translated in and out: `scores[0][d + 1]` is "token d
 * is the sentence root", and everything else shifts by one.
 *
 * The reference implementation resolves multiple roots with a penalty heuristic
 * and a second pass. This uses the exact single-root search instead, which is
 * both simpler to reason about and verified against brute force.
 */
function solve(arcScore: Float32Array, n: number): number[] {
  const size = n + 1;
  const matrix: number[][] = Array.from({ length: size }, () =>
    new Array<number>(size).fill(-Infinity),
  );

  for (let dep = 0; dep < n; dep++) {
    matrix[0]![dep + 1] = arcScore[dep * n + dep]!; // self-loop == root
    for (let head = 0; head < n; head++) {
      if (head === dep) continue;
      matrix[head + 1]![dep + 1] = arcScore[head * n + dep]!;
    }
  }

  const heads = chuLiuEdmonds(matrix, { singleRoot: true });
  const out: number[] = [];
  for (let dep = 0; dep < n; dep++) {
    const head = heads[dep + 1]!;
    out.push(head === 0 ? dep : head - 1);
  }
  return out;
}

/** Softmax probability of one entry, computed stably. */
function softmaxAt(scores: readonly number[], index: number): number {
  let max = -Infinity;
  for (const score of scores) if (score > max) max = score;
  if (!Number.isFinite(max)) return 0;

  let total = 0;
  for (const score of scores) {
    if (Number.isFinite(score)) total += Math.exp(score - max);
  }
  if (total === 0) return 0;

  const chosen = scores[index];
  if (chosen === undefined || !Number.isFinite(chosen)) return 0;
  return Math.exp(chosen - max) / total;
}
