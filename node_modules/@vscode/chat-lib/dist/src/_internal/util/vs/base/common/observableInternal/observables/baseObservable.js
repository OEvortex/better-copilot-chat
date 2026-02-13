"use strict";
//!!! DO NOT modify, this file was COPIED from 'microsoft/vscode'
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseObservable = exports.ConvenientObservable = void 0;
exports._setDerivedOpts = _setDerivedOpts;
exports._setRecomputeInitiallyAndOnChange = _setRecomputeInitiallyAndOnChange;
exports._setKeepObserved = _setKeepObserved;
exports._setDebugGetDependencyGraph = _setDebugGetDependencyGraph;
const debugLocation_1 = require("../debugLocation");
const debugName_1 = require("../debugName");
const logging_1 = require("../logging/logging");
let _derived;
/**
 * @internal
 * This is to allow splitting files.
*/
function _setDerivedOpts(derived) {
    _derived = derived;
}
let _recomputeInitiallyAndOnChange;
function _setRecomputeInitiallyAndOnChange(recomputeInitiallyAndOnChange) {
    _recomputeInitiallyAndOnChange = recomputeInitiallyAndOnChange;
}
let _keepObserved;
function _setKeepObserved(keepObserved) {
    _keepObserved = keepObserved;
}
let _debugGetDependencyGraph;
function _setDebugGetDependencyGraph(debugGetDependencyGraph) {
    _debugGetDependencyGraph = debugGetDependencyGraph;
}
class ConvenientObservable {
    get TChange() { return null; }
    reportChanges() {
        this.get();
    }
    /** @sealed */
    read(reader) {
        if (reader) {
            return reader.readObservable(this);
        }
        else {
            return this.get();
        }
    }
    map(fnOrOwner, fnOrUndefined, debugLocation = debugLocation_1.DebugLocation.ofCaller()) {
        const owner = fnOrUndefined === undefined ? undefined : fnOrOwner;
        const fn = fnOrUndefined === undefined ? fnOrOwner : fnOrUndefined;
        return _derived({
            owner,
            debugName: () => {
                const name = (0, debugName_1.getFunctionName)(fn);
                if (name !== undefined) {
                    return name;
                }
                // regexp to match `x => x.y` or `x => x?.y` where x and y can be arbitrary identifiers (uses backref):
                const regexp = /^\s*\(?\s*([a-zA-Z_$][a-zA-Z_$0-9]*)\s*\)?\s*=>\s*\1(?:\??)\.([a-zA-Z_$][a-zA-Z_$0-9]*)\s*$/;
                const match = regexp.exec(fn.toString());
                if (match) {
                    return `${this.debugName}.${match[2]}`;
                }
                if (!owner) {
                    return `${this.debugName} (mapped)`;
                }
                return undefined;
            },
            debugReferenceFn: fn,
        }, (reader) => fn(this.read(reader), reader), debugLocation);
    }
    /**
     * @sealed
     * Converts an observable of an observable value into a direct observable of the value.
    */
    flatten() {
        return _derived({
            owner: undefined,
            debugName: () => `${this.debugName} (flattened)`,
        }, (reader) => this.read(reader).read(reader));
    }
    recomputeInitiallyAndOnChange(store, handleValue) {
        store.add(_recomputeInitiallyAndOnChange(this, handleValue));
        return this;
    }
    /**
     * Ensures that this observable is observed. This keeps the cache alive.
     * However, in case of deriveds, it does not force eager evaluation (only when the value is read/get).
     * Use `recomputeInitiallyAndOnChange` for eager evaluation.
     */
    keepObserved(store) {
        store.add(_keepObserved(this));
        return this;
    }
    get debugValue() {
        return this.get();
    }
    debugGetDependencyGraph() {
        return _debugGetDependencyGraph(this);
    }
}
exports.ConvenientObservable = ConvenientObservable;
class BaseObservable extends ConvenientObservable {
    constructor(debugLocation) {
        super();
        this._observers = new Set();
        (0, logging_1.getLogger)()?.handleObservableCreated(this, debugLocation);
    }
    addObserver(observer) {
        const len = this._observers.size;
        this._observers.add(observer);
        if (len === 0) {
            this.onFirstObserverAdded();
        }
        if (len !== this._observers.size) {
            (0, logging_1.getLogger)()?.handleOnListenerCountChanged(this, this._observers.size);
        }
    }
    removeObserver(observer) {
        const deleted = this._observers.delete(observer);
        if (deleted && this._observers.size === 0) {
            this.onLastObserverRemoved();
        }
        if (deleted) {
            (0, logging_1.getLogger)()?.handleOnListenerCountChanged(this, this._observers.size);
        }
    }
    onFirstObserverAdded() { }
    onLastObserverRemoved() { }
    log() {
        const hadLogger = !!(0, logging_1.getLogger)();
        (0, logging_1.logObservable)(this);
        if (!hadLogger) {
            (0, logging_1.getLogger)()?.handleObservableCreated(this, debugLocation_1.DebugLocation.ofCaller());
        }
        return this;
    }
    debugGetObservers() {
        return this._observers;
    }
}
exports.BaseObservable = BaseObservable;
//# sourceMappingURL=baseObservable.js.map