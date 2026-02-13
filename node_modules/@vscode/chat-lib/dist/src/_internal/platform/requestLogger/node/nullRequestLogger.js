"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.NullRequestLogger = void 0;
const requestLogger_1 = require("../../../platform/requestLogger/node/requestLogger");
const event_1 = require("../../../util/vs/base/common/event");
class NullRequestLogger extends requestLogger_1.AbstractRequestLogger {
    constructor() {
        super(...arguments);
        this.onDidChangeRequests = event_1.Event.None;
    }
    addPromptTrace() {
    }
    addEntry(entry) {
    }
    getRequests() {
        return [];
    }
    logModelListCall(id, requestMetadata, models) {
    }
    logToolCall(name, args, response) {
    }
}
exports.NullRequestLogger = NullRequestLogger;
//# sourceMappingURL=nullRequestLogger.js.map