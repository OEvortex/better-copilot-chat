"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Traits = void 0;
const jsx_runtime_1 = require("../../../../prompt/jsx-runtime//jsx-runtime");
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/** @jsxRuntime automatic */
/** @jsxImportSource ../../../../prompt/jsx-runtime/ */
const components_1 = require("../../../../prompt/src/components/components");
const prompt_1 = require("../../../../prompt/src/prompt");
const componentsCompletionsPromptFactory_1 = require("../completionsPromptFactory/componentsCompletionsPromptFactory");
const Traits = (_props, context) => {
    const [traits, setTraits] = context.useState();
    const [languageId, setLanguageId] = context.useState();
    context.useData(componentsCompletionsPromptFactory_1.isCompletionRequestData, (data) => {
        if (data.traits !== traits) {
            setTraits(data.traits);
        }
        const normalizedLanguageId = (0, prompt_1.normalizeLanguageId)(data.document.detectedLanguageId);
        if (normalizedLanguageId !== languageId) {
            setLanguageId(normalizedLanguageId);
        }
    });
    if (!traits || traits.length === 0 || !languageId) {
        return;
    }
    // TODO: use a `KeepTogether` elision that removes the header if no traits are present
    return ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)(components_1.Text, { children: 'Consider this related information:\n' }), ...traits.map(trait => ((0, jsx_runtime_1.jsx)(components_1.Text, { source: trait, children: `${trait.name}: ${trait.value}` }, trait.id)))] }));
};
exports.Traits = Traits;
//# sourceMappingURL=traits.js.map