'use strict';

/**
 * backup.js
 * ---------
 * The "bulletproof rollback" foundation. Before ANY modification is made to
 * `app.asar`, we guarantee a pristine, untouched copy exists at
 * `app.asar.bak`.
 *
 * Rules enforced here:
 *   1. A backup is created ONLY if one does not already exist. This ensures the
 *      `.bak` always reflects the *original, unpatched* archive — we never
 *      accidentally back up an already-patched file on a second run.
 *   2. The copy is verified (size comparison) before we report success.
 */

const fs = require('fs');
const { logger } = require('./logger');

/**
 * Ensure a pristine backup of `asarPath` exists at `backupPath`.
 *
 * @param {string} asarPath   Path to the live app.asar.
 * @param {string} backupPath Path where the backup should live (app.asar.bak).
 * @returns {{ created: boolean }} `created` is true if a new backup was written.
 */
function ensureBackup(asarPath, backupPath) {
  if (fs.existsSync(backupPath)) {
    logger.info(`Pristine backup already exists: ${backupPath}`);
    logger.info('Re-using existing backup (this is the original, unpatched archive).');
    return { created: false };
  }

  logger.step('No backup found — creating a pristine backup before any changes…');
  fs.copyFileSync(asarPath, backupPath);

  // Verify the copy actually succeeded by comparing byte sizes.
  const srcSize = fs.statSync(asarPath).size;
  const bakSize = fs.statSync(backupPath).size;
  if (srcSize !== bakSize) {
    throw new Error(
      `Backup verification failed: source is ${srcSize} bytes but backup is ${bakSize} bytes. ` +
        'Aborting before any modification.'
    );
  }

  logger.success(`Backup created and verified (${formatBytes(bakSize)}): ${backupPath}`);
  return { created: true };
}

/** Whether a backup file currently exists. */
function backupExists(backupPath) {
  return fs.existsSync(backupPath);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

module.exports = { ensureBackup, backupExists, formatBytes };
