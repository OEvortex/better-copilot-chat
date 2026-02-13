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
exports.DomainService = void 0;
const event_1 = require("../../../util/vs/base/common/event");
const lifecycle_1 = require("../../../util/vs/base/common/lifecycle");
const copilotTokenStore_1 = require("../../authentication/common/copilotTokenStore");
const configurationService_1 = require("../../configuration/common/configurationService");
const capiClient_1 = require("../common/capiClient");
const EnterpriseURLConfig = 'github-enterprise.uri';
let DomainService = class DomainService extends lifecycle_1.Disposable {
    constructor(_configurationService, _tokenStore, _capiClientService) {
        super();
        this._configurationService = _configurationService;
        this._tokenStore = _tokenStore;
        this._capiClientService = _capiClientService;
        this._onDidChangeDomains = this._register(new event_1.Emitter());
        this.onDidChangeDomains = this._onDidChangeDomains.event;
        this._register(this._configurationService.onDidChangeConfiguration(e => this._onDidConfigChangeHandler(e)));
        this._processCopilotToken(this._tokenStore.copilotToken);
        this._register(this._tokenStore.onDidStoreUpdate(() => this._processCopilotToken(this._tokenStore.copilotToken)));
    }
    _onDidConfigChangeHandler(event) {
        // Updated configs that have to do with GHE Domains
        if (event.affectsConfiguration(`${configurationService_1.CopilotConfigPrefix}.advanced`) ||
            event.affectsConfiguration(EnterpriseURLConfig)) {
            this._processCAPIModuleChange(this._tokenStore.copilotToken);
        }
    }
    _processCAPIModuleChange(token) {
        let capiConfigUrl = this._configurationService.getConfig(configurationService_1.ConfigKey.Shared.DebugOverrideCAPIUrl);
        if (capiConfigUrl && capiConfigUrl.endsWith('/')) {
            capiConfigUrl = capiConfigUrl.slice(0, -1);
        }
        let proxyConfigUrl = this._configurationService.getConfig(configurationService_1.ConfigKey.Shared.DebugOverrideProxyUrl);
        if (proxyConfigUrl) {
            proxyConfigUrl = proxyConfigUrl.replace(/\/$/, '');
        }
        const enterpriseValue = this._configurationService.getConfig(configurationService_1.ConfigKey.Shared.AuthProvider) === configurationService_1.AuthProviderId.GitHubEnterprise ? this._configurationService.getNonExtensionConfig(EnterpriseURLConfig) : undefined;
        const moduleToken = {
            endpoints: {
                api: capiConfigUrl || token?.endpoints?.api,
                proxy: proxyConfigUrl || token?.endpoints?.proxy,
                telemetry: token?.endpoints?.telemetry,
                'origin-tracker': token?.endpoints?.['origin-tracker']
            },
            sku: token?.sku || 'unknown',
        };
        const domainsChanged = this._capiClientService.updateDomains(moduleToken, enterpriseValue);
        if (domainsChanged.capiUrlChanged || domainsChanged.proxyUrlChanged || domainsChanged.telemetryUrlChanged || domainsChanged.dotcomUrlChanged) {
            this._onDidChangeDomains.fire({
                capiUrlChanged: domainsChanged.capiUrlChanged,
                telemetryUrlChanged: domainsChanged.telemetryUrlChanged,
                proxyUrlChanged: domainsChanged.proxyUrlChanged,
                dotcomUrlChanged: domainsChanged.dotcomUrlChanged
            });
        }
    }
    _processCopilotToken(token) {
        this._processCAPIModuleChange(token);
    }
};
exports.DomainService = DomainService;
exports.DomainService = DomainService = __decorate([
    __param(0, configurationService_1.IConfigurationService),
    __param(1, copilotTokenStore_1.ICopilotTokenStore),
    __param(2, capiClient_1.ICAPIClientService)
], DomainService);
//# sourceMappingURL=domainServiceImpl.js.map