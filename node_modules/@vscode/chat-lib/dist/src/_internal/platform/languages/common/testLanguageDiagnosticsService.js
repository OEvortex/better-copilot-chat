"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.TestLanguageDiagnosticsService = void 0;
const event_1 = require("../../../util/vs/base/common/event");
const map_1 = require("../../../util/vs/base/common/map");
const languageDiagnosticsService_1 = require("./languageDiagnosticsService");
class TestLanguageDiagnosticsService extends languageDiagnosticsService_1.AbstractLanguageDiagnosticsService {
    constructor() {
        super(...arguments);
        this.diagnosticsMap = new map_1.ResourceMap();
        this._onDidChangeDiagnostics = new event_1.Emitter();
        this.onDidChangeDiagnostics = this._onDidChangeDiagnostics.event;
    }
    setDiagnostics(resource, diagnostics) {
        this.diagnosticsMap.set(resource, diagnostics);
        this._onDidChangeDiagnostics.fire({ uris: [resource] });
    }
    getDiagnostics(resource) {
        return this.diagnosticsMap.get(resource) || [];
    }
    getAllDiagnostics() {
        return Array.from(this.diagnosticsMap.entries());
    }
}
exports.TestLanguageDiagnosticsService = TestLanguageDiagnosticsService;
//# sourceMappingURL=testLanguageDiagnosticsService.js.map