import { describe, expect, it } from 'vitest';
import { parseLanguages } from '../scripts/download-stanza-model.mjs';

describe('Stanza model provisioning arguments', () => {
  it('accepts distinct comma-separated Stanza language codes', () => {
    expect(parseLanguages(['--language', 'en,ru,en'])).toEqual(['en', 'ru']);
  });

  it('rejects a missing or malformed language code before downloading', () => {
    expect(() => parseLanguages(['--language'])).toThrow('--language requires a language code.');
    expect(() => parseLanguages(['--language', 'English'])).toThrow('Invalid Stanza language code: english');
  });
});
