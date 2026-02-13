"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NoopTelemetryReporter = exports.snippyTelemetry = exports.matchNotificationTelemetry = exports.copilotOutputLogTelemetry = void 0;
const logger_1 = require("../logger");
const telemetry_1 = require("../telemetry");
const logger_2 = require("./logger");
// Check for valid http status code format. We use 6xx internally.
const statusCodeRe = /^[1-6][0-9][0-9]$/;
// Look for capital letters followed by lowercase letters.
const capitalsRe = /([A-Z][a-z]+)/;
const NAMESPACE = 'code_referencing';
class CodeQuoteTelemetry {
    constructor(baseKey) {
        this.baseKey = baseKey;
    }
    buildKey(...keys) {
        return [NAMESPACE, this.baseKey, ...keys].join('.');
    }
}
class CopilotOutputLogTelemetry extends CodeQuoteTelemetry {
    constructor() {
        super('github_copilot_log');
    }
    handleOpen({ instantiationService }) {
        const key = this.buildKey('open', 'count');
        const data = telemetry_1.TelemetryData.createAndMarkAsIssued();
        instantiationService.invokeFunction(telemetry_1.telemetry, key, data);
    }
    handleFocus({ instantiationService }) {
        const data = telemetry_1.TelemetryData.createAndMarkAsIssued();
        const key = this.buildKey('focus', 'count');
        instantiationService.invokeFunction(telemetry_1.telemetry, key, data);
    }
    handleWrite({ instantiationService }) {
        const data = telemetry_1.TelemetryData.createAndMarkAsIssued();
        const key = this.buildKey('write', 'count');
        instantiationService.invokeFunction(telemetry_1.telemetry, key, data);
    }
}
exports.copilotOutputLogTelemetry = new CopilotOutputLogTelemetry();
class MatchNotificationTelemetry extends CodeQuoteTelemetry {
    constructor() {
        super('match_notification');
    }
    handleDoAction({ instantiationService, actor }) {
        const data = telemetry_1.TelemetryData.createAndMarkAsIssued({ actor });
        const key = this.buildKey('acknowledge', 'count');
        instantiationService.invokeFunction(telemetry_1.telemetry, key, data);
    }
    handleDismiss({ instantiationService, actor }) {
        const data = telemetry_1.TelemetryData.createAndMarkAsIssued({ actor });
        const key = this.buildKey('ignore', 'count');
        instantiationService.invokeFunction(telemetry_1.telemetry, key, data);
    }
}
exports.matchNotificationTelemetry = new MatchNotificationTelemetry();
class SnippyTelemetry extends CodeQuoteTelemetry {
    constructor() {
        super('snippy');
    }
    handleUnexpectedError({ instantiationService, origin, reason }) {
        const data = telemetry_1.TelemetryData.createAndMarkAsIssued({ origin, reason });
        instantiationService.invokeFunction(telemetry_1.telemetryError, this.buildKey('unexpectedError'), data);
    }
    handleCompletionMissing({ instantiationService, origin, reason }) {
        const data = telemetry_1.TelemetryData.createAndMarkAsIssued({ origin, reason });
        instantiationService.invokeFunction(telemetry_1.telemetryError, this.buildKey('completionMissing'), data);
    }
    handleSnippyNetworkError({ instantiationService, origin, reason, message }) {
        if (!origin.match(statusCodeRe)) {
            instantiationService.invokeFunction(acc => logger_2.codeReferenceLogger.debug(acc.get(logger_1.ICompletionsLogTargetService), 'Invalid status code, not sending telemetry', { origin }));
            return;
        }
        // reason is a string like "SnippyNetworkError". We want to format it to use underscores, which
        // is the standard for Copilot telemetry keys.
        const errorType = reason
            .split(capitalsRe)
            .filter(part => Boolean(part))
            .join('_')
            .toLowerCase();
        const data = telemetry_1.TelemetryData.createAndMarkAsIssued({ message });
        instantiationService.invokeFunction(telemetry_1.telemetryError, this.buildKey(errorType, origin), data);
    }
}
exports.snippyTelemetry = new SnippyTelemetry();
/** @public KEEPING FOR TESTS */
class NoopTelemetryReporter extends CodeQuoteTelemetry {
    constructor(baseKey = '') {
        super(baseKey);
    }
    telemetry(...args) { }
    telemetryError(...args) { }
}
exports.NoopTelemetryReporter = NoopTelemetryReporter;
//# sourceMappingURL=telemetryHandlers.js.map