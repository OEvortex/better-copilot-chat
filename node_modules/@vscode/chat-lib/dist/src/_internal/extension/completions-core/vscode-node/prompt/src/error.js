"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CopilotPromptLoadFailure = void 0;
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
class CopilotPromptLoadFailure extends Error {
    constructor(message, cause) {
        super(message, { cause });
        this.code = 'CopilotPromptLoadFailure';
    }
}
exports.CopilotPromptLoadFailure = CopilotPromptLoadFailure;
//# sourceMappingURL=error.js.map