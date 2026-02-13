"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.createProxyXtabEndpoint = createProxyXtabEndpoint;
const copilot_api_1 = require("@vscode/copilot-api");
const tokenizer_1 = require("../../../util/common/tokenizer");
const chatEndpoint_1 = require("./chatEndpoint");
function createProxyXtabEndpoint(instaService, overriddenModelName) {
    const defaultInfo = {
        id: overriddenModelName ?? "copilot-nes-xtab" /* CHAT_MODEL.NES_XTAB */,
        urlOrRequestMetadata: { type: copilot_api_1.RequestType.ProxyChatCompletions },
        name: 'xtab-proxy',
        model_picker_enabled: false,
        is_chat_default: false,
        is_chat_fallback: false,
        version: 'unknown',
        capabilities: {
            type: 'chat',
            family: 'xtab-proxy',
            tokenizer: tokenizer_1.TokenizerType.O200K,
            limits: {
                max_prompt_tokens: 12285,
                max_output_tokens: 4096,
            },
            supports: {
                streaming: true,
                parallel_tool_calls: false,
                tool_calls: false,
                vision: false,
                prediction: true,
            }
        }
    };
    return instaService.createInstance(chatEndpoint_1.ChatEndpoint, defaultInfo);
}
//# sourceMappingURL=proxyXtabEndpoint.js.map