'use strict';

/**
 * paths.js
 * --------
 * Responsible for locating the Claude Desktop installation and, specifically,
 * its `app.asar` archive across Windows and macOS.
 *
 * Claude Desktop is distributed differently on each platform:
 *
 *   • Windows : installed per-user via Squirrel into
 *               %LOCALAPPDATA%\AnthropicClaude\app-<version>\resources\app.asar
 *               (the version folder changes on every update, so we glob for it)
 *
 *   • macOS   : installed as a normal .app bundle, usually at
 *               /Applications/Claude.app/Contents/Resources/app.asar
 *
 * Because update mechanisms and install locations change over time, this module
 * checks a *list* of candidate locations rather than hard-coding a single path.
 * The first candidate that actually contains an `app.asar` wins.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

/** Build the ordered list of candidate `resources` directories for Windows. */
function windowsResourceDirs() {
  const candidates = [];
  const localAppData =
    process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files';

  // The standard Squirrel install root for Claude Desktop.
  const squirrelRoots = [
    path.join(localAppData, 'AnthropicClaude'),
    path.join(localAppData, 'Programs', 'AnthropicClaude'),
    path.join(programFiles, 'AnthropicClaude'),
  ];

  for (const root of squirrelRoots) {
    if (!safeIsDir(root)) continue;

    // Squirrel keeps versioned folders named like `app-0.7.1`. There may be
    // several (old + new). Sort descending so the newest is tried first.
    const versionDirs = safeReadDir(root)
      .filter((name) => name.toLowerCase().startsWith('app-'))
      .sort()
      .reverse();

    for (const dir of versionDirs) {
      candidates.push(path.join(root, dir, 'resources'));
    }

    // Some installs place resources directly under the root.
    candidates.push(path.join(root, 'resources'));
  }

  return candidates;
}

/** Build the ordered list of candidate `Resources` directories for macOS. */
function macResourceDirs() {
  const home = os.homedir();
  return [
    '/Applications/Claude.app/Contents/Resources',
    path.join(home, 'Applications', 'Claude.app', 'Contents', 'Resources'),
  ];
}

/**
 * Locate the Claude Desktop `app.asar`.
 *
 * @returns {{
 *   asarPath: string,
 *   backupPath: string,
 *   resourcesDir: string,
 *   platform: string
 * } | null}  Resolved paths, or `null` if Claude Desktop could not be found.
 */
function locateClaudeAsar() {
  const platform = process.platform;
  let resourceDirs;

  if (platform === 'win32') {
    resourceDirs = windowsResourceDirs();
  } else if (platform === 'darwin') {
    resourceDirs = macResourceDirs();
  } else {
    // Linux / unsupported: still allow an override via env var below.
    resourceDirs = [];
  }

  // Allow power users / CI to override detection entirely.
  if (process.env.CLAUDE_RESOURCES_DIR) {
    resourceDirs.unshift(process.env.CLAUDE_RESOURCES_DIR);
  }

  for (const dir of resourceDirs) {
    const asarPath = path.join(dir, 'app.asar');
    if (safeIsFile(asarPath)) {
      return {
        asarPath,
        backupPath: path.join(dir, 'app.asar.bak'),
        resourcesDir: dir,
        platform,
      };
    }
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* Small, crash-proof filesystem helpers                                      */
/* -------------------------------------------------------------------------- */

function safeIsDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch (_) {
    return false;
  }
}

function safeIsFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch (_) {
    return false;
  }
}

function safeReadDir(p) {
  try {
    return fs.readdirSync(p);
  } catch (_) {
    return [];
  }
}

module.exports = {
  locateClaudeAsar,
  // Exported for unit testing / advanced usage.
  windowsResourceDirs,
  macResourceDirs,
};
