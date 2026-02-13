"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NullExperimentationService = exports.IExperimentationService = void 0;
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const services_1 = require("../../../util/common/services");
const event_1 = require("../../../util/vs/base/common/event");
exports.IExperimentationService = (0, services_1.createServiceIdentifier)('IExperimentationService');
class NullExperimentationService {
    constructor() {
        this._onDidTreatmentsChange = new event_1.Emitter();
        this.onDidTreatmentsChange = this._onDidTreatmentsChange.event;
    }
    async hasTreatments() { return Promise.resolve(); }
    async hasAccountBasedTreatments() { return Promise.resolve(); }
    getTreatmentVariable(_name) {
        return undefined;
    }
    async setCompletionsFilters(filters) { }
}
exports.NullExperimentationService = NullExperimentationService;
//# sourceMappingURL=nullExperimentationService.js.map