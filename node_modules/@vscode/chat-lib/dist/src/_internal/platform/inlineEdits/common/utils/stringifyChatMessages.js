"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.stringifyChatMessages = stringifyChatMessages;
const prompt_tsx_1 = require("@vscode/prompt-tsx");
function stringifyChatMessages(messages) {
    return messages.map(stringifyMessage).join('\n');
}
function stringifyMessage({ role, content }) {
    if (role !== prompt_tsx_1.Raw.ChatRole.User && role !== prompt_tsx_1.Raw.ChatRole.System) {
        return 'omitted because of non-user and non-system role'; // should be impossible
    }
    const roleStr = role === prompt_tsx_1.Raw.ChatRole.User ? 'User' : 'System';
    const textContentPart = content.at(0);
    if (textContentPart?.type !== prompt_tsx_1.Raw.ChatCompletionContentPartKind.Text) {
        return 'omitted because of non-text content'; // should be impossible
    }
    return (`${roleStr}
------
${textContentPart.text}
==================`);
}
//# sourceMappingURL=stringifyChatMessages.js.map