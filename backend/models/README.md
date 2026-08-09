# Local model assets

This directory is the standalone application's local model root. The layout is
tracked, but model binaries are ignored and downloaded only when requested.

- `stanza/` contains explicit Stanza language resources.
- `huggingface/` contains transformer backbones required by Stanza packages.
- `<language>/` may contain converted ONNX runtime models.

Initialize the Python bridge, then provision only the languages you use:

```bash
pnpm run setup:stanza # install local Python dependencies; no model download
pnpm run model:download -- --language en,ru # store English and Russian models locally
```
