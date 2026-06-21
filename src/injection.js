'use strict';

/**
 * injection.js
 * ------------
 * Holds the actual payload that gets injected into Claude Desktop's renderer:
 *
 *   1. `RTL_CSS`        — the stylesheet that fixes Right-to-Left rendering.
 *   2. `buildInjectionScript()` — a self-contained, *defensive* IIFE that
 *      installs the stylesheet at runtime and keeps it alive even when Claude
 *      re-renders or swaps its DOM.
 *
 * DESIGN PRINCIPLE — "fail silently, never crash":
 * Everything the injected script does is wrapped in try/catch. If a future
 * Claude update renames a class, removes an element, or changes its DOM, the
 * worst possible outcome is that RTL simply stops working — the host app keeps
 * running normally. We never throw out of the injected code.
 */

/**
 * A unique marker so we can (a) detect a previous injection and avoid double
 * patching, and (b) cleanly identify our own <style> tag at runtime.
 */
const INJECTION_MARKER = 'claude-rtl-patcher';
const STYLE_ELEMENT_ID = 'claude-rtl-patcher-style';

/**
 * The RTL stylesheet.
 *
 * Strategy:
 *   • We do NOT force the *entire* UI to RTL — that would mangle the layout,
 *     sidebar, and code blocks. Instead we use the `:dir()`-friendly and
 *     Unicode-bidi approach: detect content direction automatically with
 *     `unicode-bidi: plaintext`, which lets each paragraph pick its own
 *     direction based on its first strong character (Hebrew/Arabic → RTL,
 *     English → LTR). This is the most robust, update-proof approach.
 *
 *   • Code blocks, inline code, and pre-formatted text are explicitly forced
 *     back to LTR so source code never flips.
 *
 *   • Class names are intentionally broad / attribute-based where possible so
 *     the rules survive Claude's frequent class-name churn.
 */
const RTL_CSS = `
/* ===================================================================== */
/*  Claude RTL Patcher — injected stylesheet                              */
/*  Auto-detects per-paragraph direction so Hebrew/Arabic renders RTL     */
/*  while English/code stays LTR. Safe to remove via --uninstall.         */
/* ===================================================================== */

/* Message / prose containers: let each block choose its own direction. */
[class*="font-claude-message"],
[class*="prose"] p,
[class*="prose"] li,
[class*="prose"] h1,
[class*="prose"] h2,
[class*="prose"] h3,
[class*="prose"] h4,
[class*="prose"] blockquote,
[data-testid="user-message"],
[data-testid="user-message"] *,
div[class*="message"] p {
  unicode-bidi: plaintext;
  text-align: start;
}

/* The chat composer / prompt textarea — match the user's typing direction. */
div[contenteditable="true"],
textarea,
.ProseMirror,
.ProseMirror p {
  unicode-bidi: plaintext;
  text-align: start;
}

/* Lists: align bullets/numbers to the start edge so RTL lists look right. */
[class*="prose"] ul,
[class*="prose"] ol {
  unicode-bidi: plaintext;
}

/* NEVER flip code. Force all code/pre to strict LTR. */
pre,
code,
kbd,
samp,
[class*="code-block"],
[class*="hljs"],
.ProseMirror pre,
.ProseMirror code {
  unicode-bidi: embed !important;
  direction: ltr !important;
  text-align: left !important;
}

/* Tables: keep cell content auto-directional but don't reorder columns. */
table td,
table th {
  unicode-bidi: plaintext;
  text-align: start;
}
`.trim();

/**
 * Build the runtime injection script as a single string.
 *
 * The returned string is a complete, self-executing `<script>`-ready IIFE.
 * It is appended to Claude's HTML entry point (see patcher.js).
 *
 * @returns {string} JavaScript source to inject.
 */
function buildInjectionScript() {
  // We serialize the CSS via JSON.stringify so any special characters are
  // safely escaped — no template-literal or quote-escaping foot-guns.
  const cssLiteral = JSON.stringify(RTL_CSS);

  return `
/* >>> ${INJECTION_MARKER} (BEGIN) — injected by claude-rtl-patcher. Do not edit by hand. */
(function () {
  "use strict";

  // Everything below is wrapped so a failure can NEVER crash Claude Desktop.
  try {
    var STYLE_ID = ${JSON.stringify(STYLE_ELEMENT_ID)};
    var CSS = ${cssLiteral};

    // Idempotent installer: (re)creates our <style> tag if it is missing.
    function installStyle() {
      try {
        var doc = document;
        if (!doc || !doc.head) return;
        if (doc.getElementById(STYLE_ID)) return; // already present

        var style = doc.createElement("style");
        style.id = STYLE_ID;
        style.setAttribute("type", "text/css");
        style.appendChild(doc.createTextNode(CSS));
        doc.head.appendChild(style);
      } catch (e) {
        // Swallow — RTL is a nice-to-have, never a hard dependency.
      }
    }

    // Install as soon as we can.
    function boot() {
      try {
        installStyle();

        // Claude re-renders aggressively and may blow away <head> children on
        // navigation. A MutationObserver re-installs our style if it vanishes.
        if (typeof MutationObserver === "function" && document.documentElement) {
          var observer = new MutationObserver(function () {
            try {
              if (!document.getElementById(STYLE_ID)) installStyle();
            } catch (e) { /* ignore */ }
          });
          observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
          });
        }

        // Belt-and-suspenders: a low-frequency timer as a final safety net in
        // case the observer is ever detached. Cheap and harmless.
        setInterval(function () {
          try {
            if (!document.getElementById(STYLE_ID)) installStyle();
          } catch (e) { /* ignore */ }
        }, 3000);
      } catch (e) {
        // Never propagate.
      }
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", boot, { once: true });
    } else {
      boot();
    }
  } catch (outer) {
    // Absolute last line of defense — guarantees no uncaught exception leaks
    // into Claude's main renderer execution.
    try { console.warn("[claude-rtl-patcher] disabled:", outer && outer.message); } catch (e) {}
  }
})();
/* <<< ${INJECTION_MARKER} (END) */
`.trim();
}

module.exports = {
  RTL_CSS,
  INJECTION_MARKER,
  STYLE_ELEMENT_ID,
  buildInjectionScript,
};
