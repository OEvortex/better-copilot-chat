"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEngineRequestInfo = getEngineRequestInfo;
const model_1 = require("./model");
function getEngineRequestInfo(accessor, telemetryData = undefined) {
    const modelsManager = accessor.get(model_1.ICompletionsModelManagerService);
    const modelRequestInfo = modelsManager.getCurrentModelRequestInfo(telemetryData);
    const tokenizer = modelsManager.getTokenizerForModel(modelRequestInfo.modelId);
    return {
        headers: modelRequestInfo.headers,
        modelId: modelRequestInfo.modelId,
        engineChoiceSource: modelRequestInfo.modelChoiceSource,
        tokenizer,
    };
}
//# sourceMappingURL=config.js.map