"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CopilotTokenStore = exports.ICopilotTokenStore = void 0;
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const services_1 = require("../../../util/common/services");
const event_1 = require("../../../util/vs/base/common/event");
const lifecycle_1 = require("../../../util/vs/base/common/lifecycle");
exports.ICopilotTokenStore = (0, services_1.createServiceIdentifier)('ICopilotTokenStore');
class CopilotTokenStore extends lifecycle_1.Disposable {
    constructor() {
        super(...arguments);
        this._onDidStoreUpdate = this._register(new event_1.Emitter());
        this.onDidStoreUpdate = this._onDidStoreUpdate.event;
    }
    get copilotToken() {
        return this._copilotToken;
    }
    set copilotToken(token) {
        const oldToken = this._copilotToken?.token;
        this._copilotToken = token;
        if (oldToken !== token?.token) {
            this._onDidStoreUpdate.fire();
        }
    }
}
exports.CopilotTokenStore = CopilotTokenStore;
//# sourceMappingURL=copilotTokenStore.js.map