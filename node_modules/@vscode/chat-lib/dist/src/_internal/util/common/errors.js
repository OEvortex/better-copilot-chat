"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.fromUnknown = fromUnknown;
exports.toString = toString;
const objects_1 = require("../vs/base/common/objects");
function fromUnknown(error) {
    if (error instanceof Error) {
        return error;
    }
    if (typeof error === 'string') {
        return new Error(error);
    }
    return new Error(`An unexpected error occurred: ${(0, objects_1.safeStringify)(error)}`);
}
function toString(error) {
    return error.stack ? error.stack : error.message;
}
//# sourceMappingURL=errors.js.map