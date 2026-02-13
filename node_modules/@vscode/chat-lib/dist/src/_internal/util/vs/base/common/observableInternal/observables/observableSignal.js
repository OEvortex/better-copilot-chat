"use strict";
//!!! DO NOT modify, this file was COPIED from 'microsoft/vscode'
Object.defineProperty(exports, "__esModule", { value: true });
exports.observableSignal = observableSignal;
const transaction_1 = require("../transaction");
const debugName_1 = require("../debugName");
const baseObservable_1 = require("./baseObservable");
const debugLocation_1 = require("../debugLocation");
function observableSignal(debugNameOrOwner, debugLocation = debugLocation_1.DebugLocation.ofCaller()) {
    if (typeof debugNameOrOwner === 'string') {
        return new ObservableSignal(debugNameOrOwner, undefined, debugLocation);
    }
    else {
        return new ObservableSignal(undefined, debugNameOrOwner, debugLocation);
    }
}
class ObservableSignal extends baseObservable_1.BaseObservable {
    get debugName() {
        return new debugName_1.DebugNameData(this._owner, this._debugName, undefined).getDebugName(this) ?? 'Observable Signal';
    }
    toString() {
        return this.debugName;
    }
    constructor(_debugName, _owner, debugLocation) {
        super(debugLocation);
        this._debugName = _debugName;
        this._owner = _owner;
    }
    trigger(tx, change) {
        if (!tx) {
            (0, transaction_1.transaction)(tx => {
                this.trigger(tx, change);
            }, () => `Trigger signal ${this.debugName}`);
            return;
        }
        for (const o of this._observers) {
            tx.updateObserver(o, this);
            o.handleChange(this, change);
        }
    }
    get() {
        // NO OP
    }
}
//# sourceMappingURL=observableSignal.js.map