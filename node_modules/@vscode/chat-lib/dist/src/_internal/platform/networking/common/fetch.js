"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRequestId = getRequestId;
exports.isCopilotAnnotation = isCopilotAnnotation;
exports.isCodeCitationAnnotation = isCodeCitationAnnotation;
exports.isCopilotWebReference = isCopilotWebReference;
exports.isOpenAiFunctionTool = isOpenAiFunctionTool;
function getRequestId(response, json) {
    return {
        headerRequestId: response.headers.get('x-request-id') || '',
        gitHubRequestId: response.headers.get('x-github-request-id') || '',
        completionId: json && json.id ? json.id : '',
        created: json && json.created ? json.created : 0,
        serverExperiments: response.headers.get('X-Copilot-Experiment') || '',
        deploymentId: response.headers.get('azureml-model-deployment') || '',
    };
}
function isCopilotAnnotation(thing) {
    if (typeof thing !== 'object' || thing === null || !('details' in thing)) {
        return false;
    }
    const { details } = thing;
    return typeof details === 'object' && details !== null &&
        'type' in details && 'description' in details && typeof details.type === 'string' && typeof details.description === 'string';
}
function isCodeCitationAnnotation(thing) {
    if (typeof thing !== 'object' || thing === null || !('citations' in thing)) {
        return false;
    }
    const { citations } = thing;
    return typeof citations === 'object' && citations !== null &&
        'url' in citations && 'license' in citations && typeof citations.url === 'string' && typeof citations.license === 'string';
}
function isCopilotWebReference(reference) {
    return typeof reference === 'object' && !!reference && 'title' in reference && 'excerpt' in reference && 'url' in reference;
}
function isOpenAiFunctionTool(tool) {
    return tool.function !== undefined;
}
//# sourceMappingURL=fetch.js.map