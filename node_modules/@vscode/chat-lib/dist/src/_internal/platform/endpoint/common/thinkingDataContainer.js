"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ThinkingDataContainer = void 0;
exports.rawPartAsThinkingData = rawPartAsThinkingData;
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const prompt_tsx_1 = require("@vscode/prompt-tsx");
const endpointTypes_1 = require("./endpointTypes");
/**
 * Helper element to embed thinking data into assistant messages
 * as an opaque content part.
 */
class ThinkingDataContainer extends prompt_tsx_1.PromptElement {
    render() {
        const { thinking } = this.props;
        const container = { type: endpointTypes_1.CustomDataPartMimeTypes.ThinkingData, thinking };
        return vscpp("opaque", { value: container, tokenUsage: thinking.tokens });
    }
}
exports.ThinkingDataContainer = ThinkingDataContainer;
/**
 * Attempts to parse a Raw opaque content part into ThinkingData, if the type matches.
 */
function rawPartAsThinkingData(part) {
    const value = part.value;
    if (!value || typeof value !== 'object') {
        return;
    }
    const data = value;
    if (data.type === endpointTypes_1.CustomDataPartMimeTypes.ThinkingData && data.thinking && typeof data.thinking === 'object') {
        return data.thinking;
    }
    return;
}
//# sourceMappingURL=thinkingDataContainer.js.map