"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StreamedCompletionSplitter = void 0;
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const instantiation_1 = require("../../../../../../util/vs/platform/instantiation/common/instantiation");
const openai_1 = require("../openai/openai");
const blockTrimmer_1 = require("./blockTrimmer");
class StreamingCompletion {
    constructor(index, documentPrefix) {
        this.index = index;
        this.documentPrefix = documentPrefix;
        this.startOffset = 0;
        this.text = '';
        this.trimCount = 0;
    }
    updateText(text) {
        this.text = text;
    }
    get addedToPrefix() {
        return this.text.substring(0, this.startOffset);
    }
    get effectivePrefix() {
        return this.documentPrefix + this.addedToPrefix;
    }
    get effectiveText() {
        return this.text.substring(this.startOffset);
    }
    get isFirstCompletion() {
        return this.trimCount === 0;
    }
    /**
     * Returns the index of the line ending to use when trimming the completion
     * as a "single line" completion. This allows the completion to begin with
     * a single leading new line as a special case for completing the next line.
     * It supports CRLF and LF line endings. The index is the start of the line
     * terminator. Returns -1 if a suitable line ending was not found.
     */
    get firstNewlineOffset() {
        const matches = [...this.text.matchAll(/\r?\n/g)];
        if (matches.length > 0 && matches[0].index === 0) {
            matches.shift();
        }
        return matches.length > 0 ? matches[0].index : -1;
    }
    trimAt(effectiveOffset) {
        const trimmed = new StreamingCompletion(this.index, this.documentPrefix);
        trimmed.startOffset = this.startOffset;
        trimmed.text = this.text.substring(0, this.startOffset + effectiveOffset);
        trimmed.trimCount = this.trimCount;
        this.startOffset += effectiveOffset;
        this.trimCount++;
        return trimmed;
    }
}
let StreamedCompletionSplitter = class StreamedCompletionSplitter {
    constructor(prefix, languageId, initialSingleLine, trimmerLookahead, cacheFunction, instantiationService) {
        this.prefix = prefix;
        this.languageId = languageId;
        this.initialSingleLine = initialSingleLine;
        this.trimmerLookahead = trimmerLookahead;
        this.cacheFunction = cacheFunction;
        this.instantiationService = instantiationService;
        this.lineLimit = 3;
        this.completions = new Map();
    }
    getFinishedCallback() {
        return async (completionText, delta) => {
            const index = delta.index ?? 0;
            const completion = this.getCompletion(index, completionText);
            // emmulate single line completion when this.initialSingleLine is set
            if (completion.isFirstCompletion && this.initialSingleLine && completion.firstNewlineOffset >= 0) {
                const result = {
                    yieldSolution: true,
                    continueStreaming: true,
                    finishOffset: completion.firstNewlineOffset,
                };
                completion.trimAt(result.finishOffset);
                if (delta.finished) {
                    await this.trimAll(delta, completion);
                }
                return result;
            }
            return delta.finished ? await this.trimAll(delta, completion) : await this.trimOnce(delta, completion);
        };
    }
    getCompletion(index, newText) {
        let completion = this.completions.get(index);
        if (!completion) {
            completion = new StreamingCompletion(index, this.prefix);
            this.completions.set(index, completion);
        }
        completion.updateText(newText);
        return completion;
    }
    async trimOnce(delta, completion) {
        const offset = await this.trim(completion);
        if (offset === undefined) {
            return {
                yieldSolution: false,
                continueStreaming: true,
            };
        }
        if (completion.isFirstCompletion) {
            completion.trimAt(offset);
            return {
                yieldSolution: true,
                continueStreaming: true,
                finishOffset: offset,
            };
        }
        else {
            this.cacheCompletion(delta, completion, offset);
            return {
                yieldSolution: false,
                continueStreaming: true,
            };
        }
    }
    async trimAll(delta, completion) {
        let offset;
        let firstOffset;
        do {
            offset = await this.trim(completion);
            if (completion.isFirstCompletion) {
                firstOffset = offset;
                completion.trimAt(offset ?? completion.effectiveText.length);
            }
            else {
                this.cacheCompletion(delta, completion, offset);
            }
        } while (offset !== undefined);
        if (firstOffset !== undefined) {
            return {
                yieldSolution: true,
                continueStreaming: true,
                finishOffset: firstOffset,
            };
        }
        return {
            yieldSolution: false,
            continueStreaming: true,
        };
    }
    async trim(completion) {
        const trimmer = new blockTrimmer_1.TerseBlockTrimmer(this.languageId, completion.effectivePrefix, completion.effectiveText, this.lineLimit, this.trimmerLookahead);
        return await trimmer.getCompletionTrimOffset();
    }
    cacheCompletion(delta, completion, offset) {
        const trimmed = completion.trimAt(offset ?? completion.effectiveText.length);
        if (trimmed.effectiveText.trim() === '') {
            return;
        }
        const apiChoice = this.instantiationService.invokeFunction(openai_1.convertToAPIChoice, trimmed.effectiveText.trimEnd(), delta.getAPIJsonData(), trimmed.index, delta.requestId, offset !== undefined, delta.telemetryData);
        apiChoice.copilotAnnotations = this.adjustedAnnotations(apiChoice, completion, trimmed);
        apiChoice.generatedChoiceIndex = trimmed.trimCount;
        this.cacheFunction(trimmed.addedToPrefix, apiChoice);
    }
    adjustedAnnotations(choice, fullCompletion, trimmedCompletion) {
        if (choice.copilotAnnotations === undefined) {
            return undefined;
        }
        const newStartOffset = trimmedCompletion.addedToPrefix.length;
        const newEndOffset = newStartOffset + choice.completionText.length;
        // whether the current split choice is at the end of the original choice
        const atEnd = newEndOffset >= fullCompletion.text.length;
        const adjusted = {};
        for (const [name, annotationGroup] of Object.entries(choice.copilotAnnotations)) {
            const adjustedAnnotations = annotationGroup
                .filter(a => {
                return (a.start_offset - newStartOffset < choice.completionText.length &&
                    a.stop_offset - newStartOffset > 0);
            })
                .map(a => {
                const newA = { ...a };
                newA.start_offset -= newStartOffset;
                newA.stop_offset -= newStartOffset;
                if (!atEnd) {
                    newA.stop_offset = Math.min(newA.stop_offset, choice.completionText.length);
                }
                return newA;
            });
            if (adjustedAnnotations.length > 0) {
                adjusted[name] = adjustedAnnotations;
            }
        }
        return Object.keys(adjusted).length > 0 ? adjusted : undefined;
    }
};
exports.StreamedCompletionSplitter = StreamedCompletionSplitter;
exports.StreamedCompletionSplitter = StreamedCompletionSplitter = __decorate([
    __param(5, instantiation_1.IInstantiationService)
], StreamedCompletionSplitter);
//# sourceMappingURL=streamedCompletionSplitter.js.map