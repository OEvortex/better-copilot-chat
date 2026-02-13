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
exports.CompositeRelatedFilesProvider = void 0;
const ignoreService_1 = require("../../../../../../../platform/ignore/common/ignoreService");
const instantiation_1 = require("../../../../../../../util/vs/platform/instantiation/common/instantiation");
const config_1 = require("../../config");
const featuresService_1 = require("../../experiments/featuresService");
const fileSystem_1 = require("../../fileSystem");
const logger_1 = require("../../logger");
const neighborFiles_1 = require("./neighborFiles");
const relatedFiles_1 = require("./relatedFiles");
const cppLanguageIds = ['cpp', 'c', 'cuda-cpp'];
const typescriptLanguageIds = ['typescript', 'javascript', 'typescriptreact', 'javascriptreact'];
const csharpLanguageIds = ['csharp'];
const neighborFileTypeMap = new Map([
    ...cppLanguageIds.map(id => [id, neighborFiles_1.NeighboringFileType.RelatedCpp]),
    ...typescriptLanguageIds.map(id => [id, neighborFiles_1.NeighboringFileType.RelatedTypeScript]),
    ...csharpLanguageIds.map(id => [id, neighborFiles_1.NeighboringFileType.RelatedCSharpRoslyn]),
]);
function getNeighboringFileType(languageId) {
    return neighborFileTypeMap.get(languageId) ?? neighborFiles_1.NeighboringFileType.RelatedOther;
}
let CompositeRelatedFilesProvider = class CompositeRelatedFilesProvider extends relatedFiles_1.RelatedFilesProvider {
    constructor(instantiationService, ignoreService, featuresService, logTarget, fileSystemService) {
        super(instantiationService, ignoreService, logTarget, fileSystemService);
        this.featuresService = featuresService;
        this.providers = new Map();
        this.telemetrySent = false;
        this.reportedUnknownProviders = new Set();
    }
    async getRelatedFilesResponse(docInfo, telemetryData, cancellationToken) {
        const startTime = Date.now();
        const languageId = docInfo.clientLanguageId.toLowerCase();
        const fileType = getNeighboringFileType(languageId);
        if (fileType === neighborFiles_1.NeighboringFileType.RelatedOther && !this.reportedUnknownProviders.has(languageId)) {
            this.reportedUnknownProviders.add(languageId);
            relatedFiles_1.relatedFilesLogger.warn(this.logTarget, `unknown language ${languageId}`);
        }
        this.relatedFilesTelemetry(telemetryData);
        relatedFiles_1.relatedFilesLogger.debug(this.logTarget, `Fetching related files for ${docInfo.uri}`);
        if (!this.isActive(languageId, telemetryData)) {
            relatedFiles_1.relatedFilesLogger.debug(this.logTarget, 'language-server related-files experiment is not active.');
            return relatedFiles_1.EmptyRelatedFilesResponse;
        }
        const languageProviders = this.providers.get(languageId);
        if (!languageProviders) {
            return relatedFiles_1.EmptyRelatedFilesResponse;
        }
        try {
            return this.convert(docInfo.uri, languageProviders, startTime, telemetryData, cancellationToken);
        }
        catch (error) {
            // When the command returns an empty std::optional, we get an Error exception with message:
            // "Received message which is neither a response nor a notification message: {"jsonrpc": "2.0","id": 22}"
            this.relatedFileNonresponseTelemetry(languageId, telemetryData);
            // Return undefined to inform the caller that the command failed.
            return undefined;
        }
    }
    async convert(uri, providers, startTime, telemetryData, token) {
        if (!token) {
            token = {
                isCancellationRequested: false,
                onCancellationRequested: () => ({ dispose() { } }),
            };
        }
        const combined = { entries: [], traits: [] };
        let allProvidersReturnedUndefined = providers.size > 0;
        for (const provider of providers.values()) {
            const response = await provider.callback(uri, { flags: {} }, token);
            if (response) {
                allProvidersReturnedUndefined = false;
                combined.entries.push(...response.entries);
                if (response.traits) {
                    combined.traits.push(...response.traits);
                }
                for (const entry of response.entries) {
                    for (const uri of entry.uris) {
                        relatedFiles_1.relatedFilesLogger.debug(this.logTarget, uri.toString());
                    }
                }
            }
        }
        this.performanceTelemetry(Date.now() - startTime, telemetryData);
        return allProvidersReturnedUndefined ? undefined : combined;
    }
    registerRelatedFilesProvider(extensionId, languageId, provider) {
        const languageProvider = this.providers.get(languageId);
        if (languageProvider) {
            languageProvider.set(extensionId, { extensionId, languageId, callback: provider });
        }
        else {
            this.providers.set(languageId, new Map([[extensionId, { extensionId, languageId, callback: provider }]]));
        }
    }
    unregisterRelatedFilesProvider(extensionId, languageId, callback) {
        const languageProvider = this.providers.get(languageId);
        if (languageProvider) {
            const currentProvider = languageProvider.get(extensionId);
            if (currentProvider && currentProvider.callback === callback) {
                languageProvider.delete(extensionId);
            }
        }
    }
    /**
     * Providers should manage their own telemetry.
     * These four methods are for backward compatibility with the C++ provider.
     */
    isActive(languageId, telemetryData) {
        if (csharpLanguageIds.includes(languageId)) {
            return (this.featuresService.relatedFilesVSCodeCSharp(telemetryData) ||
                this.instantiationService.invokeFunction((config_1.getConfig), config_1.ConfigKey.RelatedFilesVSCodeCSharp));
        }
        else if (typescriptLanguageIds.includes(languageId)) {
            return (this.featuresService.relatedFilesVSCodeTypeScript(telemetryData) ||
                this.instantiationService.invokeFunction((config_1.getConfig), config_1.ConfigKey.RelatedFilesVSCodeTypeScript));
        }
        else if (cppLanguageIds.includes(languageId)) {
            return (this.featuresService.cppHeadersEnableSwitch(telemetryData));
        }
        return (this.featuresService.relatedFilesVSCode(telemetryData) ||
            this.instantiationService.invokeFunction((config_1.getConfig), config_1.ConfigKey.RelatedFilesVSCode));
    }
    relatedFilesTelemetry(telemetryData) { }
    relatedFileNonresponseTelemetry(language, telemetryData) { }
    performanceTelemetry(duration, telemetryData) { }
};
exports.CompositeRelatedFilesProvider = CompositeRelatedFilesProvider;
exports.CompositeRelatedFilesProvider = CompositeRelatedFilesProvider = __decorate([
    __param(0, instantiation_1.IInstantiationService),
    __param(1, ignoreService_1.IIgnoreService),
    __param(2, featuresService_1.ICompletionsFeaturesService),
    __param(3, logger_1.ICompletionsLogTargetService),
    __param(4, fileSystem_1.ICompletionsFileSystemService)
], CompositeRelatedFilesProvider);
//# sourceMappingURL=compositeRelatedFilesProvider.js.map