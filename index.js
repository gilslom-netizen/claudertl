#!/usr/bin/env node
'use strict';

/**
 * index.js — Claude RTL Patcher
 * =============================
 * Command-line entry point and orchestrator.
 *
 * Usage:
 *   claude-rtl-patcher                 Interactive menu (Install / Restore / Quit)
 *   claude-rtl-patcher --install       Install the RTL patch
 *   claude-rtl-patcher --uninstall     Restore the original (alias: --restore)
 *   claude-rtl-patcher --status        Show current install state and paths
 *   claude-rtl-patcher --help          Show help
 *
 * This file deliberately keeps all the risky filesystem/asar work inside the
 * `src/` modules. Its only jobs are: parse args, present a friendly UI, and
 * translate failures into calm, actionable messages (never raw stack traces).
 */

const readline = require('readline');

const { logger, paint } = require('./src/logger');
const { locateClaudeAsar } = require('./src/paths');
const { backupExists } = require('./src/backup');
const { install } = require('./src/patcher');
const { restore } = require('./src/restore');

const VERSION = require('./package.json').version;

/* -------------------------------------------------------------------------- */
/* Argument parsing                                                           */
/* -------------------------------------------------------------------------- */

function parseArgs(argv) {
  const args = new Set(argv.slice(2));
  if (args.has('--help') || args.has('-h')) return 'help';
  if (args.has('--install') || args.has('-i')) return 'install';
  if (args.has('--uninstall') || args.has('--restore') || args.has('-u')) {
    return 'restore';
  }
  if (args.has('--status') || args.has('-s')) return 'status';
  if (args.has('--version') || args.has('-v')) return 'version';
  return 'menu';
}

/* -------------------------------------------------------------------------- */
/* Commands                                                                   */
/* -------------------------------------------------------------------------- */

function printHeader() {
  logger.raw('');
  logger.raw(paint('cyan', '  ╔══════════════════════════════════════════════╗'));
  logger.raw(paint('cyan', '  ║        Claude RTL Patcher  ·  v' + VERSION.padEnd(8) + '    ║'));
  logger.raw(paint('cyan', '  ║   Hebrew / Arabic RTL fix for Claude Desktop  ║'));
  logger.raw(paint('cyan', '  ╚══════════════════════════════════════════════╝'));
}

function printHelp() {
  printHeader();
  logger.raw(`
${paint('bold', 'Usage:')}
  claude-rtl-patcher [command]

${paint('bold', 'Commands:')}
  ${paint('green', '--install')}       Back up app.asar and inject the RTL stylesheet.
  ${paint('green', '--uninstall')}     Restore the original app.asar from backup.
                  (aliases: --restore, -u)
  ${paint('green', '--status')}        Show whether Claude is found / patched / backed up.
  ${paint('green', '--version')}       Print the version.
  ${paint('green', '--help')}          Show this help.

Run with no arguments for an interactive menu.

${paint('bold', 'Notes:')}
  • A pristine backup (app.asar.bak) is ALWAYS created before patching.
  • The patch fails silently inside Claude and never crashes the app.
  • Close Claude Desktop completely before installing or restoring.
  • You may need elevated permissions on macOS (sudo) if Claude lives in
    /Applications.
`);
}

/**
 * Resolve the Claude target or print a friendly "not found" message.
 * @returns {object|null}
 */
function requireTarget() {
  const target = locateClaudeAsar();
  if (!target) {
    logger.error('Could not find the Claude Desktop installation.');
    logger.info('Checked the standard locations for your platform.');
    logger.info('Make sure Claude Desktop is installed: https://claude.ai/download');
    logger.info(
      'If it is installed in a custom location, set the CLAUDE_RESOURCES_DIR ' +
        'environment variable to the folder that contains app.asar and retry.'
    );
    return null;
  }
  return target;
}

function showStatus() {
  printHeader();
  logger.banner('Status');
  const target = locateClaudeAsar();
  if (!target) {
    logger.warn('Claude Desktop: NOT FOUND');
    logger.info('Set CLAUDE_RESOURCES_DIR to override detection.');
    return;
  }

  const patched = isPatched(target);
  logger.info(`Platform        : ${target.platform}`);
  logger.info(`Resources dir   : ${target.resourcesDir}`);
  logger.info(`app.asar        : ${target.asarPath}`);
  logger.info(
    `Backup (.bak)   : ${backupExists(target.backupPath) ? paint('green', 'present') : paint('yellow', 'none yet')}`
  );
  logger.info(
    `Patch installed : ${patched ? paint('green', 'YES') : paint('yellow', 'no')}`
  );
}

/**
 * Heuristic: a backup existing strongly implies the patch was installed at
 * least once. (We keep this lightweight; the authoritative marker lives inside
 * the asar, but reading it would require an extract.)
 */
function isPatched(target) {
  return backupExists(target.backupPath);
}

async function runInstall() {
  printHeader();
  const target = requireTarget();
  if (!target) return 1;

  logger.info(`Found Claude Desktop at: ${target.asarPath}`);
  logger.warn('Please make sure Claude Desktop is fully CLOSED before continuing.');

  try {
    const { patchedFiles } = await install(target);
    logger.banner('Done');
    logger.success(`RTL patch installed into ${patchedFiles.length} entry point(s).`);
    logger.info('Start Claude Desktop — Hebrew/Arabic text should now flow RTL.');
    logger.info('To undo at any time, run this tool with --uninstall.');
    return 0;
  } catch (err) {
    logger.banner('Install failed');
    logger.error(err.message);
    logger.info(
      'Your original app.asar was NOT modified in place — if a backup was ' +
        'created you can always run --uninstall to be 100% safe.'
    );
    return 1;
  }
}

function runRestore() {
  printHeader();
  const target = requireTarget();
  if (!target) return 1;

  try {
    const { restored } = restore(target);
    return restored ? 0 : 1;
  } catch (err) {
    logger.error(`Restore failed: ${err.message}`);
    logger.info(
      'If Claude Desktop will not start, reinstall it from ' +
        'https://claude.ai/download to fully reset it.'
    );
    return 1;
  }
}

/* -------------------------------------------------------------------------- */
/* Interactive menu                                                           */
/* -------------------------------------------------------------------------- */

function ask(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function runMenu() {
  printHeader();
  logger.raw(`
  ${paint('bold', 'What would you like to do?')}

    ${paint('green', '1')}) Install the RTL patch
    ${paint('green', '2')}) Restore / Uninstall (revert to original)
    ${paint('green', '3')}) Show status
    ${paint('green', '4')}) Quit
`);

  const choice = await ask('  Enter choice [1-4]: ');
  switch (choice) {
    case '1':
      return runInstall();
    case '2':
      return runRestore();
    case '3':
      showStatus();
      return 0;
    case '4':
    case '':
      logger.info('Bye!');
      return 0;
    default:
      logger.warn(`Unrecognized choice: "${choice}"`);
      return 1;
  }
}

/* -------------------------------------------------------------------------- */
/* Main                                                                       */
/* -------------------------------------------------------------------------- */

async function main() {
  const command = parseArgs(process.argv);
  let exitCode = 0;

  switch (command) {
    case 'help':
      printHelp();
      break;
    case 'version':
      logger.raw(VERSION);
      break;
    case 'status':
      showStatus();
      break;
    case 'install':
      exitCode = await runInstall();
      break;
    case 'restore':
      exitCode = runRestore();
      break;
    case 'menu':
    default:
      exitCode = await runMenu();
      break;
  }

  process.exit(exitCode);
}

// Top-level safety net: even an unexpected bug prints a calm message, not a
// raw stack trace, and exits cleanly.
main().catch((err) => {
  logger.error('Unexpected error: ' + (err && err.message ? err.message : err));
  process.exit(1);
});
