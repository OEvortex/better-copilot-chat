"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.PendingLoggedChatRequest = exports.AbstractRequestLogger = exports.IRequestLogger = exports.ChatRequestScheme = void 0;
const async_hooks_1 = require("async_hooks");
const commonTypes_1 = require("../../../platform/chat/common/commonTypes");
const services_1 = require("../../../util/common/services");
const lifecycle_1 = require("../../../util/vs/base/common/lifecycle");
const offsetRange_1 = require("../../../util/vs/editor/common/core/ranges/offsetRange");
class ChatRequestScheme {
    static { this.chatRequestScheme = 'ccreq'; }
    static buildUri(data, format = 'markdown') {
        let extension;
        if (format === 'markdown') {
            extension = 'copilotmd';
        }
        else if (format === 'json') {
            extension = 'json';
        }
        else { // rawrequest
            extension = 'request.json';
        }
        if (data.kind === 'latest') {
            return `${ChatRequestScheme.chatRequestScheme}:latest.${extension}`;
        }
        else {
            return `${ChatRequestScheme.chatRequestScheme}:${data.id}.${extension}`;
        }
    }
    static parseUri(uri) {
        // Check for latest markdown
        if (uri === this.buildUri({ kind: 'latest' }, 'markdown')) {
            return { data: { kind: 'latest' }, format: 'markdown' };
        }
        // Check for latest JSON
        if (uri === this.buildUri({ kind: 'latest' }, 'json')) {
            return { data: { kind: 'latest' }, format: 'json' };
        }
        // Check for latest rawrequest
        if (uri === this.buildUri({ kind: 'latest' }, 'rawrequest')) {
            return { data: { kind: 'latest' }, format: 'rawrequest' };
        }
        // Check for specific request markdown
        const mdMatch = uri.match(/ccreq:([^\s]+)\.copilotmd/);
        if (mdMatch) {
            return { data: { kind: 'request', id: mdMatch[1] }, format: 'markdown' };
        }
        // specific raw body json
        const bodyJsonMatch = uri.match(/ccreq:([^\s]+)\.request\.json/);
        if (bodyJsonMatch) {
            return { data: { kind: 'request', id: bodyJsonMatch[1] }, format: 'rawrequest' };
        }
        // Check for specific request JSON
        const jsonMatch = uri.match(/ccreq:([^\s]+)\.json/);
        if (jsonMatch) {
            return { data: { kind: 'request', id: jsonMatch[1] }, format: 'json' };
        }
        return undefined;
    }
    static findAllUris(text) {
        const linkRE = /(ccreq:[^\s]+\.(copilotmd|json|request\.json))/g;
        return [...text.matchAll(linkRE)].map((m) => {
            const identifier = m[1];
            return {
                uri: identifier,
                range: new offsetRange_1.OffsetRange(m.index, m.index + identifier.length)
            };
        });
    }
}
exports.ChatRequestScheme = ChatRequestScheme;
exports.IRequestLogger = (0, services_1.createServiceIdentifier)('IRequestLogger');
const requestLogStorage = new async_hooks_1.AsyncLocalStorage();
class AbstractRequestLogger extends lifecycle_1.Disposable {
    get promptRendererTracing() {
        return false;
    }
    captureInvocation(request, fn) {
        return requestLogStorage.run(request, () => fn());
    }
    logChatRequest(debugName, chatEndpoint, chatParams) {
        return new PendingLoggedChatRequest(this, debugName, chatEndpoint, chatParams);
    }
    enableWorkspaceEditTracing() {
        // no-op by default; concrete implementations can override
    }
    disableWorkspaceEditTracing() {
        // no-op by default; concrete implementations can override
    }
    /** Current request being made to the LM. */
    get currentRequest() {
        return requestLogStorage.getStore();
    }
}
exports.AbstractRequestLogger = AbstractRequestLogger;
class AbstractPendingLoggedRequest {
    constructor(_logbook, _debugName, _chatEndpoint, _chatParams) {
        this._logbook = _logbook;
        this._debugName = _debugName;
        this._chatEndpoint = _chatEndpoint;
        this._chatParams = _chatParams;
        this._timeToFirstToken = undefined;
        this._time = new Date();
    }
    markTimeToFirstToken(timeToFirstToken) {
        this._timeToFirstToken = timeToFirstToken;
    }
    resolveWithCancelation() {
        this._logbook.addEntry({
            type: "ChatMLCancelation" /* LoggedRequestKind.ChatMLCancelation */,
            debugName: this._debugName,
            chatEndpoint: this._chatEndpoint,
            chatParams: this._chatParams,
            startTime: this._time,
            endTime: new Date()
        });
    }
}
class PendingLoggedChatRequest extends AbstractPendingLoggedRequest {
    constructor(logbook, debugName, chatEndpoint, chatParams) {
        super(logbook, debugName, chatEndpoint, chatParams);
    }
    resolve(result, deltas) {
        if (result.type === commonTypes_1.ChatFetchResponseType.Success) {
            this._logbook.addEntry({
                type: "ChatMLSuccess" /* LoggedRequestKind.ChatMLSuccess */,
                debugName: this._debugName,
                usage: result.usage,
                chatEndpoint: this._chatEndpoint,
                chatParams: this._chatParams,
                startTime: this._time,
                endTime: new Date(),
                timeToFirstToken: this._timeToFirstToken,
                result,
                deltas
            });
        }
        else {
            this._logbook.addEntry({
                type: result.type === commonTypes_1.ChatFetchResponseType.Canceled ? "ChatMLCancelation" /* LoggedRequestKind.ChatMLCancelation */ : "ChatMLFailure" /* LoggedRequestKind.ChatMLFailure */,
                debugName: this._debugName,
                chatEndpoint: this._chatEndpoint,
                chatParams: this._chatParams,
                startTime: this._time,
                endTime: new Date(),
                timeToFirstToken: this._timeToFirstToken,
                result,
            });
        }
    }
}
exports.PendingLoggedChatRequest = PendingLoggedChatRequest;
//# sourceMappingURL=requestLogger.js.map