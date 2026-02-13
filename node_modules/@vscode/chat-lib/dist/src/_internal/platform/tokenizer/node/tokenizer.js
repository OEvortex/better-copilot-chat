"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
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
exports.TokenizerProvider = exports.BaseTokensPerName = exports.BaseTokensPerMessage = exports.BaseTokensPerCompletion = exports.ITokenizerProvider = void 0;
exports.calculateImageTokenCost = calculateImageTokenCost;
const prompt_tsx_1 = require("@vscode/prompt-tsx");
const cache_1 = require("../../../util/common/cache");
const imageUtils_1 = require("../../../util/common/imageUtils");
const services_1 = require("../../../util/common/services");
const tokenizer_1 = require("../../../util/common/tokenizer");
const worker_1 = require("../../../util/node/worker");
const assert_1 = require("../../../util/vs/base/common/assert");
const lazy_1 = require("../../../util/vs/base/common/lazy");
const lifecycle_1 = require("../../../util/vs/base/common/lifecycle");
const path_1 = require("../../../util/vs/base/common/path");
const telemetry_1 = require("../../telemetry/common/telemetry");
const tikTokenizerImpl_1 = require("./tikTokenizerImpl");
exports.ITokenizerProvider = (0, services_1.createServiceIdentifier)('ITokenizerProvider');
/**
 * BaseTokensPerCompletion is the minimum tokens for a completion request.
 * Replies are primed with <|im_start|>assistant<|message|>, so these tokens represent the
 * special token and the role name.
 */
exports.BaseTokensPerCompletion = 3;
/*
 * Each GPT 3.5 / GPT 4 message comes with 3 tokens per message due to special characters
 */
exports.BaseTokensPerMessage = 3;
/*
 * Since gpt-3.5-turbo-0613 each name costs 1 token
 */
exports.BaseTokensPerName = 1;
let TokenizerProvider = class TokenizerProvider {
    constructor(useWorker, telmetryService) {
        // if we're running from dist, the dictionary is compressed, but if we're  running
        // in e.g. a `spec` file we should load the dictionary using default behavior.
        // todo: cleanup a bit, have an IS_BUILT constant?
        this._cl100kTokenizer = new lazy_1.Lazy(() => new BPETokenizer(useWorker, (0, path_1.join)(__dirname, './cl100k_base.tiktoken'), 'cl100k_base', telmetryService));
        this._o200kTokenizer = new lazy_1.Lazy(() => new BPETokenizer(useWorker, (0, path_1.join)(__dirname, './o200k_base.tiktoken'), 'o200k_base', telmetryService));
    }
    dispose() {
        this._cl100kTokenizer.rawValue?.dispose();
        this._o200kTokenizer.rawValue?.dispose();
    }
    /**
     * Gets a tokenizer for a given model family
     * @param endpoint The endpoint you want to acquire a tokenizer for
     */
    acquireTokenizer(endpoint) {
        switch (endpoint.tokenizer) {
            case tokenizer_1.TokenizerType.CL100K:
                return this._cl100kTokenizer.value;
            case tokenizer_1.TokenizerType.O200K:
                return this._o200kTokenizer.value;
            default:
                throw new Error(`Unknown tokenizer: ${endpoint.tokenizer}`);
        }
    }
};
exports.TokenizerProvider = TokenizerProvider;
exports.TokenizerProvider = TokenizerProvider = __decorate([
    __param(1, telemetry_1.ITelemetryService)
], TokenizerProvider);
let BPETokenizer = class BPETokenizer extends lifecycle_1.Disposable {
    constructor(_useWorker, _tokenFilePath, _encoderName, _telemetryService) {
        super();
        this._useWorker = _useWorker;
        this._tokenFilePath = _tokenFilePath;
        this._encoderName = _encoderName;
        this._telemetryService = _telemetryService;
        /**
         * TikToken has its own cache, but it still does some processing
         * until a cache hit. We can have a much more efficient cache that
         * directly looks up string -> token length
         */
        this._cache = new cache_1.LRUCache(5000);
        this.baseTokensPerMessage = exports.BaseTokensPerMessage;
        this.baseTokensPerName = exports.BaseTokensPerName;
        this.mode = prompt_tsx_1.OutputMode.Raw;
    }
    async countMessagesTokens(messages) {
        let numTokens = exports.BaseTokensPerMessage;
        for (const message of messages) {
            numTokens += await this.countMessageTokens(message);
        }
        return numTokens;
    }
    /**
     * Tokenizes the given text.
     * @param text The text to tokenize.
     * @returns The tokenized text.
     */
    async tokenize(text) {
        return (await this.ensureTokenizer()).encode(text);
    }
    /**
     * Calculates the token length of the given text.
     * @param text The text to calculate the token length for.
     * @returns The number of tokens in the text.
     */
    async tokenLength(text) {
        if (typeof text === 'string') {
            return this._textTokenLength(text);
        }
        switch (text.type) {
            case prompt_tsx_1.Raw.ChatCompletionContentPartKind.Text:
                return this._textTokenLength(text.text);
            case prompt_tsx_1.Raw.ChatCompletionContentPartKind.Opaque:
                return text.tokenUsage || 0;
            case prompt_tsx_1.Raw.ChatCompletionContentPartKind.Image:
                if (text.imageUrl.url.startsWith('data:image/')) {
                    try {
                        return calculateImageTokenCost(text.imageUrl.url, text.imageUrl.detail);
                    }
                    catch {
                        return this._textTokenLength(text.imageUrl.url);
                    }
                }
                return this._textTokenLength(text.imageUrl.url);
            case prompt_tsx_1.Raw.ChatCompletionContentPartKind.CacheBreakpoint:
                return 0;
            default:
                (0, assert_1.assertNever)(text, `unknown content part (${JSON.stringify(text)})`);
        }
    }
    async _textTokenLength(text) {
        if (!text) {
            return 0;
        }
        let cacheValue = this._cache.get(text);
        if (!cacheValue) {
            cacheValue = (await this.tokenize(text)).length;
            this._cache.put(text, cacheValue);
        }
        return cacheValue;
    }
    /**
     * Counts tokens for a single chat message within a completion request.
     *
     * Follows https://github.com/openai/openai-cookbook/blob/main/examples/How_to_count_tokens_with_tiktoken.ipynb for GPT 3.5/4 models.
     *
     * **Note**: The result does not include base tokens for the completion itself.
     */
    async countMessageTokens(message) {
        return this.baseTokensPerMessage + (await this.countMessageObjectTokens((0, prompt_tsx_1.toMode)(prompt_tsx_1.OutputMode.OpenAI, message)));
    }
    async countToolTokens(tools) {
        const baseToolTokens = 16;
        let numTokens = 0;
        if (tools.length) {
            numTokens += baseToolTokens;
        }
        const baseTokensPerTool = 8;
        for (const tool of tools) {
            numTokens += baseTokensPerTool;
            numTokens += await this.countObjectTokens({ name: tool.name, description: tool.description, parameters: tool.inputSchema });
        }
        // This is an estimate, so give a little safety margin
        return Math.floor(numTokens * 1.1);
    }
    async countMessageObjectTokens(obj) {
        let numTokens = 0;
        for (const [key, value] of Object.entries(obj)) {
            if (!value) {
                continue;
            }
            if (typeof value === 'string') {
                numTokens += await this.tokenLength(value);
            }
            else if (value) {
                const casted = value;
                if (casted.type === 'text') {
                    numTokens += await this.tokenLength(casted.text);
                }
                else if (casted.type === 'image_url' && casted.image_url) {
                    if (casted.image_url.url.startsWith('data:image/')) {
                        try {
                            numTokens += calculateImageTokenCost(casted.image_url.url, casted.image_url.detail);
                        }
                        catch {
                            numTokens += await this.tokenLength(casted.image_url.url);
                        }
                    }
                    else {
                        numTokens += await this.tokenLength(casted.image_url.url);
                    }
                }
                else {
                    let newTokens = await this.countMessageObjectTokens(value);
                    if (key === 'tool_calls') {
                        // This is an estimate, not including all of the overhead, so give a little safety margin
                        newTokens = Math.floor(newTokens * 1.5);
                    }
                    numTokens += newTokens;
                }
            }
            if (key === 'name' && value !== undefined) {
                numTokens += this.baseTokensPerName;
            }
        }
        return numTokens;
    }
    async countObjectTokens(obj) {
        let numTokens = 0;
        for (const [key, value] of Object.entries(obj)) {
            if (!value) {
                continue;
            }
            numTokens += await this.tokenLength(key);
            if (typeof value === 'string') {
                numTokens += await this.tokenLength(value);
            }
            else if (value) {
                numTokens += await this.countMessageObjectTokens(value);
            }
        }
        return numTokens;
    }
    ensureTokenizer() {
        this._tokenizer ??= this.doInitTokenizer();
        return this._tokenizer;
    }
    async doInitTokenizer() {
        const useBinaryTokens = (0, path_1.basename)(__dirname) === 'dist';
        if (!this._useWorker) {
            const handle = tikTokenizerImpl_1.TikTokenImpl.instance.init(this._tokenFilePath, this._encoderName, useBinaryTokens);
            const cleanup = (0, lifecycle_1.toDisposable)(() => {
                tikTokenizerImpl_1.TikTokenImpl.instance.destroy(handle);
                this._store.deleteAndLeak(cleanup);
                this._tokenizer = undefined;
            });
            this._store.add(cleanup);
            return {
                encode: async (text, allowedSpecial) => {
                    return tikTokenizerImpl_1.TikTokenImpl.instance.encode(handle, text, allowedSpecial);
                }
            };
        }
        else {
            const workerPath = (0, path_1.join)(__dirname, 'tikTokenizerWorker.js');
            const worker = new worker_1.WorkerWithRpcProxy(workerPath, { name: `TikToken worker (${this._encoderName})` });
            const handle = await worker.proxy.init(this._tokenFilePath, this._encoderName, useBinaryTokens);
            const cleanup = (0, lifecycle_1.toDisposable)(() => {
                worker.terminate();
                this._store.deleteAndLeak(cleanup);
                this._tokenizer = undefined;
            });
            let timeout;
            return {
                encode: (text, allowedSpecial) => {
                    const result = worker.proxy.encode(handle, text, allowedSpecial);
                    clearTimeout(timeout);
                    timeout = setTimeout(() => cleanup.dispose(), 15000);
                    if (Math.random() < 1 / 1000) {
                        worker.proxy.resetStats().then(stats => {
                            /* __GDPR__
                                "tokenizer.stats" : {
                                    "owner": "jrieken",
                                    "comment": "Perf stats about tokenizers",
                                    "callCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "How often tokenize was called" },
                                    "encodeDuration": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Average time encode took" },
                                    "textLength": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Average length of text that got encoded" }
                                }
                            */
                            this._telemetryService.sendMSFTTelemetryEvent('tokenizer.stats', undefined, stats);
                        });
                    }
                    return result;
                }
            };
        }
    }
};
BPETokenizer = __decorate([
    __param(3, telemetry_1.ITelemetryService)
], BPETokenizer);
//#region Image tokenizer helpers
// https://platform.openai.com/docs/guides/vision#calculating-costs
function calculateImageTokenCost(imageUrl, detail) {
    let { width, height } = (0, imageUtils_1.getImageDimensions)(imageUrl);
    if (detail === 'low') {
        return 85;
    }
    // Scale image to fit within a 2048 x 2048 square if necessary.
    if (width > 2048 || height > 2048) {
        const scaleFactor = 2048 / Math.max(width, height);
        width = Math.round(width * scaleFactor);
        height = Math.round(height * scaleFactor);
    }
    const scaleFactor = 768 / Math.min(width, height);
    width = Math.round(width * scaleFactor);
    height = Math.round(height * scaleFactor);
    const tiles = Math.ceil(width / 512) * Math.ceil(height / 512);
    return tiles * 170 + 85;
}
//#endregion
//# sourceMappingURL=tokenizer.js.map