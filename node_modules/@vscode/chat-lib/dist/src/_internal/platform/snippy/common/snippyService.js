"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.NullSnippyService = exports.ISnippyService = void 0;
const services_1 = require("../../../util/common/services");
exports.ISnippyService = (0, services_1.createServiceIdentifier)('ISnippyService');
class NullSnippyService {
    async handlePostInsertion() {
        return;
    }
}
exports.NullSnippyService = NullSnippyService;
//# sourceMappingURL=snippyService.js.map