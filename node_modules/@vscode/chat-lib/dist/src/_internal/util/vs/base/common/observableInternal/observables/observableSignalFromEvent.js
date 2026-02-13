"use strict";
//!!! DO NOT modify, this file was COPIED from 'microsoft/vscode'
Object.defineProperty(exports, "__esModule", { value: true });
exports.observableSignalFromEvent = observableSignalFromEvent;
const transaction_1 = require("../transaction");
const debugName_1 = require("../debugName");
const baseObservable_1 = require("./baseObservable");
const debugLocation_1 = require("../debugLocation");
function observableSignalFromEvent(owner, event, debugLocation = debugLocation_1.DebugLocation.ofCaller()) {
    return new FromEventObservableSignal(typeof owner === 'string' ? owner : new debugName_1.DebugNameData(owner, undefined, undefined), event, debugLocation);
}
class FromEventObservableSignal extends baseObservable_1.BaseObservable {
    constructor(debugNameDataOrName, event, debugLocation) {
        super(debugLocation);
        this.event = event;
        this.handleEvent = () => {
            (0, transaction_1.transaction)((tx) => {
                for (const o of this._observers) {
                    tx.updateObserver(o, this);
                    o.handleChange(this, undefined);
                }
            }, () => this.debugName);
        };
        this.debugName = typeof debugNameDataOrName === 'string'
            ? debugNameDataOrName
            : debugNameDataOrName.getDebugName(this) ?? 'Observable Signal From Event';
    }
    onFirstObserverAdded() {
        this.subscription = this.event(this.handleEvent);
    }
    onLastObserverRemoved() {
        this.subscription.dispose();
        this.subscription = undefined;
    }
    get() {
        // NO OP
    }
}
//# sourceMappingURL=observableSignalFromEvent.js.map