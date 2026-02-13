"use strict";
//!!! DO NOT modify, this file was COPIED from 'microsoft/vscode'
Object.defineProperty(exports, "__esModule", { value: true });
exports.DebugLocation = void 0;
var DebugLocation;
(function (DebugLocation) {
    let enabled = false;
    function enable() {
        enabled = true;
    }
    DebugLocation.enable = enable;
    function ofCaller() {
        if (!enabled) {
            return undefined;
        }
        // eslint-disable-next-line local/code-no-any-casts
        const Err = Error; // For the monaco editor checks, which don't have the nodejs types.
        const l = Err.stackTraceLimit;
        Err.stackTraceLimit = 3;
        const stack = new Error().stack;
        Err.stackTraceLimit = l;
        return DebugLocationImpl.fromStack(stack, 2);
    }
    DebugLocation.ofCaller = ofCaller;
})(DebugLocation || (exports.DebugLocation = DebugLocation = {}));
class DebugLocationImpl {
    static fromStack(stack, parentIdx) {
        const lines = stack.split('\n');
        const location = parseLine(lines[parentIdx + 1]);
        if (location) {
            return new DebugLocationImpl(location.fileName, location.line, location.column, location.id);
        }
        else {
            return undefined;
        }
    }
    constructor(fileName, line, column, id) {
        this.fileName = fileName;
        this.line = line;
        this.column = column;
        this.id = id;
    }
}
function parseLine(stackLine) {
    const match = stackLine.match(/\((.*):(\d+):(\d+)\)/);
    if (match) {
        return {
            fileName: match[1],
            line: parseInt(match[2]),
            column: parseInt(match[3]),
            id: stackLine,
        };
    }
    const match2 = stackLine.match(/at ([^\(\)]*):(\d+):(\d+)/);
    if (match2) {
        return {
            fileName: match2[1],
            line: parseInt(match2[2]),
            column: parseInt(match2[3]),
            id: stackLine,
        };
    }
    return undefined;
}
//# sourceMappingURL=debugLocation.js.map