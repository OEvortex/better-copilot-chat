"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendEngineMessagesLengthTelemetry = sendEngineMessagesLengthTelemetry;
exports.sendEngineMessagesTelemetry = sendEngineMessagesTelemetry;
exports.prepareChatCompletionForReturn = prepareChatCompletionForReturn;
const prompt_tsx_1 = require("@vscode/prompt-tsx");
const hash_1 = require("../../../util/vs/base/common/hash");
const map_1 = require("../../../util/vs/base/common/map");
const uuid_1 = require("../../../util/vs/base/common/uuid");
const globalStringUtils_1 = require("../../chat/common/globalStringUtils");
const telemetry_1 = require("../../telemetry/common/telemetry");
const telemetryData_1 = require("../../telemetry/common/telemetryData");
const openai_1 = require("../common/openai");
const stream_1 = require("./stream");
// TODO @lramos15 - Find a better file for this, since this file is for the chat stream and should not be telemetry related
function sendEngineMessagesLengthTelemetry(telemetryService, messages, telemetryData, isOutput, logService) {
    const messageType = isOutput ? 'output' : 'input';
    // Get the unique model call ID - it should already be set in the base telemetryData
    const modelCallId = telemetryData.properties.modelCallId;
    if (!modelCallId) {
        // This shouldn't happen if the ID was properly generated at request start
        logService?.warn('[TELEMETRY] modelCallId not found in telemetryData, input/output messages cannot be linked');
        return;
    }
    // Create messages with content and tool_calls arguments replaced by length
    const messagesWithLength = messages.map(msg => {
        const processedMsg = {
            ...msg, // This preserves ALL existing fields including tool_calls, tool_call_id, copilot_references, etc.
            content: typeof msg.content === 'string'
                ? msg.content.length
                : Array.isArray(msg.content)
                    ? msg.content.reduce((total, part) => {
                        if (typeof part === 'string') {
                            return total + part.length;
                        }
                        if (part.type === 'text') {
                            return total + (part.text?.length || 0);
                        }
                        return total;
                    }, 0)
                    : 0,
        };
        // Process tool_calls if present
        if ('tool_calls' in msg && msg.tool_calls && Array.isArray(msg.tool_calls)) {
            processedMsg.tool_calls = msg.tool_calls.map((toolCall) => ({
                ...toolCall,
                function: toolCall.function ? {
                    ...toolCall.function,
                    arguments: typeof toolCall.function.arguments === 'string'
                        ? toolCall.function.arguments.length
                        : toolCall.function.arguments
                } : toolCall.function
            }));
        }
        return processedMsg;
    });
    // Process properties to replace request.option.tools.* field values with their length
    const processedProperties = {};
    for (const [key, value] of Object.entries(telemetryData.properties)) {
        if (key.startsWith('request.option.tools')) {
            // Replace the content with its length
            if (typeof value === 'string') {
                // If it's a string, it might be a JSON array, try to parse it
                try {
                    const parsed = JSON.parse(value);
                    if (Array.isArray(parsed)) {
                        processedProperties[key] = parsed.length.toString();
                    }
                    else {
                        processedProperties[key] = value.length.toString();
                    }
                }
                catch {
                    // If parsing fails, just use string length
                    processedProperties[key] = value.length.toString();
                }
            }
            else if (Array.isArray(value)) {
                processedProperties[key] = value.length.toString();
            }
            else {
                processedProperties[key] = '0';
            }
        }
        else {
            processedProperties[key] = value;
        }
    }
    const telemetryDataWithPrompt = telemetryData_1.TelemetryData.createAndMarkAsIssued({
        ...processedProperties,
        messagesJson: JSON.stringify(messagesWithLength),
        message_direction: messageType,
        modelCallId: modelCallId, // Include at telemetry event level too
    }, telemetryData.measurements);
    telemetryService.sendEnhancedGHTelemetryEvent('engine.messages.length', (0, telemetry_1.multiplexProperties)(telemetryDataWithPrompt.properties), telemetryDataWithPrompt.measurements);
    telemetryService.sendInternalMSFTTelemetryEvent('engine.messages.length', (0, telemetry_1.multiplexProperties)(telemetryDataWithPrompt.properties), telemetryDataWithPrompt.measurements);
}
// LRU cache from message hash to UUID to ensure same content gets same UUID (limit: 1000 entries)
const messageHashToUuid = new map_1.LRUCache(1000);
// LRU cache from request options hash to requestOptionsId to ensure same options get same ID (limit: 500 entries)
const requestOptionsHashToId = new map_1.LRUCache(500);
// LRU cache to track headerRequestId to requestTurn mapping for temporal location tracking along main agent flow (limit: 1000 entries)
const headerRequestIdTracker = new map_1.LRUCache(1000);
// Track most recent conversation headerRequestId for linking supplementary calls
const mainHeaderRequestIdTracker = {
    headerRequestId: null
};
// Track conversation turns for model.request.added events (limit: 100 entries)
const conversationTracker = new map_1.LRUCache(100);
/**
 * Updates the headerRequestIdTracker with the given headerRequestId.
 * If the headerRequestId already exists, increments its requestTurn.
 * If it doesn't exist, adds it with requestTurn = 1.
 * Returns the current requestTurn for the headerRequestId.
 */
function updateHeaderRequestIdTracker(headerRequestId) {
    const currentTurn = headerRequestIdTracker.get(headerRequestId);
    if (currentTurn !== undefined) {
        // HeaderRequestId exists, increment turn
        const newTurn = currentTurn + 1;
        headerRequestIdTracker.set(headerRequestId, newTurn);
        return newTurn;
    }
    else {
        // New headerRequestId, set turn to 1
        headerRequestIdTracker.set(headerRequestId, 1);
        return 1;
    }
}
/**
 * Updates the conversationTracker with the given conversationId.
 * If the conversationId already exists, increments its turn.
 * If it doesn't exist, adds it with turn = 1.
 * Returns the current conversationTurn for the conversationId.
 */
function updateConversationTracker(conversationId) {
    const currentTurn = conversationTracker.get(conversationId);
    if (currentTurn !== undefined) {
        // ConversationId exists, increment turn
        const newTurn = currentTurn + 1;
        conversationTracker.set(conversationId, newTurn);
        return newTurn;
    }
    else {
        // New conversationId, set turn to 1
        conversationTracker.set(conversationId, 1);
        return 1;
    }
}
// ===== MODEL TELEMETRY FUNCTIONS =====
// These functions send 'model...' events and are grouped together for better organization
function sendModelRequestOptionsTelemetry(telemetryService, telemetryData, logService) {
    // Extract all request.option.* properties
    const requestOptions = {};
    for (const [key, value] of Object.entries(telemetryData.properties)) {
        if (key.startsWith('request.option.')) {
            requestOptions[key] = value;
        }
    }
    // Only process if there are request options
    if (Object.keys(requestOptions).length === 0) {
        return undefined;
    }
    // Extract context properties
    const conversationId = telemetryData.properties.conversationId || telemetryData.properties.sessionId || 'unknown';
    const headerRequestId = telemetryData.properties.headerRequestId || 'unknown';
    // Create a hash of the request options to detect duplicates
    const requestOptionsHash = (0, hash_1.hash)(requestOptions).toString();
    // Get existing requestOptionsId for this content, or generate a new one
    let requestOptionsId = requestOptionsHashToId.get(requestOptionsHash);
    if (!requestOptionsId) {
        // This is a new set of request options, generate ID and send the event
        requestOptionsId = (0, uuid_1.generateUuid)();
        requestOptionsHashToId.set(requestOptionsHash, requestOptionsId);
    }
    else {
        // Skip sending model.request.options.added if this exact request options have already been logged
        return requestOptionsId;
    }
    // Convert request options to JSON string for chunking
    const requestOptionsJsonString = JSON.stringify(requestOptions);
    const maxChunkSize = 8000;
    // Split request options JSON into chunks of 8000 characters or less
    const chunks = [];
    for (let i = 0; i < requestOptionsJsonString.length; i += maxChunkSize) {
        chunks.push(requestOptionsJsonString.substring(i, i + maxChunkSize));
    }
    // Send one telemetry event per chunk
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        const requestOptionsData = telemetryData_1.TelemetryData.createAndMarkAsIssued({
            requestOptionsId,
            conversationId,
            headerRequestId,
            requestOptionsJson: chunks[chunkIndex], // Store chunk of request options JSON
            chunkIndex: chunkIndex.toString(), // 0-based chunk index for ordering
            totalChunks: chunks.length.toString(), // Total number of chunks for this request
        }, telemetryData.measurements); // Include measurements from original telemetryData
        telemetryService.sendInternalMSFTTelemetryEvent('model.request.options.added', requestOptionsData.properties, requestOptionsData.measurements);
    }
    return requestOptionsId;
}
function sendNewRequestAddedTelemetry(telemetryService, telemetryData, logService) {
    // This function captures user-level request context (username, session info, user preferences, etc.)
    // It's called once per unique user request (identified by headerRequestId)
    // It excludes message content and request options which are captured separately
    // Extract headerRequestId to check for uniqueness
    const headerRequestId = telemetryData.properties.headerRequestId;
    if (!headerRequestId) {
        return;
    }
    // Check if this is a conversation mode (has conversationId) or supplementary mode
    // This must be done BEFORE the duplicate check to ensure tracker is always updated
    const conversationId = telemetryData.properties.conversationId;
    if (conversationId) {
        // Conversation mode: update tracker with current headerRequestId
        mainHeaderRequestIdTracker.headerRequestId = headerRequestId;
    }
    // Check if we've already processed this headerRequestId
    if (headerRequestIdTracker.has(headerRequestId)) {
        return;
    }
    // Update conversation tracker and get conversation turn only for new headerRequestIds
    let conversationTurn;
    if (conversationId) {
        conversationTurn = updateConversationTracker(conversationId);
    }
    // Filter out properties that start with "message" or "request.option" and exclude modelCallId
    const filteredProperties = {};
    for (const [key, value] of Object.entries(telemetryData.properties)) {
        if (!key.startsWith('message') && !key.startsWith('request.option') && key !== 'modelCallId') {
            filteredProperties[key] = value;
        }
    }
    // Add conversationTurn if conversationId is present
    if (conversationTurn !== undefined) {
        filteredProperties.conversationTurn = conversationTurn.toString();
    }
    // For supplementary mode: add conversation linking fields if we have tracked data
    if (!conversationId && mainHeaderRequestIdTracker.headerRequestId) {
        const mostRecentTurn = headerRequestIdTracker.get(mainHeaderRequestIdTracker.headerRequestId);
        filteredProperties.mostRecentConversationHeaderRequestId = mainHeaderRequestIdTracker.headerRequestId;
        if (mostRecentTurn !== undefined) {
            filteredProperties.mostRecentConversationHeaderRequestIdTurn = mostRecentTurn.toString();
        }
    }
    // Create telemetry data for the request
    const requestData = telemetryData_1.TelemetryData.createAndMarkAsIssued(filteredProperties, telemetryData.measurements);
    telemetryService.sendInternalMSFTTelemetryEvent('model.request.added', requestData.properties, requestData.measurements);
}
function sendIndividualMessagesTelemetry(telemetryService, messages, telemetryData, messageDirection, logService) {
    const messageData = [];
    for (const message of messages) {
        // Extract context properties with fallbacks
        const conversationId = telemetryData.properties.conversationId || telemetryData.properties.sessionId || 'unknown';
        const headerRequestId = telemetryData.properties.headerRequestId || 'unknown';
        // Create a hash of the message content AND headerRequestId to detect duplicates
        // Including headerRequestId ensures same message content with different headerRequestIds gets separate UUIDs
        const messageHash = (0, hash_1.hash)({
            role: message.role,
            content: message.content,
            headerRequestId: headerRequestId, // Include headerRequestId in hash for proper deduplication
            ...(('tool_calls' in message && message.tool_calls) && { tool_calls: message.tool_calls }),
            ...(('tool_call_id' in message && message.tool_call_id) && { tool_call_id: message.tool_call_id })
        }).toString();
        // Get existing UUID for this message content + headerRequestId combination, or generate a new one
        let messageUuid = messageHashToUuid.get(messageHash);
        if (!messageUuid) {
            // This is a new message, generate UUID and send the event
            messageUuid = (0, uuid_1.generateUuid)();
            messageHashToUuid.set(messageHash, messageUuid);
        }
        else {
            // Always collect UUIDs and headerRequestIds for model call tracking
            messageData.push({ uuid: messageUuid, headerRequestId });
            // Skip sending model.message.added if this exact message has already been logged
            continue;
        }
        // Always collect UUIDs and headerRequestIds for model call tracking
        messageData.push({ uuid: messageUuid, headerRequestId });
        // Convert message to JSON string for chunking
        const messageJsonString = JSON.stringify(message);
        const maxChunkSize = 8000;
        // Split messageJson into chunks of 8000 characters or less
        const chunks = [];
        for (let i = 0; i < messageJsonString.length; i += maxChunkSize) {
            chunks.push(messageJsonString.substring(i, i + maxChunkSize));
        }
        // Send one telemetry event per chunk
        for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
            const messageData = telemetryData_1.TelemetryData.createAndMarkAsIssued({
                messageUuid,
                messageDirection,
                conversationId,
                headerRequestId,
                messageJson: chunks[chunkIndex], // Store chunk of message JSON
                chunkIndex: chunkIndex.toString(), // 0-based chunk index for ordering
                totalChunks: chunks.length.toString(), // Total number of chunks for this message
            }, telemetryData.measurements); // Include measurements from original telemetryData
            telemetryService.sendInternalMSFTTelemetryEvent('model.message.added', messageData.properties, messageData.measurements);
        }
    }
    return messageData; // Return collected message data with UUIDs and headerRequestIds
}
function sendModelCallTelemetry(telemetryService, messageData, telemetryData, messageDirection, logService) {
    // Get the unique model call ID
    const modelCallId = telemetryData.properties.modelCallId;
    if (!modelCallId) {
        return;
    }
    // For input calls, process request options and get requestOptionsId
    let requestOptionsId;
    if (messageDirection === 'input') {
        requestOptionsId = sendModelRequestOptionsTelemetry(telemetryService, telemetryData, logService);
    }
    // Extract trajectory context
    const conversationId = telemetryData.properties.conversationId || telemetryData.properties.sessionId || 'unknown';
    // Group messages by headerRequestId
    const messagesByHeaderRequestId = new Map();
    for (const item of messageData) {
        if (!messagesByHeaderRequestId.has(item.headerRequestId)) {
            messagesByHeaderRequestId.set(item.headerRequestId, []);
        }
        messagesByHeaderRequestId.get(item.headerRequestId).push(item.uuid);
    }
    // Send separate telemetry events for each headerRequestId
    for (const [headerRequestId, messageUuids] of messagesByHeaderRequestId) {
        const eventName = messageDirection === 'input' ? 'model.modelCall.input' : 'model.modelCall.output';
        // Update headerRequestIdTracker and get requestTurn only for input events
        let requestTurn;
        if (messageDirection === 'input') {
            requestTurn = updateHeaderRequestIdTracker(headerRequestId);
        }
        // Convert messageUuids to JSON string for chunking
        const messageUuidsJsonString = JSON.stringify(messageUuids);
        const maxChunkSize = 8000;
        // Split messageUuids JSON into chunks of 8000 characters or less
        const chunks = [];
        for (let i = 0; i < messageUuidsJsonString.length; i += maxChunkSize) {
            chunks.push(messageUuidsJsonString.substring(i, i + maxChunkSize));
        }
        // Send one telemetry event per chunk
        for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
            const modelCallData = telemetryData_1.TelemetryData.createAndMarkAsIssued({
                modelCallId,
                conversationId, // Trajectory identifier linking main and supplementary calls
                headerRequestId, // Specific to this set of messages
                messageDirection,
                messageUuids: chunks[chunkIndex], // Store chunk of messageUuids JSON
                chunkIndex: chunkIndex.toString(), // 0-based chunk index for ordering
                totalChunks: chunks.length.toString(), // Total number of chunks for this headerRequestId
                messageCount: messageUuids.length.toString(),
                ...(requestTurn !== undefined && { requestTurn: requestTurn.toString() }), // Add requestTurn only for input calls
                ...(requestOptionsId && { requestOptionsId }), // Add requestOptionsId for input calls
                ...(telemetryData.properties.turnIndex && { turnIndex: telemetryData.properties.turnIndex }), // Add turnIndex from original telemetryData
            }, telemetryData.measurements); // Include measurements from original telemetryData
            telemetryService.sendInternalMSFTTelemetryEvent(eventName, modelCallData.properties, modelCallData.measurements);
        }
    }
}
function sendModelTelemetryEvents(telemetryService, messages, telemetryData, isOutput, logService) {
    // Skip model telemetry events for XtabProvider and api.* message sources
    const messageSource = telemetryData.properties.messageSource;
    if (messageSource === 'XtabProvider' || (messageSource && messageSource.startsWith('api.'))) {
        return;
    }
    // Send model.request.added event for user input requests (once per headerRequestId)
    // This captures user-level context (username, session info, etc.) for the user's request
    // Note: This is different from model-level context which is captured in model.modelCall events
    if (!isOutput) {
        sendNewRequestAddedTelemetry(telemetryService, telemetryData, logService);
    }
    // Skip input message telemetry for retry requests to avoid duplicates
    // Retry requests are identified by the presence of retryAfterFilterCategory property
    const isRetryRequest = telemetryData.properties.retryAfterFilterCategory !== undefined;
    if (!isOutput && isRetryRequest) {
        return;
    }
    // Send individual message telemetry for deduplication tracking and collect UUIDs with their headerRequestIds
    const messageData = sendIndividualMessagesTelemetry(telemetryService, messages, telemetryData, isOutput ? 'output' : 'input', logService);
    // Send model call telemetry grouped by headerRequestId (separate events for different headerRequestIds)
    // For input calls, this also handles request options deduplication
    // Always send model call telemetry regardless of whether messages are new or duplicates to ensure every model invocation is tracked
    sendModelCallTelemetry(telemetryService, messageData, telemetryData, isOutput ? 'output' : 'input', logService);
}
// ===== END MODEL TELEMETRY FUNCTIONS =====
function sendEngineMessagesTelemetry(telemetryService, messages, telemetryData, isOutput, logService) {
    const telemetryDataWithPrompt = telemetryData.extendedBy({
        messagesJson: JSON.stringify(messages),
    });
    telemetryService.sendEnhancedGHTelemetryEvent('engine.messages', (0, telemetry_1.multiplexProperties)(telemetryDataWithPrompt.properties), telemetryDataWithPrompt.measurements);
    // Commenting this out to test a new deduplicated way to collect the same information using sendModelTelemetryEvents()
    // TO DO remove this line completely if the new way allows for complete reconstruction of entire message arrays with much lower drop rate
    //telemetryService.sendInternalMSFTTelemetryEvent('engine.messages', multiplexProperties(telemetryDataWithPrompt.properties), telemetryDataWithPrompt.measurements);
    // Send all model telemetry events (model.request.added, model.message.added, model.modelCall.input/output, model.request.options.added)
    // Comment out the line below to disable the new deduplicated model telemetry events
    sendModelTelemetryEvents(telemetryService, messages, telemetryData, isOutput, logService);
    // Also send length-only telemetry
    sendEngineMessagesLengthTelemetry(telemetryService, messages, telemetryData, isOutput, logService);
}
function prepareChatCompletionForReturn(telemetryService, logService, c, telemetryData) {
    let messageContent = c.solution.text.join('');
    let blockFinished = false;
    if (c.finishOffset !== undefined) {
        // Trim solution to finishOffset returned by finishedCb
        logService.debug(`message ${c.index}: early finish at offset ${c.finishOffset}`);
        messageContent = messageContent.substring(0, c.finishOffset);
        blockFinished = true;
    }
    logService.info(`message ${c.index} returned. finish reason: [${c.reason}]`);
    logService.debug(`message ${c.index} details: finishOffset: [${c.finishOffset}] completionId: [{${c.requestId.completionId}}] created: [{${c.requestId.created}}]`);
    const jsonData = (0, stream_1.convertToAPIJsonData)(c.solution);
    const message = {
        role: prompt_tsx_1.Raw.ChatRole.Assistant,
        content: (0, globalStringUtils_1.toTextParts)(messageContent),
    };
    // Create enhanced message for telemetry with usage information
    const telemetryMessage = (0, openai_1.rawMessageToCAPI)(message);
    // Add request metadata to telemetry data
    telemetryData.extendWithRequestId(c.requestId);
    // Add usage information to telemetryData if available
    let telemetryDataWithUsage = telemetryData;
    if (c.usage) {
        telemetryDataWithUsage = telemetryData.extendedBy({}, {
            promptTokens: c.usage.prompt_tokens,
            completionTokens: c.usage.completion_tokens,
            totalTokens: c.usage.total_tokens
        });
    }
    sendEngineMessagesTelemetry(telemetryService, [telemetryMessage], telemetryDataWithUsage, true, logService);
    return {
        message: message,
        choiceIndex: c.index,
        requestId: c.requestId,
        blockFinished: blockFinished,
        finishReason: c.reason,
        filterReason: c.filterReason,
        error: c.error,
        tokens: jsonData.tokens,
        model: c.solution.model,
        usage: c.usage,
        telemetryData: telemetryDataWithUsage,
    };
}
//# sourceMappingURL=chatStream.js.map