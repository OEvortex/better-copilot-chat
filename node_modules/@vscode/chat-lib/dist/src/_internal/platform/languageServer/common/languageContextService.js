"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.NullLanguageContextService = exports.TriggerKind = exports.KnownSources = exports.ContextKind = exports.ILanguageContextService = void 0;
const services_1 = require("../../../util/common/services");
exports.ILanguageContextService = (0, services_1.createServiceIdentifier)('ILanguageContextService');
var ContextKind;
(function (ContextKind) {
    ContextKind["Snippet"] = "snippet";
    ContextKind["Trait"] = "trait";
})(ContextKind || (exports.ContextKind = ContextKind = {}));
var KnownSources;
(function (KnownSources) {
    KnownSources["unknown"] = "unknown";
    KnownSources["sideCar"] = "sideCar";
    KnownSources["completion"] = "completion";
    KnownSources["populateCache"] = "populateCache";
    KnownSources["nes"] = "nes";
    KnownSources["chat"] = "chat";
    KnownSources["fix"] = "fix";
})(KnownSources || (exports.KnownSources = KnownSources = {}));
var TriggerKind;
(function (TriggerKind) {
    TriggerKind["unknown"] = "unknown";
    TriggerKind["selection"] = "selection";
    TriggerKind["completion"] = "completion";
})(TriggerKind || (exports.TriggerKind = TriggerKind = {}));
class EmptyAsyncIterable {
    async *[Symbol.asyncIterator]() {
    }
}
exports.NullLanguageContextService = {
    _serviceBrand: undefined,
    isActivated: async () => false,
    populateCache: async () => { },
    getContext: () => new EmptyAsyncIterable(),
    getContextOnTimeout: () => [],
};
//# sourceMappingURL=languageContextService.js.map