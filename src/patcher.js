'use strict';

/**
 * patcher.js
 * ----------
 * The core "install" pipeline:
 *
 *   1. Locate Claude Desktop's app.asar.
 *   2. Ensure a pristine backup exists (delegated to backup.js).
 *   3. Extract the archive to a temporary working directory.
 *   4. Inject the RTL payload into the renderer's HTML entry point(s) in a
 *      resilient, update-proof way (append, never overwrite by line number).
 *   5. Repack the directory back into app.asar.
 *   6. Clean up the temp directory.
 *
 * The injection itself is intentionally additive: we drop a standalone JS file
 * next to each `index.html` and append a single `<script src=…>` tag just
 * before `</body>`. Nothing in the original files is rewritten or reordered, so
 * the patch survives Claude's frequent internal refactors.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const asar = require('@electron/asar');

const { logger } = require('./logger');
const { ensureBackup } = require('./backup');
const {
  buildInjectionScript,
  INJECTION_MARKER,
} = require('./injection');

// Name of the standalone script file we drop into the extracted app.
const INJECT_FILENAME = 'claude-rtl-patcher.inject.js';

/**
 * Run the full install pipeline.
 *
 * @param {object} target Result of locateClaudeAsar().
 * @returns {{ patchedFiles: string[] }}
 */
async function install(target) {
  const { asarPath, backupPath, resourcesDir } = target;

  // --- Step 1: guarantee a pristine backup BEFORE touching anything. -------
  logger.banner('Step 1/4 · Backup');
  ensureBackup(asarPath, backupPath);

  // --- Step 2: extract to a temp working directory. ------------------------
  logger.banner('Step 2/4 · Extract');
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-rtl-'));
  logger.step(`Extracting app.asar → ${workDir}`);
  asar.extractAll(asarPath, workDir);
  logger.success('Archive extracted.');

  // --- Step 3: inject the RTL payload. -------------------------------------
  logger.banner('Step 3/4 · Inject');
  const patchedFiles = injectIntoRenderer(workDir);

  if (patchedFiles.length === 0) {
    // Don't leave a half-baked temp dir lying around.
    safeRemoveDir(workDir);
    throw new Error(
      'Could not find an HTML entry point to inject into. Claude Desktop may ' +
        'have changed its packaging. No changes were written; your app is untouched.'
    );
  }

  // --- Step 4: repack into app.asar. ---------------------------------------
  // We pack to a temporary archive first and then atomically move it over the
  // live app.asar. This avoids a read/write-to-same-path hazard (the asar lib
  // caches archives by path) and means an interrupted pack can never leave a
  // half-written app.asar — the original stays intact until the final rename.
  logger.banner('Step 4/4 · Repack');
  logger.step('Re-packing patched files into app.asar…');
  const tmpAsar = `${asarPath}.patched.tmp`;
  await asar.createPackage(workDir, tmpAsar);
  fs.renameSync(tmpAsar, asarPath);
  logger.success(`Re-packed: ${asarPath}`);

  // Cleanup.
  safeRemoveDir(workDir);
  logger.info('Temporary working directory cleaned up.');

  return { patchedFiles };
}

/**
 * Inject the payload into every renderer HTML entry point found in `workDir`.
 *
 * @param {string} workDir Extracted app directory.
 * @returns {string[]} Relative paths of the HTML files that were patched.
 */
function injectIntoRenderer(workDir) {
  const htmlFiles = findHtmlEntryPoints(workDir);
  if (htmlFiles.length === 0) return [];

  const scriptSource = buildInjectionScript();
  const patched = [];

  for (const htmlPath of htmlFiles) {
    try {
      let html = fs.readFileSync(htmlPath, 'utf8');

      // Idempotency: never inject twice into the same file.
      if (html.includes(INJECTION_MARKER)) {
        logger.info(`Already patched, skipping: ${path.relative(workDir, htmlPath)}`);
        continue;
      }

      // Drop the standalone inject script next to the HTML file so the
      // <script src> reference is a simple, relative same-origin path. Using an
      // external file (rather than an inline script) avoids tripping any
      // inline-script Content-Security-Policy that Claude may enforce.
      const injectFilePath = path.join(path.dirname(htmlPath), INJECT_FILENAME);
      fs.writeFileSync(injectFilePath, scriptSource, 'utf8');

      const tag = `<script src="./${INJECT_FILENAME}"></script>`;

      // Append just before </body> (preferred) or </html>, else at EOF.
      let injectedHtml;
      if (/<\/body>/i.test(html)) {
        injectedHtml = html.replace(/<\/body>/i, `  ${tag}\n</body>`);
      } else if (/<\/html>/i.test(html)) {
        injectedHtml = html.replace(/<\/html>/i, `${tag}\n</html>`);
      } else {
        injectedHtml = `${html}\n${tag}\n`;
      }

      fs.writeFileSync(htmlPath, injectedHtml, 'utf8');
      const rel = path.relative(workDir, htmlPath);
      logger.success(`Injected RTL hook into: ${rel}`);
      patched.push(rel);
    } catch (err) {
      // One bad file shouldn't abort the whole patch — log and continue.
      logger.warn(
        `Failed to patch ${path.relative(workDir, htmlPath)}: ${err.message}`
      );
    }
  }

  return patched;
}

/**
 * Find candidate renderer HTML entry points inside the extracted app.
 *
 * Preference order:
 *   1. Files literally named `index.html` (the conventional renderer entry).
 *   2. If none exist, any `.html` file that contains a closing </body>/</html>.
 *
 * `node_modules` is skipped to avoid patching bundled third-party demos.
 *
 * @param {string} workDir
 * @returns {string[]} Absolute paths.
 */
function findHtmlEntryPoints(workDir) {
  const allHtml = walk(workDir).filter((p) => p.toLowerCase().endsWith('.html'));

  const indexFiles = allHtml.filter(
    (p) => path.basename(p).toLowerCase() === 'index.html'
  );

  if (indexFiles.length > 0) return indexFiles;

  // Fallback: any HTML that looks like a real document.
  return allHtml.filter((p) => {
    try {
      const head = fs.readFileSync(p, 'utf8');
      return /<\/body>/i.test(head) || /<\/html>/i.test(head);
    } catch (_) {
      return false;
    }
  });
}

/** Recursively collect every file path under `dir` (skips node_modules). */
function walk(dir, acc = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_) {
    return acc;
  }

  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, acc);
    } else if (entry.isFile()) {
      acc.push(full);
    }
  }
  return acc;
}

/** Best-effort recursive directory removal. */
function safeRemoveDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (_) {
    // Older Node fallback.
    try {
      fs.rmdirSync(dir, { recursive: true });
    } catch (_) {
      /* ignore */
    }
  }
}

module.exports = {
  install,
  injectIntoRenderer,
  findHtmlEntryPoints,
  INJECT_FILENAME,
};
