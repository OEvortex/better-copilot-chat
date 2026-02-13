"use strict";
//!!! DO NOT modify, this file was COPIED from 'microsoft/vscode'
Object.defineProperty(exports, "__esModule", { value: true });
exports.trackDisposable = exports.toDisposable = exports.markAsDisposed = exports.DisposableStore = exports.Event = exports.onUnexpectedError = exports.onBugIndicatingError = exports.BugIndicatingError = exports.strictEquals = exports.assertFn = void 0;
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var assert_1 = require("../../assert");
Object.defineProperty(exports, "assertFn", { enumerable: true, get: function () { return assert_1.assertFn; } });
var equals_1 = require("../../equals");
Object.defineProperty(exports, "strictEquals", { enumerable: true, get: function () { return equals_1.strictEquals; } });
var errors_1 = require("../../errors");
Object.defineProperty(exports, "BugIndicatingError", { enumerable: true, get: function () { return errors_1.BugIndicatingError; } });
Object.defineProperty(exports, "onBugIndicatingError", { enumerable: true, get: function () { return errors_1.onBugIndicatingError; } });
Object.defineProperty(exports, "onUnexpectedError", { enumerable: true, get: function () { return errors_1.onUnexpectedError; } });
var event_1 = require("../../event");
Object.defineProperty(exports, "Event", { enumerable: true, get: function () { return event_1.Event; } });
var lifecycle_1 = require("../../lifecycle");
Object.defineProperty(exports, "DisposableStore", { enumerable: true, get: function () { return lifecycle_1.DisposableStore; } });
Object.defineProperty(exports, "markAsDisposed", { enumerable: true, get: function () { return lifecycle_1.markAsDisposed; } });
Object.defineProperty(exports, "toDisposable", { enumerable: true, get: function () { return lifecycle_1.toDisposable; } });
Object.defineProperty(exports, "trackDisposable", { enumerable: true, get: function () { return lifecycle_1.trackDisposable; } });
//# sourceMappingURL=deps.js.map