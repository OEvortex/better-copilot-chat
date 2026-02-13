"use strict";
//!!! DO NOT modify, this file was COPIED from 'microsoft/vscode'
Object.defineProperty(exports, "__esModule", { value: true });
exports.observableValueOpts = observableValueOpts;
const debugName_1 = require("../debugName");
const deps_1 = require("../commonFacade/deps");
const observableValue_1 = require("./observableValue");
const lazyObservableValue_1 = require("./lazyObservableValue");
const debugLocation_1 = require("../debugLocation");
function observableValueOpts(options, initialValue, debugLocation = debugLocation_1.DebugLocation.ofCaller()) {
    if (options.lazy) {
        return new lazyObservableValue_1.LazyObservableValue(new debugName_1.DebugNameData(options.owner, options.debugName, undefined), initialValue, options.equalsFn ?? deps_1.strictEquals, debugLocation);
    }
    return new observableValue_1.ObservableValue(new debugName_1.DebugNameData(options.owner, options.debugName, undefined), initialValue, options.equalsFn ?? deps_1.strictEquals, debugLocation);
}
//# sourceMappingURL=observableValueOpts.js.map