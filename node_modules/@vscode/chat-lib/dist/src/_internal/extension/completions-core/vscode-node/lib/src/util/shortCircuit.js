"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.shortCircuit = shortCircuit;
// TODO: need to log whenever we hit this short circuit
function shortCircuit(fn, shortCircuitMs, shortCircuitReturn) {
    return async function (...args) {
        return await Promise.race([
            fn.apply(this, args),
            new Promise(resolve => {
                setTimeout(resolve, shortCircuitMs, shortCircuitReturn);
            }),
        ]);
    };
}
//# sourceMappingURL=shortCircuit.js.map