"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractThinkingDeltaFromChoice = extractThinkingDeltaFromChoice;
function getThinkingDeltaText(thinking) {
    if (!thinking) {
        return '';
    }
    if (thinking.cot_summary) {
        return thinking.cot_summary;
    }
    if (thinking.reasoning_text) {
        return thinking.reasoning_text;
    }
    if (thinking.thinking) {
        return thinking.thinking;
    }
    return undefined;
}
function getThinkingDeltaId(thinking) {
    if (!thinking) {
        return undefined;
    }
    if (thinking.cot_id) {
        return thinking.cot_id;
    }
    if (thinking.reasoning_opaque) {
        return thinking.reasoning_opaque;
    }
    if (thinking.signature) {
        return thinking.signature;
    }
    return undefined;
}
function extractThinkingDeltaFromChoice(choice) {
    const thinking = choice.message || choice.delta;
    if (!thinking) {
        return undefined;
    }
    const id = getThinkingDeltaId(thinking);
    const text = getThinkingDeltaText(thinking);
    if (id && text) {
        return { id, text };
    }
    else if (text) {
        return { text };
    }
    else if (id) {
        return { id };
    }
    return undefined;
}
//# sourceMappingURL=thinkingUtils.js.map