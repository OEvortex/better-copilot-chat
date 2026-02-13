"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = exports.Logger = exports.ICompletionsLogTargetService = exports.LogLevel = void 0;
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * This file is kept with minimal dependencies to avoid circular dependencies
 * breaking module resolution since the Logger class is instantiated at the
 * module level in many places.
 *
 * Do not add any concrete dependencies here.
 */
const services_1 = require("../../../../../util/common/services");
const completionsTelemetryServiceBridge_1 = require("../../bridge/src/completionsTelemetryServiceBridge");
const telemetry_1 = require("./telemetry");
var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["DEBUG"] = 4] = "DEBUG";
    LogLevel[LogLevel["INFO"] = 3] = "INFO";
    LogLevel[LogLevel["WARN"] = 2] = "WARN";
    LogLevel[LogLevel["ERROR"] = 1] = "ERROR";
})(LogLevel || (exports.LogLevel = LogLevel = {}));
exports.ICompletionsLogTargetService = (0, services_1.createServiceIdentifier)('ICompletionsLogTargetService');
class Logger {
    constructor(category) {
        this.category = category;
    }
    log(logTarget, level, ...extra) {
        logTarget.logIt(level, this.category, ...extra);
    }
    debug(logTarget, ...extra) {
        this.log(logTarget, LogLevel.DEBUG, ...extra);
    }
    info(logTarget, ...extra) {
        this.log(logTarget, LogLevel.INFO, ...extra);
    }
    warn(logTarget, ...extra) {
        this.log(logTarget, LogLevel.WARN, ...extra);
    }
    /**
     * Logs an error message and reports an error to telemetry. This is appropriate for generic
     * error logging, which might not be associated with an exception. Prefer `exception()` when
     * logging exception details.
     */
    error(logTarget, ...extra) {
        this.log(logTarget, LogLevel.ERROR, ...extra);
    }
    /**
     * Logs an error message and reports the exception to telemetry. Prefer this method over
     * `error()` when logging exception details.
     *
     * @param accessor The accessor
     * @param error The Error object that was thrown
     * @param message An optional message for context (e.g. "Request error"). Must not contain customer data. **Do not include stack trace or messages from the error object.**
     */
    exception(accessor, error, origin) {
        // ignore VS Code cancellations
        if (error instanceof Error && error.name === 'Canceled' && error.message === 'Canceled') {
            return;
        }
        let message = origin;
        if (origin.startsWith('.')) {
            message = origin.substring(1);
            origin = `${this.category}${origin}`;
        }
        (0, telemetry_1.telemetryException)(accessor.get(completionsTelemetryServiceBridge_1.ICompletionsTelemetryService), error, origin);
        const safeError = error instanceof Error ? error : new Error(`Non-error thrown: ${String(error)}`);
        this.log(accessor.get(exports.ICompletionsLogTargetService), LogLevel.ERROR, `${message}:`, safeError);
    }
}
exports.Logger = Logger;
exports.logger = new Logger('default');
//# sourceMappingURL=logger.js.map