"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Response = void 0;
exports.isAbortError = isAbortError;
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var fetcherService_1 = require("../../../../../platform/networking/common/fetcherService");
Object.defineProperty(exports, "Response", { enumerable: true, get: function () { return fetcherService_1.Response; } });
/**
 * NETWORKING TYPES, INTERFACES AND ERROR CLASSES
 *
 * This module contains all networking-related types, interfaces, error classes and utilities.
 */
class HttpTimeoutError extends Error {
    constructor(message, cause) {
        super(message, { cause });
        this.name = 'HttpTimeoutError';
    }
}
function isAbortError(e) {
    if (!e || typeof e !== 'object') {
        // Reject invalid errors
        return false;
    }
    return (e instanceof HttpTimeoutError ||
        // internal Node.js AbortError, emitted by helix-fetch and electron net
        ('name' in e && e.name === 'AbortError') ||
        // that same internal Node.js AbortError, but wrapped in a Helix FetchError
        ('code' in e && e.code === 'ABORT_ERR'));
}
//# sourceMappingURL=networkingTypes.js.map