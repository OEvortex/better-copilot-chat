"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.InteractionService = exports.IInteractionService = void 0;
const services_1 = require("../../../util/common/services");
const uuid_1 = require("../../../util/vs/base/common/uuid");
exports.IInteractionService = (0, services_1.createServiceIdentifier)('IInteractionService');
/**
 * Simple service that tracks an interaction with a chat service
 * This is used for grouping requests to a logical interaction with the UI
 * It is just used for telemetry collection so is not 100% accurate, especially in the case of parallel interactions
 */
class InteractionService {
    constructor() {
        this._interactionId = (0, uuid_1.generateUuid)();
    }
    startInteraction() {
        this._interactionId = (0, uuid_1.generateUuid)();
    }
    get interactionId() {
        return this._interactionId;
    }
}
exports.InteractionService = InteractionService;
//# sourceMappingURL=interactionService.js.map