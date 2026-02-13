"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.isDocumentValid = isDocumentValid;
const ignoreService_1 = require("../../../../../../platform/ignore/common/ignoreService");
const uri_1 = require("../../../../../../util/vs/base/common/uri");
/**
 * Evaluate document uri to see if it's valid for copilot to process
 */
async function isDocumentValid(accessor, document) {
    const ignoreService = accessor.get(ignoreService_1.IIgnoreService);
    if (await ignoreService.isCopilotIgnored(uri_1.URI.parse(document.uri))) {
        return {
            status: 'invalid',
            reason: 'Document is blocked by repository policy',
        };
    }
    return { status: 'valid' };
}
//# sourceMappingURL=documentEvaluation.js.map