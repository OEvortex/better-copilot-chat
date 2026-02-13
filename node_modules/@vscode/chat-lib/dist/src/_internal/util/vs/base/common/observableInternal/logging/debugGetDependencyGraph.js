"use strict";
//!!! DO NOT modify, this file was COPIED from 'microsoft/vscode'
Object.defineProperty(exports, "__esModule", { value: true });
exports.debugGetDependencyGraph = debugGetDependencyGraph;
const derivedImpl_1 = require("../observables/derivedImpl");
const observableFromEvent_1 = require("../observables/observableFromEvent");
const observableValue_1 = require("../observables/observableValue");
const autorunImpl_1 = require("../reactions/autorunImpl");
const consoleObservableLogger_1 = require("./consoleObservableLogger");
function debugGetDependencyGraph(obs, options) {
    const debugNamePostProcessor = options?.debugNamePostProcessor ?? ((str) => str);
    const info = Info.from(obs, debugNamePostProcessor);
    if (!info) {
        return '';
    }
    const alreadyListed = new Set();
    return formatObservableInfo(info, 0, alreadyListed).trim();
}
function formatObservableInfo(info, indentLevel, alreadyListed) {
    const indent = '\t\t'.repeat(indentLevel);
    const lines = [];
    const isAlreadyListed = alreadyListed.has(info.sourceObj);
    if (isAlreadyListed) {
        lines.push(`${indent}* ${info.type} ${info.name} (already listed)`);
        return lines.join('\n');
    }
    alreadyListed.add(info.sourceObj);
    lines.push(`${indent}* ${info.type} ${info.name}:`);
    lines.push(`${indent}  value: ${(0, consoleObservableLogger_1.formatValue)(info.value, 50)}`);
    lines.push(`${indent}  state: ${info.state}`);
    if (info.dependencies.length > 0) {
        lines.push(`${indent}  dependencies:`);
        for (const dep of info.dependencies) {
            lines.push(formatObservableInfo(dep, indentLevel + 1, alreadyListed));
        }
    }
    return lines.join('\n');
}
class Info {
    static from(obs, debugNamePostProcessor) {
        if (obs instanceof autorunImpl_1.AutorunObserver) {
            const state = obs.debugGetState();
            return new Info(obs, debugNamePostProcessor(obs.debugName), 'autorun', undefined, state.stateStr, Array.from(state.dependencies).map(dep => Info.from(dep, debugNamePostProcessor) || Info.unknown(dep)));
        }
        else if (obs instanceof derivedImpl_1.Derived) {
            const state = obs.debugGetState();
            return new Info(obs, debugNamePostProcessor(obs.debugName), 'derived', state.value, state.stateStr, Array.from(state.dependencies).map(dep => Info.from(dep, debugNamePostProcessor) || Info.unknown(dep)));
        }
        else if (obs instanceof observableValue_1.ObservableValue) {
            const state = obs.debugGetState();
            return new Info(obs, debugNamePostProcessor(obs.debugName), 'observableValue', state.value, 'upToDate', []);
        }
        else if (obs instanceof observableFromEvent_1.FromEventObservable) {
            const state = obs.debugGetState();
            return new Info(obs, debugNamePostProcessor(obs.debugName), 'fromEvent', state.value, state.hasValue ? 'upToDate' : 'initial', []);
        }
        return undefined;
    }
    static unknown(obs) {
        return new Info(obs, '(unknown)', 'unknown', undefined, 'unknown', []);
    }
    constructor(sourceObj, name, type, value, state, dependencies) {
        this.sourceObj = sourceObj;
        this.name = name;
        this.type = type;
        this.value = value;
        this.state = state;
        this.dependencies = dependencies;
    }
}
//# sourceMappingURL=debugGetDependencyGraph.js.map