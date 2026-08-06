/**
 * Whether to write ⌘ or Ctrl.
 *
 * A shortcut printed with the wrong modifier is worse than no shortcut at all —
 * it teaches the reader something false about their own keyboard. The handler
 * accepts either key regardless; this only decides what the interface claims.
 */

import { browser } from '$app/environment';

const isApple = browser && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);

export const commandKey = isApple ? '⌘' : 'Ctrl';
export const processShortcut = isApple ? '⌘↵' : 'Ctrl+↵';
