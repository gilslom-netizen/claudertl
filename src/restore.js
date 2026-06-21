'use strict';

/**
 * restore.js
 * ----------
 * The "uninstall / restore" safety hatch.
 *
 * If anything goes wrong — or the user simply wants the stock app back — this
 * restores Claude Desktop to its original state by:
 *
 *   1. Verifying a pristine backup (`app.asar.bak`) exists.
 *   2. Deleting the modified `app.asar`.
 *   3. Renaming the backup back to `app.asar`.
 *
 * We deliberately RENAME (move) the backup back rather than copy-and-keep so
 * the restored archive is byte-for-byte the original. A fresh backup will be
 * created automatically the next time the user installs the patch.
 */

const fs = require('fs');
const { logger } = require('./logger');

/**
 * Restore the original app.asar from its backup.
 *
 * @param {object} target Result of locateClaudeAsar().
 * @returns {{ restored: boolean }}
 */
function restore(target) {
  const { asarPath, backupPath } = target;

  logger.banner('Restore · rolling back to the original Claude Desktop');

  if (!fs.existsSync(backupPath)) {
    logger.error(`No backup found at: ${backupPath}`);
    logger.info(
      'Nothing to restore. Either the patch was never installed, or the ' +
        'backup was deleted. If Claude Desktop is misbehaving, the safest fix ' +
        'is to reinstall it from https://claude.ai/download.'
    );
    return { restored: false };
  }

  // Remove the (possibly patched) live archive if present.
  if (fs.existsSync(asarPath)) {
    logger.step('Removing the patched app.asar…');
    fs.rmSync(asarPath, { force: true });
  }

  // Move the pristine backup back into place.
  logger.step('Restoring the original app.asar from backup…');
  fs.renameSync(backupPath, asarPath);

  logger.success('Original app.asar restored. Claude Desktop is back to stock.');
  logger.info('Restart Claude Desktop for the change to take effect.');
  return { restored: true };
}

module.exports = { restore };
