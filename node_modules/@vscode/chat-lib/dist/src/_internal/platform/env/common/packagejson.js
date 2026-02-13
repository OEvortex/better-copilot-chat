"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.vscodeEngineVersion = exports.isPreRelease = exports.isProduction = exports.packageJson = void 0;
exports.packageJson = require('../../../../package.json');
exports.isProduction = (exports.packageJson.buildType !== 'dev');
exports.isPreRelease = (exports.packageJson.isPreRelease || !exports.isProduction);
exports.vscodeEngineVersion = exports.packageJson.engines.vscode;
//# sourceMappingURL=packagejson.js.map