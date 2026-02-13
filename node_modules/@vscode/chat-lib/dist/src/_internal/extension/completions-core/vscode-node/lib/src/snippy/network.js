"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.call = call;
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const instantiation_1 = require("../../../../../../util/vs/platform/instantiation/common/instantiation");
const copilotTokenManager_1 = require("../auth/copilotTokenManager");
const config_1 = require("../config");
const logger_1 = require("../logger");
const networkConfiguration_1 = require("../networkConfiguration");
const networking_1 = require("../networking");
const connectionState_1 = require("./connectionState");
const errorCreator_1 = require("./errorCreator");
const logger_2 = require("./logger");
const telemetryHandlers_1 = require("./telemetryHandlers");
async function call(accessor, endpoint, config, signal) {
    let token;
    const logTarget = accessor.get(logger_1.ICompletionsLogTargetService);
    const instantiationService = accessor.get(instantiation_1.IInstantiationService);
    const tokenManager = accessor.get(copilotTokenManager_1.ICompletionsCopilotTokenManager);
    try {
        token = tokenManager.token ?? await tokenManager.getToken();
    }
    catch (e) {
        connectionState_1.ConnectionState.setDisconnected();
        return (0, errorCreator_1.createErrorResponse)(401, errorCreator_1.ErrorMessages[errorCreator_1.ErrorReasons.Unauthorized]);
    }
    logger_2.codeReferenceLogger.info(logTarget, `Calling ${endpoint}`);
    if (connectionState_1.ConnectionState.isRetrying()) {
        return (0, errorCreator_1.createErrorResponse)(600, 'Attempting to reconnect to the public code matching service.');
    }
    if (connectionState_1.ConnectionState.isDisconnected()) {
        return (0, errorCreator_1.createErrorResponse)(601, 'The public code matching service is offline.');
    }
    let res;
    try {
        res = await instantiationService.invokeFunction(acc => acc.get(networking_1.ICompletionsFetcherService).fetch((0, networkConfiguration_1.getEndpointUrl)(acc, token, 'origin-tracker', endpoint), {
            method: config.method,
            body: config.method === 'POST' ? JSON.stringify(config.body) : undefined,
            headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${token.token}`,
                ...(0, config_1.editorVersionHeaders)(acc),
            },
            signal,
        }));
    }
    catch (e) {
        instantiationService.invokeFunction(connectionState_1.ConnectionState.enableRetry);
        return (0, errorCreator_1.createErrorResponse)(602, 'Network error detected. Check your internet connection.');
    }
    let payload;
    try {
        payload = await res.json();
    }
    catch (e) {
        const message = e.message;
        telemetryHandlers_1.snippyTelemetry.handleUnexpectedError({
            instantiationService,
            origin: 'snippyNetwork',
            reason: message,
        });
        throw e;
    }
    if (res.ok) {
        return {
            kind: 'success',
            ...payload,
        };
    }
    const errorPayload = {
        ...payload,
        code: Number(res.status),
    };
    /**
     * Snippy will always respond with a 200, unless:
     *
     * - the request is malformed
     * - the user is not authorized.
     * - the server is down
     */
    const { code, msg, meta } = errorPayload;
    const formattedCode = Number(code);
    const errorTypeFromCode = (0, errorCreator_1.getErrorType)(formattedCode);
    const fallbackMsg = msg || 'unknown error';
    switch (errorTypeFromCode) {
        case errorCreator_1.ErrorReasons.Unauthorized: {
            return (0, errorCreator_1.createErrorResponse)(code, errorCreator_1.ErrorMessages[errorCreator_1.ErrorReasons.Unauthorized], meta);
        }
        case errorCreator_1.ErrorReasons.BadArguments: {
            return (0, errorCreator_1.createErrorResponse)(code, fallbackMsg, meta);
        }
        case errorCreator_1.ErrorReasons.RateLimit: {
            instantiationService.invokeFunction(acc => connectionState_1.ConnectionState.enableRetry(acc, 60 * 1000));
            return (0, errorCreator_1.createErrorResponse)(code, errorCreator_1.ErrorMessages.RateLimitError, meta);
        }
        case errorCreator_1.ErrorReasons.InternalError: {
            instantiationService.invokeFunction(acc => connectionState_1.ConnectionState.enableRetry(acc));
            return (0, errorCreator_1.createErrorResponse)(code, errorCreator_1.ErrorMessages[errorCreator_1.ErrorReasons.InternalError], meta);
        }
        default: {
            return (0, errorCreator_1.createErrorResponse)(code, fallbackMsg, meta);
        }
    }
}
//# sourceMappingURL=network.js.map