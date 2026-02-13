"use strict";
//!!! DO NOT modify, this file was COPIED from 'microsoft/vscode'
Object.defineProperty(exports, "__esModule", { value: true });
exports.runOnChange = runOnChange;
exports.runOnChangeWithStore = runOnChangeWithStore;
exports.runOnChangeWithCancellationToken = runOnChangeWithCancellationToken;
const cancellation_1 = require("../commonFacade/cancellation");
const deps_1 = require("../commonFacade/deps");
const autorun_1 = require("../reactions/autorun");
function runOnChange(observable, cb) {
    let _previousValue;
    let _firstRun = true;
    return (0, autorun_1.autorunWithStoreHandleChanges)({
        changeTracker: {
            createChangeSummary: () => ({ deltas: [], didChange: false }),
            handleChange: (context, changeSummary) => {
                if (context.didChange(observable)) {
                    const e = context.change;
                    if (e !== undefined) {
                        changeSummary.deltas.push(e);
                    }
                    changeSummary.didChange = true;
                }
                return true;
            },
        }
    }, (reader, changeSummary) => {
        const value = observable.read(reader);
        const previousValue = _previousValue;
        if (changeSummary.didChange) {
            _previousValue = value;
            // didChange can never be true on the first autorun, so we know previousValue is defined
            cb(value, previousValue, changeSummary.deltas);
        }
        if (_firstRun) {
            _firstRun = false;
            _previousValue = value;
        }
    });
}
function runOnChangeWithStore(observable, cb) {
    const store = new deps_1.DisposableStore();
    const disposable = runOnChange(observable, (value, previousValue, deltas) => {
        store.clear();
        cb(value, previousValue, deltas, store);
    });
    return {
        dispose() {
            disposable.dispose();
            store.dispose();
        }
    };
}
function runOnChangeWithCancellationToken(observable, cb) {
    return runOnChangeWithStore(observable, (value, previousValue, deltas, store) => {
        cb(value, previousValue, deltas, (0, cancellation_1.cancelOnDispose)(store));
    });
}
//# sourceMappingURL=runOnChange.js.map