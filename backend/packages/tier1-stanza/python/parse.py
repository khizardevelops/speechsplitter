#!/usr/bin/env python3
"""Stanza bridge — dependency-parse pre-segmented sentences into CoNLL-U.

docs/UpdatedPlan.md §6.7 and §14 Stage 2. This is the *reference* parser: it
exists so the project has a real Tier 1 before the ONNX models land in Stage 3,
and afterwards so there is something to measure those models against. It is a
development and CLI tool and is **never shipped** — nothing in the browser path
may depend on Python.

Two deliberate choices:

**Sentence boundaries are an input, not an output.** `@langchunk/segment` decides
them, deterministically and testably, and this script is told what they are
(`tokenize_no_ssplit`). Letting Stanza re-split would make segmentation a model's
opinion, put a second sentence segmenter in the system, and make the CLI's output
depend on which analyzer produced it.

**Character offsets are preserved.** Stanza reports `start_char`/`end_char` into
the text it was given; the caller adds each sentence's base offset. That keeps
every span an exact index into the user's original text, which is the schema's
core contract and something reconstructing from token forms cannot guarantee.

Two protocols, same work:

**Batch** — one JSON request on stdin, CoNLL-U on stdout, then exit:

    {"lang": "en", "sentences": [{"text": "He left.", "start": 0}]}

**Serve** (`--serve`) — newline-delimited JSON in, newline-delimited JSON out,
looping until stdin closes. Loading a Stanza pipeline costs several seconds, so
a process that answers one request and dies makes anything interactive unusable.
The serve loop keeps pipelines cached per language for the life of the process,
which turns a ~4 s round trip into ~50 ms and is what makes the TUI possible.
"""

from __future__ import annotations

import io
import json
import os
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
# Each checkout keeps its own resources by deriving a local default from the
# runtime package location; the parser itself remains promotion-compatible.
# operators may override either location without changing parser behavior.
MODEL_DIR = Path(os.environ.get("LANGCHUNK_STANZA_MODEL_DIR", ROOT / "models" / "stanza"))
HUGGINGFACE_DIR = Path(
    os.environ.get("LANGCHUNK_STANZA_HUGGINGFACE_DIR", ROOT / "models" / "huggingface")
)
PROCESSORS = "tokenize,pos,lemma,depparse"

# Transformer-backed Stanza packages retrieve their backbones through the
# Hugging Face cache. Keep that cache with the rest of the owning project's
# ignored model assets instead of silently using a contributor's home directory.
os.environ["HF_HOME"] = str(HUGGINGFACE_DIR)
os.environ["HF_HUB_CACHE"] = str(HUGGINGFACE_DIR / "hub")


class ModelNotInstalledError(RuntimeError):
    """Raised when parsing requests a model that was not provisioned locally."""


def eprint(*args: object) -> None:
    print(*args, file=sys.stderr)


def build_pipeline(lang: str, package=None):
    import stanza

    # `package` selects which treebank the models were trained on, and may be a
    # name or a per-processor map. The map matters: Stanza's transformer-backed
    # variants exist only for some processors, so `ewt_electra-large` is a valid
    # `depparse` package and not a valid `tokenize` one.
    extra = {"package": package} if package else {}
    try:
        return stanza.Pipeline(
            lang=lang,
            dir=str(MODEL_DIR),
            processors=PROCESSORS,
            **extra,
            tokenize_no_ssplit=True,
            download_method=None,
            logging_level="ERROR",
            verbose=False,
        )
    except ImportError:
        # A transformer-backed Stanza package needs Python Transformers. This
        # is an environment problem, not a missing Stanza model: downloading
        # again cannot fix it and wastes a large first-run download.
        raise
    except Exception as error:
        # Parsing is deliberately network-free. Models are provisioned by
        # `pnpm run model:download`, not as an incidental side effect of a
        # parser command. This makes the selected model explicit and keeps all
        # resources inside the owning project's ignored model directory.
        raise ModelNotInstalledError(
            f"Stanza model for '{lang}' is not installed in {MODEL_DIR}.\n"
            f"  pnpm run model:download -- --language {lang}"
        ) from error


def misc_with_offsets(token, base: int) -> str:
    """Rewrite MISC so character offsets index the original document."""
    parts = []
    start = token.get("start_char")
    end = token.get("end_char")
    if start is not None:
        parts.append(f"start_char={start + base}")
    if end is not None:
        parts.append(f"end_char={end + base}")

    existing = token.get("misc")
    if existing:
        for item in existing.split("|"):
            if item and not item.startswith(("start_char=", "end_char=")):
                parts.append(item)

    return "|".join(parts) if parts else "_"


def emit(sentence, base: int, index: int, out) -> None:
    print(f"# sent_id = {index + 1}", file=out)
    print(f"# base_offset = {base}", file=out)
    text = sentence.text if hasattr(sentence, "text") else ""
    print(f"# text = {text}", file=out)

    for token in sentence.to_dict():
        token_id = token.get("id")
        # Stanza reports a multi-word token's range as a tuple.
        if isinstance(token_id, (list, tuple)):
            printed_id = f"{token_id[0]}-{token_id[-1]}"
            head = "_"
            deprel = "_"
        else:
            printed_id = str(token_id)
            head = str(token.get("head", "_"))
            deprel = token.get("deprel") or "_"

        columns = [
            printed_id,
            token.get("text") or "_",
            token.get("lemma") or "_",
            token.get("upos") or "_",
            token.get("xpos") or "_",
            token.get("feats") or "_",
            head,
            deprel,
            "_",
            misc_with_offsets(token, base),
        ]
        print("\t".join(columns), file=out)

    print("", file=out)


PIPELINES: dict = {}


def pipeline_for(lang: str, package=None):
    """Cached per (language, package). Building one is the expensive step.

    The key is serialised rather than the raw value: `package` may be a
    per-processor dict now that transformer variants are selectable, and a dict
    cannot be a key.
    """
    key = (lang, json.dumps(package, sort_keys=True))
    if key not in PIPELINES:
        PIPELINES[key] = build_pipeline(lang, package)
    return PIPELINES[key]


def conllu_for(request: dict) -> str:
    """Render one request to CoNLL-U."""
    lang = request.get("lang")
    package = request.get("package") or None
    sentences = request.get("sentences") or []
    if not lang:
        raise ValueError("request is missing 'lang'")
    if not sentences:
        return ""

    pipeline = pipeline_for(lang, package)
    out = io.StringIO()
    for index, item in enumerate(sentences):
        text = item.get("text", "")
        base = int(item.get("start", 0))
        if not text.strip():
            continue
        document = pipeline(text)
        # `tokenize_no_ssplit` keeps one input sentence as one output sentence,
        # but a defensive loop costs nothing and avoids silently dropping text.
        for sentence in document.sentences:
            emit(sentence, base, index, out)
    return out.getvalue()


def serve() -> int:
    """Answer newline-delimited JSON requests until stdin closes."""
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
            response = {"conllu": conllu_for(request)}
        except ImportError as error:
            response = {
                "error": f"ImportError: {error}. Run `pnpm run setup:stanza` "
                "from this project to install the bridge dependencies."
            }
        except ModelNotInstalledError as error:
            response = {"error": str(error)}
        except Exception as error:  # noqa: BLE001 - reported to the Node side
            response = {"error": f"{type(error).__name__}: {error}"}
        # One response per line, flushed, or the caller waits forever.
        sys.stdout.write(json.dumps(response) + "\n")
        sys.stdout.flush()
    return 0


def main() -> int:
    if "--serve" in sys.argv[1:]:
        return serve()

    try:
        request = json.load(sys.stdin)
    except json.JSONDecodeError as error:
        eprint(f"[stanza-bridge] stdin is not valid JSON: {error}")
        return 2

    lang = request.get("lang")
    package = request.get("package") or None
    sentences = request.get("sentences") or []
    if not lang:
        eprint("[stanza-bridge] request is missing 'lang'")
        return 2
    if not sentences:
        return 0

    try:
        pipeline = build_pipeline(lang, package)
    except ModuleNotFoundError:
        eprint(
            "[stanza-bridge] stanza is not installed.\n"
            "  python3 -m venv --system-site-packages .venv-stanza\n"
            "  pnpm run setup:stanza"
        )
        return 3
    except ImportError as error:
        eprint(
            f"[stanza-bridge] missing a Python dependency: {error}\n"
            "  pnpm run setup:stanza"
        )
        return 3
    except ModelNotInstalledError as error:
        eprint(f"[stanza-bridge] {error}")
        return 4
    except Exception as error:  # noqa: BLE001 - surfaced to the Node side verbatim
        eprint(f"[stanza-bridge] could not start the pipeline: {error}")
        return 4

    for index, item in enumerate(sentences):
        text = item.get("text", "")
        base = int(item.get("start", 0))
        if not text.strip():
            continue
        document = pipeline(text)
        for sentence in document.sentences:
            emit(sentence, base, index, sys.stdout)

    return 0


if __name__ == "__main__":
    sys.exit(main())
