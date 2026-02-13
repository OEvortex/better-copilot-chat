"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.MultilineModelFeatures = exports.PromptFeatures = void 0;
exports.hasComment = hasComment;
exports.requestMultilineScore = requestMultilineScore;
const contextualFilterConstants_1 = require("./contextualFilterConstants");
const multilineModelWeights_1 = require("./multilineModelWeights");
// This comment map is based on the preprocessing used in training data.
// It should not be changed without a corresponding change in model training.
const commentMap = {
    javascript: ['//'],
    typescript: ['//'],
    typescriptreact: ['//'],
    javascriptreact: ['//'],
    vue: ['//', '-->'],
    php: ['//', '#'],
    dart: ['//'],
    go: ['//'],
    cpp: ['//'],
    scss: ['//'],
    csharp: ['//'],
    java: ['//'],
    c: ['//'],
    rust: ['//'],
    python: ['#'],
    markdown: ['#', '-->'],
    css: ['*/'],
};
// This language map is based on the preprocessing used in training data.
// It should not be changed without a corresponding change in model training.
const languageMap = {
    javascript: 1,
    javascriptreact: 2,
    typescript: 3,
    typescriptreact: 4,
    python: 5,
    go: 6,
    ruby: 7,
};
function hasComment(text, lineNumber, language, ignoreEmptyLines = true) {
    let lines = text.split('\n');
    if (ignoreEmptyLines) {
        lines = lines.filter(line => line.trim().length > 0);
    }
    if (Math.abs(lineNumber) > lines.length || lineNumber >= lines.length) {
        return false;
    }
    if (lineNumber < 0) {
        lineNumber = lines.length + lineNumber;
    }
    const line = lines[lineNumber];
    const commentChars = commentMap[language] ?? [];
    return commentChars.some(commentChar => line.includes(commentChar));
}
class PromptFeatures {
    constructor(promptComponentText, language) {
        const [firstLine, lastLine] = this.firstAndLast(promptComponentText);
        const firstAndLastTrimEnd = this.firstAndLast(promptComponentText.trimEnd());
        this.language = language;
        this.length = promptComponentText.length;
        this.firstLineLength = firstLine.length;
        this.lastLineLength = lastLine.length;
        this.lastLineRstripLength = lastLine.trimEnd().length;
        this.lastLineStripLength = lastLine.trim().length;
        this.rstripLength = promptComponentText.trimEnd().length;
        this.stripLength = promptComponentText.trim().length;
        this.rstripLastLineLength = firstAndLastTrimEnd[1].length;
        this.rstripLastLineStripLength = firstAndLastTrimEnd[1].trim().length;
        this.secondToLastLineHasComment = hasComment(promptComponentText, -2, language);
        this.rstripSecondToLastLineHasComment = hasComment(promptComponentText.trimEnd(), -2, language);
        this.prefixEndsWithNewline = promptComponentText.endsWith('\n');
        this.lastChar = promptComponentText.slice(-1);
        this.rstripLastChar = promptComponentText.trimEnd().slice(-1);
        this.firstChar = promptComponentText[0];
        this.lstripFirstChar = promptComponentText.trimStart().slice(0, 1);
    }
    firstAndLast(text) {
        const lines = text.split('\n');
        const numLines = lines.length;
        const firstLine = lines[0];
        let lastLine = lines[numLines - 1];
        if (lastLine === '' && numLines > 1) {
            lastLine = lines[numLines - 2];
        }
        return [firstLine, lastLine];
    }
}
exports.PromptFeatures = PromptFeatures;
class MultilineModelFeatures {
    constructor(prefix, suffix, language) {
        this.language = language;
        this.prefixFeatures = new PromptFeatures(prefix, language);
        this.suffixFeatures = new PromptFeatures(suffix, language);
    }
    constructFeatures() {
        // These features are ordered according to the features used in model training.
        // They should not be reordered or revised without a corresponding change in model training.
        // It is likely that not all of these features are truly necessary. However
        // for now we use the same features used in the model trained by AIP for initial evaluation.
        const numFeatures = new Array(14).fill(0);
        numFeatures[0] = this.prefixFeatures.length;
        numFeatures[1] = this.prefixFeatures.firstLineLength;
        numFeatures[2] = this.prefixFeatures.lastLineLength;
        numFeatures[3] = this.prefixFeatures.lastLineRstripLength;
        numFeatures[4] = this.prefixFeatures.lastLineStripLength;
        numFeatures[5] = this.prefixFeatures.rstripLength;
        numFeatures[6] = this.prefixFeatures.rstripLastLineLength;
        numFeatures[7] = this.prefixFeatures.rstripLastLineStripLength;
        numFeatures[8] = this.suffixFeatures.length;
        numFeatures[9] = this.suffixFeatures.firstLineLength;
        numFeatures[10] = this.suffixFeatures.lastLineLength;
        numFeatures[11] = this.prefixFeatures.secondToLastLineHasComment ? 1 : 0;
        numFeatures[12] = this.prefixFeatures.rstripSecondToLastLineHasComment ? 1 : 0;
        numFeatures[13] = this.prefixFeatures.prefixEndsWithNewline ? 1 : 0;
        const langFeatures = new Array(Object.keys(languageMap).length + 1).fill(0);
        langFeatures[languageMap[this.language] ?? 0] = 1;
        const prefixLastCharFeatures = new Array(Object.keys(contextualFilterConstants_1.contextualFilterCharacterMap).length + 1).fill(0);
        prefixLastCharFeatures[contextualFilterConstants_1.contextualFilterCharacterMap[this.prefixFeatures.lastChar] ?? 0] = 1;
        const prefixRstripLastCharFeatures = new Array(Object.keys(contextualFilterConstants_1.contextualFilterCharacterMap).length + 1).fill(0);
        prefixRstripLastCharFeatures[contextualFilterConstants_1.contextualFilterCharacterMap[this.prefixFeatures.rstripLastChar] ?? 0] = 1;
        const suffixFirstCharFeatures = new Array(Object.keys(contextualFilterConstants_1.contextualFilterCharacterMap).length + 1).fill(0);
        suffixFirstCharFeatures[contextualFilterConstants_1.contextualFilterCharacterMap[this.suffixFeatures.firstChar] ?? 0] = 1;
        const suffixLstripFirstCharFeatures = new Array(Object.keys(contextualFilterConstants_1.contextualFilterCharacterMap).length + 1).fill(0);
        suffixLstripFirstCharFeatures[contextualFilterConstants_1.contextualFilterCharacterMap[this.suffixFeatures.lstripFirstChar] ?? 0] = 1;
        return numFeatures.concat(langFeatures, prefixLastCharFeatures, prefixRstripLastCharFeatures, suffixFirstCharFeatures, suffixLstripFirstCharFeatures);
    }
}
exports.MultilineModelFeatures = MultilineModelFeatures;
function constructMultilineFeatures(prompt, language) {
    return new MultilineModelFeatures(prompt.prefix, prompt.suffix, language);
}
function requestMultilineScore(prompt, language) {
    // Construct features based on the prompt and language
    const features = constructMultilineFeatures(prompt, language).constructFeatures();
    // Return the score from the model which is the value at index 1 of the output array
    const score = (0, multilineModelWeights_1.multilineModelPredict)(features)[1];
    return score;
}
//# sourceMappingURL=multilineModel.js.map