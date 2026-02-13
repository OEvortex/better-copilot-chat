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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompletionNotifier = exports.ICompletionsNotifierService = void 0;
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const events_1 = __importDefault(require("events"));
const services_1 = require("../../../../../util/common/services");
const completionsTelemetryServiceBridge_1 = require("../../bridge/src/completionsTelemetryServiceBridge");
const src_1 = require("../../types/src");
const telemetry_1 = require("./telemetry");
const promiseQueue_1 = require("./util/promiseQueue");
const requestEventName = 'CompletionRequested';
exports.ICompletionsNotifierService = (0, services_1.createServiceIdentifier)('ICompletionsNotifierService');
let CompletionNotifier = class CompletionNotifier {
    #emitter = new events_1.default();
    constructor(completionsPromiseQueue, completionsTelemetryService) {
        this.completionsPromiseQueue = completionsPromiseQueue;
        this.completionsTelemetryService = completionsTelemetryService;
    }
    notifyRequest(completionState, completionId, telemetryData, cancellationToken, options) {
        return this.#emitter.emit(requestEventName, {
            completionId,
            completionState,
            telemetryData,
            cancellationToken,
            options,
        });
    }
    onRequest(listener) {
        const wrapper = (0, telemetry_1.telemetryCatch)(this.completionsTelemetryService, this.completionsPromiseQueue, listener, `event.${requestEventName}`);
        this.#emitter.on(requestEventName, wrapper);
        return src_1.Disposable.create(() => this.#emitter.off(requestEventName, wrapper));
    }
};
exports.CompletionNotifier = CompletionNotifier;
exports.CompletionNotifier = CompletionNotifier = __decorate([
    __param(0, promiseQueue_1.ICompletionsPromiseQueueService),
    __param(1, completionsTelemetryServiceBridge_1.ICompletionsTelemetryService)
], CompletionNotifier);
//# sourceMappingURL=completionNotifier.js.map