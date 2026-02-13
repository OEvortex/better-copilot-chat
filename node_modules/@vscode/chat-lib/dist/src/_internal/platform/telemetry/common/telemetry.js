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
exports.TelemetryTrustedValue = exports.ITelemetryService = exports.TelemetryUserConfigImpl = exports.ITelemetryUserConfig = void 0;
exports.multiplexProperties = multiplexProperties;
const services_1 = require("../../../util/common/services");
const copilotTokenStore_1 = require("../../authentication/common/copilotTokenStore");
exports.ITelemetryUserConfig = (0, services_1.createServiceIdentifier)('ITelemetryUserConfig');
let TelemetryUserConfigImpl = class TelemetryUserConfigImpl {
    constructor(trackingId, optedIn, _tokenStore) {
        this._tokenStore = _tokenStore;
        this.trackingId = trackingId;
        this.optedIn = optedIn ?? false;
        this.setupUpdateOnToken();
    }
    setupUpdateOnToken() {
        this._tokenStore.onDidStoreUpdate(() => {
            const token = this._tokenStore.copilotToken;
            if (!token) {
                return;
            }
            const enhancedTelemetry = token.getTokenValue('rt') === '1';
            const trackingId = token.getTokenValue('tid');
            if (trackingId !== undefined) {
                this.trackingId = trackingId;
                this.organizationsList = token.organizationList.toString();
                this.optedIn = enhancedTelemetry;
            }
        });
    }
};
exports.TelemetryUserConfigImpl = TelemetryUserConfigImpl;
exports.TelemetryUserConfigImpl = TelemetryUserConfigImpl = __decorate([
    __param(2, copilotTokenStore_1.ICopilotTokenStore)
], TelemetryUserConfigImpl);
exports.ITelemetryService = (0, services_1.createServiceIdentifier)('ITelemetryService');
/**
 * Borrowed from https://github.com/microsoft/vscode/blob/9e560ad042bbc97e98f241f58cd08ddde0458a30/src/vs/platform/telemetry/common/telemetryUtils.ts#L21-L25
 * Used as an API type in the vscode.d.ts as well to indicate properties that are exempt from cleaning.
 */
class TelemetryTrustedValue {
    constructor(value) {
        this.value = value;
        // This is merely used as an identifier as the instance will be lost during serialization over the exthost
        this.isTrustedTelemetryValue = true;
    }
}
exports.TelemetryTrustedValue = TelemetryTrustedValue;
// From Copilot extension.
const MAX_PROPERTY_LENGTH = 8192;
const MAX_CONCATENATED_PROPERTIES = 50; // 50 properties of 8192 characters each is 409600 characters.
function multiplexProperties(properties) {
    const newProperties = { ...properties };
    for (const key in properties) {
        const value = properties[key];
        // Test the length of value
        let remainingValueCharactersLength = value?.length ?? 0;
        if (remainingValueCharactersLength > MAX_PROPERTY_LENGTH) {
            let lastStartIndex = 0;
            let newPropertiesCount = 0;
            while (remainingValueCharactersLength > 0 && newPropertiesCount < MAX_CONCATENATED_PROPERTIES) {
                newPropertiesCount += 1;
                let propertyName = key;
                if (newPropertiesCount > 1) {
                    propertyName = key + '_' + (newPropertiesCount < 10 ? '0' : '') + newPropertiesCount;
                }
                let offsetIndex = lastStartIndex + MAX_PROPERTY_LENGTH;
                if (remainingValueCharactersLength < MAX_PROPERTY_LENGTH) {
                    offsetIndex = lastStartIndex + remainingValueCharactersLength;
                }
                newProperties[propertyName] = value.slice(lastStartIndex, offsetIndex);
                remainingValueCharactersLength -= MAX_PROPERTY_LENGTH;
                lastStartIndex += MAX_PROPERTY_LENGTH;
            }
        }
    }
    return newProperties;
}
//# sourceMappingURL=telemetry.js.map