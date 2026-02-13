"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// General utility functions for all kinds of suggestions (Ghost Text, Open Copilot)
Object.defineProperty(exports, "__esModule", { value: true });
exports.maybeSnipCompletionImpl = maybeSnipCompletionImpl;
exports.postProcessChoiceInContext = postProcessChoiceInContext;
exports.checkSuffix = checkSuffix;
const parse_1 = require("../../../prompt/src/parse");
const logger_1 = require("../logger");
const telemetry_1 = require("../telemetry");
const anomalyDetection_1 = require("./anomalyDetection");
/**
 * To avoid double-closing blocks (#272), maybe snip a trailing block-close token
 * from the given completion.
 *
 * We check whether the completion ends with a block-close token, and the next line
 * after the cursor starts with that same token at the same indentation. If so,
 * we snip.
 */
function maybeSnipCompletion(accessor, doc, position, completion) {
    // Default to `}` for block closing token
    let blockCloseToken = '}';
    //TODO: This should be properly handled in promptlib (in `getBlockCloseToken`)
    //but we don't want to change it before Universe.
    try {
        blockCloseToken = (0, parse_1.getBlockCloseToken)(doc.detectedLanguageId) ?? '}';
    }
    catch (e) {
        // Ignore errors
    }
    return maybeSnipCompletionImpl({ getLineText: lineIdx => doc.lineAt(lineIdx).text, getLineCount: () => doc.lineCount }, position, completion, blockCloseToken);
}
function maybeSnipCompletionImpl(doc, position, completion, blockCloseToken) {
    // if the last lines of the completion are just indented block close tokens (e.g. `\t}\n}`),
    // and if these lines exactly match the lines of the document after the insertion position (ignoring empty lines in both the document and the completion),
    // these lines are removed from the completion.
    // Additionally, the last line of the completion can be a prefix of a line in the model.
    // Thus, if `\tif (true) {\n\t}` is suggested and the next line of the doc is `\t} else {`, only `if (true) {` will be suggested.
    const completionLinesInfo = splitByNewLine(completion);
    const completionLines = completionLinesInfo.lines;
    if (completionLines.length === 1) {
        return completion;
    }
    for (let completionLineStartIdx = 1; completionLineStartIdx < completionLines.length; completionLineStartIdx++) {
        let matched = true;
        let docSkippedEmptyLineCount = 0;
        let completionSkippedEmptyLineCount = 0;
        for (let offset = 0; offset + completionLineStartIdx + completionSkippedEmptyLineCount < completionLines.length; offset++) {
            let docLine;
            while (true) {
                const docLineIdx = position.line + 1 + offset + docSkippedEmptyLineCount;
                docLine = docLineIdx >= doc.getLineCount() ? undefined : doc.getLineText(docLineIdx);
                if (docLine !== undefined && docLine.trim() === '') {
                    // Skip empty lines in the document and loop
                    docSkippedEmptyLineCount++;
                }
                else {
                    break;
                }
            }
            let completionLineIdx;
            let completionLine;
            while (true) {
                completionLineIdx = completionLineStartIdx + offset + completionSkippedEmptyLineCount;
                completionLine =
                    completionLineIdx >= completionLines.length ? undefined : completionLines[completionLineIdx];
                if (completionLine !== undefined && completionLine.trim() === '') {
                    // Skip empty lines in the completion and loop
                    completionSkippedEmptyLineCount++;
                }
                else {
                    break;
                }
            }
            const isLastCompletionLine = completionLineIdx === completionLines.length - 1;
            if (!completionLine ||
                !(docLine &&
                    (isLastCompletionLine
                        ? // For the last line, accept any line that starts with the completion line and vice versa.
                            // This allows for brackets, braces, parentheses, quotes, identifiers like "end" and "fi",
                            // heredocs, etc.
                            docLine.startsWith(completionLine) || completionLine.startsWith(docLine)
                        : // For other lines, strictly require the block close token, and nothing else
                            docLine === completionLine && completionLine.trim() === blockCloseToken))) {
                matched = false;
                break;
            }
        }
        if (matched) {
            const completionWithoutClosingBracketLines = completionLines
                .slice(0, completionLineStartIdx)
                .join(completionLinesInfo.newLineCharacter);
            return completionWithoutClosingBracketLines;
        }
    }
    return completion;
}
function splitByNewLine(text) {
    const newLineCharacter = text.includes('\r\n') ? '\r\n' : '\n';
    return {
        lines: text.split(newLineCharacter),
        newLineCharacter,
    };
}
function matchesNextLine(document, position, text, shouldTrim) {
    let nextLine = '';
    let lineNo = position.line + 1;
    const compareText = shouldTrim ? text.trim() : text;
    while (nextLine === '' && lineNo < document.lineCount) {
        nextLine = document.lineAt(lineNo).text;
        if (shouldTrim) {
            nextLine = nextLine.trim();
        }
        if (nextLine === compareText) {
            return true;
        }
        lineNo++;
    }
    return false;
}
/**
 * Post-processed a completion choice in the context of the document where the choice is offered.
 */
function postProcessChoiceInContext(accessor, document, position, choice, isMoreMultiline, logger) {
    const logTarget = accessor.get(logger_1.ICompletionsLogTargetService);
    if ((0, anomalyDetection_1.isRepetitive)(choice.tokens)) {
        const telemetryData = telemetry_1.TelemetryData.createAndMarkAsIssued();
        telemetryData.extendWithRequestId(choice.requestId);
        (0, telemetry_1.telemetry)(accessor, 'repetition.detected', telemetryData, telemetry_1.TelemetryStore.Enhanced);
        // FIXME: trim request at start of repetitive block? for now we just skip
        logger.info(logTarget, 'Filtered out repetitive solution');
        return undefined;
    }
    const postProcessedChoice = { ...choice };
    // Avoid single-line completions that duplicate the next line (#993)
    if (matchesNextLine(document, position, postProcessedChoice.completionText, !isMoreMultiline)) {
        const baseTelemetryData = telemetry_1.TelemetryData.createAndMarkAsIssued();
        baseTelemetryData.extendWithRequestId(choice.requestId);
        (0, telemetry_1.telemetry)(accessor, 'completion.alreadyInDocument', baseTelemetryData);
        (0, telemetry_1.telemetry)(accessor, 'completion.alreadyInDocument', baseTelemetryData.extendedBy({
            completionTextJson: JSON.stringify(postProcessedChoice.completionText),
        }), telemetry_1.TelemetryStore.Enhanced);
        logger.info(logTarget, 'Filtered out solution matching next line');
        return undefined;
    }
    // Avoid double-closing blocks (#272)
    postProcessedChoice.completionText = maybeSnipCompletion(accessor, document, position, postProcessedChoice.completionText);
    return postProcessedChoice.completionText ? postProcessedChoice : undefined;
}
function checkSuffix(document, position, choice) {
    const currentLine = document.lineAt(position.line);
    const restOfLine = currentLine.text.substring(position.character);
    if (restOfLine.length > 0) {
        if (choice.completionText.indexOf(restOfLine) !== -1) {
            //If current suggestion contains rest of the line as substring
            //then we will include it in our suggestion range
            return restOfLine.length;
        }
        else {
            let lastIndex = -1;
            let suffixLength = 0;
            for (const c of restOfLine) {
                const idx = choice.completionText.indexOf(c, lastIndex + 1);
                if (idx > lastIndex) {
                    suffixLength++;
                    lastIndex = idx;
                }
                else {
                    break;
                }
            }
            return suffixLength;
        }
    }
    return 0;
}
//# sourceMappingURL=suggestions.js.map