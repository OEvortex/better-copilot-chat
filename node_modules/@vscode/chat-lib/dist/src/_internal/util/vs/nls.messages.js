"use strict";
//!!! DO NOT modify, this file was COPIED from 'microsoft/vscode'
Object.defineProperty(exports, "__esModule", { value: true });
exports.getNLSMessages = getNLSMessages;
exports.getNLSLanguage = getNLSLanguage;
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/*
 * This module exists so that the AMD build of the monaco editor can replace this with an async loader plugin.
 * If you add new functions to this module make sure that they are also provided in the AMD build of the monaco editor.
 *
 * TODO@esm remove me once we no longer ship an AMD build.
 */
function getNLSMessages() {
    return globalThis._VSCODE_NLS_MESSAGES;
}
function getNLSLanguage() {
    return globalThis._VSCODE_NLS_LANGUAGE;
}
//# sourceMappingURL=nls.messages.js.map