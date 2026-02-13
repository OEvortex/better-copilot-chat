"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const worker_threads_1 = require("worker_threads");
const tikTokenizerImpl_1 = require("./tikTokenizerImpl");
function main() {
    const port = worker_threads_1.parentPort;
    if (!port) {
        throw new Error(`This module should only be used in a worker thread.`);
    }
    port.on('message', async (message) => {
        try {
            const res = await tikTokenizerImpl_1.TikTokenImpl.instance[message.fn](...message.args);
            port.postMessage({ id: message.id, res });
        }
        catch (err) {
            port.postMessage({ id: message.id, err });
        }
    });
}
main();
//# sourceMappingURL=tikTokenizerWorker.js.map