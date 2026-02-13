"use strict";
//!!! DO NOT modify, this file was COPIED from 'microsoft/vscode'
Object.defineProperty(exports, "__esModule", { value: true });
exports.PositionOffsetTransformer = exports.PositionOffsetTransformerBase = void 0;
exports.ensureDependenciesAreSet = ensureDependenciesAreSet;
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const stringEdit_1 = require("../edits/stringEdit");
const textEdit_1 = require("../edits/textEdit");
const positionToOffsetImpl_1 = require("./positionToOffsetImpl");
const textLength_1 = require("./textLength");
var positionToOffsetImpl_2 = require("./positionToOffsetImpl");
Object.defineProperty(exports, "PositionOffsetTransformerBase", { enumerable: true, get: function () { return positionToOffsetImpl_2.PositionOffsetTransformerBase; } });
Object.defineProperty(exports, "PositionOffsetTransformer", { enumerable: true, get: function () { return positionToOffsetImpl_2.PositionOffsetTransformer; } });
(0, positionToOffsetImpl_1._setPositionOffsetTransformerDependencies)({
    StringEdit: stringEdit_1.StringEdit,
    StringReplacement: stringEdit_1.StringReplacement,
    TextReplacement: textEdit_1.TextReplacement,
    TextEdit: textEdit_1.TextEdit,
    TextLength: textLength_1.TextLength,
});
// TODO@hediet this is dept and needs to go. See https://github.com/microsoft/vscode/issues/251126.
function ensureDependenciesAreSet() {
    // Noop
}
//# sourceMappingURL=positionToOffset.js.map