"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.SSEProcessor = void 0;
exports.splitChunk = splitChunk;
exports.convertToAPIJsonData = convertToAPIJsonData;
exports.sendCommunicationErrorTelemetry = sendCommunicationErrorTelemetry;
const logService_1 = require("../../log/common/logService");
const telemetryData_1 = require("../../telemetry/common/telemetryData");
const thinkingUtils_1 = require("../../thinking/common/thinkingUtils");
const fetch_1 = require("../common/fetch");
const openai_1 = require("../common/openai");
/** Gathers together many chunks of a single completion choice. */
class APIJsonDataStreaming {
    constructor(model) {
        this.model = model;
        this._text = [];
        this._newText = [];
    }
    get text() {
        return this._text;
    }
    append(choice) {
        if (choice.text) {
            const str = APIJsonDataStreaming._removeCR(choice.text);
            this._text.push(str);
            this._newText.push(str);
        }
        if (choice.delta?.content) {
            const str = APIJsonDataStreaming._removeCR(choice.delta.content);
            this._text.push(str);
            this._newText.push(str);
        }
        if (choice.delta?.function_call && (choice.delta.function_call.name || choice.delta.function_call.arguments)) {
            const str = APIJsonDataStreaming._removeCR(choice.delta.function_call.arguments);
            this._text.push(str);
            this._newText.push(str);
        }
    }
    flush() {
        const delta = this._newText.join('');
        this._newText = [];
        return delta;
    }
    static _removeCR(text) {
        return text.replace(/\r$/g, '');
    }
    toJSON() {
        return {
            text: this._text,
            newText: this._newText
        };
    }
}
class StreamingToolCall {
    constructor() {
        this.arguments = '';
    }
    update(toolCall) {
        if (toolCall.id) {
            this.id = toolCall.id;
        }
        if (toolCall.function?.name) {
            this.name = toolCall.function.name;
        }
        if (toolCall.function?.arguments) {
            this.arguments += toolCall.function.arguments;
        }
    }
}
class StreamingToolCalls {
    constructor() {
        this.toolCalls = [];
    }
    getToolCalls() {
        return this.toolCalls.map(call => {
            return {
                name: call.name,
                arguments: call.arguments,
                id: call.id,
            };
        });
    }
    hasToolCalls() {
        return this.toolCalls.length > 0;
    }
    update(choice) {
        choice.delta?.tool_calls?.forEach(toolCall => {
            let currentCall = this.toolCalls.at(-1);
            if (!currentCall || (toolCall.id && currentCall.id !== toolCall.id)) {
                currentCall = new StreamingToolCall();
                this.toolCalls.push(currentCall);
            }
            currentCall.update(toolCall);
        });
    }
}
// Given a string of lines separated by one or more newlines, returns complete
// lines and any remaining partial line data. Exported for test only.
function splitChunk(chunk) {
    const dataLines = chunk.split('\n');
    const newExtra = dataLines.pop(); // will be empty string if chunk ends with "\n"
    return [dataLines.filter(line => line !== ''), newExtra];
}
/**
 * Processes an HTTP request containing what is assumed to be an SSE stream of
 * OpenAI API data. Yields a stream of `FinishedCompletion` objects, each as
 * soon as it's finished.
 */
class SSEProcessor {
    constructor(logService, telemetryService, expectedNumChoices, response, body, cancellationToken) {
        this.logService = logService;
        this.telemetryService = telemetryService;
        this.expectedNumChoices = expectedNumChoices;
        this.response = response;
        this.body = body;
        this.cancellationToken = cancellationToken;
        this.requestId = (0, fetch_1.getRequestId)(this.response);
        /**
         * A key & value being here means at least one chunk with that choice index
         * has been received. A null value means we've already finished the given
         * solution and should not process incoming tokens further.
         */
        this.solutions = {};
        this.completedFunctionCallIdxs = new Map();
        this.functionCalls = {};
        this.toolCalls = new StreamingToolCalls();
        this.functionCallName = undefined;
    }
    static async create(logService, telemetryService, expectedNumChoices, response, cancellationToken) {
        const body = (await response.body());
        body.setEncoding('utf8');
        return new SSEProcessor(logService, telemetryService, expectedNumChoices, response, body, cancellationToken);
    }
    /**
     * Yields finished completions as soon as they are available. The finishedCb
     * is used to determine when a completion is done and should be truncated.
     * It is called on the whole of the received solution text, once at the end
     * of the completion (if it stops by itself) and also on any chunk that has
     * a newline in it.
     *
     * Closes the server request stream when all choices are finished/truncated
     * (as long as fastCancellation is true).
     *
     * Note that for this to work, the caller must consume the entire stream.
     * This happens automatically when using a `for await` loop, but when
     * iterating manually this needs to be done by calling `.next()` until it
     * returns an item with done = true (or calling `.return()`).
     */
    async *processSSE(finishedCb = async () => undefined) {
        try {
            // If it's n > 1 we don't handle usage as the usage is global for the stream and all our code assumes per choice
            // Therefore we will just skip over the usage and yield the completions
            if (this.expectedNumChoices > 1) {
                for await (const usageOrCompletions of this.processSSEInner(finishedCb)) {
                    if (!(0, openai_1.isApiUsage)(usageOrCompletions)) {
                        yield usageOrCompletions;
                    }
                }
            }
            else {
                let completion;
                let usage;
                // Process both the usage and the completions, then yield one combined completions
                for await (const usageOrCompletions of this.processSSEInner(finishedCb)) {
                    if ((0, openai_1.isApiUsage)(usageOrCompletions)) {
                        usage = usageOrCompletions;
                    }
                    else {
                        completion = usageOrCompletions;
                    }
                }
                if (this.maybeCancel('after receiving the completion, but maybe before we got the usage')) {
                    return;
                }
                if (completion) {
                    completion.usage = usage;
                    yield completion;
                }
            }
        }
        finally {
            this.cancel();
            this.logService.info(`request done: requestId: [${this.requestId.headerRequestId}] model deployment ID: [${this.requestId.deploymentId}]`);
        }
    }
    async *processSSEInner(finishedCb) {
        // Collects pieces of the SSE stream that haven't been fully processed yet.
        let extraData = '';
        // This flag is set when at least for one solution we finished early (via `finishedCb`).
        let hadEarlyFinishedSolution = false;
        // Iterate over arbitrarily sized chunks coming in from the network.
        for await (const chunk of this.body) {
            if (this.maybeCancel('after awaiting body chunk')) {
                return;
            }
            // this.logService.public.debug(chunk.toString());
            const [dataLines, remainder] = splitChunk(extraData + chunk.toString());
            extraData = remainder;
            // Each dataLine is complete since we've seen at least one \n after it
            // The platform agent can return a 'function_call' finish_reason, which isn't a real function call
            // but is echoing internal function call messages back to us. So don't treat them as real function calls
            // if we received more data after that
            let allowCompletingSolution = true;
            let thinkingFound = false;
            for (const dataLine of dataLines) {
                // Lines which start with a `:` are SSE Comments per the spec and can be ignored
                if (dataLine.startsWith(':')) {
                    continue;
                }
                const lineWithoutData = dataLine.slice('data:'.length).trim();
                if (lineWithoutData === '[DONE]') {
                    thinkingFound = false;
                    yield* this.finishSolutions();
                    return;
                }
                // TODO @lramos15 - This should not be an ugly inlined type like this
                let json;
                try {
                    json = JSON.parse(lineWithoutData);
                }
                catch (e) {
                    this.logService.error(`Error parsing JSON stream data for request id ${this.requestId.headerRequestId}:${dataLine}`);
                    sendCommunicationErrorTelemetry(this.telemetryService, `Error parsing JSON stream data for request id ${this.requestId.headerRequestId}:`, dataLine);
                    continue;
                }
                // Track usage data for this stream. Usage is global and not per choice. Therefore it's emitted as its own chunk
                if (json.usage) {
                    yield json.usage;
                }
                // A message with a confirmation may or may not have 'choices'
                if (json.copilot_confirmation && isCopilotConfirmation(json.copilot_confirmation)) {
                    await finishedCb('', 0, { text: '', copilotConfirmation: json.copilot_confirmation });
                }
                if (!json.choices) {
                    // Currently there are messages with a null 'choices' that include copilot_references- ignore these
                    if (!json.copilot_references && !json.copilot_confirmation) {
                        if (json.error !== undefined) {
                            this.logService.error(`Error in response for request id ${this.requestId.headerRequestId}:${json.error.message}`);
                            sendCommunicationErrorTelemetry(this.telemetryService, `Error in response for request id ${this.requestId.headerRequestId}:`, json.error.message);
                            // Encountered an error mid stream we immediately yield as the response is not usable.
                            yield {
                                index: 0,
                                finishOffset: undefined,
                                solution: new APIJsonDataStreaming(json.model || ''),
                                reason: openai_1.FinishedCompletionReason.ServerError,
                                error: json.error,
                                requestId: this.requestId,
                            };
                        }
                        else {
                            this.logService.error(`Unexpected response with no choices or error for request id ${this.requestId.headerRequestId}`);
                            sendCommunicationErrorTelemetry(this.telemetryService, `Unexpected response with no choices or error for request id ${this.requestId.headerRequestId}`);
                        }
                    }
                    // There are also messages with a null 'choices' that include copilot_errors- report these
                    if (json.copilot_errors) {
                        await finishedCb('', 0, { text: '', copilotErrors: json.copilot_errors });
                    }
                    if (json.copilot_references) {
                        await finishedCb('', 0, { text: '', copilotReferences: json.copilot_references });
                    }
                    continue;
                }
                if (this.requestId.created === 0) {
                    // Would only be 0 if we're the first actual response chunk
                    this.requestId = (0, fetch_1.getRequestId)(this.response, json);
                    if (this.requestId.created === 0 && json.choices?.length) { // An initial chunk is sent with an empty choices array and no id, to hold `prompt_filter_results`
                        this.requestId.created = Math.floor(Date.now() / 1000);
                    }
                }
                for (let i = 0; i < json.choices.length; i++) {
                    const choice = json.choices[i];
                    this.logChoice(choice);
                    const thinkingDelta = (0, thinkingUtils_1.extractThinkingDeltaFromChoice)(choice);
                    // Once we observe any thinking text or an id in this batch, keep the flag true
                    thinkingFound ||= !!(thinkingDelta?.text || thinkingDelta?.id);
                    if (!(choice.index in this.solutions)) {
                        this.solutions[choice.index] = new APIJsonDataStreaming(json.model);
                    }
                    const solution = this.solutions[choice.index];
                    if (solution === null) {
                        if (thinkingDelta) {
                            await finishedCb('', choice.index, { text: '', thinking: thinkingDelta });
                        }
                        continue; // already finished
                    }
                    let finishOffset;
                    const emitSolution = async (delta) => {
                        if (delta?.vulnAnnotations && (!Array.isArray(delta.vulnAnnotations) || !delta.vulnAnnotations.every(a => (0, fetch_1.isCopilotAnnotation)(a)))) {
                            delta.vulnAnnotations = undefined;
                        }
                        // Validate code citation annotations carefully, because the API is a work in progress
                        if (delta?.ipCodeCitations && (!Array.isArray(delta.ipCodeCitations) || !delta.ipCodeCitations.every(fetch_1.isCodeCitationAnnotation))) {
                            delta.ipCodeCitations = undefined;
                        }
                        finishOffset = await finishedCb(solution.text.join(''), choice.index, {
                            text: solution.flush(),
                            logprobs: choice.logprobs,
                            codeVulnAnnotations: delta?.vulnAnnotations,
                            ipCitations: delta?.ipCodeCitations,
                            copilotReferences: delta?.references,
                            copilotToolCalls: delta?.toolCalls,
                            _deprecatedCopilotFunctionCalls: delta?.functionCalls,
                            beginToolCalls: delta?.beginToolCalls,
                            copilotErrors: delta?.errors,
                            thinking: thinkingDelta ?? delta?.thinking,
                        });
                        if (finishOffset !== undefined) {
                            hadEarlyFinishedSolution = true;
                        }
                        return this.maybeCancel('after awaiting finishedCb');
                    };
                    let handled = true;
                    if (choice.delta?.tool_calls) {
                        if (!this.toolCalls.hasToolCalls()) {
                            const firstToolName = choice.delta.tool_calls.at(0)?.function?.name;
                            if (firstToolName) {
                                if (solution.text.length) {
                                    // Flush the linkifier stream. See #16465
                                    solution.append({ index: 0, delta: { content: ' ' } });
                                }
                                await emitSolution({ beginToolCalls: [{ name: firstToolName }] });
                            }
                        }
                        this.toolCalls.update(choice);
                    }
                    else if (choice.delta?.copilot_annotations?.CodeVulnerability || choice.delta?.copilot_annotations?.IPCodeCitations) {
                        if (await emitSolution()) {
                            continue;
                        }
                        if (!hadEarlyFinishedSolution) {
                            solution.append(choice);
                            if (await emitSolution({ vulnAnnotations: choice.delta?.copilot_annotations?.CodeVulnerability, ipCodeCitations: choice.delta?.copilot_annotations?.IPCodeCitations })) {
                                continue;
                            }
                        }
                    }
                    else if (choice.delta?.role === 'function') {
                        if (choice.delta.content) {
                            try {
                                const references = JSON.parse(choice.delta.content);
                                if (Array.isArray(references)) {
                                    if (await emitSolution({ references: references })) {
                                        continue;
                                    }
                                }
                            }
                            catch (ex) {
                                this.logService.error(`Error parsing function references: ${JSON.stringify(ex)}`);
                            }
                        }
                    }
                    else if (choice.delta?.function_call && (choice.delta.function_call.name || choice.delta.function_call.arguments)) {
                        allowCompletingSolution = false;
                        this.functionCallName ??= choice.delta.function_call.name;
                        this.functionCalls[this.functionCallName] ??= new APIJsonDataStreaming(json.model);
                        const functionCall = this.functionCalls[this.functionCallName];
                        functionCall.append(choice);
                    }
                    else if ((choice.finish_reason === openai_1.FinishedCompletionReason.FunctionCall || choice.finish_reason === openai_1.FinishedCompletionReason.Stop) && this.functionCallName) {
                        // We don't want to yield the function call until we have all the data
                        const functionCallStreamObj = this.functionCalls[this.functionCallName];
                        const functionCall = { name: this.functionCallName, arguments: functionCallStreamObj.flush() };
                        this.completedFunctionCallIdxs.set(choice.index, 'function');
                        try {
                            if (await emitSolution({ functionCalls: [functionCall] })) {
                                continue;
                            }
                        }
                        catch (error) {
                            this.logService.error(error);
                        }
                        this.functionCalls[this.functionCallName] = null;
                        this.functionCallName = undefined;
                        if (choice.finish_reason === openai_1.FinishedCompletionReason.FunctionCall) {
                            // See note about the 'function_call' finish_reason below
                            continue;
                        }
                    }
                    else {
                        handled = false;
                    }
                    if ((choice.finish_reason === openai_1.FinishedCompletionReason.ToolCalls || choice.finish_reason === openai_1.FinishedCompletionReason.Stop) && this.toolCalls.hasToolCalls()) {
                        handled = true;
                        const toolCalls = this.toolCalls.getToolCalls();
                        this.completedFunctionCallIdxs.set(choice.index, 'tool');
                        const toolId = toolCalls.length > 0 ? toolCalls[0].id : undefined;
                        try {
                            if (await emitSolution({ toolCalls: toolCalls, thinking: (toolId && thinkingFound) ? { metadata: { toolId } } : undefined })) {
                                continue;
                            }
                        }
                        catch (error) {
                            this.logService.error(error);
                        }
                    }
                    if (!handled) {
                        solution.append(choice);
                        // Call finishedCb to determine if the solution is now complete.
                        if (await emitSolution()) {
                            continue;
                        }
                    }
                    const solutionDone = Boolean(choice.finish_reason) || finishOffset !== undefined;
                    if (!solutionDone) {
                        continue;
                    }
                    // NOTE: When there is a finish_reason the text of subsequent chunks is always '',
                    // (current chunk might still have useful text, that is why we add it above).
                    // So we know that we already got all the text to be displayed for the user.
                    // TODO: This might contain additional logprobs for excluded next tokens. We should
                    // filter out indices that correspond to excluded tokens. It will not affect the
                    // text though.
                    yield {
                        solution,
                        finishOffset,
                        reason: choice.finish_reason ?? openai_1.FinishedCompletionReason.ClientTrimmed,
                        filterReason: choiceToFilterReason(choice),
                        requestId: this.requestId,
                        index: choice.index,
                    };
                    if (this.maybeCancel('after yielding finished choice')) {
                        return;
                    }
                    if (allowCompletingSolution) {
                        this.solutions[choice.index] = null;
                    }
                }
            }
        }
        // Yield whatever solutions remain incomplete in case no [DONE] was received.
        // This shouldn't happen in practice unless there was an error somewhere.
        for (const [index, solution] of Object.entries(this.solutions)) {
            const solutionIndex = Number(index); // Convert `index` from string to number
            if (solution === null) {
                continue; // already finished
            }
            yield {
                solution,
                finishOffset: undefined,
                reason: openai_1.FinishedCompletionReason.ClientIterationDone,
                requestId: this.requestId,
                index: solutionIndex,
            };
            if (this.maybeCancel('after yielding after iteration done')) {
                return;
            }
        }
        // Error message can be present in `extraData`
        //
        // When `finishedCb` decides to finish a solution early, it is possible that
        // we will have unfinished or partial JSON data in `extraData` because we
        // break out of the above for loop as soon as all solutions are finished.
        //
        // We don't want to alarm ourselves with such partial JSON data.
        if (extraData.length > 0 && !hadEarlyFinishedSolution) {
            try {
                const extraDataJson = JSON.parse(extraData);
                if (extraDataJson.error !== undefined) {
                    this.logService.error(extraDataJson.error, `Error in response: ${extraDataJson.error.message}`);
                    sendCommunicationErrorTelemetry(this.telemetryService, `Error in response: ${extraDataJson.error.message}`, extraDataJson.error);
                }
            }
            catch (e) {
                this.logService.error(`Error parsing extraData for request id ${this.requestId.headerRequestId}: ${extraData}`);
                sendCommunicationErrorTelemetry(this.telemetryService, `Error parsing extraData for request id ${this.requestId.headerRequestId}: ${extraData}`);
            }
        }
    }
    /** Yields the solutions that weren't yet finished, with a 'DONE' reason. */
    async *finishSolutions() {
        for (const [index, solution] of Object.entries(this.solutions)) {
            const solutionIndex = Number(index); // Convert `index` from string to number
            if (solution === null) {
                continue; // already finished
            }
            if (this.completedFunctionCallIdxs.has(solutionIndex)) {
                yield {
                    solution,
                    finishOffset: undefined,
                    reason: this.completedFunctionCallIdxs.get(solutionIndex) === 'function' ? openai_1.FinishedCompletionReason.FunctionCall : openai_1.FinishedCompletionReason.ToolCalls,
                    requestId: this.requestId,
                    index: solutionIndex,
                };
                continue;
            }
            yield {
                solution,
                finishOffset: undefined,
                reason: openai_1.FinishedCompletionReason.ClientDone,
                requestId: this.requestId,
                index: solutionIndex,
            };
            if (this.maybeCancel('after yielding on DONE')) {
                return;
            }
        }
    }
    /**
     * Returns whether the cancellation token was cancelled and closes the
     * stream if it was.
     */
    maybeCancel(description) {
        if (this.cancellationToken?.isCancellationRequested) {
            this.logService.debug('Cancelled: ' + description);
            this.cancel();
            return true;
        }
        return false;
    }
    cancel() {
        this.body.destroy();
    }
    logChoice(choice) {
        const choiceCopy = { ...choice };
        delete choiceCopy.index;
        delete choiceCopy.content_filter_results;
        delete choiceCopy.content_filter_offsets;
        this.logService.trace(`choice ${JSON.stringify(choiceCopy)}`);
    }
}
exports.SSEProcessor = SSEProcessor;
// data: {"choices":null,"copilot_confirmation":{"type":"action","title":"Are you sure you want to proceed?","message":"This action is irreversible.","confirmation":{"id":"123"}},"id":null}
function isCopilotConfirmation(obj) {
    return typeof obj.title === 'string' &&
        typeof obj.message === 'string' &&
        !!obj.confirmation;
}
// Function to convert from APIJsonDataStreaming to APIJsonData format
function convertToAPIJsonData(streamingData) {
    const joinedText = streamingData.text.join('');
    const out = {
        text: joinedText,
        tokens: streamingData.text,
    };
    return out;
}
/**
 * Given a choice from the API call, returns the reason for filtering out the choice, or undefined if the choice should not be filtered out.
 * @param choice The choice from the API call
 * @returns The reason for filtering out the choice, or undefined if the choice should not be filtered out.
 */
function choiceToFilterReason(choice) {
    if (choice.finish_reason !== openai_1.FinishedCompletionReason.ContentFilter) {
        return undefined;
    }
    if (choice.delta?.copilot_annotations?.TextCopyright) {
        return openai_1.FilterReason.Copyright;
    }
    if (choice.delta?.copilot_annotations?.Sexual || choice.delta?.copilot_annotations?.SexualPattern) {
        return openai_1.FilterReason.Sexual;
    }
    if (choice.delta?.copilot_annotations?.Violence) {
        return openai_1.FilterReason.Violence;
    }
    if (choice.delta?.copilot_annotations?.HateSpeech || choice.delta?.copilot_annotations?.HateSpeechPattern) {
        return openai_1.FilterReason.Hate;
    }
    if (choice.delta?.copilot_annotations?.SelfHarm) {
        return openai_1.FilterReason.SelfHarm;
    }
    if (choice.delta?.copilot_annotations?.PromptPromBlockList) {
        return openai_1.FilterReason.Prompt;
    }
    if (!choice.content_filter_results) {
        return undefined;
    }
    for (const filter of Object.keys(choice.content_filter_results)) {
        if (choice.content_filter_results[filter]?.filtered) {
            return filter;
        }
    }
    return undefined;
}
function sendCommunicationErrorTelemetry(telemetryService, message, extra) {
    const args = [message, extra];
    const secureMessage = (args.length > 0 ? JSON.stringify(args) : 'no msg');
    const enhancedData = telemetryData_1.TelemetryData.createAndMarkAsIssued({
        context: 'fetch',
        level: logService_1.LogLevel[logService_1.LogLevel.Error],
        message: secureMessage,
    });
    // send full content to secure telemetry
    telemetryService.sendEnhancedGHTelemetryErrorEvent('log', enhancedData.properties, enhancedData.measurements);
    const data = telemetryData_1.TelemetryData.createAndMarkAsIssued({
        context: 'fetch',
        level: logService_1.LogLevel[logService_1.LogLevel.Error],
        message: '[redacted]',
    });
    // send content that excludes customer data to standard telemetry
    telemetryService.sendGHTelemetryErrorEvent('log', data.properties, data.measurements);
}
//# sourceMappingURL=stream.js.map