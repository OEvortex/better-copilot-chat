"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NoOpCitationManager = exports.ICompletionsCitationManager = void 0;
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const services_1 = require("../../../../../util/common/services");
const lifecycle_1 = require("../../../../../util/vs/base/common/lifecycle");
exports.ICompletionsCitationManager = (0, services_1.createServiceIdentifier)('ICompletionsCitationManager');
class NoOpCitationManager {
    register() { return lifecycle_1.Disposable.None; }
    async handleIPCodeCitation(citation) {
        // Do nothing
    }
}
exports.NoOpCitationManager = NoOpCitationManager;
//# sourceMappingURL=citationManager.js.map