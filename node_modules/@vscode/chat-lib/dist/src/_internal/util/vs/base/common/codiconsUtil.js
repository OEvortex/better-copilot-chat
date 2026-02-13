"use strict";
//!!! DO NOT modify, this file was COPIED from 'microsoft/vscode'
Object.defineProperty(exports, "__esModule", { value: true });
exports.register = register;
exports.getCodiconFontCharacters = getCodiconFontCharacters;
const types_1 = require("./types");
const _codiconFontCharacters = Object.create(null);
function register(id, fontCharacter) {
    if ((0, types_1.isString)(fontCharacter)) {
        const val = _codiconFontCharacters[fontCharacter];
        if (val === undefined) {
            throw new Error(`${id} references an unknown codicon: ${fontCharacter}`);
        }
        fontCharacter = val;
    }
    _codiconFontCharacters[id] = fontCharacter;
    return { id };
}
/**
 * Only to be used by the iconRegistry.
 */
function getCodiconFontCharacters() {
    return _codiconFontCharacters;
}
//# sourceMappingURL=codiconsUtil.js.map