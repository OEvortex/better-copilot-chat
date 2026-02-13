"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_PROMPT_ALLOCATION_PERCENT = exports.DEFAULT_SUFFIX_MATCH_THRESHOLD = exports.DEFAULT_NUM_SNIPPETS = exports.DEFAULT_MAX_PROMPT_LENGTH = exports.DEFAULT_MAX_COMPLETION_LENGTH = void 0;
exports.normalizeLanguageId = normalizeLanguageId;
/**
 * Default PromptOptions are defined as constants to ensure the same values are shared
 * between:
 * - the class constructor
 * - the EXP default flags
 */
/** The maximum number of tokens in a completion. */
exports.DEFAULT_MAX_COMPLETION_LENGTH = 500;
/** The maximum number of tokens in a prompt. */
exports.DEFAULT_MAX_PROMPT_LENGTH = 8192 - exports.DEFAULT_MAX_COMPLETION_LENGTH;
/** The maximal number of the final snippets to return. */
exports.DEFAULT_NUM_SNIPPETS = 4;
/**
 * The default threshold for choosing a cached suffix.
 */
exports.DEFAULT_SUFFIX_MATCH_THRESHOLD = 10;
/* The default allocation of the prompt to different components */
exports.DEFAULT_PROMPT_ALLOCATION_PERCENT = {
    prefix: 35,
    suffix: 15,
    stableContext: 35,
    volatileContext: 15,
};
/**
 * A map that normalises common aliases of languageIds.
 */
const languageNormalizationMap = {
    javascriptreact: 'javascript',
    jsx: 'javascript',
    typescriptreact: 'typescript',
    jade: 'pug',
    cshtml: 'razor',
    c: 'cpp',
};
/**
 * Return a normalized form of a language id, by lower casing and combining
 * certain languageId's that are not considered distinct by promptlib.
 */
function normalizeLanguageId(languageId) {
    languageId = languageId.toLowerCase();
    return languageNormalizationMap[languageId] ?? languageId;
}
//# sourceMappingURL=prompt.js.map