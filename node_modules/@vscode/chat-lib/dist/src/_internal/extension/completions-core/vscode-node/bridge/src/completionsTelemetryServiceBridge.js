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
exports.CompletionsTelemetryServiceBridge = exports.ICompletionsTelemetryService = void 0;
const telemetry_1 = require("../../../../../platform/telemetry/common/telemetry");
const azureInsightsReporter_1 = require("../../../../../platform/telemetry/node/azureInsightsReporter");
const services_1 = require("../../../../../util/common/services");
const telemetry_2 = require("../../lib/src/telemetry");
exports.ICompletionsTelemetryService = (0, services_1.createServiceIdentifier)('completionsTelemetryService');
let CompletionsTelemetryServiceBridge = class CompletionsTelemetryServiceBridge {
    constructor(telemetryService) {
        this.telemetryService = telemetryService;
        this.reporter = undefined;
        this.enhancedReporter = undefined;
    }
    sendGHTelemetryEvent(eventName, properties, measurements, store) {
        this.telemetryService.sendGHTelemetryEvent((0, azureInsightsReporter_1.wrapEventNameForPrefixRemoval)(`copilot/${eventName}`), properties, measurements);
        this.getSpyReporters(store ?? telemetry_2.TelemetryStore.Standard)?.sendTelemetryEvent(eventName, properties, measurements);
    }
    sendEnhancedGHTelemetryEvent(eventName, properties, measurements, store) {
        this.telemetryService.sendEnhancedGHTelemetryEvent((0, azureInsightsReporter_1.wrapEventNameForPrefixRemoval)(`copilot/${eventName}`), properties, measurements);
        this.getSpyReporters(store ?? telemetry_2.TelemetryStore.Enhanced)?.sendTelemetryEvent(eventName, properties, measurements);
    }
    sendGHTelemetryErrorEvent(eventName, properties, measurements, store) {
        this.telemetryService.sendGHTelemetryErrorEvent((0, azureInsightsReporter_1.wrapEventNameForPrefixRemoval)(`copilot/${eventName}`), properties, measurements);
        this.getSpyReporters(store ?? telemetry_2.TelemetryStore.Enhanced)?.sendTelemetryErrorEvent(eventName, properties, measurements);
    }
    sendGHTelemetryException(maybeError, origin, store) {
        this.telemetryService.sendGHTelemetryException(maybeError, origin);
        if (maybeError instanceof Error) {
            this.getSpyReporters(store ?? telemetry_2.TelemetryStore.Enhanced)?.sendTelemetryException(maybeError, undefined, undefined);
        }
    }
    setSpyReporters(reporter, enhancedReporter) {
        this.reporter = reporter;
        this.enhancedReporter = enhancedReporter;
    }
    clearSpyReporters() {
        this.reporter = undefined;
        this.enhancedReporter = undefined;
    }
    getSpyReporters(store) {
        if (telemetry_2.TelemetryStore.isEnhanced(store)) {
            return this.enhancedReporter;
        }
        else {
            return this.reporter;
        }
    }
};
exports.CompletionsTelemetryServiceBridge = CompletionsTelemetryServiceBridge;
exports.CompletionsTelemetryServiceBridge = CompletionsTelemetryServiceBridge = __decorate([
    __param(0, telemetry_1.ITelemetryService)
], CompletionsTelemetryServiceBridge);
//# sourceMappingURL=completionsTelemetryServiceBridge.js.map