"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports._promptTimeout = exports._promptCancelled = exports._promptError = exports._copilotContentExclusion = exports._contextTooShort = exports.MIN_PROMPT_CHARS = void 0;
exports.trimLastLine = trimLastLine;
exports.extractPrompt = extractPrompt;
exports.getPromptOptions = getPromptOptions;
const languageMarker_1 = require("../../../prompt/src/languageMarker");
const featuresService_1 = require("../experiments/featuresService");
const similarFileOptionsProvider_1 = require("../experiments/similarFileOptionsProvider");
const openai_1 = require("../openai/openai");
const textDocumentManager_1 = require("../textDocumentManager");
const completionsPromptFactory_1 = require("./completionsPromptFactory/completionsPromptFactory");
const neighborFiles_1 = require("./similarFiles/neighborFiles");
// The minimum number of prompt-eligible characters before we offer a completion
exports.MIN_PROMPT_CHARS = 10;
exports._contextTooShort = { type: 'contextTooShort' };
exports._copilotContentExclusion = { type: 'copilotContentExclusion' };
exports._promptError = { type: 'promptError' };
exports._promptCancelled = { type: 'promptCancelled' };
exports._promptTimeout = { type: 'promptTimeout' };
/** Record trailing whitespace, and trim it from prompt if the last line is only whitespace */
function trimLastLine(source) {
    const lines = source.split('\n');
    const lastLine = lines[lines.length - 1];
    const extraSpace = lastLine.length - lastLine.trimEnd().length;
    const promptTrim = source.slice(0, source.length - extraSpace);
    const trailingWs = source.slice(promptTrim.length);
    const resPrompt = lastLine.length === extraSpace ? promptTrim : source;
    return [resPrompt, trailingWs];
}
function extractPrompt(accessor, completionId, completionState, telemetryData, cancellationToken, promptOpts = {}) {
    const textDocumentManagerService = accessor.get(textDocumentManager_1.ICompletionsTextDocumentManagerService);
    const notebook = textDocumentManagerService.findNotebook(completionState.textDocument);
    const activeCell = notebook?.getCellFor(completionState.textDocument);
    if (notebook && activeCell) {
        completionState = applyEditsForNotebook(completionState, notebook, activeCell);
    }
    telemetryData.extendWithConfigProperties(accessor);
    telemetryData.sanitizeKeys();
    const separateContext = true;
    const promptFactory = accessor.get(completionsPromptFactory_1.ICompletionsPromptFactoryService);
    return promptFactory.prompt({
        completionId,
        completionState,
        telemetryData,
        promptOpts: { ...promptOpts, separateContext },
    }, cancellationToken);
}
function addNeighboringCellsToPrompt(neighboringCell, activeCellLanguageId) {
    const languageId = neighboringCell.document.detectedLanguageId;
    const text = neighboringCell.document.getText();
    if (languageId === activeCellLanguageId) {
        // Blocks of the same language are added as is
        return text;
    }
    else {
        // Consider adding a languageMarker to cells of different languages
        // Note, that comments should be added with markers from the language of the active cell!
        return (0, languageMarker_1.commentBlockAsSingles)(text, activeCellLanguageId);
    }
}
function applyEditsForNotebook(state, notebook, activeCell) {
    const cells = notebook.getCells();
    const beforeCells = cells.filter(cell => cell.index < activeCell.index &&
        (0, neighborFiles_1.considerNeighborFile)(activeCell.document.detectedLanguageId, cell.document.detectedLanguageId));
    const newText = beforeCells.length > 0
        ? beforeCells
            .map(cell => addNeighboringCellsToPrompt(cell, activeCell.document.detectedLanguageId))
            .join('\n\n') + '\n\n'
        : '';
    const top = { line: 0, character: 0 };
    return state.applyEdits([{ newText, range: { start: top, end: top } }]);
}
function getPromptOptions(accessor, telemetryData, languageId) {
    // Note: the default values of the EXP flags currently overwrite the default `PromptOptions`
    const featuresService = accessor.get(featuresService_1.ICompletionsFeaturesService);
    const maxTokens = featuresService.maxPromptCompletionTokens(telemetryData);
    const maxPromptLength = maxTokens - (0, openai_1.getMaxSolutionTokens)();
    const numberOfSnippets = (0, similarFileOptionsProvider_1.getNumberOfSnippets)(telemetryData, languageId);
    const similarFilesOptions = (0, similarFileOptionsProvider_1.getSimilarFilesOptions)(accessor, telemetryData, languageId);
    const suffixPercent = featuresService.suffixPercent(telemetryData);
    const suffixMatchThreshold = featuresService.suffixMatchThreshold(telemetryData);
    if (suffixPercent < 0 || suffixPercent > 100) {
        throw new Error(`suffixPercent must be between 0 and 100, but was ${suffixPercent}`);
    }
    if (suffixMatchThreshold < 0 || suffixMatchThreshold > 100) {
        throw new Error(`suffixMatchThreshold must be between 0 and 100, but was ${suffixMatchThreshold}`);
    }
    return {
        maxPromptLength,
        similarFilesOptions,
        numberOfSnippets,
        suffixPercent,
        suffixMatchThreshold,
    };
}
//# sourceMappingURL=prompt.js.map