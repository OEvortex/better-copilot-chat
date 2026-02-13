"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WASMLanguage = void 0;
exports.isSupportedLanguageId = isSupportedLanguageId;
exports.languageIdToWasmLanguage = languageIdToWasmLanguage;
exports.getLanguage = getLanguage;
exports.parseTreeSitter = parseTreeSitter;
exports.parseTreeSitterIncludingVersion = parseTreeSitterIncludingVersion;
exports.getBlockCloseToken = getBlockCloseToken;
exports.queryPythonIsDocstring = queryPythonIsDocstring;
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const web_tree_sitter_1 = __importDefault(require("web-tree-sitter"));
const error_1 = require("./error");
const fileLoader_1 = require("./fileLoader");
var WASMLanguage;
(function (WASMLanguage) {
    WASMLanguage["Python"] = "python";
    WASMLanguage["JavaScript"] = "javascript";
    WASMLanguage["TypeScript"] = "typescript";
    WASMLanguage["TSX"] = "tsx";
    WASMLanguage["Go"] = "go";
    WASMLanguage["Ruby"] = "ruby";
    WASMLanguage["CSharp"] = "c-sharp";
    WASMLanguage["Java"] = "java";
    WASMLanguage["Php"] = "php";
    WASMLanguage["Cpp"] = "cpp";
})(WASMLanguage || (exports.WASMLanguage = WASMLanguage = {}));
const languageIdToWasmLanguageMapping = {
    python: WASMLanguage.Python,
    javascript: WASMLanguage.JavaScript,
    javascriptreact: WASMLanguage.JavaScript,
    jsx: WASMLanguage.JavaScript,
    typescript: WASMLanguage.TypeScript,
    typescriptreact: WASMLanguage.TSX,
    go: WASMLanguage.Go,
    ruby: WASMLanguage.Ruby,
    csharp: WASMLanguage.CSharp,
    java: WASMLanguage.Java,
    php: WASMLanguage.Php,
    c: WASMLanguage.Cpp,
    cpp: WASMLanguage.Cpp,
};
function isSupportedLanguageId(languageId) {
    // Temporarily disable C# support until the tree-sitter parser for it is
    // fully spec-ed.
    return (languageId in languageIdToWasmLanguageMapping &&
        languageId !== 'csharp' &&
        languageId !== 'java' &&
        languageId !== 'php' &&
        languageId !== 'c' &&
        languageId !== 'cpp');
}
function languageIdToWasmLanguage(languageId) {
    if (!(languageId in languageIdToWasmLanguageMapping)) {
        throw new Error(`Unrecognized language: ${languageId}`);
    }
    return languageIdToWasmLanguageMapping[languageId];
}
const languageLoadPromises = new Map();
async function loadWasmLanguage(language) {
    // construct a path that works both for the TypeScript source, which lives under `/src`, and for
    // the transpiled JavaScript, which lives under `/dist`
    let wasmBytes;
    try {
        wasmBytes = await (0, fileLoader_1.readFile)(`tree-sitter-${language}.wasm`);
    }
    catch (e) {
        if (e instanceof Error && 'code' in e && typeof e.code === 'string' && e.name === 'Error') {
            throw new error_1.CopilotPromptLoadFailure(`Could not load tree-sitter-${language}.wasm`, e);
        }
        throw e;
    }
    return web_tree_sitter_1.default.Language.load(wasmBytes);
}
function getLanguage(language) {
    const wasmLanguage = languageIdToWasmLanguage(language);
    if (!languageLoadPromises.has(wasmLanguage)) {
        // IMPORTANT: This function does not have an async signature to prevent interleaved execution
        // that can cause duplicate loading of the same language during yields/awaits prior to them
        // being added to the cache.
        const loadedLang = loadWasmLanguage(wasmLanguage);
        languageLoadPromises.set(wasmLanguage, loadedLang);
    }
    return languageLoadPromises.get(wasmLanguage);
}
class WrappedError extends Error {
    constructor(message, cause) {
        super(message, { cause });
    }
}
// This method returns a tree that the user needs to call `.delete()` before going out of scope.
async function parseTreeSitter(language, source) {
    return (await parseTreeSitterIncludingVersion(language, source))[0];
}
// This method returns a tree that the user needs to call `.delete()` before going out of scope.
async function parseTreeSitterIncludingVersion(language, source) {
    // `Parser.init` needs to be called before `new Parser()` below
    await web_tree_sitter_1.default.init({
        locateFile: (filename) => (0, fileLoader_1.locateFile)(filename),
    });
    let parser;
    try {
        parser = new web_tree_sitter_1.default();
    }
    catch (e) {
        if (e &&
            typeof e === 'object' &&
            'message' in e &&
            typeof e.message === 'string' &&
            e.message.includes('table index is out of bounds')) {
            throw new WrappedError(`Could not init Parse for language <${language}>`, e);
        }
        throw e;
    }
    const treeSitterLanguage = await getLanguage(language);
    parser.setLanguage(treeSitterLanguage);
    const parsedTree = parser.parse(source);
    // Need to delete parser objects directly
    parser.delete();
    return [parsedTree, treeSitterLanguage.version];
}
function getBlockCloseToken(language) {
    const wasmLanguage = languageIdToWasmLanguage(language);
    switch (wasmLanguage) {
        case WASMLanguage.Python:
            return null;
        case WASMLanguage.JavaScript:
        case WASMLanguage.TypeScript:
        case WASMLanguage.TSX:
        case WASMLanguage.Go:
        case WASMLanguage.CSharp:
        case WASMLanguage.Java:
        case WASMLanguage.Php:
        case WASMLanguage.Cpp:
            return '}';
        case WASMLanguage.Ruby:
            return 'end';
    }
}
function innerQuery(queries, root) {
    const matches = [];
    for (const query of queries) {
        // parse and cache query if this is the first time we've used it
        if (!query[1]) {
            const lang = root.tree.getLanguage();
            // cache parsed query object
            query[1] = lang.query(query[0]);
        }
        matches.push(...query[1].matches(root));
    }
    return matches;
}
const docstringQuery = [
    `[
	(class_definition (block (expression_statement (string))))
	(function_definition (block (expression_statement (string))))
]`,
];
function queryPythonIsDocstring(blockNode) {
    return innerQuery([docstringQuery], blockNode).length === 1;
}
//# sourceMappingURL=parse.js.map