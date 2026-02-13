"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_EDIT_DISTANCE_LENGTH = void 0;
exports.CurrentFile = CurrentFile;
exports.BeforeCursor = BeforeCursor;
exports.AfterCursor = AfterCursor;
exports.DocumentPrefix = DocumentPrefix;
exports.DocumentSuffix = DocumentSuffix;
const jsx_runtime_1 = require("../../../../prompt/jsx-runtime//jsx-runtime");
const components_1 = require("../../../../prompt/src/components/components");
const prompt_1 = require("../../../../prompt/src/prompt");
const suffixMatchCriteria_1 = require("../../../../prompt/src/suffixMatchCriteria");
const tokenization_1 = require("../../../../prompt/src/tokenization");
const componentsCompletionsPromptFactory_1 = require("../completionsPromptFactory/componentsCompletionsPromptFactory");
/** The maximum number of tokens that is used for calculate edit distance. */
exports.MAX_EDIT_DISTANCE_LENGTH = 50;
function approximateMaxCharacters(maxPromptLength) {
    const maxCharsInPrompt = maxPromptLength * 4; // approximate 4 chars per token
    const compensation = maxPromptLength * 0.1; // 10% overflow to compensate the token approximation
    return Math.floor(maxCharsInPrompt + compensation);
}
/**
 * A required component for the CompletionsPromptRenderer. It represents the document and position where completions should be shown.
 */
function CurrentFile(_props, context) {
    const [document, setDocument] = context.useState();
    const [position, setPosition] = context.useState();
    const [maxPromptLength, setMaxPromptLength] = context.useState(0);
    const [suffixMatchThreshold, setSuffixMatchThreshold] = context.useState();
    const [tokenizer, setTokenizer] = context.useState();
    context.useData(componentsCompletionsPromptFactory_1.isCompletionRequestData, request => {
        const requestDocument = request.document;
        if (request.document.uri !== document?.uri || requestDocument.getText() !== document?.getText()) {
            setDocument(requestDocument);
        }
        if (request.position !== position) {
            setPosition(request.position);
        }
        if (request.suffixMatchThreshold !== suffixMatchThreshold) {
            setSuffixMatchThreshold(request.suffixMatchThreshold);
        }
        if (request.maxPromptTokens !== maxPromptLength) {
            setMaxPromptLength(request.maxPromptTokens);
        }
        if (request.tokenizer !== tokenizer) {
            setTokenizer(request.tokenizer);
        }
    });
    const maxCharacters = approximateMaxCharacters(maxPromptLength);
    return ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)(BeforeCursor, { document: document, position: position, maxCharacters: maxCharacters }), (0, jsx_runtime_1.jsx)(AfterCursor, { document: document, position: position, suffixMatchThreshold: suffixMatchThreshold, maxCharacters: maxCharacters, tokenizer: tokenizer })] }));
}
function BeforeCursor(props) {
    if (props.document === undefined || props.position === undefined) {
        return (0, jsx_runtime_1.jsx)(components_1.Text, {});
    }
    let text = props.document.getText({ start: { line: 0, character: 0 }, end: props.position });
    if (text.length > props.maxCharacters) {
        text = text.slice(-props.maxCharacters);
    }
    return (0, jsx_runtime_1.jsx)(components_1.Text, { children: text });
}
function AfterCursor(props, context) {
    const [cachedSuffix, setCachedSuffix] = context.useState('');
    if (props.document === undefined || props.position === undefined) {
        return (0, jsx_runtime_1.jsx)(components_1.Text, {});
    }
    let suffix = props.document.getText({
        start: props.position,
        end: { line: Number.MAX_VALUE, character: Number.MAX_VALUE },
    });
    if (suffix.length > props.maxCharacters) {
        suffix = suffix.slice(0, props.maxCharacters);
    }
    // Start the suffix at the beginning of the next line. This allows for consistent reconciliation of trailing punctuation.
    const trimmedSuffix = suffix.replace(/^.*/, '').trimStart();
    if (trimmedSuffix === '') {
        return (0, jsx_runtime_1.jsx)(components_1.Text, {});
    }
    // Cache hit
    if (cachedSuffix === trimmedSuffix) {
        return (0, jsx_runtime_1.jsx)(components_1.Text, { children: cachedSuffix });
    }
    let suffixToUse = trimmedSuffix;
    if (cachedSuffix !== '') {
        const tokenizer = (0, tokenization_1.getTokenizer)(props.tokenizer);
        const firstSuffixTokens = tokenizer.takeFirstTokens(trimmedSuffix, exports.MAX_EDIT_DISTANCE_LENGTH);
        // Check if the suffix is similar to the cached suffix.
        // See docs/suffix_caching.md for some background about why we do this.
        if (firstSuffixTokens.tokens.length > 0) {
            // Calculate the distance between the computed and cached suffixed using Levenshtein distance.
            // Only compare the first MAX_EDIT_DISTANCE_LENGTH tokens to speed up.
            const dist = (0, suffixMatchCriteria_1.findEditDistanceScore)(firstSuffixTokens.tokens, tokenizer.takeFirstTokens(cachedSuffix, exports.MAX_EDIT_DISTANCE_LENGTH).tokens)?.score;
            if (100 * dist <
                (props.suffixMatchThreshold ?? prompt_1.DEFAULT_SUFFIX_MATCH_THRESHOLD) * firstSuffixTokens.tokens.length) {
                suffixToUse = cachedSuffix;
            }
        }
    }
    // Only set the suffix if it's different from the cached one, otherwise we rerender this component all the time
    if (suffixToUse !== cachedSuffix) {
        setCachedSuffix(suffixToUse);
    }
    return (0, jsx_runtime_1.jsx)(components_1.Text, { children: suffixToUse });
}
function DocumentPrefix(_props, context) {
    const [document, setDocument] = context.useState();
    const [position, setPosition] = context.useState();
    const [maxPromptLength, setMaxPromptLength] = context.useState(0);
    context.useData(componentsCompletionsPromptFactory_1.isCompletionRequestData, request => {
        const requestDocument = request.document;
        if (request.document.uri !== document?.uri || requestDocument.getText() !== document?.getText()) {
            setDocument(requestDocument);
        }
        if (request.position !== position) {
            setPosition(request.position);
        }
        if (request.maxPromptTokens !== maxPromptLength) {
            setMaxPromptLength(request.maxPromptTokens);
        }
    });
    const maxCharacters = approximateMaxCharacters(maxPromptLength);
    return (0, jsx_runtime_1.jsx)(BeforeCursor, { document: document, position: position, maxCharacters: maxCharacters });
}
function DocumentSuffix(_props, context) {
    const [document, setDocument] = context.useState();
    const [position, setPosition] = context.useState();
    const [maxPromptLength, setMaxPromptLength] = context.useState(0);
    const [suffixMatchThreshold, setSuffixMatchThreshold] = context.useState();
    const [tokenizer, setTokenizer] = context.useState();
    context.useData(componentsCompletionsPromptFactory_1.isCompletionRequestData, request => {
        const requestDocument = request.document;
        if (request.document.uri !== document?.uri || requestDocument.getText() !== document?.getText()) {
            setDocument(requestDocument);
        }
        if (request.position !== position) {
            setPosition(request.position);
        }
        if (request.suffixMatchThreshold !== suffixMatchThreshold) {
            setSuffixMatchThreshold(request.suffixMatchThreshold);
        }
        if (request.maxPromptTokens !== maxPromptLength) {
            setMaxPromptLength(request.maxPromptTokens);
        }
        if (request.tokenizer !== tokenizer) {
            setTokenizer(request.tokenizer);
        }
    });
    const maxCharacters = approximateMaxCharacters(maxPromptLength);
    return ((0, jsx_runtime_1.jsx)(AfterCursor, { document: document, position: position, suffixMatchThreshold: suffixMatchThreshold, maxCharacters: maxCharacters, tokenizer: tokenizer }));
}
//# sourceMappingURL=currentFile.js.map