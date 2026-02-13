"use strict";
//!!! DO NOT modify, this file was COPIED from 'microsoft/vscode'
Object.defineProperty(exports, "__esModule", { value: true });
exports.ValueWithChangeEventFromObservable = void 0;
exports.observableFromValueWithChangeEvent = observableFromValueWithChangeEvent;
const deps_1 = require("../commonFacade/deps");
const observableFromEvent_1 = require("../observables/observableFromEvent");
class ValueWithChangeEventFromObservable {
    constructor(observable) {
        this.observable = observable;
    }
    get onDidChange() {
        return deps_1.Event.fromObservableLight(this.observable);
    }
    get value() {
        return this.observable.get();
    }
}
exports.ValueWithChangeEventFromObservable = ValueWithChangeEventFromObservable;
function observableFromValueWithChangeEvent(owner, value) {
    if (value instanceof ValueWithChangeEventFromObservable) {
        return value.observable;
    }
    return (0, observableFromEvent_1.observableFromEvent)(owner, value.onDidChange, () => value.value);
}
//# sourceMappingURL=valueWithChangeEvent.js.map