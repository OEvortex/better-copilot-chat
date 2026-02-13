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
exports.ContextProviderBridge = exports.ICompletionsContextProviderBridgeService = void 0;
const services_1 = require("../../../../../../../util/common/services");
const cache_1 = require("../../helpers/cache");
const contextProviderRegistry_1 = require("../contextProviderRegistry");
exports.ICompletionsContextProviderBridgeService = (0, services_1.createServiceIdentifier)('ICompletionsContextProviderBridgeService');
let ContextProviderBridge = class ContextProviderBridge {
    constructor(contextProviderRegistry) {
        this.contextProviderRegistry = contextProviderRegistry;
        this.scheduledResolutions = new cache_1.LRUCacheMap(25);
    }
    schedule(completionState, completionId, opportunityId, telemetryData, cancellationToken, options) {
        const { textDocument, originalPosition, originalOffset, originalVersion, editsWithPosition } = completionState;
        const resolutionPromise = this.contextProviderRegistry.resolveAllProviders(completionId, opportunityId, {
            uri: textDocument.uri,
            languageId: textDocument.detectedLanguageId,
            version: originalVersion,
            offset: originalOffset,
            position: originalPosition,
            proposedEdits: editsWithPosition.length > 0 ? editsWithPosition : undefined,
        }, telemetryData, cancellationToken, options?.data);
        this.scheduledResolutions.set(completionId, resolutionPromise);
        // intentionally not awaiting to avoid blocking
    }
    async resolution(id) {
        const resolutionPromise = this.scheduledResolutions.get(id);
        if (resolutionPromise) {
            return await resolutionPromise;
        }
        return [];
    }
};
exports.ContextProviderBridge = ContextProviderBridge;
exports.ContextProviderBridge = ContextProviderBridge = __decorate([
    __param(0, contextProviderRegistry_1.ICompletionsContextProviderRegistryService)
], ContextProviderBridge);
//# sourceMappingURL=contextProviderBridge.js.map