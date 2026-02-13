"use strict";
//!!! DO NOT modify, this file was COPIED from 'microsoft/vscode'
Object.defineProperty(exports, "__esModule", { value: true });
exports.derived = derived;
exports.derivedWithSetter = derivedWithSetter;
exports.derivedOpts = derivedOpts;
exports.derivedHandleChanges = derivedHandleChanges;
exports.derivedWithStore = derivedWithStore;
exports.derivedDisposable = derivedDisposable;
const deps_1 = require("../commonFacade/deps");
const debugLocation_1 = require("../debugLocation");
const debugName_1 = require("../debugName");
const baseObservable_1 = require("./baseObservable");
const derivedImpl_1 = require("./derivedImpl");
function derived(computeFnOrOwner, computeFn, debugLocation = debugLocation_1.DebugLocation.ofCaller()) {
    if (computeFn !== undefined) {
        return new derivedImpl_1.Derived(new debugName_1.DebugNameData(computeFnOrOwner, undefined, computeFn), computeFn, undefined, undefined, deps_1.strictEquals, debugLocation);
    }
    return new derivedImpl_1.Derived(
    // eslint-disable-next-line local/code-no-any-casts
    new debugName_1.DebugNameData(undefined, undefined, computeFnOrOwner), 
    // eslint-disable-next-line local/code-no-any-casts
    computeFnOrOwner, undefined, undefined, deps_1.strictEquals, debugLocation);
}
function derivedWithSetter(owner, computeFn, setter, debugLocation = debugLocation_1.DebugLocation.ofCaller()) {
    return new derivedImpl_1.DerivedWithSetter(new debugName_1.DebugNameData(owner, undefined, computeFn), computeFn, undefined, undefined, deps_1.strictEquals, setter, debugLocation);
}
function derivedOpts(options, computeFn, debugLocation = debugLocation_1.DebugLocation.ofCaller()) {
    return new derivedImpl_1.Derived(new debugName_1.DebugNameData(options.owner, options.debugName, options.debugReferenceFn), computeFn, undefined, options.onLastObserverRemoved, options.equalsFn ?? deps_1.strictEquals, debugLocation);
}
(0, baseObservable_1._setDerivedOpts)(derivedOpts);
/**
 * Represents an observable that is derived from other observables.
 * The value is only recomputed when absolutely needed.
 *
 * {@link computeFn} should start with a JS Doc using `@description` to name the derived.
 *
 * Use `createEmptyChangeSummary` to create a "change summary" that can collect the changes.
 * Use `handleChange` to add a reported change to the change summary.
 * The compute function is given the last change summary.
 * The change summary is discarded after the compute function was called.
 *
 * @see derived
 */
function derivedHandleChanges(options, computeFn, debugLocation = debugLocation_1.DebugLocation.ofCaller()) {
    return new derivedImpl_1.Derived(new debugName_1.DebugNameData(options.owner, options.debugName, undefined), computeFn, options.changeTracker, undefined, options.equalityComparer ?? deps_1.strictEquals, debugLocation);
}
function derivedWithStore(computeFnOrOwner, computeFnOrUndefined, debugLocation = debugLocation_1.DebugLocation.ofCaller()) {
    let computeFn;
    let owner;
    if (computeFnOrUndefined === undefined) {
        // eslint-disable-next-line local/code-no-any-casts
        computeFn = computeFnOrOwner;
        owner = undefined;
    }
    else {
        owner = computeFnOrOwner;
        // eslint-disable-next-line local/code-no-any-casts
        computeFn = computeFnOrUndefined;
    }
    // Intentionally re-assigned in case an inactive observable is re-used later
    // eslint-disable-next-line local/code-no-potentially-unsafe-disposables
    let store = new deps_1.DisposableStore();
    return new derivedImpl_1.Derived(new debugName_1.DebugNameData(owner, undefined, computeFn), r => {
        if (store.isDisposed) {
            store = new deps_1.DisposableStore();
        }
        else {
            store.clear();
        }
        return computeFn(r, store);
    }, undefined, () => store.dispose(), deps_1.strictEquals, debugLocation);
}
function derivedDisposable(computeFnOrOwner, computeFnOrUndefined, debugLocation = debugLocation_1.DebugLocation.ofCaller()) {
    let computeFn;
    let owner;
    if (computeFnOrUndefined === undefined) {
        // eslint-disable-next-line local/code-no-any-casts
        computeFn = computeFnOrOwner;
        owner = undefined;
    }
    else {
        owner = computeFnOrOwner;
        // eslint-disable-next-line local/code-no-any-casts
        computeFn = computeFnOrUndefined;
    }
    let store = undefined;
    return new derivedImpl_1.Derived(new debugName_1.DebugNameData(owner, undefined, computeFn), r => {
        if (!store) {
            store = new deps_1.DisposableStore();
        }
        else {
            store.clear();
        }
        const result = computeFn(r);
        if (result) {
            store.add(result);
        }
        return result;
    }, undefined, () => {
        if (store) {
            store.dispose();
            store = undefined;
        }
    }, deps_1.strictEquals, debugLocation);
}
//# sourceMappingURL=derived.js.map