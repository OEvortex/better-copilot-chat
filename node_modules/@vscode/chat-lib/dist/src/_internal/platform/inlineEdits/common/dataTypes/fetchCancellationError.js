"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.FetchCancellationError = void 0;
const errors_1 = require("../../../../util/vs/base/common/errors");
class FetchCancellationError extends errors_1.CancellationError {
    constructor(extraInformation) {
        super();
        this.extraInformation = extraInformation;
    }
}
exports.FetchCancellationError = FetchCancellationError;
//# sourceMappingURL=fetchCancellationError.js.map