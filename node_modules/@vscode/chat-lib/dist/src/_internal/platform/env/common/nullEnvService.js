"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.NullNativeEnvService = exports.NullEnvService = void 0;
const uri_1 = require("../../../util/vs/base/common/uri");
const envService_1 = require("./envService");
const packagejson_1 = require("./packagejson");
class NullEnvService extends envService_1.AbstractEnvService {
    constructor() {
        super(...arguments);
        this.language = 'en';
    }
    static { this.Instance = new NullEnvService(); }
    get extensionId() {
        return 'test-extension-id';
    }
    get vscodeVersion() {
        return 'test-version';
    }
    get isActive() {
        return true;
    }
    get sessionId() {
        return 'test-session';
    }
    get machineId() {
        return 'test-machine';
    }
    get devDeviceId() {
        return 'test-dev-device';
    }
    get remoteName() {
        return undefined;
    }
    get uiKind() {
        return 'desktop';
    }
    get uriScheme() {
        return 'code-null';
    }
    get appRoot() {
        return '';
    }
    get shell() {
        return 'zsh';
    }
    get OS() {
        return envService_1.OperatingSystem.Linux;
    }
    getEditorInfo() {
        return new envService_1.NameAndVersion('simulation-tests-editor', packagejson_1.packageJson.engines.vscode.match(/\d+\.\d+/)?.[0] ?? '1.89');
    }
    getEditorPluginInfo() {
        return new envService_1.NameAndVersion('simulation-tests-plugin', '2');
    }
    openExternal(target) {
        return Promise.resolve(false);
    }
}
exports.NullEnvService = NullEnvService;
class NullNativeEnvService extends NullEnvService {
    get userHome() {
        return uri_1.URI.file('/home/testuser');
    }
}
exports.NullNativeEnvService = NullNativeEnvService;
//# sourceMappingURL=nullEnvService.js.map