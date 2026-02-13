"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.StatefulMarkerContainer = void 0;
exports.rawPartAsStatefulMarker = rawPartAsStatefulMarker;
exports.encodeStatefulMarker = encodeStatefulMarker;
exports.decodeStatefulMarker = decodeStatefulMarker;
exports.getAllStatefulMarkersAndIndicies = getAllStatefulMarkersAndIndicies;
exports.getStatefulMarkerAndIndex = getStatefulMarkerAndIndex;
const prompt_tsx_1 = require("@vscode/prompt-tsx");
const endpointTypes_1 = require("./endpointTypes");
/**
 * Helper to store the statefulMarker as part of a prompt-tsx assistant message
 */
class StatefulMarkerContainer extends prompt_tsx_1.PromptElement {
    render() {
        const { statefulMarker } = this.props;
        const container = { type: endpointTypes_1.CustomDataPartMimeTypes.StatefulMarker, value: statefulMarker };
        return vscpp("opaque", { value: container });
    }
}
exports.StatefulMarkerContainer = StatefulMarkerContainer;
/**
 * Check whether an opaque content part is a StatefulMarkerContainer and retrieve the stateful marker if so
 */
function rawPartAsStatefulMarker(part) {
    const value = part.value;
    if (!value || typeof value !== 'object') {
        return;
    }
    const data = value;
    if (data.type === endpointTypes_1.CustomDataPartMimeTypes.StatefulMarker && typeof data.value === 'object') {
        return data.value;
    }
    return;
}
function encodeStatefulMarker(modelId, marker) {
    return new TextEncoder().encode(modelId + '\\' + marker);
}
function decodeStatefulMarker(data) {
    const decoded = new TextDecoder().decode(data);
    const [modelId, marker] = decoded.split('\\');
    return { modelId, marker };
}
/** Gets stateful markers from the messages, from the most to least recent */
function* getAllStatefulMarkersAndIndicies(messages) {
    for (let idx = messages.length - 1; idx >= 0; idx--) {
        const message = messages[idx];
        if (message.role === prompt_tsx_1.Raw.ChatRole.Assistant) {
            for (const part of message.content) {
                if (part.type === prompt_tsx_1.Raw.ChatCompletionContentPartKind.Opaque) {
                    const statefulMarker = rawPartAsStatefulMarker(part);
                    if (statefulMarker) {
                        yield { statefulMarker: statefulMarker, index: idx };
                    }
                }
            }
        }
    }
    return undefined;
}
function getStatefulMarkerAndIndex(modelId, messages) {
    for (const marker of getAllStatefulMarkersAndIndicies(messages)) {
        if (marker.statefulMarker.modelId === modelId) {
            return { statefulMarker: marker.statefulMarker.marker, index: marker.index };
        }
    }
    return undefined;
}
//# sourceMappingURL=statefulMarkerContainer.js.map