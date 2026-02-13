"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.NullIgnoreService = exports.IIgnoreService = exports.HAS_IGNORED_FILES_MESSAGE = void 0;
exports.filterIngoredResources = filterIngoredResources;
const l10n = __importStar(require("@vscode/l10n"));
const services_1 = require("../../../util/common/services");
exports.HAS_IGNORED_FILES_MESSAGE = l10n.t('\n\n**Note:** Some files were excluded from the context due to content exclusion rules. Click [here](https://docs.github.com/en/copilot/managing-github-copilot-in-your-organization/configuring-content-exclusions-for-github-copilot) to learn more.');
exports.IIgnoreService = (0, services_1.createServiceIdentifier)('IIgnoreService');
class NullIgnoreService {
    static { this.Instance = new NullIgnoreService(); }
    dispose() { }
    get isEnabled() {
        return false;
    }
    get isRegexExclusionsEnabled() {
        return false;
    }
    async init() { }
    async isCopilotIgnored(file) {
        return false;
    }
    async asMinimatchPattern() {
        return undefined;
    }
}
exports.NullIgnoreService = NullIgnoreService;
async function filterIngoredResources(ignoreService, resources) {
    const result = [];
    for (const resource of resources) {
        if (!await ignoreService.isCopilotIgnored(resource)) {
            result.push(resource);
        }
    }
    return result;
}
//# sourceMappingURL=ignoreService.js.map