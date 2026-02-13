"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
exports.telemetryShown = telemetryShown;
exports.telemetryAccepted = telemetryAccepted;
exports.telemetryRejected = telemetryRejected;
exports.mkCanceledResultTelemetry = mkCanceledResultTelemetry;
exports.mkBasicResultTelemetry = mkBasicResultTelemetry;
exports.handleGhostTextResultTelemetry = handleGhostTextResultTelemetry;
exports.resultTypeToString = resultTypeToString;
const logger_1 = require("../logger");
const telemetry_1 = require("../telemetry");
const ghostText_1 = require("./ghostText");
const speculativeRequestCache_1 = require("./speculativeRequestCache");
exports.logger = new logger_1.Logger('getCompletions');
/** Send `.shown` event */
function telemetryShown(accessor, insertionCategory, completion) {
    const speculativeRequestCache = accessor.get(speculativeRequestCache_1.ICompletionsSpeculativeRequestCache);
    void speculativeRequestCache.request(completion.clientCompletionId);
    completion.telemetry.markAsDisplayed(); // TODO: Consider removing displayedTime as unused and generally incorrect.
    completion.telemetry.properties.reason = resultTypeToString(completion.resultType);
    (0, telemetry_1.telemetry)(accessor, `${insertionCategory}.shown`, completion.telemetry);
}
/** Send `.accepted` event */
function telemetryAccepted(accessor, insertionCategory, telemetryData) {
    const telemetryName = insertionCategory + '.accepted';
    (0, telemetry_1.telemetry)(accessor, telemetryName, telemetryData);
}
/** Send `.rejected` event */
function telemetryRejected(accessor, insertionCategory, telemetryData) {
    const telemetryName = insertionCategory + '.rejected';
    (0, telemetry_1.telemetry)(accessor, telemetryName, telemetryData);
}
function mkCanceledResultTelemetry(telemetryBlob, extraFlags = {}) {
    return {
        ...extraFlags,
        telemetryBlob,
    };
}
function mkBasicResultTelemetry(telemetryBlob) {
    const result = {
        headerRequestId: telemetryBlob.properties['headerRequestId'],
        copilot_trackingId: telemetryBlob.properties['copilot_trackingId'],
    };
    // copy certain properties if present
    if (telemetryBlob.properties['sku'] !== undefined) {
        result.sku = telemetryBlob.properties['sku'];
    }
    if (telemetryBlob.properties['opportunityId'] !== undefined) {
        result.opportunityId = telemetryBlob.properties['opportunityId'];
    }
    if (telemetryBlob.properties['organizations_list'] !== undefined) {
        result.organizations_list = telemetryBlob.properties['organizations_list'];
    }
    if (telemetryBlob.properties['enterprise_list'] !== undefined) {
        result.enterprise_list = telemetryBlob.properties['enterprise_list'];
    }
    if (telemetryBlob.properties['clientCompletionId'] !== undefined) {
        result.clientCompletionId = telemetryBlob.properties['clientCompletionId'];
    }
    return result;
}
/**
 * Given a ghost text result, send the appropriate "result" telemetry, if any, and return the
 * result value if one was produced.
 * @param start Milliseconds (since process start) when the completion request was by the editor.
 */
function handleGhostTextResultTelemetry(accessor, result) {
    const logTarget = accessor.get(logger_1.ICompletionsLogTargetService);
    // testing/debugging only case, no telemetry
    if (result.type === 'promptOnly') {
        return;
    }
    if (result.type === 'success') {
        const timeToProduceMs = (0, telemetry_1.now)() - result.telemetryBlob.issuedTime;
        const reason = resultTypeToString(result.resultType);
        const performanceMetrics = JSON.stringify(result.performanceMetrics);
        const properties = { ...result.telemetryData, reason, performanceMetrics };
        const { foundOffset } = result.telemetryBlob.measurements;
        const perf = result.performanceMetrics?.map(([key, dur]) => `\n${dur.toFixed(2)}\t${key}`).join('') ?? '';
        exports.logger.debug(logTarget, `ghostText produced from ${reason} in ${Math.round(timeToProduceMs)}ms with foundOffset ${foundOffset}${perf}`);
        (0, telemetry_1.telemetryRaw)(accessor, 'ghostText.produced', properties, { timeToProduceMs, foundOffset });
        return result.value;
    }
    exports.logger.debug(logTarget, 'No ghostText produced -- ' + result.type + ': ' + result.reason);
    if (result.type === 'canceled') {
        // For backwards compatibility, we send a "fat" telemetry message in this case.
        (0, telemetry_1.telemetry)(accessor, `ghostText.canceled`, result.telemetryData.telemetryBlob.extendedBy({
            reason: result.reason,
            cancelledNetworkRequest: result.telemetryData.cancelledNetworkRequest ? 'true' : 'false',
        }));
        return;
    }
    (0, telemetry_1.telemetryRaw)(accessor, `ghostText.${result.type}`, { ...result.telemetryData, reason: result.reason }, {});
}
function resultTypeToString(resultType) {
    switch (resultType) {
        case ghostText_1.ResultType.Network:
            return 'network';
        case ghostText_1.ResultType.Cache:
            return 'cache';
        case ghostText_1.ResultType.Cycling:
            return 'cycling';
        case ghostText_1.ResultType.TypingAsSuggested:
            return 'typingAsSuggested';
        case ghostText_1.ResultType.Async:
            return 'async';
    }
}
//# sourceMappingURL=telemetry.js.map