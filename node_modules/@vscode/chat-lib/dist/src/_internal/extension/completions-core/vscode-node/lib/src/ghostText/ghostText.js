"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ForceMultiLine = exports.ResultType = void 0;
exports.getGhostText = getGhostText;
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const telemetry_1 = require("../../../../../../platform/telemetry/common/telemetry");
const crypto_1 = require("../../../../../../util/common/crypto");
const uuid_1 = require("../../../../../../util/vs/base/common/uuid");
const instantiation_1 = require("../../../../../../util/vs/platform/instantiation/common/instantiation");
const parse_1 = require("../../../prompt/src/parse");
const tokenization_1 = require("../../../prompt/src/tokenization");
const src_1 = require("../../../types/src");
const completionNotifier_1 = require("../completionNotifier");
const config_1 = require("../config");
const userErrorNotifier_1 = require("../error/userErrorNotifier");
const featuresService_1 = require("../experiments/featuresService");
const logger_1 = require("../logger");
const networking_1 = require("../networking");
const config_2 = require("../openai/config");
const fetch_1 = require("../openai/fetch");
const openai_1 = require("../openai/openai");
const progress_1 = require("../progress");
const contextProviderBridge_1 = require("../prompt/components/contextProviderBridge");
const contextProviderStatistics_1 = require("../prompt/contextProviderStatistics");
const parseBlock_1 = require("../prompt/parseBlock");
const prompt_1 = require("../prompt/prompt");
const repository_1 = require("../prompt/repository");
const suggestions_1 = require("../suggestions/suggestions");
const telemetry_2 = require("../telemetry");
const textDocument_1 = require("../textDocument");
const async_1 = require("../util/async");
const runtimeMode_1 = require("../util/runtimeMode");
const asyncCompletions_1 = require("./asyncCompletions");
const blockTrimmer_1 = require("./blockTrimmer");
const completionsCache_1 = require("./completionsCache");
const configBlockMode_1 = require("./configBlockMode");
const current_1 = require("./current");
const multilineModel_1 = require("./multilineModel");
const streamedCompletionSplitter_1 = require("./streamedCompletionSplitter");
const telemetry_3 = require("./telemetry");
const ghostTextLogger = new logger_1.Logger('ghostText');
var ResultType;
(function (ResultType) {
    ResultType[ResultType["Network"] = 0] = "Network";
    ResultType[ResultType["Cache"] = 1] = "Cache";
    ResultType[ResultType["TypingAsSuggested"] = 2] = "TypingAsSuggested";
    ResultType[ResultType["Cycling"] = 3] = "Cycling";
    ResultType[ResultType["Async"] = 4] = "Async";
})(ResultType || (exports.ResultType = ResultType = {}));
// p50 line length is 19 characters (p95 is 73)
// average token length is around 4 characters
// the below values have quite a bit of buffer while bringing the limit in significantly from 500
const maxSinglelineTokens = 20;
async function genericGetCompletionsFromNetwork(accessor, requestContext, baseTelemetryData, cancellationToken, finishedCb, what, processChoices) {
    const featuresService = accessor.get(featuresService_1.ICompletionsFeaturesService);
    const fetcherService = accessor.get(fetch_1.ICompletionsOpenAIFetcherService);
    const runtimeMode = accessor.get(runtimeMode_1.ICompletionsRuntimeModeService);
    const instantiationService = accessor.get(instantiation_1.IInstantiationService);
    const logTarget = accessor.get(logger_1.ICompletionsLogTargetService);
    const userErrorNotifier = accessor.get(userErrorNotifier_1.ICompletionsUserErrorNotifierService);
    ghostTextLogger.debug(logTarget, `Getting ${what} from network`);
    // copy the base telemetry data
    baseTelemetryData = baseTelemetryData.extendedBy();
    // Request one choice for automatic requests, three for invoked (cycling) requests.
    const n = requestContext.isCycling ? 3 : 1;
    const temperature = (0, openai_1.getTemperatureForSamples)(runtimeMode, n);
    const extra = {
        language: requestContext.languageId,
        next_indent: requestContext.indentation.next ?? 0,
        trim_by_indentation: (0, config_1.shouldDoServerTrimming)(requestContext.blockMode),
        prompt_tokens: requestContext.prompt.prefixTokens ?? 0,
        suffix_tokens: requestContext.prompt.suffixTokens ?? 0,
    };
    const postOptions = { n, temperature, code_annotations: false };
    const modelTerminatesSingleline = featuresService.modelAlwaysTerminatesSingleline(baseTelemetryData);
    const simulateSingleline = requestContext.blockMode === config_1.BlockMode.MoreMultiline &&
        blockTrimmer_1.BlockTrimmer.isSupported(requestContext.languageId) &&
        !modelTerminatesSingleline;
    if (!requestContext.multiline && !simulateSingleline) {
        // If we are not in multiline mode, we get the server to truncate the results. This does mean that we
        // also cache a single line result which will be reused even if we are later in multiline mode. This is
        // an acceptable trade-off as the transition should be relatively rare and truncating on the server is
        // more efficient.
        // Note that this also means we don't need to truncate when creating the GhostAPIChoice object below.
        postOptions['stop'] = ['\n'];
    }
    else if (requestContext.stop) {
        postOptions['stop'] = requestContext.stop;
    }
    if (requestContext.maxTokens !== undefined) {
        postOptions['max_tokens'] = requestContext.maxTokens;
    }
    const requestStart = Date.now();
    // extend telemetry data
    const newProperties = {
        endpoint: 'completions',
        uiKind: fetch_1.CopilotUiKind.GhostText,
        temperature: JSON.stringify(temperature),
        n: JSON.stringify(n),
        stop: JSON.stringify(postOptions['stop']) ?? 'unset',
        logit_bias: JSON.stringify(null),
    };
    Object.assign(baseTelemetryData.properties, newProperties);
    try {
        const completionParams = {
            prompt: requestContext.prompt,
            languageId: requestContext.languageId,
            repoInfo: requestContext.repoInfo,
            ourRequestId: requestContext.ourRequestId,
            engineModelId: requestContext.engineModelId,
            count: n,
            uiKind: fetch_1.CopilotUiKind.GhostText,
            postOptions,
            headers: requestContext.headers,
            extra,
        };
        const res = await fetcherService.fetchAndStreamCompletions(completionParams, baseTelemetryData, finishedCb, cancellationToken);
        if (res.type === 'failed') {
            return {
                type: 'failed',
                reason: res.reason,
                telemetryData: (0, telemetry_3.mkBasicResultTelemetry)(baseTelemetryData),
            };
        }
        if (res.type === 'canceled') {
            ghostTextLogger.debug(logTarget, 'Cancelled after awaiting fetchCompletions');
            return {
                type: 'canceled',
                reason: res.reason,
                telemetryData: (0, telemetry_3.mkCanceledResultTelemetry)(baseTelemetryData),
            };
        }
        return processChoices(requestStart, res.getProcessingTime(), res.choices);
    }
    catch (err) {
        // If we cancelled a network request, we don't want to log an error
        if ((0, networking_1.isAbortError)(err)) {
            return {
                type: 'canceled',
                reason: 'network request aborted',
                telemetryData: (0, telemetry_3.mkCanceledResultTelemetry)(baseTelemetryData, {
                    cancelledNetworkRequest: true,
                }),
            };
        }
        else {
            instantiationService.invokeFunction(acc => ghostTextLogger.exception(acc, err, `Error on ghost text request`));
            userErrorNotifier.notifyUser(err);
            if (runtimeMode.shouldFailForDebugPurposes()) {
                throw err;
            }
            // not including err in this result because it'll end up in standard telemetry
            return {
                type: 'failed',
                reason: 'non-abort error on ghost text request',
                telemetryData: (0, telemetry_3.mkBasicResultTelemetry)(baseTelemetryData),
            };
        }
    }
}
/**
 * Post-proceses a completion choice based on the current request context and existing choices.
 */
function postProcessChoices(newChoice, requestContext, currentChoices) {
    if (!currentChoices) {
        currentChoices = [];
    }
    newChoice.completionText = newChoice.completionText.trimEnd();
    if (!newChoice.completionText) {
        return undefined;
    }
    // Collect only unique displayTexts
    if (currentChoices.findIndex(v => v.completionText.trim() === newChoice.completionText.trim()) !== -1) {
        return undefined;
    }
    return newChoice;
}
/** Requests new completion from OpenAI, should be called if and only if the completions for given prompt were not cached before.
 *  It returns only first completion, additional completions are added to the caches in the background.
 *  Copies from the base telemetry data are used as the basis for each choice's telemetry.
 */
async function getCompletionsFromNetwork(accessor, requestContext, baseTelemetryData, cancellationToken, finishedCb) {
    const instantiationService = accessor.get(instantiation_1.IInstantiationService);
    const logTarget = accessor.get(logger_1.ICompletionsLogTargetService);
    const runtimeMode = accessor.get(runtimeMode_1.ICompletionsRuntimeModeService);
    return genericGetCompletionsFromNetwork(accessor, requestContext, baseTelemetryData, cancellationToken, finishedCb, 'completions', async (requestStart, processingTime, choicesStream) => {
        const choicesIterator = choicesStream[Symbol.asyncIterator]();
        const firstRes = await choicesIterator.next();
        if (firstRes.done) {
            ghostTextLogger.debug(logTarget, 'All choices redacted');
            return {
                type: 'empty',
                reason: 'all choices redacted',
                telemetryData: (0, telemetry_3.mkBasicResultTelemetry)(baseTelemetryData),
            };
        }
        if (cancellationToken?.isCancellationRequested) {
            ghostTextLogger.debug(logTarget, 'Cancelled after awaiting redactedChoices iterator');
            return {
                type: 'canceled',
                reason: 'after awaiting redactedChoices iterator',
                telemetryData: (0, telemetry_3.mkCanceledResultTelemetry)(baseTelemetryData),
            };
        }
        const firstChoice = firstRes.value;
        if (firstChoice === undefined) {
            // This is probably unreachable given the firstRes.done check above
            ghostTextLogger.debug(logTarget, 'Got undefined choice from redactedChoices iterator');
            return {
                type: 'empty',
                reason: 'got undefined choice from redactedChoices iterator',
                telemetryData: (0, telemetry_3.mkBasicResultTelemetry)(baseTelemetryData),
            };
        }
        instantiationService.invokeFunction(telemetryPerformance, 'performance', firstChoice, requestStart, processingTime);
        ghostTextLogger.debug(logTarget, `Awaited first result, id:  ${firstChoice.choiceIndex}`);
        // Adds first result to cache
        const processedFirstChoice = postProcessChoices(firstChoice, requestContext);
        if (processedFirstChoice) {
            instantiationService.invokeFunction(appendToCache, requestContext, processedFirstChoice);
            ghostTextLogger.debug(logTarget, `GhostText first completion (index ${processedFirstChoice?.choiceIndex}): ${JSON.stringify(processedFirstChoice?.completionText)}`);
        }
        //Create promise for each result, don't `await` it (unless in test mode) but handle asynchronously with `.then()`
        const cacheDone = (async () => {
            const apiChoices = processedFirstChoice !== undefined ? [processedFirstChoice] : [];
            for await (const choice of choicesStream) {
                if (choice === undefined) {
                    continue;
                }
                ghostTextLogger.debug(logTarget, `GhostText later completion (index ${choice?.choiceIndex}): ${JSON.stringify(choice.completionText)}`);
                const processedChoice = postProcessChoices(choice, requestContext, apiChoices);
                if (!processedChoice) {
                    continue;
                }
                apiChoices.push(processedChoice);
                instantiationService.invokeFunction(appendToCache, requestContext, processedChoice);
            }
        })();
        if (runtimeMode.isRunningInTest()) {
            await cacheDone;
        }
        if (processedFirstChoice) {
            // Because we ask the server to stop at \n above, we don't need to force single line here
            return {
                type: 'success',
                value: [makeGhostAPIChoice(processedFirstChoice, { forceSingleLine: false }), cacheDone],
                telemetryData: (0, telemetry_3.mkBasicResultTelemetry)(baseTelemetryData),
                telemetryBlob: baseTelemetryData,
                resultType: ResultType.Network,
            };
        }
        else {
            return {
                type: 'empty',
                reason: 'got undefined processedFirstChoice',
                telemetryData: (0, telemetry_3.mkBasicResultTelemetry)(baseTelemetryData),
            };
        }
    });
}
/** Requests new completion from OpenAI, should be called if and only if we are in the servers-side termination mode, and it's follow-up cycling request
 *  It returns all requested completions
 *  Copies from the base telemetry data are used as the basis for each choice's telemetry.
 */
async function getAllCompletionsFromNetwork(accessor, requestContext, baseTelemetryData, cancellationToken, finishedCb) {
    const logTarget = accessor.get(logger_1.ICompletionsLogTargetService);
    const instantiationService = accessor.get(instantiation_1.IInstantiationService);
    return genericGetCompletionsFromNetwork(accessor, requestContext, baseTelemetryData, cancellationToken, finishedCb, 'all completions', async (requestStart, processingTime, choicesStream) => {
        const apiChoices = [];
        for await (const choice of choicesStream) {
            if (cancellationToken?.isCancellationRequested) {
                ghostTextLogger.debug(logTarget, 'Cancelled after awaiting choices iterator');
                return {
                    type: 'canceled',
                    reason: 'after awaiting choices iterator',
                    telemetryData: (0, telemetry_3.mkCanceledResultTelemetry)(baseTelemetryData),
                };
            }
            const processedChoice = postProcessChoices(choice, requestContext, apiChoices);
            if (!processedChoice) {
                continue;
            }
            apiChoices.push(processedChoice);
        }
        //Append results to current completions cache, and network cache
        if (apiChoices.length > 0) {
            for (const choice of apiChoices) {
                instantiationService.invokeFunction(appendToCache, requestContext, choice);
            }
            instantiationService.invokeFunction(telemetryPerformance, 'cyclingPerformance', apiChoices[0], requestStart, processingTime);
        }
        return {
            type: 'success',
            value: [apiChoices, Promise.resolve()],
            telemetryData: (0, telemetry_3.mkBasicResultTelemetry)(baseTelemetryData),
            telemetryBlob: baseTelemetryData,
            resultType: ResultType.Cycling,
        };
    });
}
function makeGhostAPIChoice(choice, options) {
    const ghostChoice = { ...choice };
    if (options.forceSingleLine) {
        const { completionText } = ghostChoice;
        // Special case for when completion starts with a newline, don't count that as its own line
        const initialLineBreak = completionText.match(/^\r?\n/);
        if (initialLineBreak) {
            ghostChoice.completionText = initialLineBreak[0] + completionText.split('\n')[1];
        }
        else {
            ghostChoice.completionText = completionText.split('\n')[0];
        }
    }
    return ghostChoice;
}
function takeNLines(n) {
    return (text) => {
        // If the text is longer than n lines, return the offset.
        // Checks for n+1 lines because of the leading newline.
        const lines = text?.split('\n') ?? [];
        if (lines.length > n + 1) {
            return lines.slice(0, n + 1).join('\n').length;
        }
    };
}
async function getGhostTextStrategy(accessor, completionState, prefix, prompt, isCycling, inlineSuggestion, hasAcceptedCurrentCompletion, preIssuedTelemetryData) {
    const instantiationService = accessor.get(instantiation_1.IInstantiationService);
    const featuresService = accessor.get(featuresService_1.ICompletionsFeaturesService);
    const blockModeConfig = accessor.get(configBlockMode_1.ICompletionsBlockModeConfig);
    const multilineAfterAcceptLines = featuresService.multilineAfterAcceptLines(preIssuedTelemetryData);
    const blockMode = blockModeConfig.forLanguage(completionState.textDocument.detectedLanguageId, preIssuedTelemetryData);
    switch (blockMode) {
        case config_1.BlockMode.Server:
            // Override the server-side trimming after accepting a completion
            if (hasAcceptedCurrentCompletion) {
                return {
                    blockMode: config_1.BlockMode.Parsing,
                    requestMultiline: true,
                    finishedCb: takeNLines(multilineAfterAcceptLines),
                    stop: ['\n\n'],
                    maxTokens: maxSinglelineTokens * multilineAfterAcceptLines,
                };
            }
            return {
                blockMode: config_1.BlockMode.Server,
                requestMultiline: true,
                finishedCb: _ => undefined,
            };
        case config_1.BlockMode.Parsing:
        case config_1.BlockMode.ParsingAndServer:
        case config_1.BlockMode.MoreMultiline:
        default: {
            // we shouldn't drop through to here, but in case we do, be explicit about the behaviour
            let requestMultiline;
            try {
                requestMultiline = await instantiationService.invokeFunction(shouldRequestMultiline, blockMode, completionState.textDocument, completionState.position, inlineSuggestion, hasAcceptedCurrentCompletion, prompt);
            }
            catch (err) {
                // Fallback to non-multiline
                requestMultiline = { requestMultiline: false };
            }
            if (!hasAcceptedCurrentCompletion &&
                requestMultiline.requestMultiline &&
                featuresService.singleLineUnlessAccepted(preIssuedTelemetryData)) {
                requestMultiline.requestMultiline = false;
            }
            if (requestMultiline.requestMultiline) {
                // Note that `trailingWs` contains *any* trailing whitespace from the prompt, but the prompt itself
                // is only trimmed if the entire last line is whitespace.  We have to account for that here when we
                // check whether the block body is finished.
                let adjustedPosition;
                if (prompt.trailingWs.length > 0 && !prompt.prompt.prefix.endsWith(prompt.trailingWs)) {
                    // Prompt was adjusted, so adjust the position to match
                    adjustedPosition = textDocument_1.LocationFactory.position(completionState.position.line, Math.max(completionState.position.character - prompt.trailingWs.length, 0));
                }
                else {
                    // Otherwise, just use the original position
                    adjustedPosition = completionState.position;
                }
                return {
                    blockMode: blockMode,
                    requestMultiline: true,
                    ...instantiationService.invokeFunction(buildFinishedCallback, blockMode, completionState.textDocument, adjustedPosition, requestMultiline.blockPosition, prefix, true, prompt.prompt, preIssuedTelemetryData),
                };
            }
            // Override single-line to multiline after accepting a completion
            if (hasAcceptedCurrentCompletion) {
                const result = {
                    blockMode: config_1.BlockMode.Parsing,
                    requestMultiline: true,
                    finishedCb: takeNLines(multilineAfterAcceptLines),
                    stop: ['\n\n'],
                    maxTokens: maxSinglelineTokens * multilineAfterAcceptLines,
                };
                if (blockMode === config_1.BlockMode.MoreMultiline) {
                    result.blockMode = config_1.BlockMode.MoreMultiline;
                }
                return result;
            }
            // not multiline
            return {
                blockMode: blockMode,
                requestMultiline: false,
                ...instantiationService.invokeFunction(buildFinishedCallback, blockMode, completionState.textDocument, completionState.position, requestMultiline.blockPosition, prefix, false, prompt.prompt, preIssuedTelemetryData),
            };
        }
    }
}
function buildFinishedCallback(accessor, blockMode, document, position, positionType, prefix, multiline, prompt, telemetryData) {
    const featuresService = accessor.get(featuresService_1.ICompletionsFeaturesService);
    const instantiationService = accessor.get(instantiation_1.IInstantiationService);
    if (multiline && blockMode === config_1.BlockMode.MoreMultiline && blockTrimmer_1.BlockTrimmer.isSupported(document.detectedLanguageId)) {
        const lookAhead = positionType === blockTrimmer_1.BlockPositionType.EmptyBlock || positionType === blockTrimmer_1.BlockPositionType.BlockEnd
            ? featuresService.longLookaheadSize(telemetryData)
            : featuresService.shortLookaheadSize(telemetryData);
        const finishedCb = instantiationService.createInstance(streamedCompletionSplitter_1.StreamedCompletionSplitter, prefix, document.detectedLanguageId, false, lookAhead, (extraPrefix, item) => {
            const cacheContext = {
                prefix: prefix + extraPrefix,
                prompt: { ...prompt, prefix: prompt.prefix + extraPrefix },
            };
            instantiationService.invokeFunction(appendToCache, cacheContext, item);
        }).getFinishedCallback();
        return {
            finishedCb,
            maxTokens: featuresService.maxMultilineTokens(telemetryData),
        };
    }
    return { finishedCb: multiline ? (0, parseBlock_1.parsingBlockFinished)(document, position) : _ => undefined };
}
const defaultOptions = {
    isCycling: false,
    promptOnly: false,
    isSpeculative: false,
};
function getRemainingDebounceMs(accessor, opts, telemetry) {
    const featuresService = accessor.get(featuresService_1.ICompletionsFeaturesService);
    const debounce = (0, config_1.getConfig)(accessor, config_1.ConfigKey.CompletionsDebounce) ??
        featuresService.completionsDebounce(telemetry) ??
        opts.debounceMs;
    if (debounce === undefined) {
        return 0;
    }
    const elapsed = (0, telemetry_2.now)() - telemetry.issuedTime;
    return Math.max(0, debounce - elapsed);
}
function inlineCompletionRequestCancelled(currentGhostText, requestId, cancellationToken) {
    return cancellationToken?.isCancellationRequested || requestId !== currentGhostText.currentRequestId;
}
async function getGhostTextWithoutAbortHandling(accessor, completionState, ourRequestId, preIssuedTelemetryDataWithExp, cancellationToken, options) {
    let start = preIssuedTelemetryDataWithExp.issuedTime; // Start before getting exp assignments
    const performanceMetrics = [];
    /** Internal helper to record performance measurements. Mutates performanceMetrics and start. */
    function recordPerformance(name) {
        const next = (0, telemetry_2.now)();
        performanceMetrics.push([name, next - start]);
        start = next;
    }
    recordPerformance('telemetry');
    const instantiationService = accessor.get(instantiation_1.IInstantiationService);
    const featuresService = accessor.get(featuresService_1.ICompletionsFeaturesService);
    const asyncCompletionManager = accessor.get(asyncCompletions_1.ICompletionsAsyncManagerService);
    const logTarget = accessor.get(logger_1.ICompletionsLogTargetService);
    const currentGhostText = accessor.get(current_1.ICompletionsCurrentGhostText);
    const statusReporter = accessor.get(progress_1.ICompletionsStatusReporter);
    if (inlineCompletionRequestCancelled(currentGhostText, ourRequestId, cancellationToken)) {
        return {
            type: 'abortedBeforeIssued',
            reason: 'cancelled before extractPrompt',
            telemetryData: (0, telemetry_3.mkBasicResultTelemetry)(preIssuedTelemetryDataWithExp),
        };
    }
    const inlineSuggestion = isInlineSuggestion(completionState.textDocument, completionState.position);
    if (inlineSuggestion === undefined) {
        ghostTextLogger.debug(logTarget, 'Breaking, invalid middle of the line');
        return {
            type: 'abortedBeforeIssued',
            reason: 'Invalid middle of the line',
            telemetryData: (0, telemetry_3.mkBasicResultTelemetry)(preIssuedTelemetryDataWithExp),
        };
    }
    const engineInfo = instantiationService.invokeFunction(config_2.getEngineRequestInfo, preIssuedTelemetryDataWithExp);
    const ghostTextOptions = { ...defaultOptions, ...options, tokenizer: engineInfo.tokenizer };
    const prompt = await instantiationService.invokeFunction(prompt_1.extractPrompt, ourRequestId, completionState, preIssuedTelemetryDataWithExp, undefined, ghostTextOptions);
    recordPerformance('prompt');
    if (prompt.type === 'copilotContentExclusion') {
        ghostTextLogger.debug(logTarget, 'Copilot not available, due to content exclusion');
        return {
            type: 'abortedBeforeIssued',
            reason: 'Copilot not available due to content exclusion',
            telemetryData: (0, telemetry_3.mkBasicResultTelemetry)(preIssuedTelemetryDataWithExp),
        };
    }
    if (prompt.type === 'contextTooShort') {
        ghostTextLogger.debug(logTarget, 'Breaking, not enough context');
        return {
            type: 'abortedBeforeIssued',
            reason: 'Not enough context',
            telemetryData: (0, telemetry_3.mkBasicResultTelemetry)(preIssuedTelemetryDataWithExp),
        };
    }
    if (prompt.type === 'promptError') {
        ghostTextLogger.debug(logTarget, 'Error while building the prompt');
        return {
            type: 'abortedBeforeIssued',
            reason: 'Error while building the prompt',
            telemetryData: (0, telemetry_3.mkBasicResultTelemetry)(preIssuedTelemetryDataWithExp),
        };
    }
    if (ghostTextOptions.promptOnly) {
        return { type: 'promptOnly', reason: 'Breaking, promptOnly set to true', prompt: prompt };
    }
    if (prompt.type === 'promptCancelled') {
        ghostTextLogger.debug(logTarget, 'Cancelled during extractPrompt');
        return {
            type: 'abortedBeforeIssued',
            reason: 'Cancelled during extractPrompt',
            telemetryData: (0, telemetry_3.mkBasicResultTelemetry)(preIssuedTelemetryDataWithExp),
        };
    }
    if (prompt.type === 'promptTimeout') {
        ghostTextLogger.debug(logTarget, 'Timeout during extractPrompt');
        return {
            type: 'abortedBeforeIssued',
            reason: 'Timeout',
            telemetryData: (0, telemetry_3.mkBasicResultTelemetry)(preIssuedTelemetryDataWithExp),
        };
    }
    if (prompt.prompt.prefix.length === 0 && prompt.prompt.suffix.length === 0) {
        ghostTextLogger.debug(logTarget, 'Error empty prompt');
        return {
            type: 'abortedBeforeIssued',
            reason: 'Empty prompt',
            telemetryData: (0, telemetry_3.mkBasicResultTelemetry)(preIssuedTelemetryDataWithExp),
        };
    }
    const debounce = instantiationService.invokeFunction(getRemainingDebounceMs, ghostTextOptions, preIssuedTelemetryDataWithExp);
    if (debounce > 0) {
        ghostTextLogger.debug(logTarget, `Debouncing ghost text request for ${debounce}ms`);
        await (0, async_1.delay)(debounce);
        if (inlineCompletionRequestCancelled(currentGhostText, ourRequestId, cancellationToken)) {
            return {
                type: 'abortedBeforeIssued',
                reason: 'cancelled after debounce',
                telemetryData: (0, telemetry_3.mkBasicResultTelemetry)(preIssuedTelemetryDataWithExp),
            };
        }
    }
    return statusReporter.withProgress(async () => {
        const [prefix] = (0, prompt_1.trimLastLine)(completionState.textDocument.getText(textDocument_1.LocationFactory.range(textDocument_1.LocationFactory.position(0, 0), completionState.position)));
        const hasAcceptedCurrentCompletion = currentGhostText.hasAcceptedCurrentCompletion(prefix, prompt.prompt.suffix);
        const originalPrompt = prompt.prompt;
        const ghostTextStrategy = await instantiationService.invokeFunction(getGhostTextStrategy, completionState, prefix, prompt, ghostTextOptions.isCycling, inlineSuggestion, hasAcceptedCurrentCompletion, preIssuedTelemetryDataWithExp);
        recordPerformance('strategy');
        let choices = instantiationService.invokeFunction(getLocalInlineSuggestion, prefix, originalPrompt, ghostTextStrategy.requestMultiline);
        recordPerformance('cache');
        const repoInfo = instantiationService.invokeFunction(repository_1.extractRepoInfoInBackground, completionState.textDocument.uri);
        const requestContext = {
            blockMode: ghostTextStrategy.blockMode,
            languageId: completionState.textDocument.detectedLanguageId,
            repoInfo: repoInfo,
            engineModelId: engineInfo.modelId,
            ourRequestId,
            prefix,
            prompt: prompt.prompt,
            multiline: ghostTextStrategy.requestMultiline,
            indentation: (0, parseBlock_1.contextIndentation)(completionState.textDocument, completionState.position),
            isCycling: ghostTextOptions.isCycling,
            headers: engineInfo.headers,
            stop: ghostTextStrategy.stop,
            maxTokens: ghostTextStrategy.maxTokens,
            afterAccept: hasAcceptedCurrentCompletion,
        };
        // Add headers to identify async completions and speculative requests
        requestContext.headers = {
            ...requestContext.headers,
            'X-Copilot-Async': 'true',
            'X-Copilot-Speculative': ghostTextOptions.isSpeculative ? 'true' : 'false',
        };
        // this will be used as basis for the choice telemetry data
        const telemetryData = instantiationService.invokeFunction(telemetryIssued, completionState.textDocument, requestContext, completionState.position, prompt, preIssuedTelemetryDataWithExp, engineInfo, ghostTextOptions);
        // Wait before requesting more completions if there is a candidate
        // completion request in flight. Does not wait for cycling requests or
        // if there is a cached completion.
        if (choices === undefined &&
            !ghostTextOptions.isCycling &&
            asyncCompletionManager.shouldWaitForAsyncCompletions(prefix, prompt.prompt)) {
            const choice = await asyncCompletionManager.getFirstMatchingRequestWithTimeout(ourRequestId, prefix, prompt.prompt, ghostTextOptions.isSpeculative, telemetryData);
            recordPerformance('asyncWait');
            if (choice) {
                const forceSingleLine = !ghostTextStrategy.requestMultiline;
                const trimmedChoice = makeGhostAPIChoice(choice[0], { forceSingleLine });
                choices = [[trimmedChoice], ResultType.Async];
            }
            if (inlineCompletionRequestCancelled(currentGhostText, ourRequestId, cancellationToken)) {
                ghostTextLogger.debug(logTarget, 'Cancelled before requesting a new completion');
                return {
                    type: 'abortedBeforeIssued',
                    reason: 'Cancelled after waiting for async completion',
                    telemetryData: (0, telemetry_3.mkBasicResultTelemetry)(telemetryData),
                };
            }
        }
        const isMoreMultiline = ghostTextStrategy.blockMode === config_1.BlockMode.MoreMultiline &&
            blockTrimmer_1.BlockTrimmer.isSupported(completionState.textDocument.detectedLanguageId);
        if (choices !== undefined) {
            // Post-process any cached choices before deciding whether to issue a network request
            choices[0] = choices[0]
                .map(c => instantiationService.invokeFunction(suggestions_1.postProcessChoiceInContext, completionState.textDocument, completionState.position, c, isMoreMultiline, ghostTextLogger))
                .filter(c => c !== undefined);
        }
        if (choices !== undefined && choices[0].length === 0) {
            ghostTextLogger.debug(logTarget, `Found empty inline suggestions locally via ${(0, telemetry_3.resultTypeToString)(choices[1])}`);
            return {
                type: 'empty',
                reason: 'cached results empty after post-processing',
                telemetryData: (0, telemetry_3.mkBasicResultTelemetry)(telemetryData),
            };
        }
        if (choices !== undefined &&
            choices[0].length > 0 &&
            // If it's a cycling request, need to show multiple choices
            (!ghostTextOptions.isCycling || choices[0].length > 1)) {
            ghostTextLogger.debug(logTarget, `Found inline suggestions locally via ${(0, telemetry_3.resultTypeToString)(choices[1])}`);
        }
        else {
            // No local choices, go to network
            if (ghostTextOptions.isCycling) {
                const networkChoices = await instantiationService.invokeFunction(getAllCompletionsFromNetwork, requestContext, telemetryData, cancellationToken, ghostTextStrategy.finishedCb);
                // TODO: if we already had some choices cached from the initial non-cycling request,
                // and then the cycling request returns no results for some reason, we need to still
                // return the original choices to the editor to avoid the ghost text disappearing completely.
                // However this should be telemetrised according to the result of the cycling request itself,
                // i.e. failure/empty (or maybe canceled).
                //
                // Right now this is awkward to orchestrate in the code and we don't handle it, incorrectly
                // returning `ghostText.produced` instead. Cycling is a manual action and hence uncommon,
                // so this shouldn't cause much inaccuracy, but we still should fix this.
                if (networkChoices.type === 'success') {
                    const resultChoices = choices?.[0] ?? [];
                    networkChoices.value[0].forEach(c => {
                        // Collect only unique displayTexts
                        if (resultChoices.findIndex(v => v.completionText.trim() === c.completionText.trim()) !== -1) {
                            return;
                        }
                        resultChoices.push(c);
                    });
                    choices = [resultChoices, ResultType.Cycling];
                }
                else {
                    if (choices === undefined) {
                        return networkChoices;
                    }
                }
            }
            else {
                // Wrap an observer around the finished callback to update the
                // async manager as the request streams in.
                const finishedCb = (text, delta) => {
                    asyncCompletionManager.updateCompletion(ourRequestId, text);
                    return ghostTextStrategy.finishedCb(text, delta);
                };
                const asyncCancellationTokenSource = new src_1.CancellationTokenSource();
                const requestPromise = instantiationService.invokeFunction(getCompletionsFromNetwork, requestContext, telemetryData, asyncCancellationTokenSource.token, finishedCb);
                void asyncCompletionManager.queueCompletionRequest(ourRequestId, prefix, prompt.prompt, asyncCancellationTokenSource, requestPromise);
                const c = await asyncCompletionManager.getFirstMatchingRequest(ourRequestId, prefix, prompt.prompt, ghostTextOptions.isSpeculative);
                if (c === undefined) {
                    return {
                        type: 'empty',
                        reason: 'received no results from async completions',
                        telemetryData: (0, telemetry_3.mkBasicResultTelemetry)(telemetryData),
                    };
                }
                choices = [[c[0]], ResultType.Async];
            }
            recordPerformance('network');
        }
        if (choices === undefined) {
            return {
                type: 'failed',
                reason: 'internal error: choices should be defined after network call',
                telemetryData: (0, telemetry_3.mkBasicResultTelemetry)(telemetryData),
            };
        }
        const [choicesArray, resultType] = choices;
        const postProcessedChoicesArray = choicesArray
            .map(c => instantiationService.invokeFunction(suggestions_1.postProcessChoiceInContext, completionState.textDocument, completionState.position, c, isMoreMultiline, ghostTextLogger))
            .filter(c => c !== undefined);
        // Delay response if needed. Note, this must come before the
        // telemetryWithAddData call since the time_to_produce_ms is computed
        // there
        const completionsDelay = instantiationService.invokeFunction((config_1.getConfig), config_1.ConfigKey.CompletionsDelay) ??
            featuresService.completionsDelay(preIssuedTelemetryDataWithExp);
        const elapsed = (0, telemetry_2.now)() - preIssuedTelemetryDataWithExp.issuedTime;
        const remainingDelay = Math.max(completionsDelay - elapsed, 0);
        if (resultType !== ResultType.TypingAsSuggested && !ghostTextOptions.isCycling && remainingDelay > 0) {
            ghostTextLogger.debug(logTarget, `Waiting ${remainingDelay}ms before returning completion`);
            await (0, async_1.delay)(remainingDelay);
            if (inlineCompletionRequestCancelled(currentGhostText, ourRequestId, cancellationToken)) {
                ghostTextLogger.debug(logTarget, 'Cancelled after completions delay');
                return {
                    type: 'canceled',
                    reason: 'after completions delay',
                    telemetryData: (0, telemetry_3.mkCanceledResultTelemetry)(telemetryData),
                };
            }
        }
        const results = [];
        for (const choice of postProcessedChoicesArray) {
            // Do this to get a new object for each choice
            const choiceTelemetryData = telemetryWithAddData(completionState.textDocument, requestContext, choice, telemetryData);
            const suffixCoverage = inlineSuggestion
                ? (0, suggestions_1.checkSuffix)(completionState.textDocument, completionState.position, choice)
                : 0;
            // We want to use `newTrailingWs` as the trailing whitespace
            const ghostCompletion = adjustLeadingWhitespace(choice.choiceIndex, choice.completionText, prompt.trailingWs);
            const res = {
                completion: ghostCompletion,
                telemetry: choiceTelemetryData,
                isMiddleOfTheLine: inlineSuggestion,
                suffixCoverage,
                copilotAnnotations: choice.copilotAnnotations,
                clientCompletionId: choice.clientCompletionId,
            };
            results.push(res);
        }
        // Lift clientCompletionId out of the result in order to include it in the telemetry payload computed by mkBasicResultTelemetry.
        telemetryData.properties.clientCompletionId = results[0]?.clientCompletionId;
        // If reading from the cache or async, capture the look back offset used
        telemetryData.measurements.foundOffset = results?.[0]?.telemetry?.measurements?.foundOffset ?? -1;
        ghostTextLogger.debug(logTarget, `Produced ${results.length} results from ${(0, telemetry_3.resultTypeToString)(resultType)} at ${telemetryData.measurements.foundOffset} offset`);
        if (inlineCompletionRequestCancelled(currentGhostText, ourRequestId, cancellationToken)) {
            return {
                type: 'canceled',
                reason: 'after post processing completions',
                telemetryData: (0, telemetry_3.mkCanceledResultTelemetry)(telemetryData),
            };
        }
        if (!ghostTextOptions.isSpeculative) {
            // Update the current ghost text with the new response before returning for the "typing as suggested" UX
            currentGhostText.setGhostText(prefix, prompt.prompt.suffix, postProcessedChoicesArray, resultType);
        }
        recordPerformance('complete');
        return {
            type: 'success',
            value: [results, resultType],
            telemetryData: (0, telemetry_3.mkBasicResultTelemetry)(telemetryData),
            telemetryBlob: telemetryData,
            resultType,
            performanceMetrics,
        };
    });
}
async function getGhostText(accessor, completionState, token, options) {
    const id = (0, uuid_1.generateUuid)();
    const instantiationService = accessor.get(instantiation_1.IInstantiationService);
    const telemetryService = accessor.get(telemetry_1.ITelemetryService);
    const notifierService = accessor.get(completionNotifier_1.ICompletionsNotifierService);
    const contextProviderBridge = accessor.get(contextProviderBridge_1.ICompletionsContextProviderBridgeService);
    const currentGhostText = accessor.get(current_1.ICompletionsCurrentGhostText);
    const contextproviderStatistics = accessor.get(contextProviderStatistics_1.ICompletionsContextProviderService);
    currentGhostText.currentRequestId = id;
    const telemetryData = await createTelemetryWithExp(accessor, completionState.textDocument, id, options);
    // A CLS consumer has an LSP bug where it erroneously makes method requests before `initialize` has returned, which
    // means we can't use `initialize` to actually initialize anything expensive.  This the primary user of the
    // tokenizer, so settle for initializing here instead.  We don't use waitForTokenizers() because in the event of a
    // tokenizer load failure, that would spam handleException() on every request.
    await tokenization_1.initializeTokenizers.catch(() => { });
    try {
        contextProviderBridge.schedule(completionState, id, options?.opportunityId ?? '', telemetryData, token, options);
        notifierService.notifyRequest(completionState, id, telemetryData, token, options);
        const result = await instantiationService.invokeFunction(getGhostTextWithoutAbortHandling, completionState, id, telemetryData, token, options);
        const statistics = contextproviderStatistics.getStatisticsForCompletion(id);
        const opportunityId = options?.opportunityId ?? 'unknown';
        for (const [providerId, statistic] of statistics.getAllUsageStatistics()) {
            /* __GDPR__
                "context-provider.completion-stats" : {
                    "owner": "dirkb",
                    "comment": "Telemetry for copilot inline completion context",
                    "requestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The request correlation id" },
                    "opportunityId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The opportunity id" },
                    "providerId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The context provider id" },
                    "resolution": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The resolution of the context" },
                    "usage": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "How the context was used" },
                    "usageDetails": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Additional details about the usage as a JSON string" }
                }
            */
            telemetryService.sendMSFTTelemetryEvent('context-provider.completion-stats', {
                requestId: id,
                opportunityId,
                providerId,
                resolution: statistic.resolution,
                usage: statistic.usage,
                usageDetails: JSON.stringify(statistic.usageDetails),
            }, {});
        }
        return result;
    }
    catch (e) {
        // The cancellation token may be called after the request is done but while we still process data.
        // The underlying implementation catches abort errors for specific scenarios but we still have uncovered paths.
        // To avoid returning an error to the editor, this acts as an fault barrier here.
        if ((0, networking_1.isAbortError)(e)) {
            return {
                type: 'canceled',
                reason: 'aborted at unknown location',
                telemetryData: (0, telemetry_3.mkCanceledResultTelemetry)(telemetryData, {
                    cancelledNetworkRequest: true,
                }),
            };
        }
        throw e;
    }
}
/**
 * Attempt to get InlineSuggestion locally, in one of two ways:
 *  1. If the user is typing the letters already displayed as inline suggestion.
 *  2. If we have a previously cached inline suggestion for this prompt and requestMultiline.
 */
function getLocalInlineSuggestion(accessor, prefix, prompt, requestMultiline) {
    const currentGhostText = accessor.get(current_1.ICompletionsCurrentGhostText);
    const choicesTyping = currentGhostText.getCompletionsForUserTyping(prefix, prompt.suffix);
    const choicesCache = getCompletionsFromCache(accessor, prefix, prompt.suffix, requestMultiline);
    if (choicesTyping && choicesTyping.length > 0) {
        // Append cached choices to choicesTyping, if any. Ensure typing choices
        // are first so that the shown completion doesn't disappear.
        // Filter duplicates by completionText
        const choicesCacheDeduped = (choicesCache ?? []).filter(c => !choicesTyping.some(t => t.completionText === c.completionText));
        return [choicesTyping.concat(choicesCacheDeduped), ResultType.TypingAsSuggested];
    }
    if (choicesCache && choicesCache.length > 0) {
        return [choicesCache, ResultType.Cache];
    }
}
/** Checks if the position is valid inline suggestion position. Returns `undefined` if it's position where ghost text shouldn't be displayed */
function isInlineSuggestion(document, position) {
    //Checks if we're in the position for the middle of the line suggestion
    const isMiddleOfLine = isMiddleOfTheLine(position, document);
    const isValidMiddleOfLine = isValidMiddleOfTheLinePosition(position, document);
    if (isMiddleOfLine && !isValidMiddleOfLine) {
        return;
    }
    const isInlineSuggestion = isMiddleOfLine && isValidMiddleOfLine;
    return isInlineSuggestion;
}
/** Checks if position is NOT at the end of the line */
function isMiddleOfTheLine(selectionPosition, doc) {
    // must be end of line or trailing whitespace
    const line = doc.lineAt(selectionPosition);
    if (line.text.substr(selectionPosition.character).trim().length !== 0) {
        return true;
    }
    return false;
}
/** Checks if position is valid for the middle of the line suggestion */
function isValidMiddleOfTheLinePosition(selectionPosition, doc) {
    const line = doc.lineAt(selectionPosition);
    const endOfLine = line.text.substr(selectionPosition.character).trim();
    return /^\s*[)>}\]"'`]*\s*[:{;,]?\s*$/.test(endOfLine);
}
/** Checks if position is the beginning of an empty line (including indentation) */
function isNewLine(selectionPosition, doc) {
    const line = doc.lineAt(selectionPosition);
    const lineTrimmed = line.text.trim();
    return lineTrimmed.length === 0;
}
// This enables tests to control multi line behavior
class ForceMultiLine {
    static { this.default = new ForceMultiLine(); }
    constructor(requestMultilineOverride = false) {
        this.requestMultilineOverride = requestMultilineOverride;
    }
}
exports.ForceMultiLine = ForceMultiLine;
async function shouldRequestMultiline(accessor, blockMode, document, position, inlineSuggestion, afterAccept, prompt) {
    // Parsing long files for multiline completions is slow, so we only do
    // it for files with less than 8000 lines
    if (document.lineCount >= 8000) {
        (0, telemetry_2.telemetry)(accessor, 'ghostText.longFileMultilineSkip', telemetry_2.TelemetryData.createAndMarkAsIssued({
            languageId: document.detectedLanguageId,
            lineCount: String(document.lineCount),
            currentLine: String(position.line),
        }));
    }
    else {
        if (blockMode === config_1.BlockMode.MoreMultiline && blockTrimmer_1.BlockTrimmer.isSupported(document.detectedLanguageId)) {
            if (!afterAccept) {
                return { requestMultiline: false };
            }
            const blockPosition = await (0, blockTrimmer_1.getBlockPositionType)(document, position);
            return { requestMultiline: true, blockPosition };
        }
        const targetLanguagesNewLine = ['typescript', 'typescriptreact'];
        if (targetLanguagesNewLine.includes(document.detectedLanguageId)) {
            const newLine = isNewLine(position, document);
            if (newLine) {
                return { requestMultiline: true };
            }
        }
        let requestMultiline = false;
        if (!inlineSuggestion && (0, parse_1.isSupportedLanguageId)(document.detectedLanguageId)) {
            // Can only check block-level nodes of languages we support
            requestMultiline = await (0, parseBlock_1.isEmptyBlockStartUtil)(document, position);
        }
        else if (inlineSuggestion && (0, parse_1.isSupportedLanguageId)(document.detectedLanguageId)) {
            //If we are inline, check if we would suggest multiline for current position or if we would suggest a multiline completion if we were at the end of the line
            requestMultiline =
                (await (0, parseBlock_1.isEmptyBlockStartUtil)(document, position)) ||
                    (await (0, parseBlock_1.isEmptyBlockStartUtil)(document, document.lineAt(position).range.end));
        }
        // If requestMultiline is false, for specific languages check multiline score
        if (!requestMultiline) {
            const requestMultiModelThreshold = 0.5;
            const targetLanguagesModel = ['javascript', 'javascriptreact', 'python'];
            if (targetLanguagesModel.includes(document.detectedLanguageId)) {
                // Call multiline model if not multiline and EXP flag is set.
                const multiModelScore = (0, multilineModel_1.requestMultilineScore)(prompt.prompt, document.detectedLanguageId);
                requestMultiline = multiModelScore > requestMultiModelThreshold;
            }
        }
        return { requestMultiline };
    }
    return { requestMultiline: false };
}
/** Appends completions to existing entry in cache or creates new entry. */
function appendToCache(accessor, requestContext, choice) {
    accessor.get(completionsCache_1.ICompletionsCacheService).append(requestContext.prefix, requestContext.prompt.suffix, choice);
}
function adjustLeadingWhitespace(index, text, ws) {
    if (ws.length > 0) {
        if (text.startsWith(ws)) {
            // Remove common prefix so that it can display in the correct position
            return {
                completionIndex: index,
                completionText: text,
                displayText: text.substring(ws.length),
                displayNeedsWsOffset: false,
            };
        }
        else {
            // The idea here is that we do want the display to be as close to the final position as possible
            const textLeftWs = text.substring(0, text.length - text.trimStart().length);
            if (ws.startsWith(textLeftWs)) {
                // NOTE: It's possible that `ws` is a bit too over-indented. Example:
                // def foo(n):
                //     if n > 0:
                //         print(f"n is positive: {n}")
                //         [cursor is here after new line]
                //
                // completion: "    else:"
                return {
                    completionIndex: index,
                    completionText: text,
                    displayText: text.trimStart(),
                    displayNeedsWsOffset: true,
                };
            }
            else {
                // We don't know any better so just send `text` back
                return { completionIndex: index, completionText: text, displayText: text, displayNeedsWsOffset: false };
            }
        }
    }
    else {
        // If we do not know leading whitespace or if it is an empty string, just return input text
        return { completionIndex: index, completionText: text, displayText: text, displayNeedsWsOffset: false };
    }
}
/**
 * Returns all completions from the cache for given document prefix. Walks back
 * from the current prefix to search for completions with a prefix that
 * partially matches the current prefix and completion text that matches the
 * remaining current prefix.
 */
function getCompletionsFromCache(accessor, prefix, suffix, multiline) {
    const logTarget = accessor.get(logger_1.ICompletionsLogTargetService);
    const choices = accessor.get(completionsCache_1.ICompletionsCacheService).findAll(prefix, suffix);
    if (choices.length === 0) {
        ghostTextLogger.debug(logTarget, `Found no completions in cache`);
        return [];
    }
    ghostTextLogger.debug(logTarget, `Found ${choices.length} completions in cache`);
    return choices.map(choice => makeGhostAPIChoice(choice, { forceSingleLine: !multiline }));
}
/** Create a TelemetryWithExp instance for a ghost text request. */
async function createTelemetryWithExp(accessor, document, headerRequestId, options) {
    const featuresService = accessor.get(featuresService_1.ICompletionsFeaturesService);
    const properties = { headerRequestId };
    if (options?.opportunityId) {
        properties.opportunityId = options.opportunityId;
    }
    if (options?.selectedCompletionInfo?.text) {
        properties.completionsActive = 'true';
    }
    if (options?.isSpeculative) {
        properties.reason = 'speculative';
    }
    const telemetryData = telemetry_2.TelemetryData.createAndMarkAsIssued(properties);
    const telemetryWithExp = await featuresService.updateExPValuesAndAssignments({ uri: document.uri, languageId: document.detectedLanguageId }, telemetryData);
    return telemetryWithExp;
}
/** Return a copy of the choice's telemetry data with extra information added */
function telemetryWithAddData(document, requestContext, choice, issuedTelemetryData) {
    const requestId = choice.requestId;
    const properties = {
        choiceIndex: choice.choiceIndex.toString(),
        clientCompletionId: choice.clientCompletionId,
    };
    if (choice.generatedChoiceIndex !== undefined) {
        properties.originalChoiceIndex = properties.choiceIndex;
        properties.choiceIndex = (10_000 * (choice.generatedChoiceIndex + 1) + choice.choiceIndex).toString();
    }
    const measurements = {
        compCharLen: choice.completionText.length,
        numLines: choice.completionText.trim().split('\n').length,
    };
    // Add assessments
    if (choice.meanLogProb) {
        measurements.meanLogProb = choice.meanLogProb;
    }
    if (choice.meanAlternativeLogProb) {
        measurements.meanAlternativeLogProb = choice.meanAlternativeLogProb;
    }
    const extendedTelemetry = choice.telemetryData.extendedBy(properties, measurements);
    extendedTelemetry.issuedTime = issuedTelemetryData.issuedTime;
    extendedTelemetry.measurements.timeToProduceMs = performance.now() - issuedTelemetryData.issuedTime;
    addDocumentTelemetry(extendedTelemetry, document);
    extendedTelemetry.extendWithRequestId(requestId);
    return extendedTelemetry;
}
/** Create new telemetry data based on baseTelemetryData and send `ghostText.issued` event  */
function telemetryIssued(accessor, document, requestContext, position, prompt, baseTelemetryData, requestInfo, ghostTextOptions) {
    // base ghostText telemetry data
    const properties = {
        languageId: document.detectedLanguageId,
    };
    properties.afterAccept = requestContext.afterAccept.toString();
    properties.isSpeculative = ghostTextOptions.isSpeculative.toString();
    const telemetryData = baseTelemetryData.extendedBy(properties);
    addDocumentTelemetry(telemetryData, document);
    // Add repository information
    const repoInfo = requestContext.repoInfo;
    telemetryData.properties.gitRepoInformation =
        repoInfo === undefined ? 'unavailable' : repoInfo === repository_1.ComputationStatus.PENDING ? 'pending' : 'available';
    if (repoInfo !== undefined && repoInfo !== repository_1.ComputationStatus.PENDING) {
        telemetryData.properties.gitRepoUrl = repoInfo.url;
        telemetryData.properties.gitRepoHost = repoInfo.hostname;
        if (repoInfo.repoId?.type === 'github') {
            telemetryData.properties.gitRepoOwner = repoInfo.repoId.org;
            telemetryData.properties.gitRepoName = repoInfo.repoId.repo;
        }
        else if (repoInfo.repoId?.type === 'ado') {
            telemetryData.properties.gitRepoOwner = repoInfo.repoId.project;
            telemetryData.properties.gitRepoName = repoInfo.repoId.repo;
        }
        else {
            // TODO: We don't have generic owner and repo for other providers
        }
        telemetryData.properties.gitRepoPath = repoInfo.pathname;
    }
    telemetryData.properties.engineName = requestInfo.modelId;
    telemetryData.properties.engineChoiceSource = requestInfo.engineChoiceSource;
    // Add requestMultiline information
    telemetryData.properties.isMultiline = JSON.stringify(requestContext.multiline);
    telemetryData.properties.isCycling = JSON.stringify(requestContext.isCycling);
    // calculated values for the issued event
    const currentLine = document.lineAt(position.line);
    const lineBeforeCursor = document.getText(textDocument_1.LocationFactory.range(currentLine.range.start, position));
    const restOfLine = document.getText(textDocument_1.LocationFactory.range(position, currentLine.range.end));
    const typeFileHashCode = Array.from(prompt.neighborSource.entries()).map(typeFiles => [
        typeFiles[0],
        typeFiles[1].map(f => (0, crypto_1.createSha256Hash)(f).toString()), // file name is sensitive. We just keep SHA256 of the file name.
    ]);
    // Properties that we only want to include in the issued event
    const extendedProperties = {
        beforeCursorWhitespace: JSON.stringify(lineBeforeCursor.trim() === ''),
        afterCursorWhitespace: JSON.stringify(restOfLine.trim() === ''),
        neighborSource: JSON.stringify(typeFileHashCode),
        blockMode: requestContext.blockMode,
    };
    const extendedMeasurements = {
        ...(0, telemetry_2.telemetrizePromptLength)(prompt.prompt),
        promptEndPos: document.offsetAt(position),
        promptComputeTimeMs: prompt.computeTimeMs,
    };
    if (prompt.metadata) {
        extendedProperties.promptMetadata = JSON.stringify(prompt.metadata);
    }
    if (prompt.contextProvidersTelemetry) {
        extendedProperties.contextProviders = JSON.stringify(prompt.contextProvidersTelemetry);
    }
    const telemetryDataToSend = telemetryData.extendedBy(extendedProperties, extendedMeasurements);
    // telemetrize the issued event
    (0, telemetry_2.telemetry)(accessor, 'ghostText.issued', telemetryDataToSend);
    return telemetryData;
}
function addDocumentTelemetry(telemetry, document) {
    telemetry.measurements.documentLength = document.getText().length;
    telemetry.measurements.documentLineCount = document.lineCount;
}
function telemetryPerformance(accessor, performanceKind, choice, requestStart, processingTimeMs) {
    const requestTimeMs = Date.now() - requestStart;
    const deltaMs = requestTimeMs - processingTimeMs;
    const telemetryData = choice.telemetryData.extendedBy({}, {
        completionCharLen: choice.completionText.length,
        requestTimeMs: requestTimeMs,
        processingTimeMs: processingTimeMs,
        deltaMs: deltaMs,
        // Choice properties
        meanLogProb: choice.meanLogProb || NaN,
        meanAlternativeLogProb: choice.meanAlternativeLogProb || NaN,
    });
    telemetryData.extendWithRequestId(choice.requestId);
    (0, telemetry_2.telemetry)(accessor, `ghostText.${performanceKind}`, telemetryData);
}
//# sourceMappingURL=ghostText.js.map