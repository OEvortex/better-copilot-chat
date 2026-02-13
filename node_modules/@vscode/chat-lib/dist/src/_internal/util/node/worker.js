"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkerWithRpcProxy = exports.RcpResponseHandler = void 0;
exports.createRpcProxy = createRpcProxy;
const worker_threads_1 = require("worker_threads");
/**
 * Holds promises for RPC requests and resolves them when the call completes.
 */
class RcpResponseHandler {
    constructor() {
        this.nextId = 1;
        this.handlers = new Map();
    }
    createHandler() {
        const id = this.nextId++;
        let resolve;
        let reject;
        const result = new Promise((res, rej) => {
            resolve = res;
            reject = rej;
        });
        this.handlers.set(id, { resolve: resolve, reject: reject });
        return { id, result };
    }
    handleResponse(response) {
        const handler = this.handlers.get(response.id);
        if (!handler) {
            return;
        }
        this.handlers.delete(response.id);
        if (response.err) {
            handler.reject(response.err);
        }
        else {
            handler.resolve(response.res);
        }
    }
    /**
     * Handle an unexpected error by logging it and rejecting all handlers.
     */
    handleError(err) {
        for (const handler of this.handlers.values()) {
            handler.reject(err);
        }
        this.handlers.clear();
    }
    clear() {
        this.handlers.clear();
    }
}
exports.RcpResponseHandler = RcpResponseHandler;
function createRpcProxy(remoteCall) {
    const handler = {
        get: (target, name) => {
            if (typeof name === 'string' && !target[name]) {
                target[name] = (...myArgs) => {
                    return remoteCall(name, myArgs);
                };
            }
            return target[name];
        }
    };
    return new Proxy(Object.create(null), handler);
}
class WorkerWithRpcProxy {
    constructor(workerPath, workerOptions, host) {
        this.responseHandler = new RcpResponseHandler();
        this.worker = new worker_threads_1.Worker(workerPath, workerOptions);
        this.worker.on('message', async (msg) => {
            if ('fn' in msg) {
                try {
                    const response = await host?.[msg.fn].apply(host, msg.args);
                    this.worker.postMessage({ id: msg.id, res: response });
                }
                catch (err) {
                    this.worker.postMessage({ id: msg.id, err });
                }
            }
            else {
                this.responseHandler.handleResponse(msg);
            }
        });
        this.worker.on('error', (err) => this.handleError(err));
        this.worker.on('exit', code => {
            if (code !== 0) {
                this.handleError(new Error(`Worker thread exited with code ${code}.`));
            }
        });
        this.proxy = createRpcProxy((fn, args) => {
            if (!this.worker) {
                throw new Error(`Worker was terminated!`);
            }
            const { id, result } = this.responseHandler.createHandler();
            this.worker.postMessage({ id, fn, args });
            return result;
        });
    }
    terminate() {
        this.worker.removeAllListeners();
        this.worker.terminate();
        this.responseHandler.clear();
    }
    /**
     * Handle an unexpected error by logging it and rejecting all handlers.
     */
    handleError(err) {
        this.responseHandler.handleError(err);
    }
}
exports.WorkerWithRpcProxy = WorkerWithRpcProxy;
//# sourceMappingURL=worker.js.map