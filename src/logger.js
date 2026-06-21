'use strict';

/**
 * logger.js
 * ---------
 * A tiny, dependency-free console logger with ANSI colors and a consistent
 * prefix. Kept deliberately simple so the project can be compiled with `pkg`
 * without pulling extra runtime dependencies.
 *
 * Colors degrade gracefully: if the terminal does not support ANSI codes,
 * the worst case is a few stray escape sequences — never a crash.
 */

const COLORS = {
  reset: '\x1b[0m',
  gray: '\x1b[90m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

function paint(color, text) {
  return `${COLORS[color] || ''}${text}${COLORS.reset}`;
}

const logger = {
  /** Section banner — used to visually separate major steps. */
  banner(text) {
    const line = '─'.repeat(Math.max(text.length + 4, 40));
    console.log('');
    console.log(paint('cyan', line));
    console.log(paint('cyan', `  ${COLORS.bold}${text}`));
    console.log(paint('cyan', line));
  },

  step(text) {
    console.log(`${paint('blue', '→')} ${text}`);
  },

  info(text) {
    console.log(`${paint('gray', 'ℹ')} ${text}`);
  },

  success(text) {
    console.log(`${paint('green', '✔')} ${text}`);
  },

  warn(text) {
    console.warn(`${paint('yellow', '⚠')} ${text}`);
  },

  error(text) {
    console.error(`${paint('red', '✖')} ${text}`);
  },

  raw(text) {
    console.log(text);
  },
};

module.exports = { logger, paint, COLORS };
