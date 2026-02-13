"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentMarker = void 0;
const jsx_runtime_1 = require("../../../../prompt/jsx-runtime//jsx-runtime");
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/** @jsxRuntime automatic */
/** @jsxImportSource ../../../../prompt/jsx-runtime/ */
const components_1 = require("../../../../prompt/src/components/components");
const languageMarker_1 = require("../../../../prompt/src/languageMarker");
const componentsCompletionsPromptFactory_1 = require("../completionsPromptFactory/componentsCompletionsPromptFactory");
const DocumentMarker = (props, context) => {
    const [document, setDocument] = context.useState();
    context.useData(componentsCompletionsPromptFactory_1.isCompletionRequestData, request => {
        if (request.document.uri !== document?.uri) {
            setDocument(request.document);
        }
    });
    if (document) {
        const relativePath = props.tdms.getRelativePath(document);
        const docInfo = {
            uri: document.uri,
            source: document.getText(),
            relativePath,
            languageId: document.detectedLanguageId,
        };
        const notebook = props.tdms.findNotebook(document);
        if (docInfo.relativePath && !notebook) {
            return (0, jsx_runtime_1.jsx)(PathMarker, { docInfo: docInfo });
        }
        return (0, jsx_runtime_1.jsx)(LanguageMarker, { docInfo: docInfo });
    }
};
exports.DocumentMarker = DocumentMarker;
const PathMarker = (props) => {
    return (0, jsx_runtime_1.jsx)(components_1.Text, { children: (0, languageMarker_1.getPathMarker)(props.docInfo) });
};
const LanguageMarker = (props) => {
    return (0, jsx_runtime_1.jsx)(components_1.Text, { children: (0, languageMarker_1.getLanguageMarker)(props.docInfo) });
};
//# sourceMappingURL=marker.js.map