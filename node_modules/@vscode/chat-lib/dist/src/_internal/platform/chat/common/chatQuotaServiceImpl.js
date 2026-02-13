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
exports.ChatQuotaService = void 0;
const lifecycle_1 = require("../../../util/vs/base/common/lifecycle");
const authentication_1 = require("../../authentication/common/authentication");
let ChatQuotaService = class ChatQuotaService extends lifecycle_1.Disposable {
    constructor(_authService) {
        super();
        this._authService = _authService;
        this._register(this._authService.onDidAuthenticationChange(() => {
            this.processUserInfoQuotaSnapshot(this._authService.copilotToken?.quotaInfo);
        }));
    }
    get quotaExhausted() {
        if (!this._quotaInfo) {
            return false;
        }
        return this._quotaInfo.used >= this._quotaInfo.quota && !this._quotaInfo.overageEnabled && !this._quotaInfo.unlimited;
    }
    get overagesEnabled() {
        if (!this._quotaInfo) {
            return false;
        }
        return this._quotaInfo.overageEnabled;
    }
    clearQuota() {
        this._quotaInfo = undefined;
    }
    processQuotaHeaders(headers) {
        const quotaHeader = this._authService.copilotToken?.isFreeUser ? headers.get('x-quota-snapshot-chat') : headers.get('x-quota-snapshot-premium_models') || headers.get('x-quota-snapshot-premium_interactions');
        if (!quotaHeader) {
            return;
        }
        try {
            // Parse URL encoded string into key-value pairs
            const params = new URLSearchParams(quotaHeader);
            // Extract values with fallbacks to ensure type safety
            const entitlement = parseInt(params.get('ent') || '0', 10);
            const overageUsed = parseFloat(params.get('ov') || '0.0');
            const overageEnabled = params.get('ovPerm') === 'true';
            const percentRemaining = parseFloat(params.get('rem') || '0.0');
            const resetDateString = params.get('rst');
            let resetDate;
            if (resetDateString) {
                resetDate = new Date(resetDateString);
            }
            else {
                // Default to one month from now if not provided
                resetDate = new Date();
                resetDate.setMonth(resetDate.getMonth() + 1);
            }
            // Calculate used based on entitlement and remaining
            const used = Math.max(0, entitlement * (1 - percentRemaining / 100));
            // Update quota info
            this._quotaInfo = {
                quota: entitlement,
                unlimited: entitlement === -1,
                used,
                overageUsed,
                overageEnabled,
                resetDate
            };
        }
        catch (error) {
            console.error('Failed to parse quota header', error);
        }
    }
    processUserInfoQuotaSnapshot(quotaInfo) {
        if (!quotaInfo || !quotaInfo.quota_snapshots || !quotaInfo.quota_reset_date) {
            return;
        }
        this._quotaInfo = {
            unlimited: quotaInfo.quota_snapshots.premium_interactions.unlimited,
            overageEnabled: quotaInfo.quota_snapshots.premium_interactions.overage_permitted,
            overageUsed: quotaInfo.quota_snapshots.premium_interactions.overage_count,
            quota: quotaInfo.quota_snapshots.premium_interactions.entitlement,
            resetDate: new Date(quotaInfo.quota_reset_date),
            used: Math.max(0, quotaInfo.quota_snapshots.premium_interactions.entitlement * (1 - quotaInfo.quota_snapshots.premium_interactions.percent_remaining / 100)),
        };
    }
};
exports.ChatQuotaService = ChatQuotaService;
exports.ChatQuotaService = ChatQuotaService = __decorate([
    __param(0, authentication_1.IAuthenticationService)
], ChatQuotaService);
//# sourceMappingURL=chatQuotaServiceImpl.js.map