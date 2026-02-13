"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LastGhostText = exports.ICompletionsLastGhostText = void 0;
exports.rejectLastShown = rejectLastShown;
exports.setLastShown = setLastShown;
exports.handleGhostTextShown = handleGhostTextShown;
exports.handleGhostTextPostInsert = handleGhostTextPostInsert;
exports.handlePartialGhostTextPostInsert = handlePartialGhostTextPostInsert;
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const services_1 = require("../../../../../../util/common/services");
const logger_1 = require("../logger");
const postInsertion_1 = require("../postInsertion");
const partialSuggestions_1 = require("../suggestions/partialSuggestions");
const ghostText_1 = require("./ghostText");
const telemetry_1 = require("./telemetry");
const ghostTextLogger = new logger_1.Logger('ghostText');
exports.ICompletionsLastGhostText = (0, services_1.createServiceIdentifier)('ICompletionsLastGhostText');
class LastGhostText {
    constructor() {
        this.#shownCompletions = [];
        this.linesAccepted = 0; // Number of lines accepted in the current completion, used for partial acceptance
    }
    #position;
    #uri;
    #shownCompletions;
    get position() {
        return this.#position;
    }
    get shownCompletions() {
        return this.#shownCompletions || [];
    }
    get uri() {
        return this.#uri;
    }
    resetState() {
        this.#uri = undefined;
        this.#position = undefined;
        this.#shownCompletions = [];
        this.resetPartialAcceptanceState();
    }
    setState({ uri }, position) {
        this.#uri = uri;
        this.#position = position;
        this.#shownCompletions = [];
    }
    resetPartialAcceptanceState() {
        this.partiallyAcceptedLength = 0;
        this.totalLength = undefined;
        this.linesLeft = undefined;
        this.linesAccepted = 0;
    }
}
exports.LastGhostText = LastGhostText;
function computeRejectedCompletions(last) {
    const rejectedCompletions = [];
    last.shownCompletions.forEach(c => {
        if (c.displayText && c.telemetry) {
            let completionText;
            let completionTelemetryData;
            if (last.partiallyAcceptedLength) {
                // suggestion got partially accepted already but rejecting the remainder
                completionText = c.displayText.substring(last.partiallyAcceptedLength - 1);
                completionTelemetryData = c.telemetry.extendedBy({
                    compType: 'partial',
                }, {
                    compCharLen: completionText.length,
                });
            }
            else {
                completionText = c.displayText;
                completionTelemetryData = c.telemetry;
            }
            const rejection = { completionText, completionTelemetryData, offset: c.offset };
            rejectedCompletions.push(rejection);
        }
    });
    return rejectedCompletions;
}
function rejectLastShown(accessor, offset) {
    const last = accessor.get(exports.ICompletionsLastGhostText);
    if (!last.position || !last.uri) {
        return;
    }
    //The position has changed and we're not in typing-as-suggested flow
    // so previously shown completions can be reported as rejected
    const rejectedCompletions = computeRejectedCompletions(last);
    if (rejectedCompletions.length > 0) {
        (0, postInsertion_1.postRejectionTasks)(accessor, 'ghostText', offset ?? rejectedCompletions[0].offset, last.uri, rejectedCompletions);
    }
    last.resetState();
    last.resetPartialAcceptanceState();
}
function setLastShown(accessor, document, position, resultType) {
    const last = accessor.get(exports.ICompletionsLastGhostText);
    if (last.position &&
        last.uri &&
        !(last.position.line === position.line &&
            last.position.character === position.character &&
            last.uri.toString() === document.uri.toString()) &&
        resultType !== ghostText_1.ResultType.TypingAsSuggested // results for partial acceptance count as TypingAsSuggested
    ) {
        rejectLastShown(accessor, document.offsetAt(last.position));
    }
    last.setState(document, position);
    return last.index;
}
function handleGhostTextShown(accessor, cmp) {
    const logTarget = accessor.get(logger_1.ICompletionsLogTargetService);
    const last = accessor.get(exports.ICompletionsLastGhostText);
    last.index = cmp.index;
    if (!last.shownCompletions.find(c => c.index === cmp.index)) {
        // Only update if .position is still at the position of the completion
        if (cmp.uri === last.uri &&
            last.position?.line === cmp.position.line &&
            last.position?.character === cmp.position.character) {
            last.shownCompletions.push(cmp);
        }
        // Show telemetry only if it was not shown before (i.e. don't sent repeated telemetry in cycling case when user cycled through every suggestions or goes back and forth)
        if (cmp.displayText) {
            const fromCache = !(cmp.resultType === ghostText_1.ResultType.Network);
            ghostTextLogger.debug(logTarget, `[${cmp.telemetry.properties.headerRequestId}] shown choiceIndex: ${cmp.telemetry.properties.choiceIndex}, fromCache ${fromCache}`);
            cmp.telemetry.measurements.compCharLen = cmp.displayText.length;
            (0, telemetry_1.telemetryShown)(accessor, 'ghostText', cmp);
        }
    }
}
/**
 * Handles partial acceptance for VS Code clients using line-based strategy.
 * VS Code tracks acceptance by lines and resets the accepted length per line.
 */
function handleLineAcceptance(accessor, cmp, acceptedLength) {
    const last = accessor.get(exports.ICompletionsLastGhostText);
    // If this is the first acceptance, we need to initialize the linesLeft
    if (last.linesLeft === undefined) {
        last.linesAccepted = (0, partialSuggestions_1.countLines)(cmp.insertText.substring(0, acceptedLength));
        last.linesLeft = (0, partialSuggestions_1.countLines)(cmp.displayText);
    }
    const linesLeft = (0, partialSuggestions_1.countLines)(cmp.displayText);
    if (last.linesLeft > linesLeft) {
        // If the number of lines left has decreased, we need to update the accepted lines count
        // and reset the last line accepted length
        last.linesAccepted += last.linesLeft - linesLeft;
        last.lastLineAcceptedLength = last.partiallyAcceptedLength;
        last.linesLeft = linesLeft;
    }
    last.partiallyAcceptedLength = (last.lastLineAcceptedLength || 0) + acceptedLength;
}
/**
 * Handles full acceptance of ghost text completions.
 * This method is primarily used by VS Code for explicit full acceptances.
 */
function handleGhostTextPostInsert(accessor, cmp, triggerCategory = 'ghostText') {
    const last = accessor.get(exports.ICompletionsLastGhostText);
    let suggestionStatus;
    if (last.partiallyAcceptedLength) {
        suggestionStatus = {
            compType: 'full',
            acceptedLength: (last.partiallyAcceptedLength || 0) + cmp.displayText.length,
            acceptedLines: last.linesAccepted + (last.linesLeft ?? 0),
        };
    }
    else {
        suggestionStatus = {
            compType: 'full',
            acceptedLength: cmp.displayText.length,
            acceptedLines: (0, partialSuggestions_1.countLines)(cmp.displayText),
        };
    }
    //If any completion was accepted, clear the list of shown completions
    //that would be passed to rejected telemetry
    last.resetState();
    return (0, postInsertion_1.postInsertionTasks)(accessor, triggerCategory, cmp.displayText, cmp.offset, cmp.uri, cmp.telemetry, suggestionStatus, cmp.copilotAnnotations);
}
function handlePartialGhostTextPostInsert(accessor, cmp, acceptedLength, triggerKind = partialSuggestions_1.PartialAcceptTriggerKind.Unknown, triggerCategory = 'ghostText') {
    const last = accessor.get(exports.ICompletionsLastGhostText);
    handleLineAcceptance(accessor, cmp, acceptedLength);
    const suggestionStatus = {
        compType: 'partial',
        acceptedLength: last.partiallyAcceptedLength || 0,
        acceptedLines: last.linesAccepted,
    };
    return (0, postInsertion_1.postInsertionTasks)(accessor, triggerCategory, cmp.displayText, cmp.offset, cmp.uri, cmp.telemetry, suggestionStatus, cmp.copilotAnnotations);
}
//# sourceMappingURL=last.js.map