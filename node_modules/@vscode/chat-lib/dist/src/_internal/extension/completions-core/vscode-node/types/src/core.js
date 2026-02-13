"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.RangeSchema = exports.WorkspaceFolder = exports.VersionedTextDocumentIdentifier = exports.TextEdit = exports.TextDocumentItem = exports.Range = exports.Position = exports.DocumentUri = exports.Disposable = exports.Command = exports.CancellationTokenSource = exports.CancellationToken = void 0;
const typebox_1 = require("@sinclair/typebox");
var vscode_languageserver_protocol_1 = require("vscode-languageserver-protocol");
Object.defineProperty(exports, "CancellationToken", { enumerable: true, get: function () { return vscode_languageserver_protocol_1.CancellationToken; } });
Object.defineProperty(exports, "CancellationTokenSource", { enumerable: true, get: function () { return vscode_languageserver_protocol_1.CancellationTokenSource; } });
Object.defineProperty(exports, "Command", { enumerable: true, get: function () { return vscode_languageserver_protocol_1.Command; } });
Object.defineProperty(exports, "Disposable", { enumerable: true, get: function () { return vscode_languageserver_protocol_1.Disposable; } });
Object.defineProperty(exports, "DocumentUri", { enumerable: true, get: function () { return vscode_languageserver_protocol_1.DocumentUri; } });
Object.defineProperty(exports, "Position", { enumerable: true, get: function () { return vscode_languageserver_protocol_1.Position; } });
Object.defineProperty(exports, "Range", { enumerable: true, get: function () { return vscode_languageserver_protocol_1.Range; } });
Object.defineProperty(exports, "TextDocumentItem", { enumerable: true, get: function () { return vscode_languageserver_protocol_1.TextDocumentItem; } });
Object.defineProperty(exports, "TextEdit", { enumerable: true, get: function () { return vscode_languageserver_protocol_1.TextEdit; } });
Object.defineProperty(exports, "VersionedTextDocumentIdentifier", { enumerable: true, get: function () { return vscode_languageserver_protocol_1.VersionedTextDocumentIdentifier; } });
Object.defineProperty(exports, "WorkspaceFolder", { enumerable: true, get: function () { return vscode_languageserver_protocol_1.WorkspaceFolder; } });
const PositionSchema = typebox_1.Type.Object({
    line: typebox_1.Type.Integer({ minimum: 0 }),
    character: typebox_1.Type.Integer({ minimum: 0 }),
});
exports.RangeSchema = typebox_1.Type.Object({
    start: PositionSchema,
    end: PositionSchema,
});
//# sourceMappingURL=core.js.map