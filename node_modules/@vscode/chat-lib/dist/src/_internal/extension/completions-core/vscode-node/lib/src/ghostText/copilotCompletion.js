"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.completionsFromGhostTextResults = completionsFromGhostTextResults;
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const uuid_1 = require("../../../../../../util/vs/base/common/uuid");
const textDocument_1 = require("../textDocument");
const ghostText_1 = require("./ghostText");
const normalizeIndent_1 = require("./normalizeIndent");
function completionsFromGhostTextResults(completionResults, resultType, document, position, textEditorOptions, lastShownCompletionIndex) {
    const currentLine = document.lineAt(position);
    let completions = completionResults.map(result => {
        const range = textDocument_1.LocationFactory.range(textDocument_1.LocationFactory.position(position.line, 0), textDocument_1.LocationFactory.position(position.line, position.character + result.suffixCoverage));
        let insertText = '';
        if (textEditorOptions) {
            result.completion = (0, normalizeIndent_1.normalizeIndentCharacter)(textEditorOptions, result.completion, currentLine.isEmptyOrWhitespace);
        }
        if (currentLine.isEmptyOrWhitespace &&
            (result.completion.displayNeedsWsOffset || // Deindenting case
                // This enables stable behavior for deleting whitespace on blank lines
                result.completion.completionText.startsWith(currentLine.text))) {
            insertText = result.completion.completionText;
        }
        else {
            const rangeFromStart = textDocument_1.LocationFactory.range(range.start, position);
            insertText = document.getText(rangeFromStart) + result.completion.displayText;
        }
        const completion = {
            uuid: (0, uuid_1.generateUuid)(),
            insertText,
            range,
            uri: document.uri,
            index: result.completion.completionIndex,
            telemetry: result.telemetry,
            displayText: result.completion.displayText,
            position,
            offset: document.offsetAt(position),
            resultType,
            copilotAnnotations: result.copilotAnnotations,
            clientCompletionId: result.clientCompletionId,
        };
        return completion;
    });
    //If we are in typing as suggested flow, we want to put the last displayed completion at the top of the list to keep it selected
    if (resultType === ghostText_1.ResultType.TypingAsSuggested && lastShownCompletionIndex !== undefined) {
        const lastShownCompletion = completions.find(predicate => predicate.index === lastShownCompletionIndex);
        if (lastShownCompletion) {
            const restCompletions = completions.filter(predicate => predicate.index !== lastShownCompletionIndex);
            completions = [lastShownCompletion, ...restCompletions];
        }
    }
    return completions;
}
//# sourceMappingURL=copilotCompletion.js.map