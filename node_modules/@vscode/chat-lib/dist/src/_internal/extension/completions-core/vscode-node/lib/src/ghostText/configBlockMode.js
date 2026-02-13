"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// The following code was moved from config.ts into here to break the cyclic dependencies
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
exports.ConfigBlockModeConfig = exports.ICompletionsBlockModeConfig = void 0;
const services_1 = require("../../../../../../util/common/services");
const instantiation_1 = require("../../../../../../util/vs/platform/instantiation/common/instantiation");
const config_1 = require("../../../../../completions/common/config");
const parse_1 = require("../../../prompt/src/parse");
const config_2 = require("../config");
const featuresService_1 = require("../experiments/featuresService");
const blockTrimmer_1 = require("./blockTrimmer");
const statementTree_1 = require("./statementTree");
exports.ICompletionsBlockModeConfig = (0, services_1.createServiceIdentifier)('ICompletionsBlockModeConfig');
let ConfigBlockModeConfig = class ConfigBlockModeConfig {
    constructor(instantiationService, featuresService) {
        this.instantiationService = instantiationService;
        this.featuresService = featuresService;
    }
    forLanguage(languageId, telemetryData) {
        const overrideBlockMode = this.featuresService.overrideBlockMode(telemetryData);
        if (overrideBlockMode) {
            return toApplicableBlockMode(overrideBlockMode, languageId);
        }
        const progressiveReveal = this.featuresService.enableProgressiveReveal(telemetryData);
        const config = this.instantiationService.invokeFunction(config_2.getConfig, config_2.ConfigKey.AlwaysRequestMultiline);
        if (config ?? progressiveReveal) {
            return toApplicableBlockMode(config_1.BlockMode.MoreMultiline, languageId);
        }
        if (blockTrimmer_1.BlockTrimmer.isTrimmedByDefault(languageId)) {
            return toApplicableBlockMode(config_1.BlockMode.MoreMultiline, languageId);
        }
        // special casing once cancellations based on tree-sitter propagate to
        // the proxy.
        if (languageId === 'ruby') {
            return config_1.BlockMode.Parsing;
        }
        // For existing multiline languages use standard tree-sitter based parsing
        // plus proxy-side trimming
        if ((0, parse_1.isSupportedLanguageId)(languageId)) {
            return config_1.BlockMode.ParsingAndServer;
        }
        return config_1.BlockMode.Server;
    }
};
exports.ConfigBlockModeConfig = ConfigBlockModeConfig;
exports.ConfigBlockModeConfig = ConfigBlockModeConfig = __decorate([
    __param(0, instantiation_1.IInstantiationService),
    __param(1, featuresService_1.ICompletionsFeaturesService)
], ConfigBlockModeConfig);
function blockModeRequiresTreeSitter(blockMode) {
    return [config_1.BlockMode.Parsing, config_1.BlockMode.ParsingAndServer, config_1.BlockMode.MoreMultiline].includes(blockMode);
}
/**
 * Prevents tree-sitter parsing from being applied to languages we don't include
 * parsers for.
 */
function toApplicableBlockMode(blockMode, languageId) {
    if (blockMode === config_1.BlockMode.MoreMultiline && statementTree_1.StatementTree.isSupported(languageId)) {
        return blockMode;
    }
    if (blockModeRequiresTreeSitter(blockMode) && !(0, parse_1.isSupportedLanguageId)(languageId)) {
        return config_1.BlockMode.Server;
    }
    return blockMode;
}
//# sourceMappingURL=configBlockMode.js.map