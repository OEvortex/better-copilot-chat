"use strict";
//!!! DO NOT modify, this file was COPIED from 'microsoft/vscode'
Object.defineProperty(exports, "__esModule", { value: true });
exports.Codicon = exports.codiconsDerived = void 0;
exports.getAllCodicons = getAllCodicons;
const codiconsUtil_1 = require("./codiconsUtil");
const codiconsLibrary_1 = require("./codiconsLibrary");
/**
 * Only to be used by the iconRegistry.
 */
function getAllCodicons() {
    return Object.values(exports.Codicon);
}
/**
 * Derived icons, that could become separate icons.
 * These mappings should be moved into the mapping file in the vscode-codicons repo at some point.
 */
exports.codiconsDerived = {
    dialogError: (0, codiconsUtil_1.register)('dialog-error', 'error'),
    dialogWarning: (0, codiconsUtil_1.register)('dialog-warning', 'warning'),
    dialogInfo: (0, codiconsUtil_1.register)('dialog-info', 'info'),
    dialogClose: (0, codiconsUtil_1.register)('dialog-close', 'close'),
    treeItemExpanded: (0, codiconsUtil_1.register)('tree-item-expanded', 'chevron-down'), // collapsed is done with rotation
    treeFilterOnTypeOn: (0, codiconsUtil_1.register)('tree-filter-on-type-on', 'list-filter'),
    treeFilterOnTypeOff: (0, codiconsUtil_1.register)('tree-filter-on-type-off', 'list-selection'),
    treeFilterClear: (0, codiconsUtil_1.register)('tree-filter-clear', 'close'),
    treeItemLoading: (0, codiconsUtil_1.register)('tree-item-loading', 'loading'),
    menuSelection: (0, codiconsUtil_1.register)('menu-selection', 'check'),
    menuSubmenu: (0, codiconsUtil_1.register)('menu-submenu', 'chevron-right'),
    menuBarMore: (0, codiconsUtil_1.register)('menubar-more', 'more'),
    scrollbarButtonLeft: (0, codiconsUtil_1.register)('scrollbar-button-left', 'triangle-left'),
    scrollbarButtonRight: (0, codiconsUtil_1.register)('scrollbar-button-right', 'triangle-right'),
    scrollbarButtonUp: (0, codiconsUtil_1.register)('scrollbar-button-up', 'triangle-up'),
    scrollbarButtonDown: (0, codiconsUtil_1.register)('scrollbar-button-down', 'triangle-down'),
    toolBarMore: (0, codiconsUtil_1.register)('toolbar-more', 'more'),
    quickInputBack: (0, codiconsUtil_1.register)('quick-input-back', 'arrow-left'),
    dropDownButton: (0, codiconsUtil_1.register)('drop-down-button', 0xeab4),
    symbolCustomColor: (0, codiconsUtil_1.register)('symbol-customcolor', 0xeb5c),
    exportIcon: (0, codiconsUtil_1.register)('export', 0xebac),
    workspaceUnspecified: (0, codiconsUtil_1.register)('workspace-unspecified', 0xebc3),
    newLine: (0, codiconsUtil_1.register)('newline', 0xebea),
    thumbsDownFilled: (0, codiconsUtil_1.register)('thumbsdown-filled', 0xec13),
    thumbsUpFilled: (0, codiconsUtil_1.register)('thumbsup-filled', 0xec14),
    gitFetch: (0, codiconsUtil_1.register)('git-fetch', 0xec1d),
    lightbulbSparkleAutofix: (0, codiconsUtil_1.register)('lightbulb-sparkle-autofix', 0xec1f),
    debugBreakpointPending: (0, codiconsUtil_1.register)('debug-breakpoint-pending', 0xebd9),
};
/**
 * The Codicon library is a set of default icons that are built-in in VS Code.
 *
 * In the product (outside of base) Codicons should only be used as defaults. In order to have all icons in VS Code
 * themeable, component should define new, UI component specific icons using `iconRegistry.registerIcon`.
 * In that call a Codicon can be named as default.
 */
exports.Codicon = {
    ...codiconsLibrary_1.codiconsLibrary,
    ...exports.codiconsDerived
};
//# sourceMappingURL=codicons.js.map