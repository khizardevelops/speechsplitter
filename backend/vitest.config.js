import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Workspace package -> its TypeScript source, so tests need no build step.
 * The engine is NOT aliased: `langchunk` and its subpaths resolve through
 * node_modules to the published package — the tests exercise what a consumer
 * actually installs.
 */
const packages = {
  "@langchunk/packs": "packages/packs/src/index.ts",
  "@langchunk/corrections": "packages/corrections/src/index.ts",
  "@langchunk/cli": "apps/cli/src/index.ts",
  "@speechsplitter/pipeline": "packages/pipeline/src/index.ts",
  "@speechsplitter/tier1-stanza": "packages/tier1-stanza/src/index.ts",
  "@speechsplitter/tier1-onnx": "packages/tier1-onnx/src/index.ts",
  "@speechsplitter/tier1-agreement": "packages/tier1-agreement/src/index.ts",
};

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: [
      "packages/*/test/**/*.{test,spec}.ts",
      "apps/*/test/**/*.{test,spec}.ts",
      "tests/**/*.{test,spec}.ts",
    ],
  },
  resolve: {
    preserveSymlinks: true,
    alias: Object.fromEntries(
      Object.entries(packages).map(([name, file]) => [
        name,
        path.resolve(__dirname, file),
      ]),
    ),
  },
});
