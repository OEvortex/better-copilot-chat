"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getInlineCompletions = getInlineCompletions;
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const vscode_languageserver_protocol_1 = require("vscode-languageserver-protocol");
const instantiation_1 = require("../../../../../util/vs/platform/instantiation/common/instantiation");
const completionState_1 = require("./completionState");
const copilotCompletion_1 = require("./ghostText/copilotCompletion");
const ghostText_1 = require("./ghostText/ghostText");
const last_1 = require("./ghostText/last");
const speculativeRequestCache_1 = require("./ghostText/speculativeRequestCache");
const telemetry_1 = require("./ghostText/telemetry");
const logger_1 = require("./logger");
async function getInlineCompletionsResult(accessor, completionState, token, options = {}) {
    const instantiationService = accessor.get(instantiation_1.IInstantiationService);
    const speculativeRequestCache = accessor.get(speculativeRequestCache_1.ICompletionsSpeculativeRequestCache);
    let lineLengthIncrease = 0;
    // The golang.go extension (and quite possibly others) uses snippets for function completions, which collapse down
    // to look like empty function calls (e.g., `foo()`) in selectedCompletionInfo.text.  Injecting that directly into
    // the prompt produces low quality completions, so don't.
    if (options.selectedCompletionInfo?.text && !options.selectedCompletionInfo.text.includes(')')) {
        completionState = completionState.addSelectedCompletionInfo(options.selectedCompletionInfo);
        lineLengthIncrease = completionState.position.character - options.selectedCompletionInfo.range.end.character;
    }
    const result = await instantiationService.invokeFunction(ghostText_1.getGhostText, completionState, token, options);
    if (result.type !== 'success') {
        return result;
    }
    const [resultArray, resultType] = result.value;
    if (token?.isCancellationRequested) {
        return {
            type: 'canceled',
            reason: 'after getGhostText',
            telemetryData: { telemetryBlob: result.telemetryBlob },
        };
    }
    const index = instantiationService.invokeFunction(last_1.setLastShown, completionState.textDocument, completionState.position, resultType);
    const completions = (0, copilotCompletion_1.completionsFromGhostTextResults)(resultArray, resultType, completionState.textDocument, completionState.position, options.formattingOptions, index);
    if (completions.length === 0) {
        // This is a backstop, most/all cases of an empty completions list should be caught earlier
        // TODO: figure out how this accounts for 7% of ghostText.empty when it looks unreachable
        return { type: 'empty', reason: 'no completions in final result', telemetryData: result.telemetryData };
    }
    // Speculatively request a new completion including the newly returned completion in the document
    if (resultType !== ghostText_1.ResultType.TypingAsSuggested) {
        completionState = completionState.applyEdits([
            {
                newText: completions[0].insertText,
                range: completions[0].range,
            },
        ]);
        // Cache speculative request to be triggered when telemetryShown is called
        const specOpts = { isSpeculative: true, opportunityId: options.opportunityId };
        const fn = () => instantiationService.invokeFunction(ghostText_1.getGhostText, completionState, undefined, specOpts);
        speculativeRequestCache.set(completions[0].clientCompletionId, fn);
    }
    const value = completions.map(completion => {
        const { start, end } = completion.range;
        const range = vscode_languageserver_protocol_1.Range.create(start, vscode_languageserver_protocol_1.Position.create(end.line, end.character - lineLengthIncrease));
        return { ...completion, range };
    });
    return { ...result, value };
}
async function getInlineCompletions(accessor, textDocument, position, token, options = {}) {
    const instantiationService = accessor.get(instantiation_1.IInstantiationService);
    logCompletionLocation(accessor.get(logger_1.ICompletionsLogTargetService), textDocument, position);
    const result = await getInlineCompletionsResult(accessor, (0, completionState_1.createCompletionState)(textDocument, position), token, options);
    return instantiationService.invokeFunction(telemetry_1.handleGhostTextResultTelemetry, result);
}
function logCompletionLocation(logTarget, textDocument, position) {
    const prefix = textDocument.getText({
        start: { line: Math.max(position.line - 1, 0), character: 0 },
        end: position,
    });
    const suffix = textDocument.getText({
        start: position,
        end: {
            line: Math.min(position.line + 2, textDocument.lineCount - 1),
            character: textDocument.lineCount - 1 > position.line ? 0 : position.character,
        },
    });
    telemetry_1.logger.debug(logTarget, `Requesting for ${textDocument.uri} at ${position.line}:${position.character}`, `between ${JSON.stringify(prefix)} and ${JSON.stringify(suffix)}.`);
}
//# sourceMappingURL=inlineCompletion.js.map