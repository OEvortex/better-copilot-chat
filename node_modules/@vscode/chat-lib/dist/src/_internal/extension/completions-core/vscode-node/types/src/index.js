"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TextEdit = exports.Range = exports.Position = exports.Disposable = exports.CancellationTokenSource = exports.CancellationToken = void 0;
var vscode_languageserver_protocol_1 = require("vscode-languageserver-protocol");
Object.defineProperty(exports, "CancellationToken", { enumerable: true, get: function () { return vscode_languageserver_protocol_1.CancellationToken; } });
Object.defineProperty(exports, "CancellationTokenSource", { enumerable: true, get: function () { return vscode_languageserver_protocol_1.CancellationTokenSource; } });
Object.defineProperty(exports, "Disposable", { enumerable: true, get: function () { return vscode_languageserver_protocol_1.Disposable; } });
Object.defineProperty(exports, "Position", { enumerable: true, get: function () { return vscode_languageserver_protocol_1.Position; } });
Object.defineProperty(exports, "Range", { enumerable: true, get: function () { return vscode_languageserver_protocol_1.Range; } });
Object.defineProperty(exports, "TextEdit", { enumerable: true, get: function () { return vscode_languageserver_protocol_1.TextEdit; } });
__exportStar(require("./auth"), exports);
__exportStar(require("./codeCitation"), exports);
__exportStar(require("./contextProviderApiV1"), exports);
__exportStar(require("./core"), exports);
__exportStar(require("./status"), exports);
//# sourceMappingURL=index.js.map