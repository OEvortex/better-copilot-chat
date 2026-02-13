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
exports.TestComponentsCompletionsPromptFactory = exports.ComponentsCompletionsPromptFactory = exports.PromptOrdering = void 0;
exports.isCompletionRequestData = isCompletionRequestData;
const jsx_runtime_1 = require("../../../../prompt/jsx-runtime//jsx-runtime");
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/** @jsxRuntime automatic */
/** @jsxImportSource ../../../../prompt/jsx-runtime/ */
const logger_1 = require("../../logger");
const ignoreService_1 = require("../../../../../../../platform/ignore/common/ignoreService");
const uri_1 = require("../../../../../../../util/vs/base/common/uri");
const instantiation_1 = require("../../../../../../../util/vs/platform/instantiation/common/instantiation");
const completionsTelemetryServiceBridge_1 = require("../../../../bridge/src/completionsTelemetryServiceBridge");
const virtualPrompt_1 = require("../../../../prompt/src/components/virtualPrompt");
const telemetry_1 = require("../../telemetry");
const textDocumentManager_1 = require("../../textDocumentManager");
const codeSnippets_1 = require("../components/codeSnippets");
const completionsContext_1 = require("../components/completionsContext");
const completionsPromptRenderer_1 = require("../components/completionsPromptRenderer");
const contextProviderBridge_1 = require("../components/contextProviderBridge");
const currentFile_1 = require("../components/currentFile");
const marker_1 = require("../components/marker");
const recentEdits_1 = require("../components/recentEdits");
const similarFiles_1 = require("../components/similarFiles");
const splitContextPrompt_1 = require("../components/splitContextPrompt");
const splitContextPromptRenderer_1 = require("../components/splitContextPromptRenderer");
const traits_1 = require("../components/traits");
const contextProviderRegistry_1 = require("../contextProviderRegistry");
const codeSnippets_2 = require("../contextProviders/codeSnippets");
const traits_2 = require("../contextProviders/traits");
const contextProviderStatistics_1 = require("../contextProviderStatistics");
const prompt_1 = require("../prompt");
const recentEditsProvider_1 = require("../recentEdits/recentEditsProvider");
const neighborFiles_1 = require("../similarFiles/neighborFiles");
function isCompletionRequestData(data) {
    if (!data || typeof data !== 'object') {
        return false;
    }
    const req = data;
    // Check document
    if (!req.document) {
        return false;
    }
    // Check position
    if (!req.position) {
        return false;
    }
    if (req.position.line === undefined) {
        return false;
    }
    if (req.position.character === undefined) {
        return false;
    }
    // Check telemetryData
    if (!req.telemetryData) {
        return false;
    }
    return true;
}
var PromptOrdering;
(function (PromptOrdering) {
    PromptOrdering["Default"] = "default";
    PromptOrdering["SplitContext"] = "splitContext";
})(PromptOrdering || (exports.PromptOrdering = PromptOrdering = {}));
const availableDeclarativePrompts = {
    [PromptOrdering.Default]: {
        promptFunction: defaultCompletionsPrompt,
        renderer: completionsPromptRenderer_1.CompletionsPromptRenderer,
    },
    [PromptOrdering.SplitContext]: {
        promptFunction: splitContextPrompt_1.splitContextCompletionsPrompt,
        renderer: splitContextPromptRenderer_1.SplitContextPromptRenderer,
    },
};
// The weights mimic the PromptPriorityList from prompt/src/wishlist.ts
function defaultCompletionsPrompt(accessor) {
    const tdms = accessor.get(textDocumentManager_1.ICompletionsTextDocumentManagerService);
    const instantiationService = accessor.get(instantiation_1.IInstantiationService);
    const recentEditsProvider = accessor.get(recentEditsProvider_1.ICompletionsRecentEditsProviderService);
    return ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsxs)(completionsContext_1.CompletionsContext, { children: [(0, jsx_runtime_1.jsx)(marker_1.DocumentMarker, { tdms: tdms, weight: 0.7 }), (0, jsx_runtime_1.jsx)(traits_1.Traits, { weight: 0.6 }), (0, jsx_runtime_1.jsx)(codeSnippets_1.CodeSnippets, { tdms: tdms, weight: 0.9 }), (0, jsx_runtime_1.jsx)(similarFiles_1.SimilarFiles, { tdms: tdms, instantiationService: instantiationService, weight: 0.8 }), (0, jsx_runtime_1.jsx)(recentEdits_1.RecentEdits, { tdms: tdms, recentEditsProvider: recentEditsProvider, weight: 0.99 })] }), (0, jsx_runtime_1.jsx)(currentFile_1.CurrentFile, { weight: 1 })] }));
}
let BaseComponentsCompletionsPromptFactory = class BaseComponentsCompletionsPromptFactory {
    constructor(virtualPrompt, ordering, instantiationService, completionsTelemetryService, ignoreService, contextProviderBridge, logTarget, contextProviderStatistics) {
        this.instantiationService = instantiationService;
        this.completionsTelemetryService = completionsTelemetryService;
        this.ignoreService = ignoreService;
        this.contextProviderBridge = contextProviderBridge;
        this.logTarget = logTarget;
        this.contextProviderStatistics = contextProviderStatistics;
        this.promptOrdering = ordering ?? PromptOrdering.Default;
        this.virtualPrompt = virtualPrompt ?? new virtualPrompt_1.VirtualPrompt(this.completionsPrompt());
        this.pipe = this.virtualPrompt.createPipe();
        this.renderer = this.getRenderer();
    }
    async prompt(opts, cancellationToken) {
        try {
            return await this.createPromptUnsafe(opts, cancellationToken);
        }
        catch (e) {
            return this.errorPrompt(e);
        }
    }
    async createPromptUnsafe({ completionId, completionState, telemetryData, promptOpts }, cancellationToken) {
        const { maxPromptLength, suffixPercent, suffixMatchThreshold } = this.instantiationService.invokeFunction(prompt_1.getPromptOptions, telemetryData, completionState.textDocument.detectedLanguageId);
        const failFastPrompt = await this.failFastPrompt(completionState.textDocument, completionState.position, suffixPercent, cancellationToken);
        if (failFastPrompt) {
            return failFastPrompt;
        }
        // TODO: Prompt ordering changes are triggered by ExP changes.
        // TODO@benibenj remove this as its always true (except in tests)
        const promptOrdering = promptOpts?.separateContext ? PromptOrdering.SplitContext : PromptOrdering.Default;
        this.setPromptOrdering(promptOrdering);
        const start = performance.now();
        const { traits, codeSnippets, turnOffSimilarFiles, resolvedContextItems } = await this.resolveContext(completionId, completionState, telemetryData, cancellationToken, promptOpts);
        await this.updateComponentData(completionState.textDocument, completionState.position, traits, codeSnippets, telemetryData, turnOffSimilarFiles, maxPromptLength, cancellationToken, promptOpts, suffixMatchThreshold, promptOpts?.tokenizer);
        if (cancellationToken?.isCancellationRequested) {
            return prompt_1._promptCancelled;
        }
        const snapshot = this.virtualPrompt.snapshot(cancellationToken);
        const snapshotStatus = snapshot.status;
        if (snapshotStatus === 'cancelled') {
            return prompt_1._promptCancelled;
        }
        else if (snapshotStatus === 'error') {
            return this.errorPrompt(snapshot.error);
        }
        const rendered = this.renderer.render(snapshot.snapshot, {
            delimiter: '\n',
            tokenizer: promptOpts?.tokenizer,
            promptTokenLimit: maxPromptLength,
            suffixPercent: suffixPercent,
            languageId: completionState.textDocument.detectedLanguageId,
        }, cancellationToken);
        if (rendered.status === 'cancelled') {
            return prompt_1._promptCancelled;
        }
        else if (rendered.status === 'error') {
            return this.errorPrompt(rendered.error);
        }
        const [prefix, trailingWs] = (0, prompt_1.trimLastLine)(rendered.prefix);
        const renderedTrimmed = { ...rendered, prefix };
        let contextProvidersTelemetry = undefined;
        const languageId = completionState.textDocument.detectedLanguageId;
        if (this.instantiationService.invokeFunction(contextProviderRegistry_1.useContextProviderAPI, languageId, telemetryData)) {
            const promptMatcher = (0, contextProviderStatistics_1.componentStatisticsToPromptMatcher)(rendered.metadata.componentStatistics);
            this.contextProviderStatistics
                .getStatisticsForCompletion(completionId)
                .computeMatch(promptMatcher);
            contextProvidersTelemetry = (0, contextProviderRegistry_1.telemetrizeContextItems)(this.contextProviderStatistics, completionId, resolvedContextItems);
            // To support generating context provider metrics of completion in COffE.
            logger_1.logger.debug(this.logTarget, `Context providers telemetry: '${JSON.stringify(contextProvidersTelemetry)}'`);
        }
        const end = performance.now();
        this.resetIfEmpty(rendered);
        return this.successPrompt(renderedTrimmed, end, start, trailingWs, contextProvidersTelemetry);
    }
    async updateComponentData(textDocument, position, traits, codeSnippets, telemetryData, turnOffSimilarFiles, maxPromptLength, cancellationToken, opts = {}, suffixMatchThreshold, tokenizer) {
        const completionRequestData = this.createRequestData(textDocument, position, telemetryData, cancellationToken, opts, maxPromptLength, traits, codeSnippets, turnOffSimilarFiles, suffixMatchThreshold, tokenizer);
        await this.pipe.pump(completionRequestData);
    }
    async resolveContext(completionId, completionState, telemetryData, cancellationToken, opts = {}) {
        let resolvedContextItems = [];
        let traits;
        let codeSnippets;
        let turnOffSimilarFiles = false;
        if (this.instantiationService.invokeFunction(contextProviderRegistry_1.useContextProviderAPI, completionState.textDocument.detectedLanguageId, telemetryData)) {
            resolvedContextItems = await this.contextProviderBridge.resolution(completionId);
            const { textDocument } = completionState;
            // Turn off neighboring files if:
            // - it's not explicitly enabled via EXP flag
            // - there are matched context providers
            const matchedContextItems = resolvedContextItems.filter(contextProviderRegistry_1.matchContextItems);
            if (!this.instantiationService.invokeFunction(similarFilesEnabled, textDocument.detectedLanguageId, matchedContextItems, telemetryData)) {
                turnOffSimilarFiles = true;
            }
            traits = await this.instantiationService.invokeFunction(traits_2.getTraitsFromContextItems, completionId, matchedContextItems);
            void this.instantiationService.invokeFunction(traits_2.ReportTraitsTelemetry, `contextProvider.traits`, traits, textDocument.detectedLanguageId, textDocument.detectedLanguageId, // TextDocumentContext does not have clientLanguageId
            telemetryData);
            codeSnippets = await this.instantiationService.invokeFunction(codeSnippets_2.getCodeSnippetsFromContextItems, completionId, matchedContextItems, textDocument.detectedLanguageId);
        }
        return { traits, codeSnippets, turnOffSimilarFiles, resolvedContextItems };
    }
    async failFastPrompt(textDocument, position, suffixPercent, cancellationToken) {
        if (cancellationToken?.isCancellationRequested) {
            return prompt_1._promptCancelled;
        }
        if (await this.ignoreService.isCopilotIgnored(uri_1.URI.parse(textDocument.uri))) {
            return prompt_1._copilotContentExclusion;
        }
        const eligibleChars = suffixPercent > 0 ? textDocument.getText().length : textDocument.offsetAt(position);
        if (eligibleChars < prompt_1.MIN_PROMPT_CHARS) {
            // Too short context
            return prompt_1._contextTooShort;
        }
    }
    createRequestData(textDocument, position, telemetryData, cancellationToken, opts, maxPromptLength, traits, codeSnippets, turnOffSimilarFiles, suffixMatchThreshold, tokenizer) {
        return {
            document: textDocument,
            position,
            telemetryData,
            cancellationToken,
            data: opts.data,
            traits,
            codeSnippets,
            turnOffSimilarFiles,
            suffixMatchThreshold,
            maxPromptTokens: maxPromptLength,
            tokenizer,
        };
    }
    resetIfEmpty(rendered) {
        if (rendered.prefix.length === 0 && rendered.suffix.length === 0) {
            this.reset();
        }
    }
    successPrompt(rendered, end, start, trailingWs, contextProvidersTelemetry) {
        return {
            type: 'prompt',
            prompt: {
                prefix: rendered.prefix,
                prefixTokens: rendered.prefixTokens,
                suffix: rendered.suffix,
                suffixTokens: rendered.suffixTokens,
                context: rendered.context,
                isFimEnabled: rendered.suffix.length > 0,
            },
            computeTimeMs: end - start,
            trailingWs,
            neighborSource: new Map(),
            metadata: rendered.metadata,
            contextProvidersTelemetry,
        };
    }
    errorPrompt(error) {
        (0, telemetry_1.telemetryException)(this.completionsTelemetryService, error, 'PromptComponents.CompletionsPromptFactory');
        this.reset();
        return prompt_1._promptError;
    }
    reset() {
        this.renderer = this.getRenderer();
        this.virtualPrompt = new virtualPrompt_1.VirtualPrompt(this.completionsPrompt());
        this.pipe = this.virtualPrompt.createPipe();
    }
    setPromptOrdering(ordering) {
        if (this.promptOrdering !== ordering) {
            this.promptOrdering = ordering;
            this.reset();
        }
    }
    completionsPrompt() {
        const promptFunction = availableDeclarativePrompts[this.promptOrdering]?.promptFunction ?? defaultCompletionsPrompt;
        return this.instantiationService.invokeFunction(promptFunction);
    }
    getRenderer() {
        const promptInfo = availableDeclarativePrompts[this.promptOrdering] ?? availableDeclarativePrompts[PromptOrdering.Default];
        return new promptInfo.renderer();
    }
};
BaseComponentsCompletionsPromptFactory = __decorate([
    __param(2, instantiation_1.IInstantiationService),
    __param(3, completionsTelemetryServiceBridge_1.ICompletionsTelemetryService),
    __param(4, ignoreService_1.IIgnoreService),
    __param(5, contextProviderBridge_1.ICompletionsContextProviderBridgeService),
    __param(6, logger_1.ICompletionsLogTargetService),
    __param(7, contextProviderStatistics_1.ICompletionsContextProviderService)
], BaseComponentsCompletionsPromptFactory);
let ComponentsCompletionsPromptFactory = class ComponentsCompletionsPromptFactory extends BaseComponentsCompletionsPromptFactory {
    constructor(instantiationService, completionsTelemetryService, ignoreService, contextProviderBridge, logTarget, contextProviderStatistics) {
        super(undefined, undefined, instantiationService, completionsTelemetryService, ignoreService, contextProviderBridge, logTarget, contextProviderStatistics);
    }
};
exports.ComponentsCompletionsPromptFactory = ComponentsCompletionsPromptFactory;
exports.ComponentsCompletionsPromptFactory = ComponentsCompletionsPromptFactory = __decorate([
    __param(0, instantiation_1.IInstantiationService),
    __param(1, completionsTelemetryServiceBridge_1.ICompletionsTelemetryService),
    __param(2, ignoreService_1.IIgnoreService),
    __param(3, contextProviderBridge_1.ICompletionsContextProviderBridgeService),
    __param(4, logger_1.ICompletionsLogTargetService),
    __param(5, contextProviderStatistics_1.ICompletionsContextProviderService)
], ComponentsCompletionsPromptFactory);
class TestComponentsCompletionsPromptFactory extends BaseComponentsCompletionsPromptFactory {
}
exports.TestComponentsCompletionsPromptFactory = TestComponentsCompletionsPromptFactory;
// Similar files is enabled if:
// - the languageId is C/C++.
// - it's explicitly enabled via EXP flag or config.
// - no code snippets are provided (which includes the case when all providers error).
function similarFilesEnabled(accessor, detectedLanguageId, matchedContextItems, telemetryData) {
    const cppLanguageIds = ['cpp', 'c'];
    const includeNeighboringFiles = (0, neighborFiles_1.isIncludeNeighborFilesActive)(accessor, detectedLanguageId, telemetryData) || cppLanguageIds.includes(detectedLanguageId);
    return (includeNeighboringFiles || !matchedContextItems.some(ci => ci.data.some(item => item.type === 'CodeSnippet')));
}
//# sourceMappingURL=componentsCompletionsPromptFactory.js.map