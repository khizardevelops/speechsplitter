/**
 * @langchunk/cli — the terminal renderers.
 *
 * The binary lives in `cli.ts`. The pipeline itself is `langchunk/pipeline`,
 * so that a non-terminal front end reuses it rather than restating it.
 */

export type { Format } from "./render.js";
export { render } from "./render.js";
