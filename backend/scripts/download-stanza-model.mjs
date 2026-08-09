import { existsSync } from 'node:fs';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const DOWNLOAD_SCRIPT = join(ROOT, 'scripts', 'stanza-model-download.py');
const MODEL_DIR = join(ROOT, 'models', 'stanza');
const HUGGINGFACE_DIR = join(ROOT, 'models', 'huggingface');

export function usage() {
  return [
    'Usage:',
    '  pnpm run model:download -- --language en',
    '  pnpm run model:download -- --language en,ru',
    '',
    'Downloads only the requested Stanza model(s) into backend/models/stanza/.',
  ].join('\n');
}

export function parseLanguages(args) {
  const requested = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--') continue;
    if (argument === '--help' || argument === '-h') return undefined;
    if (argument === '--language' || argument === '-l') {
      const value = args[index + 1];
      if (!value || value.startsWith('-')) throw new Error(`${argument} requires a language code.`);
      requested.push(...value.split(',').map((part) => part.trim().toLowerCase()).filter(Boolean));
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${argument}`);
  }

  if (requested.length === 0) throw new Error('Choose --language <code>.');
  const selected = new Set();
  for (const language of requested) {
    if (!/^[a-z]{2,3}$/.test(language)) throw new Error(`Invalid Stanza language code: ${language}`);
    selected.add(language);
  }
  return [...selected];
}

function defaultPython() {
  const declared = process.env.LANGCHUNK_PYTHON;
  if (declared) return declared;
  const local = join(ROOT, '.venv-stanza', 'bin', 'python');
  return existsSync(local) ? local : 'python3';
}

async function run(python, language) {
  // `model:download` builds first, but keeping this import inside the action
  // lets argument validation remain usable without generated package output.
  const { BEST_PACKAGES } = await import('../packages/tier1-stanza/dist/index.js');
  const packageSelection = BEST_PACKAGES[language];
  const args = [
    DOWNLOAD_SCRIPT,
    '--lang', language,
    '--model-dir', MODEL_DIR,
    '--huggingface-dir', HUGGINGFACE_DIR,
  ];
  if (packageSelection !== undefined) args.push('--package-json', JSON.stringify(packageSelection));

  const child = spawn(python, args, { cwd: ROOT, stdio: 'inherit' });
  const [code, signal] = await Promise.race([
    once(child, 'close'),
    once(child, 'error').then(([error]) => Promise.reject(error)),
  ]);
  if (code !== 0) {
    throw new Error(`Model download for ${language} failed (${signal ? `signal ${signal}` : `exit ${code}`}).`);
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const languages = parseLanguages(process.argv.slice(2));
    if (languages === undefined) {
      console.log(usage());
    } else {
      const python = defaultPython();
      for (const language of languages) await run(python, language);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(`\n${usage()}`);
    process.exitCode = 2;
  }
}
