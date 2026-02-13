"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectionState = void 0;
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const instantiation_1 = require("../../../../../../util/vs/platform/instantiation/common/instantiation");
const logger_1 = require("../logger");
const networkConfiguration_1 = require("../networkConfiguration");
const networking_1 = require("../networking");
const logger_2 = require("./logger");
const InitialTimeout = 3000;
const BaseRetryTime = 2;
const MaxRetryTime = 256;
const MaxAttempts = Math.log(MaxRetryTime) / Math.log(BaseRetryTime) / BaseRetryTime;
const state = {
    connection: 'disabled',
    maxAttempts: MaxAttempts,
    retryAttempts: 0,
    initialWait: false,
};
let stateAPI;
const handlers = [];
function registerConnectionState() {
    if (stateAPI) {
        return stateAPI;
    }
    function subscribe(cb) {
        handlers.push(cb);
        return () => {
            const index = handlers.indexOf(cb);
            if (index !== -1) {
                handlers.splice(index, 1);
            }
        };
    }
    function afterUpdateConnection() {
        for (const handler of handlers) {
            handler();
        }
    }
    function updateConnection(status) {
        if (state.connection === status) {
            return;
        }
        state.connection = status;
        afterUpdateConnection();
    }
    function isConnected() {
        return state.connection === 'connected';
    }
    function isDisconnected() {
        return state.connection === 'disconnected';
    }
    function isRetrying() {
        return state.connection === 'retry';
    }
    function isDisabled() {
        return state.connection === 'disabled';
    }
    function setConnected() {
        updateConnection('connected');
        setInitialWait(false);
    }
    function setDisconnected() {
        updateConnection('disconnected');
    }
    function setRetrying() {
        updateConnection('retry');
    }
    function setDisabled() {
        updateConnection('disabled');
    }
    function setInitialWait(enabled) {
        if (state.initialWait !== enabled) {
            state.initialWait = enabled;
        }
    }
    function enableRetry(accessor, initialTimeout = InitialTimeout) {
        if (isRetrying()) {
            return;
        }
        setRetrying();
        setInitialWait(true);
        void attemptToPing(accessor, initialTimeout);
    }
    function isInitialWait() {
        return state.initialWait;
    }
    async function attemptToPing(accessor, initialTimeout) {
        const logTarget = accessor.get(logger_1.ICompletionsLogTargetService);
        const fetcher = accessor.get(networking_1.ICompletionsFetcherService);
        const instantiationService = accessor.get(instantiation_1.IInstantiationService);
        logger_2.codeReferenceLogger.info(logTarget, `Attempting to reconnect in ${initialTimeout}ms.`);
        // Initial 3 second delay before attempting to reconnect to Snippy.
        await timeout(initialTimeout);
        setInitialWait(false);
        function succeedOrRetry(time) {
            if (time > MaxRetryTime) {
                logger_2.codeReferenceLogger.info(logTarget, 'Max retry time reached, disabling.');
                setDisabled();
                return;
            }
            const tryAgain = async () => {
                state.retryAttempts = Math.min(state.retryAttempts + 1, MaxAttempts);
                try {
                    logger_2.codeReferenceLogger.info(logTarget, `Pinging service after ${time} second(s)`);
                    const response = await fetcher.fetch(new URL('_ping', instantiationService.invokeFunction(networkConfiguration_1.getLastKnownEndpoints)['origin-tracker']).href, {
                        method: 'GET',
                        headers: {
                            'content-type': 'application/json',
                        },
                    });
                    if (response.status !== 200 || !response.ok) {
                        succeedOrRetry(time ** 2);
                    }
                    else {
                        logger_2.codeReferenceLogger.info(logTarget, 'Successfully reconnected.');
                        setConnected();
                        return;
                    }
                }
                catch (e) {
                    succeedOrRetry(time ** 2);
                }
            };
            setTimeout(() => void tryAgain(), time * 1000);
        }
        logger_2.codeReferenceLogger.info(logTarget, 'Attempting to reconnect.');
        succeedOrRetry(BaseRetryTime);
    }
    const timeout = (ms) => {
        return new Promise(resolve => setTimeout(resolve, ms));
    };
    function listen(cb) {
        const disposer = subscribe(cb);
        return { dispose: disposer };
    }
    stateAPI = {
        setConnected,
        setDisconnected,
        setRetrying,
        setDisabled,
        enableRetry,
        listen,
        isConnected,
        isDisconnected,
        isRetrying,
        isDisabled,
        isInitialWait,
    };
    return stateAPI;
}
exports.ConnectionState = registerConnectionState();
//# sourceMappingURL=connectionState.js.map