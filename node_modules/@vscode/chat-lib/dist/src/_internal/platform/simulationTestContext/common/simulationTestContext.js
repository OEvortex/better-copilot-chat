"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.NulSimulationTestContext = exports.ISimulationTestContext = void 0;
const services_1 = require("../../../util/common/services");
exports.ISimulationTestContext = (0, services_1.createServiceIdentifier)('ISimulationTestContext');
class NulSimulationTestContext {
    constructor() {
        this.isInSimulationTests = false;
    }
    async writeFile(filename, contents, tag) {
        return '';
    }
}
exports.NulSimulationTestContext = NulSimulationTestContext;
//# sourceMappingURL=simulationTestContext.js.map