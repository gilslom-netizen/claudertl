<div align="center">

# 🔄 Claude RTL Patcher

### Fix Right-to-Left (RTL) text in the Claude Desktop app for Hebrew & Arabic users

A tiny, **safe**, and **fully reversible** desktop utility that teaches the official
[Claude Desktop](https://claude.ai/download) app to render Hebrew / Arabic text in the
correct right-to-left direction — without touching a single line of Claude's source code by hand.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-blue.svg)](#-supported-platforms)
[![Made for](https://img.shields.io/badge/for-Hebrew%20%2F%20Arabic-orange.svg)](#)

</div>

---

## ✨ Why this exists

Claude Desktop is a fantastic app — but for users typing in **Hebrew** or **Arabic**, the
text often renders left-to-right, making conversations awkward to read and write.

This patcher injects a small, defensive stylesheet into Claude's renderer so that:

- 🟢 **Hebrew / Arabic paragraphs flow right-to-left**, automatically.
- 🟢 **English text and code blocks stay left-to-right** — nothing gets mangled.
- 🟢 The fix re-applies itself even after Claude re-renders the UI.

It does all of this **the safe way**: a pristine backup first, an additive injection that
never relies on fragile line numbers, and a one-click restore if you ever change your mind.

---

## 🛡️ Safety first — how we avoid breaking Claude

This tool was built around four hard safety guarantees:

| Guarantee | What it means |
|---|---|
| **🔒 Bulletproof backup** | Before *any* change, a pristine copy of `app.asar` is saved as `app.asar.bak`. The backup is only ever created from the original, never from an already-patched file. |
| **↩️ One-command restore** | `--uninstall` deletes the patched archive and moves the original backup back into place. Instant, byte-for-byte recovery. |
| **💥 Anti-crash injection** | The injected JavaScript is wrapped in nested `try/catch` blocks. If a future Claude update renames a class or changes the DOM, the patch **fails silently** — Claude keeps running perfectly. |
| **🧩 Update-proof method** | We **append** a `<script>` tag and a standalone JS file rather than editing core files by line number. Patches survive Claude's frequent internal refactors. |

> [!IMPORTANT]
> This is an unofficial, community tool. It is not affiliated with or endorsed by Anthropic.
> Modifying the app is at your own discretion — but the restore feature means you can always
> get back to a clean install in seconds.

---

## 🚀 Quick start — for non-technical users (recommended)

You don't need Node.js or any developer tools. Just grab the pre-built executable:

1. Go to the **[Releases page](../../releases)**.
2. Download the file for your system:
   - **Windows:** `claude-rtl-patcher-win.exe`
   - **macOS (Intel):** `claude-rtl-patcher-macos`
   - **macOS (Apple Silicon):** `claude-rtl-patcher-macos-arm64`
3. **Fully close the Claude Desktop app.**
4. Run the downloaded file:
   - **Windows:** double-click `claude-rtl-patcher-win.exe`.
   - **macOS:** open Terminal, then run
     ```bash
     chmod +x ./claude-rtl-patcher-macos
     ./claude-rtl-patcher-macos
     ```
     (On macOS you may need `sudo ./claude-rtl-patcher-macos` if Claude is in `/Applications`.)
5. Choose **1) Install the RTL patch** from the menu.
6. Re-open Claude Desktop — enjoy proper RTL! 🎉

To undo everything, run the tool again and choose **2) Restore / Uninstall**.

> [!NOTE]
> macOS may warn that the binary is from an unidentified developer. Right-click → **Open**,
> or allow it under **System Settings → Privacy & Security**.

---

## 🧑‍💻 Running from source (for developers)

Requires **Node.js 16+**.

```bash
# 1. Clone and install dependencies
git clone https://github.com/<your-username>/claude-rtl-patcher.git
cd claude-rtl-patcher
npm install

# 2. Close Claude Desktop, then install the patch
npm run install:patch
#   ...or directly:
node index.js --install

# 3. Restore the original at any time
npm run uninstall:patch
#   ...or:
node index.js --uninstall
```

### All commands

```text
node index.js              Interactive menu (Install / Restore / Status / Quit)
node index.js --install    Back up app.asar and inject the RTL stylesheet
node index.js --uninstall  Restore the original app.asar from backup
node index.js --status     Show whether Claude is found / patched / backed up
node index.js --help       Show help
node index.js --version    Print the version
```

---

## 📦 Building standalone executables

We use [`pkg`](https://github.com/vercel/pkg) to compile the Node.js script into a single
self-contained binary, so end users don't need Node installed.

```bash
# Build Windows + macOS (Intel) binaries into ./dist
npm run build

# Or build individually:
npm run build:win        # → dist/claude-rtl-patcher-win.exe
npm run build:mac        # → dist/claude-rtl-patcher-macos
npm run build:mac:arm    # → dist/claude-rtl-patcher-macos-arm64
```

Upload the resulting files in `dist/` to a **GitHub Release** so users can download them
directly from the Releases page.

---

## 🗂️ Project structure

```text
claude-rtl-patcher/
├── index.js                # CLI entry point & orchestrator (args, menu, safety net)
├── package.json            # Dependencies, scripts, and pkg build config
├── README.md               # You are here
├── LICENSE                 # MIT
├── .gitignore
└── src/
    ├── paths.js            # Locate Claude Desktop's app.asar (Windows & macOS)
    ├── backup.js           # Pristine, verified backup of app.asar → app.asar.bak
    ├── injection.js        # The RTL CSS + the defensive, crash-proof inject script
    ├── patcher.js          # Extract → inject → repack pipeline
    ├── restore.js          # Uninstall / rollback from backup
    └── logger.js           # Small colored console logger (no extra deps)
```

---

## 🔬 How it works (under the hood)

1. **Locate** `app.asar`. Claude is an Electron app, so its UI lives inside an `asar` archive.
   We search the standard install paths per-platform (and accept a `CLAUDE_RESOURCES_DIR`
   override for custom installs).
2. **Backup.** If `app.asar.bak` doesn't already exist, we copy the original and verify the
   copy by size before continuing.
3. **Extract** the archive into a temporary folder using [`@electron/asar`](https://github.com/electron/asar).
4. **Inject.** We drop a standalone `claude-rtl-patcher.inject.js` next to each renderer
   `index.html` and append a single `<script src="…">` tag right before `</body>`. The script:
   - installs an RTL `<style>` element,
   - uses `unicode-bidi: plaintext` so each paragraph auto-picks its own direction,
   - forces code blocks back to LTR,
   - re-installs itself via a `MutationObserver` (+ a low-frequency timer) if Claude wipes it,
   - is wrapped in nested `try/catch` so it can **never** crash the host app.
5. **Repack** the folder back into `app.asar` and clean up the temp files.

Because the injection is **additive** and **attribute-based** (not line-number based), it is
resilient to Claude's frequent UI updates.

---

## ❓ Troubleshooting

<details>
<summary><b>"Could not find the Claude Desktop installation"</b></summary>

Make sure Claude Desktop is installed from <https://claude.ai/download>. If it lives in a
custom location, set the environment variable to the folder containing `app.asar`:

```bash
# macOS / Linux
CLAUDE_RESOURCES_DIR="/path/to/Claude.app/Contents/Resources" node index.js --install

# Windows (PowerShell)
$env:CLAUDE_RESOURCES_DIR="C:\path\to\resources"; node index.js --install
```
</details>

<details>
<summary><b>Permission denied on macOS</b></summary>

If Claude is in `/Applications`, you may need elevated permissions:

```bash
sudo ./claude-rtl-patcher-macos
```
</details>

<details>
<summary><b>A Claude update reverted the patch</b></summary>

App updates replace `app.asar`, which removes the patch (and leaves your `.bak` from the old
version). Just run **Install** again after updating. Then run **Restore** if you want a clean
state, or delete a stale `app.asar.bak` and re-install to refresh the backup.
</details>

<details>
<summary><b>Something looks broken — how do I fully reset?</b></summary>

Run the tool and choose **Restore / Uninstall**. If the backup is missing, simply reinstall
Claude Desktop from <https://claude.ai/download> for a 100% clean slate.
</details>

---

## 🤝 Contributing

Issues and pull requests are welcome! Good first contributions:

- Tweaks to the RTL stylesheet for edge cases (tables, blockquotes, tooltips).
- Additional install-path detection for unusual setups.
- Linux support.

---

## ⚖️ License

[MIT](./LICENSE) — free to use, modify, and distribute.

> Not affiliated with Anthropic. "Claude" is a trademark of Anthropic. This project merely
> applies a user stylesheet to your own local installation.
