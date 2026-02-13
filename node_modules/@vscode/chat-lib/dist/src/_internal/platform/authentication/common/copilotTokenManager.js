"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.ICopilotTokenManager = void 0;
exports.nowSeconds = nowSeconds;
const services_1 = require("../../../util/common/services");
exports.ICopilotTokenManager = (0, services_1.createServiceIdentifier)('ICopilotTokenManager');
function nowSeconds() {
    return Math.floor(Date.now() / 1000);
}
//# sourceMappingURL=copilotTokenManager.js.map