"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.RuntimeMode = exports.ICompletionsRuntimeModeService = void 0;
const services_1 = require("../../../../../../util/common/services");
exports.ICompletionsRuntimeModeService = (0, services_1.createServiceIdentifier)('completionsRuntimeModeService');
class RuntimeMode {
    constructor(flags) {
        this.flags = flags;
    }
    static fromEnvironment(isRunningInTest, argv = process.argv, env = process.env) {
        return new RuntimeMode({
            debug: determineDebugFlag(argv, env),
            verboseLogging: determineVerboseLoggingEnabled(argv, env),
            testMode: isRunningInTest,
            simulation: determineSimulationFlag(env),
        });
    }
    isRunningInTest() {
        return this.flags.testMode;
    }
    shouldFailForDebugPurposes() {
        return this.isRunningInTest();
    }
    isDebugEnabled() {
        return this.flags.debug;
    }
    isVerboseLoggingEnabled() {
        return this.flags.verboseLogging;
    }
    isRunningInSimulation() {
        return this.flags.simulation;
    }
}
exports.RuntimeMode = RuntimeMode;
function determineDebugFlag(argv, env) {
    return argv.includes('--debug') || determineEnvFlagEnabled(env, 'DEBUG');
}
function determineSimulationFlag(env) {
    return determineEnvFlagEnabled(env, 'SIMULATION');
}
function determineVerboseLoggingEnabled(argv, env) {
    return (env['COPILOT_AGENT_VERBOSE'] === '1' ||
        env['COPILOT_AGENT_VERBOSE']?.toLowerCase() === 'true' ||
        determineEnvFlagEnabled(env, 'VERBOSE') ||
        determineDebugFlag(argv, env));
}
function determineEnvFlagEnabled(env, name) {
    for (const prefix of ['GH_COPILOT_', 'GITHUB_COPILOT_']) {
        const val = env[`${prefix}${name}`];
        if (val) {
            return val === '1' || val?.toLowerCase() === 'true';
        }
    }
    return false;
}
//# sourceMappingURL=runtimeMode.js.map