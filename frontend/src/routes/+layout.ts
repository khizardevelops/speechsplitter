/**
 * No server rendering.
 *
 * Which shell to draw depends on the window width and on a preference kept in
 * `localStorage`, neither of which exists on a server — so an SSR pass could only
 * guess, and a wrong guess is a full-layout swap on hydration rather than a
 * cosmetic flicker. There is nothing to lose by skipping it: the page cannot
 * show anything until it has asked the local service what is installed, so the
 * markup a server could produce is an empty shell either way.
 */
export const ssr = false;
