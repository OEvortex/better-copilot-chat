"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExpServiceTelemetryNames = void 0;
var ExpServiceTelemetryNames;
(function (ExpServiceTelemetryNames) {
    // these are defined (but not exported) in the code for the tas client, currently here:
    // https://github.com/microsoft/tas-client/blob/75f8895b15ef5696653cbee134ccae24477b0b94/vscode-tas-client/src/vscode-tas-client/VSCodeTasClient.ts#L67
    ExpServiceTelemetryNames["featuresTelemetryPropertyName"] = "VSCode.ABExp.Features";
})(ExpServiceTelemetryNames || (exports.ExpServiceTelemetryNames = ExpServiceTelemetryNames = {}));
//# sourceMappingURL=telemetryNames.js.map