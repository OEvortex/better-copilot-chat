"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.InstantiationServiceBuilder = exports.createServiceIdentifier = void 0;
const instantiation_1 = require("../vs/platform/instantiation/common/instantiation");
Object.defineProperty(exports, "createServiceIdentifier", { enumerable: true, get: function () { return instantiation_1.createDecorator; } });
const instantiationService_1 = require("../vs/platform/instantiation/common/instantiationService");
const serviceCollection_1 = require("../vs/platform/instantiation/common/serviceCollection");
class InstantiationServiceBuilder {
    constructor(entries) {
        this._isSealed = false;
        this._collection = Array.isArray(entries) ? new serviceCollection_1.ServiceCollection(...entries) : entries ?? new serviceCollection_1.ServiceCollection();
    }
    define(id, instance) {
        if (this._isSealed) {
            throw new Error('This accessor is sealed and cannot be modified anymore.');
        }
        this._collection.set(id, instance);
    }
    seal() {
        if (this._isSealed) {
            throw new Error('This accessor is sealed and cannot be seal again anymore.');
        }
        this._isSealed = true;
        return new instantiationService_1.InstantiationService(this._collection, true);
    }
}
exports.InstantiationServiceBuilder = InstantiationServiceBuilder;
//# sourceMappingURL=services.js.map