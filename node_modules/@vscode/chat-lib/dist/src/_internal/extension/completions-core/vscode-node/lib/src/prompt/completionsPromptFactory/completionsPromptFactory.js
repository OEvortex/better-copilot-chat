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
exports.TestCompletionsPromptFactory = exports.CompletionsPromptFactory = exports.DEFAULT_PROMPT_TIMEOUT = exports.ICompletionsPromptFactoryService = void 0;
const vscode_languageserver_protocol_1 = require("vscode-languageserver-protocol");
const instantiation_1 = require("../../../../../../../util/vs/platform/instantiation/common/instantiation");
const prompt_1 = require("../prompt");
const componentsCompletionsPromptFactory_1 = require("./componentsCompletionsPromptFactory");
const services_1 = require("../../../../../../../util/common/services");
exports.ICompletionsPromptFactoryService = (0, services_1.createServiceIdentifier)('ICompletionsPromptFactoryService');
// This class needs to extend CompletionsPromptFactory since it's set on the context.
class SequentialCompletionsPromptFactory {
    constructor(delegate) {
        this.delegate = delegate;
    }
    async prompt(opts, cancellationToken) {
        this.lastPromise = this.promptAsync(opts, cancellationToken);
        return this.lastPromise;
    }
    async promptAsync(opts, cancellationToken) {
        // Wait for previous request to complete
        await this.lastPromise;
        // Check if request was cancelled while waiting
        if (cancellationToken?.isCancellationRequested) {
            return prompt_1._promptCancelled;
        }
        // Return prompt from delegate catching any errors
        try {
            return await this.delegate.prompt(opts, cancellationToken);
        }
        catch {
            return prompt_1._promptError;
        }
    }
}
// 0.01% of prompt construction time is 1s+. Setting this to 1200ms should be safe.
exports.DEFAULT_PROMPT_TIMEOUT = 1200;
class TimeoutHandlingCompletionsPromptFactory {
    constructor(delegate) {
        this.delegate = delegate;
    }
    async prompt(opts, cancellationToken) {
        const timeoutTokenSource = new vscode_languageserver_protocol_1.CancellationTokenSource();
        const timeoutToken = timeoutTokenSource.token;
        cancellationToken?.onCancellationRequested(() => {
            timeoutTokenSource.cancel();
        });
        return await Promise.race([
            this.delegate.prompt(opts, timeoutToken),
            new Promise(resolve => {
                setTimeout(() => {
                    // Cancel the token when timeout occurs
                    timeoutTokenSource.cancel();
                    resolve(prompt_1._promptTimeout);
                }, exports.DEFAULT_PROMPT_TIMEOUT);
            }),
        ]);
    }
}
let BaseComponentsCompletionsPromptFactory = class BaseComponentsCompletionsPromptFactory {
    constructor(virtualPrompt, ordering, instantiationService) {
        this.delegate = new SequentialCompletionsPromptFactory(new TimeoutHandlingCompletionsPromptFactory(instantiationService.createInstance(componentsCompletionsPromptFactory_1.TestComponentsCompletionsPromptFactory, virtualPrompt, ordering)));
    }
    prompt(opts, cancellationToken) {
        return this.delegate.prompt(opts, cancellationToken);
    }
};
BaseComponentsCompletionsPromptFactory = __decorate([
    __param(2, instantiation_1.IInstantiationService)
], BaseComponentsCompletionsPromptFactory);
let CompletionsPromptFactory = class CompletionsPromptFactory extends BaseComponentsCompletionsPromptFactory {
    constructor(instantiationService) {
        super(undefined, undefined, instantiationService);
    }
};
exports.CompletionsPromptFactory = CompletionsPromptFactory;
exports.CompletionsPromptFactory = CompletionsPromptFactory = __decorate([
    __param(0, instantiation_1.IInstantiationService)
], CompletionsPromptFactory);
class TestCompletionsPromptFactory extends BaseComponentsCompletionsPromptFactory {
}
exports.TestCompletionsPromptFactory = TestCompletionsPromptFactory;
//# sourceMappingURL=completionsPromptFactory.js.map