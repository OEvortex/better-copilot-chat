"use strict";
//!!! DO NOT modify, this file was COPIED from 'microsoft/vscode'
Object.defineProperty(exports, "__esModule", { value: true });
exports.autorun = autorun;
exports.autorunOpts = autorunOpts;
exports.autorunHandleChanges = autorunHandleChanges;
exports.autorunWithStoreHandleChanges = autorunWithStoreHandleChanges;
exports.autorunWithStore = autorunWithStore;
exports.autorunDelta = autorunDelta;
exports.autorunIterableDelta = autorunIterableDelta;
exports.autorunSelfDisposable = autorunSelfDisposable;
const deps_1 = require("../commonFacade/deps");
const debugName_1 = require("../debugName");
const autorunImpl_1 = require("./autorunImpl");
const debugLocation_1 = require("../debugLocation");
/**
 * Runs immediately and whenever a transaction ends and an observed observable changed.
 * {@link fn} should start with a JS Doc using `@description` to name the autorun.
 */
function autorun(fn, debugLocation = debugLocation_1.DebugLocation.ofCaller()) {
    return new autorunImpl_1.AutorunObserver(new debugName_1.DebugNameData(undefined, undefined, fn), fn, undefined, debugLocation);
}
/**
 * Runs immediately and whenever a transaction ends and an observed observable changed.
 * {@link fn} should start with a JS Doc using `@description` to name the autorun.
 */
function autorunOpts(options, fn, debugLocation = debugLocation_1.DebugLocation.ofCaller()) {
    return new autorunImpl_1.AutorunObserver(new debugName_1.DebugNameData(options.owner, options.debugName, options.debugReferenceFn ?? fn), fn, undefined, debugLocation);
}
/**
 * Runs immediately and whenever a transaction ends and an observed observable changed.
 * {@link fn} should start with a JS Doc using `@description` to name the autorun.
 *
 * Use `changeTracker.createChangeSummary` to create a "change summary" that can collect the changes.
 * Use `changeTracker.handleChange` to add a reported change to the change summary.
 * The run function is given the last change summary.
 * The change summary is discarded after the run function was called.
 *
 * @see autorun
 */
function autorunHandleChanges(options, fn, debugLocation = debugLocation_1.DebugLocation.ofCaller()) {
    return new autorunImpl_1.AutorunObserver(new debugName_1.DebugNameData(options.owner, options.debugName, options.debugReferenceFn ?? fn), fn, options.changeTracker, debugLocation);
}
/**
 * @see autorunHandleChanges (but with a disposable store that is cleared before the next run or on dispose)
 */
function autorunWithStoreHandleChanges(options, fn) {
    const store = new deps_1.DisposableStore();
    const disposable = autorunHandleChanges({
        owner: options.owner,
        debugName: options.debugName,
        debugReferenceFn: options.debugReferenceFn ?? fn,
        changeTracker: options.changeTracker,
    }, (reader, changeSummary) => {
        store.clear();
        fn(reader, changeSummary, store);
    });
    return (0, deps_1.toDisposable)(() => {
        disposable.dispose();
        store.dispose();
    });
}
/**
 * @see autorun (but with a disposable store that is cleared before the next run or on dispose)
 *
 * @deprecated Use `autorun(reader => { reader.store.add(...) })` instead!
 */
function autorunWithStore(fn) {
    const store = new deps_1.DisposableStore();
    const disposable = autorunOpts({
        owner: undefined,
        debugName: undefined,
        debugReferenceFn: fn,
    }, reader => {
        store.clear();
        fn(reader, store);
    });
    return (0, deps_1.toDisposable)(() => {
        disposable.dispose();
        store.dispose();
    });
}
function autorunDelta(observable, handler) {
    let _lastValue;
    return autorunOpts({ debugReferenceFn: handler }, (reader) => {
        const newValue = observable.read(reader);
        const lastValue = _lastValue;
        _lastValue = newValue;
        handler({ lastValue, newValue });
    });
}
function autorunIterableDelta(getValue, handler, getUniqueIdentifier = v => v) {
    const lastValues = new Map();
    return autorunOpts({ debugReferenceFn: getValue }, (reader) => {
        const newValues = new Map();
        const removedValues = new Map(lastValues);
        for (const value of getValue(reader)) {
            const id = getUniqueIdentifier(value);
            if (lastValues.has(id)) {
                removedValues.delete(id);
            }
            else {
                newValues.set(id, value);
                lastValues.set(id, value);
            }
        }
        for (const id of removedValues.keys()) {
            lastValues.delete(id);
        }
        if (newValues.size || removedValues.size) {
            handler({ addedValues: [...newValues.values()], removedValues: [...removedValues.values()] });
        }
    });
}
/**
 * An autorun with a `dispose()` method on its `reader` which cancels the autorun.
 * It it safe to call `dispose()` synchronously.
 */
function autorunSelfDisposable(fn, debugLocation = debugLocation_1.DebugLocation.ofCaller()) {
    let ar;
    let disposed = false;
    // eslint-disable-next-line prefer-const
    ar = autorun(reader => {
        fn({
            delayedStore: reader.delayedStore,
            store: reader.store,
            readObservable: reader.readObservable.bind(reader),
            dispose: () => {
                ar?.dispose();
                disposed = true;
            }
        });
    }, debugLocation);
    if (disposed) {
        ar.dispose();
    }
    return ar;
}
//# sourceMappingURL=autorun.js.map