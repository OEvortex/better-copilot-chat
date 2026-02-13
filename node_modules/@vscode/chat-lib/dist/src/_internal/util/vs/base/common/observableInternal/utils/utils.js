"use strict";
//!!! DO NOT modify, this file was COPIED from 'microsoft/vscode'
Object.defineProperty(exports, "__esModule", { value: true });
exports.KeepAliveObserver = void 0;
exports.observableFromPromise = observableFromPromise;
exports.signalFromObservable = signalFromObservable;
exports.debouncedObservableDeprecated = debouncedObservableDeprecated;
exports.debouncedObservable = debouncedObservable;
exports.wasEventTriggeredRecently = wasEventTriggeredRecently;
exports.keepObserved = keepObserved;
exports.recomputeInitiallyAndOnChange = recomputeInitiallyAndOnChange;
exports.derivedObservableWithCache = derivedObservableWithCache;
exports.derivedObservableWithWritableCache = derivedObservableWithWritableCache;
exports.mapObservableArrayCached = mapObservableArrayCached;
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const autorun_1 = require("../reactions/autorun");
const transaction_1 = require("../transaction");
const observableValue_1 = require("../observables/observableValue");
const deps_1 = require("../commonFacade/deps");
const derived_1 = require("../observables/derived");
const observableFromEvent_1 = require("../observables/observableFromEvent");
const observableSignal_1 = require("../observables/observableSignal");
const baseObservable_1 = require("../observables/baseObservable");
function observableFromPromise(promise) {
    const observable = (0, observableValue_1.observableValue)('promiseValue', {});
    promise.then((value) => {
        observable.set({ value }, undefined);
    });
    return observable;
}
function signalFromObservable(owner, observable) {
    return (0, derived_1.derivedOpts)({
        owner,
        equalsFn: () => false,
    }, reader => {
        observable.read(reader);
    });
}
/**
 * @deprecated Use `debouncedObservable` instead.
 */
function debouncedObservableDeprecated(observable, debounceMs, disposableStore) {
    const debouncedObservable = (0, observableValue_1.observableValue)('debounced', undefined);
    let timeout = undefined;
    disposableStore.add((0, autorun_1.autorun)(reader => {
        /** @description debounce */
        const value = observable.read(reader);
        if (timeout) {
            clearTimeout(timeout);
        }
        timeout = setTimeout(() => {
            (0, transaction_1.transaction)(tx => {
                debouncedObservable.set(value, tx);
            });
        }, debounceMs);
    }));
    return debouncedObservable;
}
/**
 * Creates an observable that debounces the input observable.
 */
function debouncedObservable(observable, debounceMs) {
    let hasValue = false;
    let lastValue;
    let timeout = undefined;
    return (0, observableFromEvent_1.observableFromEvent)(cb => {
        const d = (0, autorun_1.autorun)(reader => {
            const value = observable.read(reader);
            if (!hasValue) {
                hasValue = true;
                lastValue = value;
            }
            else {
                if (timeout) {
                    clearTimeout(timeout);
                }
                timeout = setTimeout(() => {
                    lastValue = value;
                    cb();
                }, debounceMs);
            }
        });
        return {
            dispose() {
                d.dispose();
                hasValue = false;
                lastValue = undefined;
            },
        };
    }, () => {
        if (hasValue) {
            return lastValue;
        }
        else {
            return observable.get();
        }
    });
}
function wasEventTriggeredRecently(event, timeoutMs, disposableStore) {
    const observable = (0, observableValue_1.observableValue)('triggeredRecently', false);
    let timeout = undefined;
    disposableStore.add(event(() => {
        observable.set(true, undefined);
        if (timeout) {
            clearTimeout(timeout);
        }
        timeout = setTimeout(() => {
            observable.set(false, undefined);
        }, timeoutMs);
    }));
    return observable;
}
/**
 * This makes sure the observable is being observed and keeps its cache alive.
 */
function keepObserved(observable) {
    const o = new KeepAliveObserver(false, undefined);
    observable.addObserver(o);
    return (0, deps_1.toDisposable)(() => {
        observable.removeObserver(o);
    });
}
(0, baseObservable_1._setKeepObserved)(keepObserved);
/**
 * This converts the given observable into an autorun.
 */
function recomputeInitiallyAndOnChange(observable, handleValue) {
    const o = new KeepAliveObserver(true, handleValue);
    observable.addObserver(o);
    try {
        o.beginUpdate(observable);
    }
    finally {
        o.endUpdate(observable);
    }
    return (0, deps_1.toDisposable)(() => {
        observable.removeObserver(o);
    });
}
(0, baseObservable_1._setRecomputeInitiallyAndOnChange)(recomputeInitiallyAndOnChange);
class KeepAliveObserver {
    constructor(_forceRecompute, _handleValue) {
        this._forceRecompute = _forceRecompute;
        this._handleValue = _handleValue;
        this._counter = 0;
    }
    beginUpdate(observable) {
        this._counter++;
    }
    endUpdate(observable) {
        if (this._counter === 1 && this._forceRecompute) {
            if (this._handleValue) {
                this._handleValue(observable.get());
            }
            else {
                observable.reportChanges();
            }
        }
        this._counter--;
    }
    handlePossibleChange(observable) {
        // NO OP
    }
    handleChange(observable, change) {
        // NO OP
    }
}
exports.KeepAliveObserver = KeepAliveObserver;
function derivedObservableWithCache(owner, computeFn) {
    let lastValue = undefined;
    const observable = (0, derived_1.derivedOpts)({ owner, debugReferenceFn: computeFn }, reader => {
        lastValue = computeFn(reader, lastValue);
        return lastValue;
    });
    return observable;
}
function derivedObservableWithWritableCache(owner, computeFn) {
    let lastValue = undefined;
    const onChange = (0, observableSignal_1.observableSignal)('derivedObservableWithWritableCache');
    const observable = (0, derived_1.derived)(owner, reader => {
        onChange.read(reader);
        lastValue = computeFn(reader, lastValue);
        return lastValue;
    });
    return Object.assign(observable, {
        clearCache: (tx) => {
            lastValue = undefined;
            onChange.trigger(tx);
        },
        setCache: (newValue, tx) => {
            lastValue = newValue;
            onChange.trigger(tx);
        }
    });
}
/**
 * When the items array changes, referential equal items are not mapped again.
 */
function mapObservableArrayCached(owner, items, map, keySelector) {
    let m = new ArrayMap(map, keySelector);
    const self = (0, derived_1.derivedOpts)({
        debugReferenceFn: map,
        owner,
        onLastObserverRemoved: () => {
            m.dispose();
            m = new ArrayMap(map);
        }
    }, (reader) => {
        m.setItems(items.read(reader));
        return m.getItems();
    });
    return self;
}
class ArrayMap {
    constructor(_map, _keySelector) {
        this._map = _map;
        this._keySelector = _keySelector;
        this._cache = new Map();
        this._items = [];
    }
    dispose() {
        this._cache.forEach(entry => entry.store.dispose());
        this._cache.clear();
    }
    setItems(items) {
        const newItems = [];
        const itemsToRemove = new Set(this._cache.keys());
        for (const item of items) {
            const key = this._keySelector ? this._keySelector(item) : item;
            let entry = this._cache.get(key);
            if (!entry) {
                const store = new deps_1.DisposableStore();
                const out = this._map(item, store);
                entry = { out, store };
                this._cache.set(key, entry);
            }
            else {
                itemsToRemove.delete(key);
            }
            newItems.push(entry.out);
        }
        for (const item of itemsToRemove) {
            const entry = this._cache.get(item);
            entry.store.dispose();
            this._cache.delete(item);
        }
        this._items = newItems;
    }
    getItems() {
        return this._items;
    }
}
//# sourceMappingURL=utils.js.map