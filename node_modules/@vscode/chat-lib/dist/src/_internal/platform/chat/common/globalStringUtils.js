"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTextPart = getTextPart;
exports.toTextPart = toTextPart;
exports.toTextParts = toTextParts;
exports.roleToString = roleToString;
const prompt_tsx_1 = require("@vscode/prompt-tsx");
const assert_1 = require("../../../util/vs/base/common/assert");
/**
 * Gets the text content part out of the message.
 * In the event it is an `ChatCompletionContentPart`, it will extract out the `ChatCompletionContentPartText`.
 **/
function getTextPart(message) {
    if (!message) {
        return '';
    }
    if (typeof message === 'string') {
        return message;
    }
    if (!Array.isArray(message)) {
        return message.type === prompt_tsx_1.Raw.ChatCompletionContentPartKind.Text ? message.text : '';
    }
    return message.map(c => (c.type === prompt_tsx_1.Raw.ChatCompletionContentPartKind.Text || c.type === 'text') ? c.text : '').join('');
}
function toTextPart(message) {
    return {
        type: prompt_tsx_1.Raw.ChatCompletionContentPartKind.Text,
        text: message
    };
}
function toTextParts(message) {
    return [toTextPart(message)];
}
function roleToString(role) {
    switch (role) {
        case prompt_tsx_1.Raw.ChatRole.System:
            return 'system';
        case prompt_tsx_1.Raw.ChatRole.User:
            return 'user';
        case prompt_tsx_1.Raw.ChatRole.Assistant:
            return 'assistant';
        case prompt_tsx_1.Raw.ChatRole.Tool:
            return 'tool';
        default:
            (0, assert_1.assertNever)(role, `unknown role (${role})`);
    }
}
//# sourceMappingURL=globalStringUtils.js.map