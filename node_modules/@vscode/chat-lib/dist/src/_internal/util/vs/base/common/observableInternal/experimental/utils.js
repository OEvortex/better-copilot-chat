"use strict";
//!!! DO NOT modify, this file was COPIED from 'microsoft/vscode'
Object.defineProperty(exports, "__esModule", { value: true });
exports.latestChangedValue = latestChangedValue;
exports.derivedConstOnceDefined = derivedConstOnceDefined;
const deps_1 = require("../commonFacade/deps");
const debugName_1 = require("../debugName");
const observableFromEvent_1 = require("../observables/observableFromEvent");
const autorun_1 = require("../reactions/autorun");
const utils_1 = require("../utils/utils");
/**
 * Creates an observable that has the latest changed value of the given observables.
 * Initially (and when not observed), it has the value of the last observable.
 * When observed and any of the observables change, it has the value of the last changed observable.
 * If multiple observables change in the same transaction, the last observable wins.
*/
function latestChangedValue(owner, observables) {
    if (observables.length === 0) {
        throw new deps_1.BugIndicatingError();
    }
    let hasLastChangedValue = false;
    let lastChangedValue = undefined;
    const result = (0, observableFromEvent_1.observableFromEvent)(owner, cb => {
        const store = new deps_1.DisposableStore();
        for (const o of observables) {
            store.add((0, autorun_1.autorunOpts)({ debugName: () => (0, debugName_1.getDebugName)(result, new debugName_1.DebugNameData(owner, undefined, undefined)) + '.updateLastChangedValue' }, reader => {
                hasLastChangedValue = true;
                lastChangedValue = o.read(reader);
                cb();
            }));
        }
        store.add({
            dispose() {
                hasLastChangedValue = false;
                lastChangedValue = undefined;
            },
        });
        return store;
    }, () => {
        if (hasLastChangedValue) {
            return lastChangedValue;
        }
        else {
            return observables[observables.length - 1].get();
        }
    });
    return result;
}
/**
 * Works like a derived.
 * However, if the value is not undefined, it is cached and will not be recomputed anymore.
 * In that case, the derived will unsubscribe from its dependencies.
*/
function derivedConstOnceDefined(owner, fn) {
    return (0, utils_1.derivedObservableWithCache)(owner, (reader, lastValue) => lastValue ?? fn(reader));
}
//# sourceMappingURL=utils.js.map