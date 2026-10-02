/**
 * Post-process Angular release bundles with javascript-obfuscator.
 * Uses Angular-safe options (no control-flow / self-defending) so DI keeps working.
 */
import { readdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { join, extname } from 'node:path';
import JavaScriptObfuscator from 'javascript-obfuscator';

const ROOT = join(process.cwd(), 'dist', 'miragepaint', 'release');

const OBFUSCATOR_OPTIONS = {
  compact: true,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  debugProtection: false,
  disableConsoleOutput: false,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,
  selfDefending: false,
  simplify: true,
  splitStrings: false,
  stringArray: true,
  stringArrayCallsTransform: false,
  stringArrayEncoding: [],
  stringArrayThreshold: 0.75,
  transformObjectKeys: false,
  unicodeEscapeSequence: false,
};

async function collectJsFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectJsFiles(full)));
    } else if (extname(entry.name) === '.js') {
      files.push(full);
    } else if (entry.name.endsWith('.map')) {
      await unlink(full);
    }
  }
  return files;
}

const jsFiles = await collectJsFiles(ROOT);
if (!jsFiles.length) {
  console.error(`No JS files found under ${ROOT}. Run the Angular release build first.`);
  process.exit(1);
}

for (const file of jsFiles) {
  const code = await readFile(file, 'utf8');
  const result = JavaScriptObfuscator.obfuscate(code, OBFUSCATOR_OPTIONS);
  await writeFile(file, result.getObfuscatedCode(), 'utf8');
  console.log(`obfuscated ${file.slice(ROOT.length + 1)}`);
}

console.log(`Release obfuscation done (${jsFiles.length} file(s)).`);
