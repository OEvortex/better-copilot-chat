"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.isScenarioAutomation = exports.AbstractEnvService = exports.INativeEnvService = exports.IEnvService = exports.NameAndVersion = exports.OperatingSystem = void 0;
const services_1 = require("../../../util/common/services");
const process_1 = require("../../../util/vs/base/common/process");
const packagejson_1 = require("./packagejson");
var OperatingSystem;
(function (OperatingSystem) {
    OperatingSystem["Windows"] = "Windows";
    OperatingSystem["Macintosh"] = "Mac";
    OperatingSystem["Linux"] = "Linux";
})(OperatingSystem || (exports.OperatingSystem = OperatingSystem = {}));
class NameAndVersion {
    constructor(name, version) {
        this.name = name;
        this.version = version;
    }
    format() {
        return `${this.name}/${this.version}`;
    }
}
exports.NameAndVersion = NameAndVersion;
exports.IEnvService = (0, services_1.createServiceIdentifier)('IEnvService');
exports.INativeEnvService = (0, services_1.createServiceIdentifier)('INativeEnvService');
class AbstractEnvService {
    /**
     * @returns true if this is a build for end users.
     */
    isProduction() {
        return packagejson_1.isProduction;
    }
    isPreRelease() {
        return packagejson_1.isPreRelease;
    }
    isSimulation() {
        return process_1.env['SIMULATION'] === '1';
    }
    getBuildType() {
        return packagejson_1.packageJson.buildType;
    }
    getVersion() {
        return packagejson_1.packageJson.version;
    }
    getBuild() {
        return packagejson_1.packageJson.build;
    }
    getName() {
        return packagejson_1.packageJson.name;
    }
    getEditorVersionHeaders() {
        return {
            'Editor-Version': this.getEditorInfo().format(),
            'Editor-Plugin-Version': this.getEditorPluginInfo().format(),
        };
    }
}
exports.AbstractEnvService = AbstractEnvService;
// FIXME: This needs to be used in locations where the EnvService is not yet available, so it's
//        not part of the env service itself.
exports.isScenarioAutomation = process_1.env['IS_SCENARIO_AUTOMATION'] === '1';
//# sourceMappingURL=envService.js.map