"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerDocumentTracker = exports.accessTimes = void 0;
exports.sortByAccessTimes = sortByAccessTimes;
const cache_1 = require("./helpers/cache");
const textDocumentManager_1 = require("./textDocumentManager");
/**
 * A map from the string representation of a document URI to its last access time in ms since the
 * epoch.
 */
exports.accessTimes = new cache_1.LRUCacheMap();
/**
 * Returns a copy of `docs` sorted by access time, from most to least recent.
 */
function sortByAccessTimes(docs) {
    return [...docs].sort((a, b) => {
        const aAccessTime = exports.accessTimes.get(a.uri) ?? 0;
        const bAccessTime = exports.accessTimes.get(b.uri) ?? 0;
        return bAccessTime - aAccessTime;
    });
}
/**
 * Registers a listener on the `window.onDidChangeActiveTextEditor` event that records/updates the
 * access time of the document.
 */
const registerDocumentTracker = (accessor) => accessor.get(textDocumentManager_1.ICompletionsTextDocumentManagerService).onDidFocusTextDocument(e => {
    if (e.document) {
        exports.accessTimes.set(e.document.uri.toString(), Date.now());
    }
});
exports.registerDocumentTracker = registerDocumentTracker;
//# sourceMappingURL=documentTracker.js.map