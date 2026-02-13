"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.Result = void 0;
var Result;
(function (Result) {
    function ok(value) {
        return new ResultOk(value);
    }
    Result.ok = ok;
    function error(value) {
        return new ResultError(value);
    }
    Result.error = error;
    function fromString(errorMessage) {
        return Result.error(new Error(errorMessage));
    }
    Result.fromString = fromString;
})(Result || (exports.Result = Result = {}));
/**
 * To instantiate a ResultOk, use `Result.ok(value)`.
 * To instantiate a ResultError, use `Result.error(value)`.
 */
class ResultOk {
    constructor(val) {
        this.val = val;
    }
    map(f) {
        return new ResultOk(f(this.val));
    }
    flatMap(f) {
        return f(this.val);
    }
    isOk() {
        return true;
    }
    isError() {
        return false;
    }
}
/**
 * To instantiate a ResultOk, use `Result.ok(value)`.
 * To instantiate a ResultError, use `Result.error(value)`.
 */
class ResultError {
    constructor(err) {
        this.err = err;
    }
    map(f) {
        return this;
    }
    flatMap(f) {
        return this;
    }
    isOk() {
        return false;
    }
    isError() {
        return true;
    }
}
//# sourceMappingURL=result.js.map