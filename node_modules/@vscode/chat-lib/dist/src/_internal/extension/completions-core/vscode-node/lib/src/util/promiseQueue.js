"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.PromiseQueue = exports.ICompletionsPromiseQueueService = void 0;
const services_1 = require("../../../../../../util/common/services");
exports.ICompletionsPromiseQueueService = (0, services_1.createServiceIdentifier)('completionsPromiseQueueService');
class PromiseQueue {
    constructor() {
        this.promises = new Set();
    }
    register(promise) {
        this.promises.add(promise);
        void promise.finally(() => this.promises.delete(promise));
    }
    async flush() {
        await Promise.allSettled(this.promises);
    }
}
exports.PromiseQueue = PromiseQueue;
//# sourceMappingURL=promiseQueue.js.map