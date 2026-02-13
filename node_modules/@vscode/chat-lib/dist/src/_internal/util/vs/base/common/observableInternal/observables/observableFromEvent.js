"use strict";
//!!! DO NOT modify, this file was COPIED from 'microsoft/vscode'
Object.defineProperty(exports, "__esModule", { value: true });
exports.FromEventObservable = void 0;
exports.observableFromEvent = observableFromEvent;
exports.observableFromEventOpts = observableFromEventOpts;
const transaction_1 = require("../transaction");
const deps_1 = require("../commonFacade/deps");
const debugName_1 = require("../debugName");
const logging_1 = require("../logging/logging");
const baseObservable_1 = require("./baseObservable");
const debugLocation_1 = require("../debugLocation");
function observableFromEvent(...args) {
    let owner;
    let event;
    let getValue;
    let debugLocation;
    if (args.length === 2) {
        [event, getValue] = args;
    }
    else {
        [owner, event, getValue, debugLocation] = args;
    }
    return new FromEventObservable(new debugName_1.DebugNameData(owner, undefined, getValue), event, getValue, () => FromEventObservable.globalTransaction, deps_1.strictEquals, debugLocation ?? debugLocation_1.DebugLocation.ofCaller());
}
function observableFromEventOpts(options, event, getValue, debugLocation = debugLocation_1.DebugLocation.ofCaller()) {
    return new FromEventObservable(new debugName_1.DebugNameData(options.owner, options.debugName, options.debugReferenceFn ?? getValue), event, getValue, () => FromEventObservable.globalTransaction, options.equalsFn ?? deps_1.strictEquals, debugLocation);
}
class FromEventObservable extends baseObservable_1.BaseObservable {
    constructor(_debugNameData, event, _getValue, _getTransaction, _equalityComparator, debugLocation) {
        super(debugLocation);
        this._debugNameData = _debugNameData;
        this.event = event;
        this._getValue = _getValue;
        this._getTransaction = _getTransaction;
        this._equalityComparator = _equalityComparator;
        this._hasValue = false;
        this.handleEvent = (args) => {
            const newValue = this._getValue(args);
            const oldValue = this._value;
            const didChange = !this._hasValue || !(this._equalityComparator(oldValue, newValue));
            let didRunTransaction = false;
            if (didChange) {
                this._value = newValue;
                if (this._hasValue) {
                    didRunTransaction = true;
                    (0, transaction_1.subtransaction)(this._getTransaction(), (tx) => {
                        (0, logging_1.getLogger)()?.handleObservableUpdated(this, { oldValue, newValue, change: undefined, didChange, hadValue: this._hasValue });
                        for (const o of this._observers) {
                            tx.updateObserver(o, this);
                            o.handleChange(this, undefined);
                        }
                    }, () => {
                        const name = this.getDebugName();
                        return 'Event fired' + (name ? `: ${name}` : '');
                    });
                }
                this._hasValue = true;
            }
            if (!didRunTransaction) {
                (0, logging_1.getLogger)()?.handleObservableUpdated(this, { oldValue, newValue, change: undefined, didChange, hadValue: this._hasValue });
            }
        };
    }
    getDebugName() {
        return this._debugNameData.getDebugName(this);
    }
    get debugName() {
        const name = this.getDebugName();
        return 'From Event' + (name ? `: ${name}` : '');
    }
    onFirstObserverAdded() {
        this._subscription = this.event(this.handleEvent);
    }
    onLastObserverRemoved() {
        this._subscription.dispose();
        this._subscription = undefined;
        this._hasValue = false;
        this._value = undefined;
    }
    get() {
        if (this._subscription) {
            if (!this._hasValue) {
                this.handleEvent(undefined);
            }
            return this._value;
        }
        else {
            // no cache, as there are no subscribers to keep it updated
            const value = this._getValue(undefined);
            return value;
        }
    }
    debugSetValue(value) {
        // eslint-disable-next-line local/code-no-any-casts
        this._value = value;
    }
    debugGetState() {
        return { value: this._value, hasValue: this._hasValue };
    }
}
exports.FromEventObservable = FromEventObservable;
(function (observableFromEvent) {
    observableFromEvent.Observer = FromEventObservable;
    function batchEventsGlobally(tx, fn) {
        let didSet = false;
        if (FromEventObservable.globalTransaction === undefined) {
            FromEventObservable.globalTransaction = tx;
            didSet = true;
        }
        try {
            fn();
        }
        finally {
            if (didSet) {
                FromEventObservable.globalTransaction = undefined;
            }
        }
    }
    observableFromEvent.batchEventsGlobally = batchEventsGlobally;
})(observableFromEvent || (exports.observableFromEvent = observableFromEvent = {}));
//# sourceMappingURL=observableFromEvent.js.map