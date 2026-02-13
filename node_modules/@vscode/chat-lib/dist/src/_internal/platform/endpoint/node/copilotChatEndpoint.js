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
exports.CopilotChatEndpoint = void 0;
const instantiation_1 = require("../../../util/vs/platform/instantiation/common/instantiation");
const authentication_1 = require("../../authentication/common/authentication");
const chatMLFetcher_1 = require("../../chat/common/chatMLFetcher");
const configurationService_1 = require("../../configuration/common/configurationService");
const envService_1 = require("../../env/common/envService");
const logService_1 = require("../../log/common/logService");
const fetcherService_1 = require("../../networking/common/fetcherService");
const nullExperimentationService_1 = require("../../telemetry/common/nullExperimentationService");
const telemetry_1 = require("../../telemetry/common/telemetry");
const tokenizer_1 = require("../../tokenizer/node/tokenizer");
const capiClient_1 = require("../common/capiClient");
const domainService_1 = require("../common/domainService");
const chatEndpoint_1 = require("./chatEndpoint");
let CopilotChatEndpoint = class CopilotChatEndpoint extends chatEndpoint_1.ChatEndpoint {
    constructor(modelMetadata, domainService, capiClientService, fetcherService, envService, telemetryService, authService, chatMLFetcher, tokenizerProvider, instantiationService, configurationService, experimentService, logService) {
        super(modelMetadata, domainService, capiClientService, fetcherService, telemetryService, authService, chatMLFetcher, tokenizerProvider, instantiationService, configurationService, experimentService, logService);
    }
    getCompletionsCallback() {
        return (out, data) => {
            if (data && data.id) {
                out.reasoning_opaque = data.id;
                out.reasoning_text = Array.isArray(data.text) ? data.text.join('') : data.text;
            }
        };
    }
};
exports.CopilotChatEndpoint = CopilotChatEndpoint;
exports.CopilotChatEndpoint = CopilotChatEndpoint = __decorate([
    __param(1, domainService_1.IDomainService),
    __param(2, capiClient_1.ICAPIClientService),
    __param(3, fetcherService_1.IFetcherService),
    __param(4, envService_1.IEnvService),
    __param(5, telemetry_1.ITelemetryService),
    __param(6, authentication_1.IAuthenticationService),
    __param(7, chatMLFetcher_1.IChatMLFetcher),
    __param(8, tokenizer_1.ITokenizerProvider),
    __param(9, instantiation_1.IInstantiationService),
    __param(10, configurationService_1.IConfigurationService),
    __param(11, nullExperimentationService_1.IExperimentationService),
    __param(12, logService_1.ILogService)
], CopilotChatEndpoint);
//# sourceMappingURL=copilotChatEndpoint.js.map