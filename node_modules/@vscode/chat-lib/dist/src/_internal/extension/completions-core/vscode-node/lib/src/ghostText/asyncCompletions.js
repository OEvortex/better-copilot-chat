"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AsyncCompletionManager = exports.ICompletionsAsyncManagerService = void 0;
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const services_1 = require("../../../../../../util/common/services");
const featuresService_1 = require("../experiments/featuresService");
const cache_1 = require("../helpers/cache");
const logger_1 = require("../logger");
const async_1 = require("../util/async");
const subject_1 = require("../util/subject");
var AsyncCompletionRequestState;
(function (AsyncCompletionRequestState) {
    AsyncCompletionRequestState[AsyncCompletionRequestState["Completed"] = 0] = "Completed";
    AsyncCompletionRequestState[AsyncCompletionRequestState["Error"] = 1] = "Error";
    AsyncCompletionRequestState[AsyncCompletionRequestState["Pending"] = 2] = "Pending";
})(AsyncCompletionRequestState || (AsyncCompletionRequestState = {}));
exports.ICompletionsAsyncManagerService = (0, services_1.createServiceIdentifier)('ICompletionsAsyncManagerService');
let AsyncCompletionManager = class AsyncCompletionManager {
    #logger;
    constructor(featuresService, logTarget) {
        this.featuresService = featuresService;
        this.logTarget = logTarget;
        this.#logger = new logger_1.Logger('AsyncCompletionManager');
        /** Mapping of headerRequestId to completion request */
        this.requests = new cache_1.LRUCacheMap(100);
        /** The most recently requested (either via getFirstMatchingRequest or
         * getFirstMatchingRequestWithTimeout) header request ID. Serves as a lock
         * for cancellation. Since we only want to cancel requests that don't match
         * the most recent request prefix. */
        this.mostRecentRequestId = '';
    }
    clear() {
        this.requests.clear();
    }
    /**
     * Check if there are any candidate completions for the current position.
     * We need to strike the right balance between queuing completions as the
     * user types, without queuing one per keystroke. This method should return
     * true if we don't have any completions that match the current position.
     * This method should return false if we have reasonable candidates that
     * match the current position.
     */
    shouldWaitForAsyncCompletions(prefix, prompt) {
        // TODO: Consider adding a minimum threshold for candidate completions,
        // where we will queue more if the user's typing seems to be diverging
        // from current speculation.
        for (const [_, request] of this.requests) {
            if (isCandidate(prefix, prompt, request)) {
                return true;
            }
        }
        return false;
    }
    /**
     * Called from a FinishedCallback to report partial results as a completion
     * is streamed back from the server.
     */
    updateCompletion(headerRequestId, text) {
        const request = this.requests.get(headerRequestId);
        if (request === undefined) {
            return;
        }
        request.partialCompletionText = text;
        request.subject.next(request);
    }
    /**
     * Adds an in-flight completion request to the requests map for tracking.
     * Once the request is completed it is removed from the requests map.
     */
    queueCompletionRequest(headerRequestId, prefix, prompt, cancellationTokenSource, resultPromise) {
        this.#logger.debug(this.logTarget, `[${headerRequestId}] Queueing async completion request:`, prefix.substring(prefix.lastIndexOf('\n') + 1));
        const subject = new subject_1.ReplaySubject();
        this.requests.set(headerRequestId, {
            state: AsyncCompletionRequestState.Pending,
            cancellationTokenSource,
            headerRequestId,
            prefix,
            prompt,
            subject,
        });
        return resultPromise
            .then(result => {
            this.requests.delete(headerRequestId);
            if (result.type !== 'success') {
                this.#logger.debug(this.logTarget, `[${headerRequestId}] Request failed with`, result.reason);
                subject.error(result.reason);
                return;
            }
            const completed = {
                cancellationTokenSource,
                headerRequestId,
                prefix,
                prompt,
                subject,
                choice: result.value[0],
                result,
                state: AsyncCompletionRequestState.Completed,
                allChoicesPromise: result.value[1],
            };
            this.requests.set(headerRequestId, completed);
            subject.next(completed);
            subject.complete();
        })
            .catch((e) => {
            this.#logger.error(this.logTarget, `[${headerRequestId}] Request errored with`, e);
            this.requests.delete(headerRequestId);
            subject.error(e);
        });
    }
    /** Returns the first matching completion or times out. */
    getFirstMatchingRequestWithTimeout(headerRequestId, prefix, prompt, isSpeculative, telemetryWithExp) {
        const timeout = this.featuresService.asyncCompletionsTimeout(telemetryWithExp);
        if (timeout < 0) {
            this.#logger.debug(this.logTarget, `[${headerRequestId}] Waiting for completions without timeout`);
            return this.getFirstMatchingRequest(headerRequestId, prefix, prompt, isSpeculative);
        }
        this.#logger.debug(this.logTarget, `[${headerRequestId}] Waiting for completions with timeout of ${timeout}ms`);
        return Promise.race([
            this.getFirstMatchingRequest(headerRequestId, prefix, prompt, isSpeculative),
            new Promise(r => setTimeout(() => r(null), timeout)),
        ]).then(result => {
            if (result === null) {
                this.#logger.debug(this.logTarget, `[${headerRequestId}] Timed out waiting for completion`);
                return undefined;
            }
            return result;
        });
    }
    /**
     * Returns the first resolved matching completion request. Modifies the
     * returned APIChoice to match the current prompt.
     */
    async getFirstMatchingRequest(headerRequestId, prefix, prompt, isSpeculative) {
        if (!isSpeculative) {
            this.mostRecentRequestId = headerRequestId;
        }
        let resolved = false;
        const deferred = new async_1.Deferred();
        const subscriptions = new Map();
        const finishRequest = (id) => () => {
            const subscription = subscriptions.get(id);
            if (subscription === undefined) {
                return;
            }
            subscription();
            subscriptions.delete(id);
            if (!resolved && subscriptions.size === 0) {
                // TODO: Check for new candidates before resolving.
                resolved = true;
                this.#logger.debug(this.logTarget, `[${headerRequestId}] No matching completions found`);
                deferred.resolve(undefined);
            }
        };
        const next = (request) => {
            if (isCandidate(prefix, prompt, request)) {
                if (request.state === AsyncCompletionRequestState.Completed) {
                    const remainingPrefix = prefix.substring(request.prefix.length);
                    let { completionText } = request.choice;
                    if (!completionText.startsWith(remainingPrefix) ||
                        completionText.length <= remainingPrefix.length) {
                        finishRequest(request.headerRequestId)();
                        return;
                    }
                    completionText = completionText.substring(remainingPrefix.length);
                    request.choice.telemetryData.measurements.foundOffset = remainingPrefix.length;
                    this.#logger.debug(this.logTarget, `[${headerRequestId}] Found completion at offset ${remainingPrefix.length}: ${JSON.stringify(completionText)}`);
                    deferred.resolve([{ ...request.choice, completionText }, request.allChoicesPromise]);
                    resolved = true;
                }
            }
            else {
                this.cancelRequest(headerRequestId, request);
                finishRequest(request.headerRequestId)();
            }
        };
        for (const [id, request] of this.requests) {
            if (isCandidate(prefix, prompt, request)) {
                subscriptions.set(id, request.subject.subscribe({
                    next,
                    error: finishRequest(id),
                    complete: finishRequest(id),
                }));
            }
            else {
                this.cancelRequest(headerRequestId, request);
            }
        }
        return deferred.promise.finally(() => {
            for (const dispose of subscriptions.values()) {
                dispose();
            }
        });
    }
    /**
     * Attempts to cancel a request if it is still pending and the request
     * attempting the cancellation (that it no longer matches) is the most
     * recent request.
     *
     * @param headerRequestId The request id for the call to
     * getFirstMatchingRequest that the `request` no longer matches.
     * @param request The request to cancel
     */
    cancelRequest(headerRequestId, request) {
        if (headerRequestId !== this.mostRecentRequestId) {
            return;
        }
        if (request.state === AsyncCompletionRequestState.Completed) {
            return;
        }
        this.#logger.debug(this.logTarget, `[${headerRequestId}] Cancelling request: ${request.headerRequestId}`);
        request.cancellationTokenSource.cancel();
        this.requests.delete(request.headerRequestId);
    }
};
exports.AsyncCompletionManager = AsyncCompletionManager;
exports.AsyncCompletionManager = AsyncCompletionManager = __decorate([
    __param(0, featuresService_1.ICompletionsFeaturesService),
    __param(1, logger_1.ICompletionsLogTargetService)
], AsyncCompletionManager);
function isCandidate(prefix, prompt, request) {
    if (request.prompt.suffix !== prompt.suffix) {
        return false;
    }
    if (!prefix.startsWith(request.prefix)) {
        return false;
    }
    const remainingPrefix = prefix.substring(request.prefix.length);
    if (request.state === AsyncCompletionRequestState.Completed) {
        return (request.choice.completionText.startsWith(remainingPrefix) &&
            request.choice.completionText.trimEnd().length > remainingPrefix.length);
    }
    if (request.partialCompletionText === undefined) {
        return true;
    }
    return request.partialCompletionText.startsWith(remainingPrefix);
}
//# sourceMappingURL=asyncCompletions.js.map