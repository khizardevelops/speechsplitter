#!/usr/bin/env python3
"""Provision one explicit Stanza language model outside the parser runtime."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path


PROCESSORS = "tokenize,pos,lemma,depparse"


def main() -> int:
    parser = argparse.ArgumentParser(description="Download one explicit Stanza language package.")
    parser.add_argument("--lang", required=True, help="Stanza language code, for example fa")
    parser.add_argument("--model-dir", required=True, help="Repository-local Stanza resource directory")
    parser.add_argument("--huggingface-dir", required=True, help="Repository-local Hugging Face cache directory")
    parser.add_argument("--package-json", help="JSON Stanza package selector")
    args = parser.parse_args()

    model_dir = Path(args.model_dir)
    huggingface_dir = Path(args.huggingface_dir)
    package = json.loads(args.package_json) if args.package_json else None
    model_dir.mkdir(parents=True, exist_ok=True)
    huggingface_dir.mkdir(parents=True, exist_ok=True)
    os.environ["HF_HOME"] = str(huggingface_dir)
    os.environ["HF_HUB_CACHE"] = str(huggingface_dir / "hub")

    try:
        import stanza
    except ModuleNotFoundError:
        print("[stanza-model] Stanza is not installed. Run `pnpm run setup:stanza` first.", file=sys.stderr)
        return 3

    print(
        f"[stanza-model] downloading '{args.lang}'"
        f"{f' ({package})' if package else ''} into {model_dir}",
        file=sys.stderr,
    )
    stanza.download(
        args.lang,
        model_dir=str(model_dir),
        processors=PROCESSORS,
        package=package,
        logging_level="ERROR",
        verbose=False,
    )
    print(f"[stanza-model] '{args.lang}' is ready in {model_dir}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
