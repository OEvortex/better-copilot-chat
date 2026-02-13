"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SimilarFiles = void 0;
const jsx_runtime_1 = require("../../../../prompt/jsx-runtime//jsx-runtime");
const components_1 = require("../../../../prompt/src/components/components");
const similarFiles_1 = require("../../../../prompt/src/snippetInclusion/similarFiles");
const snippets_1 = require("../../../../prompt/src/snippetInclusion/snippets");
const similarFileOptionsProvider_1 = require("../../experiments/similarFileOptionsProvider");
const componentsCompletionsPromptFactory_1 = require("../completionsPromptFactory/componentsCompletionsPromptFactory");
const prompt_1 = require("../prompt");
const neighborFiles_1 = require("../similarFiles/neighborFiles");
const SimilarFiles = (props, context) => {
    const [document, setDocument] = context.useState();
    const [similarFiles, setSimilarFiles] = context.useState([]);
    context.useData(componentsCompletionsPromptFactory_1.isCompletionRequestData, async (requestData) => {
        if (requestData.document.uri !== document?.uri) {
            setSimilarFiles([]);
        }
        setDocument(requestData.document);
        let files = neighborFiles_1.NeighborSource.defaultEmptyResult();
        if (!requestData.turnOffSimilarFiles) {
            files = await props.instantiationService.invokeFunction(async (acc) => await neighborFiles_1.NeighborSource.getNeighborFilesAndTraits(acc, requestData.document.uri, requestData.document.detectedLanguageId, requestData.telemetryData, requestData.cancellationToken, requestData.data));
        }
        const similarFiles = await produceSimilarFiles(requestData.telemetryData, requestData.document, requestData, files);
        setSimilarFiles(similarFiles);
    });
    async function produceSimilarFiles(telemetryData, doc, requestData, files) {
        const promptOptions = props.instantiationService.invokeFunction(prompt_1.getPromptOptions, telemetryData, doc.detectedLanguageId);
        const similarSnippets = await findSimilarSnippets(promptOptions, telemetryData, doc, requestData, files);
        return similarSnippets
            .filter(s => s.snippet.length > 0)
            .sort((a, b) => a.score - b.score)
            .map(s => {
            return { ...(0, snippets_1.announceSnippet)(s), score: s.score };
        });
    }
    async function findSimilarSnippets(promptOptions, telemetryData, doc, requestData, files) {
        const similarFilesOptions = promptOptions.similarFilesOptions ||
            props.instantiationService.invokeFunction(similarFileOptionsProvider_1.getSimilarFilesOptions, telemetryData, doc.detectedLanguageId);
        const tdm = props.tdms;
        const relativePath = tdm.getRelativePath(doc);
        const docInfo = {
            uri: doc.uri,
            source: doc.getText(),
            offset: doc.offsetAt(requestData.position),
            relativePath,
            languageId: doc.detectedLanguageId,
        };
        return await (0, similarFiles_1.getSimilarSnippets)(docInfo, Array.from(files.docs.values()), similarFilesOptions);
    }
    return (0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [...similarFiles.map((file, index) => (0, jsx_runtime_1.jsx)(SimilarFile, { snippet: file }))] });
};
exports.SimilarFiles = SimilarFiles;
// TODO: change Chunk for KeepTogether
const SimilarFile = (props, context) => {
    return ((0, jsx_runtime_1.jsxs)(components_1.Chunk, { children: [(0, jsx_runtime_1.jsx)(components_1.Text, { children: props.snippet.headline }), (0, jsx_runtime_1.jsx)(components_1.Text, { children: props.snippet.snippet })] }));
};
//# sourceMappingURL=similarFiles.js.map