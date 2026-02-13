"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenErrorNotificationId = exports.CopilotToken = void 0;
exports.containsInternalOrg = containsInternalOrg;
/**
 * A function used to determine if the org list contains an internal organization
 * @param orgList The list of organizations the user is a member of
 * Whether or not it contains an internal org
 */
function containsInternalOrg(orgList) {
    return containsGitHubOrg(orgList) || containsMicrosoftOrg(orgList);
}
/**
 * A function used to determine if the org list contains a GitHub organization
 * @param orgList The list of organizations the user is a member of
 * Whether or not it contains a GitHub org
 */
function containsGitHubOrg(orgList) {
    const GITHUB_ORGANIZATIONS = ['4535c7beffc844b46bb1ed4aa04d759a'];
    // Check if the user is part of an allowed organization.
    for (const org of orgList) {
        if (GITHUB_ORGANIZATIONS.includes(org)) {
            return true;
        }
    }
    return false;
}
/**
 * A function used to determine if the org list contains a Microsoft organization
 * @param orgList The list of organizations the user is a member of
 * Whether or not it contains a Microsoft org
 */
function containsMicrosoftOrg(orgList) {
    const MICROSOFT_ORGANIZATIONS = ['a5db0bcaae94032fe715fb34a5e4bce2', '7184f66dfcee98cb5f08a1cb936d5225',
        '1cb18ac6eedd49b43d74a1c5beb0b955', 'ea9395b9a9248c05ee6847cbd24355ed'];
    // Check if the user is part of a Microsoft organization.
    for (const org of orgList) {
        if (MICROSOFT_ORGANIZATIONS.includes(org)) {
            return true;
        }
    }
    return false;
}
class CopilotToken {
    constructor(_info) {
        this._info = _info;
        this.tokenMap = this.parseToken(_info.token);
    }
    parseToken(token) {
        const result = new Map();
        const firstPart = token?.split(':')[0];
        const fields = firstPart?.split(';');
        for (const field of fields) {
            const [key, value] = field.split('=');
            result.set(key, value);
        }
        return result;
    }
    get token() {
        return this._info.token;
    }
    get sku() {
        return this._info.sku;
    }
    /**
     * Evaluates `has_cfi_access?` which is defined as `!has_cfb_access? && !has_cfe_access?`
     * (cfb = copilot for business, cfe = copilot for enterprise).
     * So it's also true for copilot free users.
     */
    get isIndividual() {
        return this._info.individual ?? false;
    }
    get organizationList() {
        return this._info.organization_list || [];
    }
    get enterpriseList() {
        return this._info.enterprise_list || [];
    }
    get endpoints() {
        return this._info.endpoints;
    }
    get isInternal() {
        return containsInternalOrg(this.organizationList);
    }
    get isMicrosoftInternal() {
        return containsMicrosoftOrg(this.organizationList);
    }
    get isGitHubInternal() {
        return containsGitHubOrg(this.organizationList);
    }
    get isFreeUser() {
        return this.sku === 'free_limited_copilot';
    }
    get isNoAuthUser() {
        return this.sku === 'no_auth_limited_copilot';
    }
    get isChatQuotaExceeded() {
        return this.isFreeUser && (this._info.limited_user_quotas?.chat ?? 1) <= 0;
    }
    get isCompletionsQuotaExceeded() {
        return this.isFreeUser && (this._info.limited_user_quotas?.completions ?? 1) <= 0;
    }
    get codeQuoteEnabled() {
        return this._info.code_quote_enabled ?? false;
    }
    get isVscodeTeamMember() {
        return this._info.isVscodeTeamMember;
    }
    get codexAgentEnabled() {
        return this._info.codex_agent_enabled ?? false;
    }
    get copilotPlan() {
        if (this.isFreeUser) {
            return 'free';
        }
        const plan = this._info.copilot_plan;
        switch (plan) {
            case 'individual':
            case 'individual_pro':
            case 'business':
            case 'enterprise':
                return plan;
            default:
                // Default to 'individual' for unexpected values
                return 'individual';
        }
    }
    get quotaInfo() {
        return { quota_snapshots: this._info.quota_snapshots, quota_reset_date: this._info.quota_reset_date };
    }
    get username() {
        return this._info.username;
    }
    isTelemetryEnabled() {
        if (this._isTelemetryEnabled === undefined) {
            this._isTelemetryEnabled = this._info.telemetry === 'enabled';
        }
        return this._isTelemetryEnabled;
    }
    isPublicSuggestionsEnabled() {
        if (this._isPublicSuggestionsEnabled === undefined) {
            this._isPublicSuggestionsEnabled = this._info.public_suggestions === 'enabled';
        }
        return this._isPublicSuggestionsEnabled;
    }
    isChatEnabled() {
        return this._info.chat_enabled ?? false;
    }
    isCopilotIgnoreEnabled() {
        return this._info.copilotignore_enabled ?? false;
    }
    get isCopilotCodeReviewEnabled() {
        return (this.getTokenValue('ccr') === '1');
    }
    isEditorPreviewFeaturesEnabled() {
        // Editor preview features are disabled if the flag is present and set to 0
        return this.getTokenValue('editor_preview_features') !== '0';
    }
    isMcpEnabled() {
        // MCP is disabled if the flag is present and set to 0
        return this.getTokenValue('mcp') !== '0';
    }
    getTokenValue(key) {
        return this.tokenMap.get(key);
    }
    isExpandedClientSideIndexingEnabled() {
        return this._info.blackbird_clientside_indexing === true;
    }
    isFcv1() {
        return this.tokenMap.get('fcv1') === '1';
    }
}
exports.CopilotToken = CopilotToken;
var TokenErrorNotificationId;
(function (TokenErrorNotificationId) {
    TokenErrorNotificationId["EnterPriseManagedUserAccount"] = "enterprise_managed_user_account";
    TokenErrorNotificationId["NotSignedUp"] = "not_signed_up";
    TokenErrorNotificationId["NoCopilotAccess"] = "no_copilot_access";
    TokenErrorNotificationId["SubscriptionEnded"] = "subscription_ended";
    TokenErrorNotificationId["ServerError"] = "server_error";
    TokenErrorNotificationId["FeatureFlagBlocked"] = "feature_flag_blocked";
    TokenErrorNotificationId["SpammyUser"] = "spammy_user";
    TokenErrorNotificationId["CodespacesDemoInactive"] = "codespaces_demo_inactive";
    TokenErrorNotificationId["SnippyNotConfigured"] = "snippy_not_configured";
})(TokenErrorNotificationId || (exports.TokenErrorNotificationId = TokenErrorNotificationId = {}));
//# sourceMappingURL=copilotToken.js.map