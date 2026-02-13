"use strict";
//!!! DO NOT modify, this file was COPIED from 'microsoft/vscode'
Object.defineProperty(exports, "__esModule", { value: true });
exports.cancelOnDispose = exports.CancellationTokenSource = exports.CancellationToken = exports.CancellationError = void 0;
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var errors_1 = require("../../errors");
Object.defineProperty(exports, "CancellationError", { enumerable: true, get: function () { return errors_1.CancellationError; } });
var cancellation_1 = require("../../cancellation");
Object.defineProperty(exports, "CancellationToken", { enumerable: true, get: function () { return cancellation_1.CancellationToken; } });
Object.defineProperty(exports, "CancellationTokenSource", { enumerable: true, get: function () { return cancellation_1.CancellationTokenSource; } });
Object.defineProperty(exports, "cancelOnDispose", { enumerable: true, get: function () { return cancellation_1.cancelOnDispose; } });
//# sourceMappingURL=cancellation.js.map