/**
 * Decoding logits into a tree.
 *
 * Hand-built logit blocks, no model. The point is to pin the constraints that
 * are easy to leave out and quietly wrong to leave out — root labels confined to
 * the diagonal, `goeswith` confined to adjacency — because with a real model
 * present, a violation looks like ordinary parser noise rather than a bug.
 */

import { describe, expect, it } from "vitest";
import { decodeTree } from "../src/decode.js";

/**
 * Labels: 0 = filler (never legal off-diagonal), 1 = "nsubj", 2 = "root",
 * 3 = "goeswith".
 */
const LABELS = { filler: 0, nsubj: 1, root: 2, goeswith: 3 } as const;
const LABEL_COUNT = 4;
const ROOT_LABELS = [LABELS.root];

/** Build an n×n×L block, everything low except what the test asks for. */
function block(
  n: number,
  set: (head: number, dep: number, label: number, value: number) => void,
): Float32Array {
  const logits = new Float32Array(n * n * LABEL_COUNT).fill(-5);
  set((head, dep, label, value) => {
    logits[(head * n + dep) * LABEL_COUNT + label] = value;
  });
  return logits;
}

function decode(n: number, logits: Float32Array, goeswith = LABELS.goeswith) {
  return decodeTree({
    logits,
    tokenCount: n,
    labelCount: LABEL_COUNT,
    rootLabelIds: ROOT_LABELS,
    goeswithLabelId: goeswith,
  });
}

describe("decodeTree", () => {
  it("returns nothing for an empty sentence", () => {
    expect(decode(0, new Float32Array(0))).toEqual([]);
  });

  it("makes a single token its own root", () => {
    const logits = block(1, (set) => set(0, 0, LABELS.root, 9));
    const [token] = decode(1, logits);
    expect(token).toMatchObject({ head: 0, labelId: LABELS.root });
  });

  it("reads head and label off the winning arc", () => {
    // token 1 is root; token 0 is its subject.
    const logits = block(2, (set) => {
      set(1, 1, LABELS.root, 9);
      set(1, 0, LABELS.nsubj, 8);
    });
    const decoded = decode(2, logits);
    expect(decoded[0]).toMatchObject({ head: 1, labelId: LABELS.nsubj });
    expect(decoded[1]).toMatchObject({ head: 1, labelId: LABELS.root });
  });

  it("never selects a root label off the diagonal", () => {
    // The root label scores highest for the arc 1 -> 0, but that arc is not the
    // diagonal, so it must not be chosen. Without the constraint the decoder
    // would claim token 0 is a root whose head is token 1 — a contradiction.
    const logits = block(2, (set) => {
      set(1, 1, LABELS.root, 9);
      set(1, 0, LABELS.root, 100);
      set(1, 0, LABELS.nsubj, 1);
    });
    expect(decode(2, logits)[0]!.labelId).toBe(LABELS.nsubj);
  });

  it("never selects the filler label off the diagonal", () => {
    const logits = block(2, (set) => {
      set(1, 1, LABELS.root, 9);
      set(1, 0, LABELS.filler, 100);
      set(1, 0, LABELS.nsubj, 1);
    });
    expect(decode(2, logits)[0]!.labelId).toBe(LABELS.nsubj);
  });

  it("returns exactly one root even when several look attractive", () => {
    const logits = block(3, (set) => {
      set(0, 0, LABELS.root, 9);
      set(1, 1, LABELS.root, 9);
      set(2, 2, LABELS.root, 9);
      set(0, 1, LABELS.nsubj, 8);
      set(0, 2, LABELS.nsubj, 8);
    });
    const decoded = decode(3, logits);
    const roots = decoded.filter((token, index) => token.head === index);
    expect(roots).toHaveLength(1);
  });

  it("produces a tree with no cycles", () => {
    // Mutually attractive arcs between 1 and 2 would form a cycle if each token
    // simply took its best head.
    const logits = block(3, (set) => {
      set(0, 0, LABELS.root, 5);
      set(2, 1, LABELS.nsubj, 9);
      set(1, 2, LABELS.nsubj, 9);
      set(0, 1, LABELS.nsubj, 1);
    });
    const decoded = decode(3, logits);
    for (let start = 0; start < decoded.length; start++) {
      const seen = new Set<number>([start]);
      let current = decoded[start]!.head;
      while (current !== decoded[current]!.head) {
        expect(seen.has(current)).toBe(false);
        seen.add(current);
        current = decoded[current]!.head;
      }
    }
  });

  it("allows goeswith onto the immediately following token", () => {
    const logits = block(2, (set) => {
      set(0, 0, LABELS.root, 9);
      set(0, 1, LABELS.goeswith, 8);
    });
    expect(decode(2, logits)[1]).toMatchObject({ head: 0, labelId: LABELS.goeswith });
  });

  it("refuses goeswith across a gap", () => {
    // Token 2 cannot be a fragment of token 0 when token 1 sits between them and
    // is not itself part of the chain. Unconstrained, this relation would fire
    // between arbitrary tokens and shatter unrelated words.
    const logits = block(3, (set) => {
      set(0, 0, LABELS.root, 9);
      set(0, 1, LABELS.nsubj, 8);
      set(0, 2, LABELS.goeswith, 100);
      set(0, 2, LABELS.nsubj, 1);
    });
    expect(decode(3, logits)[2]!.labelId).not.toBe(LABELS.goeswith);
  });

  it("allows a goeswith chain to continue past the first fragment", () => {
    // A word split into three pieces: 1 and 2 both attach to 0.
    const logits = block(3, (set) => {
      set(0, 0, LABELS.root, 9);
      set(0, 1, LABELS.goeswith, 9);
      set(0, 2, LABELS.goeswith, 9);
    });
    const decoded = decode(3, logits);
    expect(decoded[1]!.labelId).toBe(LABELS.goeswith);
    expect(decoded[2]!.labelId).toBe(LABELS.goeswith);
  });

  it("copes with a model that has no goeswith label", () => {
    const logits = block(2, (set) => {
      set(0, 0, LABELS.root, 9);
      set(0, 1, LABELS.nsubj, 8);
    });
    expect(() => decodeTree({
      logits,
      tokenCount: 2,
      labelCount: LABEL_COUNT,
      rootLabelIds: ROOT_LABELS,
      goeswithLabelId: undefined,
    })).not.toThrow();
  });

  it("reports probabilities that are real probabilities", () => {
    const logits = block(2, (set) => {
      set(1, 1, LABELS.root, 9);
      set(1, 0, LABELS.nsubj, 8);
    });
    for (const token of decode(2, logits)) {
      expect(token.headProbability).toBeGreaterThan(0);
      expect(token.headProbability).toBeLessThanOrEqual(1);
      expect(token.labelProbability).toBeGreaterThan(0);
      expect(token.labelProbability).toBeLessThanOrEqual(1);
    }
  });

  it("reports low confidence when two heads are equally plausible", () => {
    // The honesty requirement of §10: a genuine coin flip must not render as
    // certainty.
    const confident = block(3, (set) => {
      set(0, 0, LABELS.root, 9);
      set(0, 1, LABELS.nsubj, 9);
      set(0, 2, LABELS.nsubj, 9);
    });
    const torn = block(3, (set) => {
      set(0, 0, LABELS.root, 9);
      set(0, 1, LABELS.nsubj, 9);
      set(0, 2, LABELS.nsubj, 5);
      set(1, 2, LABELS.nsubj, 5);
    });
    expect(decode(3, torn)[2]!.headProbability).toBeLessThan(
      decode(3, confident)[2]!.headProbability,
    );
  });
});
