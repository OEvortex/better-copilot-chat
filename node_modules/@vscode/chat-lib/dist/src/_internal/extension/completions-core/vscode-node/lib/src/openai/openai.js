"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRequestId = void 0;
exports.convertToAPIChoice = convertToAPIChoice;
exports.getTemperatureForSamples = getTemperatureForSamples;
exports.getStops = getStops;
exports.getTopP = getTopP;
exports.getMaxSolutionTokens = getMaxSolutionTokens;
const uuid_1 = require("../../../../../../util/vs/base/common/uuid");
const prompt_1 = require("../../../prompt/src/prompt");
const logger_1 = require("../logger");
const telemetry_1 = require("../telemetry");
var fetch_1 = require("./fetch");
Object.defineProperty(exports, "getRequestId", { enumerable: true, get: function () { return fetch_1.getRequestId; } });
function convertToAPIChoice(accessor, completionText, jsonData, choiceIndex, requestId, blockFinished, telemetryData) {
    (0, telemetry_1.logEngineCompletion)(accessor, completionText, jsonData, requestId, choiceIndex);
    // NOTE: It's possible that the completion text we care about is not exactly jsonData.text but a prefix,
    // so we pass it down directly.
    return {
        // NOTE: This does not contain stop tokens necessarily
        completionText: completionText,
        meanLogProb: calculateMeanLogProb(accessor, jsonData),
        meanAlternativeLogProb: calculateMeanAlternativeLogProb(accessor, jsonData),
        choiceIndex: choiceIndex,
        requestId: requestId,
        blockFinished: blockFinished,
        tokens: jsonData.tokens,
        numTokens: jsonData.tokens.length,
        telemetryData: telemetryData,
        copilotAnnotations: jsonData.copilot_annotations,
        clientCompletionId: (0, uuid_1.generateUuid)(),
        finishReason: jsonData.finish_reason,
    };
}
// Helper functions
function calculateMeanLogProb(accessor, jsonData) {
    if (!jsonData?.logprobs?.token_logprobs) {
        return undefined;
    }
    try {
        let logProbSum = 0.0;
        let numTokens = 0;
        // Limit to first 50 logprobs, avoids up-ranking longer solutions
        let iterLimit = 50;
        // First token is always null and last token can have multiple options if it hit a stop
        for (let i = 0; i < jsonData.logprobs.token_logprobs.length - 1 && iterLimit > 0; i++, iterLimit--) {
            logProbSum += jsonData.logprobs.token_logprobs[i];
            numTokens += 1;
        }
        if (numTokens > 0) {
            return logProbSum / numTokens;
        }
        else {
            return undefined;
        }
    }
    catch (e) {
        logger_1.logger.exception(accessor, e, `Error calculating mean prob`);
    }
}
function calculateMeanAlternativeLogProb(accessor, jsonData) {
    if (!jsonData?.logprobs?.top_logprobs) {
        return undefined;
    }
    try {
        let logProbSum = 0.0;
        let numTokens = 0;
        // Limit to first 50 logprobs, avoids up-ranking longer solutions
        let iterLimit = 50;
        for (let i = 0; i < jsonData.logprobs.token_logprobs.length - 1 && iterLimit > 0; i++, iterLimit--) {
            // copy the options object to avoid mutating the original
            const options = { ...jsonData.logprobs.top_logprobs[i] };
            delete options[jsonData.logprobs.tokens[i]];
            logProbSum += Math.max(...Object.values(options));
            numTokens += 1;
        }
        if (numTokens > 0) {
            return logProbSum / numTokens;
        }
        else {
            return undefined;
        }
    }
    catch (e) {
        logger_1.logger.exception(accessor, e, `Error calculating mean prob`);
    }
}
// Returns a temperature in range 0.0-1.0, using either a config setting,
// or the following ranges: 1=0.0, <10=0.2, <20=0.4, >=20=0.8
function getTemperatureForSamples(runtime, numShots) {
    if (runtime.isRunningInTest()) {
        return 0.0;
    }
    if (numShots <= 1) {
        return 0.0;
    }
    else if (numShots < 10) {
        return 0.2;
    }
    else if (numShots < 20) {
        return 0.4;
    }
    else {
        return 0.8;
    }
}
const stopsForLanguage = {
    markdown: ['\n\n\n'],
    python: ['\ndef ', '\nclass ', '\nif ', '\n\n#'],
};
function getStops(languageId) {
    return stopsForLanguage[languageId ?? ''] ?? ['\n\n\n', '\n```'];
}
function getTopP() {
    return 1;
}
function getMaxSolutionTokens() {
    return prompt_1.DEFAULT_MAX_COMPLETION_LENGTH;
}
//# sourceMappingURL=openai.js.map