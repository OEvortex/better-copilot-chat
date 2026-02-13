"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.serializeLanguageContext = serializeLanguageContext;
exports.serializeFileDiagnostics = serializeFileDiagnostics;
const languageContextService_1 = require("../../../languageServer/common/languageContextService");
function serializeLanguageContext(response) {
    return {
        start: response.start,
        end: response.end,
        items: response.items.map(item => ({
            context: serializeLanguageContextItem(item.context),
            timeStamp: item.timeStamp,
            onTimeout: item.onTimeout,
        }))
    };
}
function serializeLanguageContextItem(context) {
    switch (context.kind) {
        case languageContextService_1.ContextKind.Snippet:
            return serializeSnippetContext(context);
        case languageContextService_1.ContextKind.Trait:
            return serializeTraitContext(context);
    }
}
function serializeSnippetContext(context) {
    return {
        kind: context.kind,
        priority: context.priority,
        uri: context.uri.toString(),
        additionalUris: context.additionalUris?.map(uri => uri.toString()),
        value: context.value
    };
}
function serializeTraitContext(context) {
    return {
        kind: context.kind,
        priority: context.priority,
        name: context.name,
        value: context.value
    };
}
function serializeDiagnostic(diagnostic, resource) {
    return {
        uri: resource.toString(),
        severity: diagnostic.severity,
        message: diagnostic.message,
        source: diagnostic.source || ''
    };
}
function serializeFileDiagnostics(diagnostics) {
    return diagnostics.flatMap(([resource, diags]) => diags.map(diagnostic => serializeDiagnostic(diagnostic, resource)));
}
//# sourceMappingURL=languageContext.js.map