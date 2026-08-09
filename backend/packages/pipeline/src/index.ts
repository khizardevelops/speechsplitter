/**
 * speechsplitter owns raw-text orchestration and Tier 1 execution. langchunk
 * receives only the resulting portable dependency analysis and performs Tier 2.
 */

import type { Analyzer, LanguageTier, ParsedDocument } from "langchunk/schema";
import { buildDocument } from "langchunk/grammar";
import { isBroadFallback, listPacks, resolveLanguage, type LanguagePack } from "langchunk/lang";
import { segmentSentences, type SentenceSpan } from "langchunk/segment";

export interface SegmentAwareAnalyzer extends Analyzer {
  analyzeSegmented(
    text: string,
    spans: readonly { start: number; end: number }[],
    lang: string,
  ): Promise<Awaited<ReturnType<Analyzer["analyze"]>>>;
}

export interface ParseTextOptions {
  readonly text: string;
  readonly analyzer: Analyzer | SegmentAwareAnalyzer;
  readonly lang?: string;
  readonly tier?: LanguageTier;
  readonly fallback?: boolean;
}

export interface ParseTextResult {
  readonly document: ParsedDocument;
  readonly pack: LanguagePack;
  readonly sentences: readonly SentenceSpan[];
}

export async function parseText(options: ParseTextOptions): Promise<ParseTextResult> {
  const resolution = resolveLanguage(options.text, options.lang, {
    fallback: options.fallback ?? true,
  });
  if (resolution === undefined) {
    throw new Error(
      options.lang !== undefined
        ? `No language pack for ${JSON.stringify(options.lang)}. Installed: ` +
          `${listPacks().map((pack) => pack.code).join(", ")}.`
        : "Could not detect a language from the script. Pass a language code.",
    );
  }
  const { pack } = resolution;
  if (!options.analyzer.supports(pack.code)) {
    throw new Error(`Analyzer ${JSON.stringify(options.analyzer.id)} does not support ${pack.code}.`);
  }

  const sentences = segmentSentences(options.text, pack.segmentation);
  const analyzed = isSegmentAware(options.analyzer)
    ? await options.analyzer.analyzeSegmented(options.text, sentences, pack.code)
    : await options.analyzer.analyze(options.text, pack.code);
  const warnings: string[] = [];
  if (sentences.length !== analyzed.length) {
    warnings.push(
      `segmenter produced ${sentences.length} sentence(s) but the analyzer ` +
        `returned ${analyzed.length}; spans remain correct but the two stages disagree about boundaries`,
    );
  }
  if (isBroadFallback(pack)) {
    warnings.push(
      `no language pack for ${pack.code}; parsed with Tier 2's language-neutral ` +
        "defaults at broad-fallback tier, and confidence is capped because nothing about this language has been measured",
    );
  }
  if (resolution.alternatives !== undefined && resolution.alternatives.length > 0) {
    warnings.push(
      `language detected as ${pack.code} from ${resolution.script ?? "script"} alone; ` +
        `${resolution.alternatives.join(", ")} use the same script. Pass a language code to be certain.`,
    );
  }

  const document = buildDocument({
    text: options.text,
    sentences: analyzed,
    language: {
      code: pack.code,
      tier: options.tier ?? pack.tier,
      resolution: resolution.resolution,
    },
    analyzer: { id: options.analyzer.id, version: options.analyzer.version },
    options: pack.grammar,
    ...(warnings.length > 0 ? { warnings } : {}),
  });
  return { document, pack, sentences };
}

function isSegmentAware(analyzer: Analyzer): analyzer is SegmentAwareAnalyzer {
  return typeof (analyzer as SegmentAwareAnalyzer).analyzeSegmented === "function";
}
