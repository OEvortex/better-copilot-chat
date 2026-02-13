"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.onCopilotToken = onCopilotToken;
function onCopilotToken(authService, listener) {
    return authService.onDidAuthenticationChange(() => {
        const copilotToken = authService.copilotToken;
        if (copilotToken) {
            listener(copilotToken);
        }
    });
}
//# sourceMappingURL=copilotTokenNotifier.js.map