/**
 * @module src/extension/devtools
 * @memberof StroidDevtools
 * @typedef {Record<string, unknown>} ModuleDocShape
 * @what owns Core logic for src/extension/devtools.
 * @who owns Stroid Devtools maintainers.
 * @likelyBreakpoint Runtime event normalization, UI render paths, or command routing in this module.
 * @param {unknown} [input] Module-level JSDoc anchor for tooling consistency.
 * @returns {void}
 * @public
 */
chrome.devtools.panels.create("Stroid", "", "panel.html");


