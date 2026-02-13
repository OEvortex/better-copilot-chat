"use strict";
//!!! DO NOT modify, this file was COPIED from 'microsoft/vscode'
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleBugIndicatingErrorRecovery = handleBugIndicatingErrorRecovery;
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const deps_1 = require("./commonFacade/deps");
/**
 * This function is used to indicate that the caller recovered from an error that indicates a bug.
*/
function handleBugIndicatingErrorRecovery(message) {
    const err = new Error('BugIndicatingErrorRecovery: ' + message);
    (0, deps_1.onUnexpectedError)(err);
    console.error('recovered from an error that indicates a bug', err);
}
//# sourceMappingURL=base.js.map