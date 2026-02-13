"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.NullGitExtensionService = void 0;
const event_1 = require("../../../util/vs/base/common/event");
class NullGitExtensionService {
    constructor() {
        this.onDidChange = event_1.Event.None;
        this.extensionAvailable = false;
    }
    getExtensionApi() {
        return undefined;
    }
}
exports.NullGitExtensionService = NullGitExtensionService;
//# sourceMappingURL=nullGitExtensionService.js.map