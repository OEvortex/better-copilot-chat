"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PartialAcceptTriggerKind = void 0;
exports.computeCompCharLen = computeCompCharLen;
exports.countLines = countLines;
exports.computeCompletionText = computeCompletionText;
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// Copy of https://github.com/microsoft/vscode/blob/969b5714b4fc54992801dceefc3269ce4e07f8f7/src/vscode-dts/vscode.proposed.inlineCompletionsAdditions.d.ts#L75
// to avoid dependencies to vscode from lib
var PartialAcceptTriggerKind;
(function (PartialAcceptTriggerKind) {
    PartialAcceptTriggerKind[PartialAcceptTriggerKind["Unknown"] = 0] = "Unknown";
    PartialAcceptTriggerKind[PartialAcceptTriggerKind["Word"] = 1] = "Word";
    PartialAcceptTriggerKind[PartialAcceptTriggerKind["Line"] = 2] = "Line";
    PartialAcceptTriggerKind[PartialAcceptTriggerKind["Suggest"] = 3] = "Suggest";
})(PartialAcceptTriggerKind || (exports.PartialAcceptTriggerKind = PartialAcceptTriggerKind = {}));
function computeCompCharLen(suggestionStatus, completionText) {
    return suggestionStatus.compType === 'partial' ? suggestionStatus.acceptedLength : completionText.length;
}
function countLines(text) {
    if (text.length === 0) {
        return 0;
    }
    return text.split('\n').length;
}
function computeCompletionText(completionText, suggestionStatus) {
    if (suggestionStatus.compType === 'partial') {
        return completionText.substring(0, suggestionStatus.acceptedLength);
    }
    return completionText;
}
//# sourceMappingURL=partialSuggestions.js.map