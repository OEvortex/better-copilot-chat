"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.CopilotExtensionStatus = exports.ICompletionsExtensionStatus = void 0;
const services_1 = require("../../../../../util/common/services");
exports.ICompletionsExtensionStatus = (0, services_1.createServiceIdentifier)('ICompletionsExtensionStatus');
class CopilotExtensionStatus {
    constructor(kind = 'Normal', message, busy = false, command) {
        this.kind = kind;
        this.message = message;
        this.busy = busy;
        this.command = command;
    }
}
exports.CopilotExtensionStatus = CopilotExtensionStatus;
//# sourceMappingURL=extensionStatus.js.map