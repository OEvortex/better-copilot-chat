"use strict";
//!!! DO NOT modify, this file was COPIED from 'microsoft/vscode'
Object.defineProperty(exports, "__esModule", { value: true });
exports.latestChangedValue = exports.derivedConstOnceDefined = exports.runOnChangeWithStore = exports.runOnChangeWithCancellationToken = exports.runOnChange = exports.ValueWithChangeEventFromObservable = exports.observableFromValueWithChangeEvent = exports.TransactionImpl = exports.transaction = exports.subtransaction = exports.globalTransaction = exports.asyncTransaction = exports.observableSignalFromEvent = exports.observableFromEventOpts = exports.observableSignal = exports.constObservable = exports.recordChangesLazy = exports.recordChanges = exports.wasEventTriggeredRecently = exports.signalFromObservable = exports.recomputeInitiallyAndOnChange = exports.observableFromPromise = exports.mapObservableArrayCached = exports.keepObserved = exports.derivedObservableWithWritableCache = exports.derivedObservableWithCache = exports.debouncedObservable = exports.debouncedObservableDeprecated = exports.waitForState = exports.derivedWithCancellationToken = exports.PromiseResult = exports.ObservablePromise = exports.ObservableLazyPromise = exports.ObservableLazy = exports.derivedWithStore = exports.derivedWithSetter = exports.derivedOpts = exports.derivedHandleChanges = exports.derivedDisposable = exports.derived = exports.disposableObservableValue = exports.autorunSelfDisposable = exports.autorunIterableDelta = exports.autorunWithStoreHandleChanges = exports.autorunWithStore = exports.autorunOpts = exports.autorunHandleChanges = exports.autorunDelta = exports.autorun = exports.observableValueOpts = void 0;
exports.DebugLocation = exports.ObservableMap = exports.ObservableSet = exports.observableValue = exports.observableFromEvent = void 0;
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// This is a facade for the observable implementation. Only import from here!
var observableValueOpts_1 = require("./observables/observableValueOpts");
Object.defineProperty(exports, "observableValueOpts", { enumerable: true, get: function () { return observableValueOpts_1.observableValueOpts; } });
var autorun_1 = require("./reactions/autorun");
Object.defineProperty(exports, "autorun", { enumerable: true, get: function () { return autorun_1.autorun; } });
Object.defineProperty(exports, "autorunDelta", { enumerable: true, get: function () { return autorun_1.autorunDelta; } });
Object.defineProperty(exports, "autorunHandleChanges", { enumerable: true, get: function () { return autorun_1.autorunHandleChanges; } });
Object.defineProperty(exports, "autorunOpts", { enumerable: true, get: function () { return autorun_1.autorunOpts; } });
Object.defineProperty(exports, "autorunWithStore", { enumerable: true, get: function () { return autorun_1.autorunWithStore; } });
Object.defineProperty(exports, "autorunWithStoreHandleChanges", { enumerable: true, get: function () { return autorun_1.autorunWithStoreHandleChanges; } });
Object.defineProperty(exports, "autorunIterableDelta", { enumerable: true, get: function () { return autorun_1.autorunIterableDelta; } });
Object.defineProperty(exports, "autorunSelfDisposable", { enumerable: true, get: function () { return autorun_1.autorunSelfDisposable; } });
var observableValue_1 = require("./observables/observableValue");
Object.defineProperty(exports, "disposableObservableValue", { enumerable: true, get: function () { return observableValue_1.disposableObservableValue; } });
var derived_1 = require("./observables/derived");
Object.defineProperty(exports, "derived", { enumerable: true, get: function () { return derived_1.derived; } });
Object.defineProperty(exports, "derivedDisposable", { enumerable: true, get: function () { return derived_1.derivedDisposable; } });
Object.defineProperty(exports, "derivedHandleChanges", { enumerable: true, get: function () { return derived_1.derivedHandleChanges; } });
Object.defineProperty(exports, "derivedOpts", { enumerable: true, get: function () { return derived_1.derivedOpts; } });
Object.defineProperty(exports, "derivedWithSetter", { enumerable: true, get: function () { return derived_1.derivedWithSetter; } });
Object.defineProperty(exports, "derivedWithStore", { enumerable: true, get: function () { return derived_1.derivedWithStore; } });
var promise_1 = require("./utils/promise");
Object.defineProperty(exports, "ObservableLazy", { enumerable: true, get: function () { return promise_1.ObservableLazy; } });
Object.defineProperty(exports, "ObservableLazyPromise", { enumerable: true, get: function () { return promise_1.ObservableLazyPromise; } });
Object.defineProperty(exports, "ObservablePromise", { enumerable: true, get: function () { return promise_1.ObservablePromise; } });
Object.defineProperty(exports, "PromiseResult", { enumerable: true, get: function () { return promise_1.PromiseResult; } });
var utilsCancellation_1 = require("./utils/utilsCancellation");
Object.defineProperty(exports, "derivedWithCancellationToken", { enumerable: true, get: function () { return utilsCancellation_1.derivedWithCancellationToken; } });
Object.defineProperty(exports, "waitForState", { enumerable: true, get: function () { return utilsCancellation_1.waitForState; } });
var utils_1 = require("./utils/utils");
Object.defineProperty(exports, "debouncedObservableDeprecated", { enumerable: true, get: function () { return utils_1.debouncedObservableDeprecated; } });
Object.defineProperty(exports, "debouncedObservable", { enumerable: true, get: function () { return utils_1.debouncedObservable; } });
Object.defineProperty(exports, "derivedObservableWithCache", { enumerable: true, get: function () { return utils_1.derivedObservableWithCache; } });
Object.defineProperty(exports, "derivedObservableWithWritableCache", { enumerable: true, get: function () { return utils_1.derivedObservableWithWritableCache; } });
Object.defineProperty(exports, "keepObserved", { enumerable: true, get: function () { return utils_1.keepObserved; } });
Object.defineProperty(exports, "mapObservableArrayCached", { enumerable: true, get: function () { return utils_1.mapObservableArrayCached; } });
Object.defineProperty(exports, "observableFromPromise", { enumerable: true, get: function () { return utils_1.observableFromPromise; } });
Object.defineProperty(exports, "recomputeInitiallyAndOnChange", { enumerable: true, get: function () { return utils_1.recomputeInitiallyAndOnChange; } });
Object.defineProperty(exports, "signalFromObservable", { enumerable: true, get: function () { return utils_1.signalFromObservable; } });
Object.defineProperty(exports, "wasEventTriggeredRecently", { enumerable: true, get: function () { return utils_1.wasEventTriggeredRecently; } });
var changeTracker_1 = require("./changeTracker");
Object.defineProperty(exports, "recordChanges", { enumerable: true, get: function () { return changeTracker_1.recordChanges; } });
Object.defineProperty(exports, "recordChangesLazy", { enumerable: true, get: function () { return changeTracker_1.recordChangesLazy; } });
var constObservable_1 = require("./observables/constObservable");
Object.defineProperty(exports, "constObservable", { enumerable: true, get: function () { return constObservable_1.constObservable; } });
var observableSignal_1 = require("./observables/observableSignal");
Object.defineProperty(exports, "observableSignal", { enumerable: true, get: function () { return observableSignal_1.observableSignal; } });
var observableFromEvent_1 = require("./observables/observableFromEvent");
Object.defineProperty(exports, "observableFromEventOpts", { enumerable: true, get: function () { return observableFromEvent_1.observableFromEventOpts; } });
var observableSignalFromEvent_1 = require("./observables/observableSignalFromEvent");
Object.defineProperty(exports, "observableSignalFromEvent", { enumerable: true, get: function () { return observableSignalFromEvent_1.observableSignalFromEvent; } });
var transaction_1 = require("./transaction");
Object.defineProperty(exports, "asyncTransaction", { enumerable: true, get: function () { return transaction_1.asyncTransaction; } });
Object.defineProperty(exports, "globalTransaction", { enumerable: true, get: function () { return transaction_1.globalTransaction; } });
Object.defineProperty(exports, "subtransaction", { enumerable: true, get: function () { return transaction_1.subtransaction; } });
Object.defineProperty(exports, "transaction", { enumerable: true, get: function () { return transaction_1.transaction; } });
Object.defineProperty(exports, "TransactionImpl", { enumerable: true, get: function () { return transaction_1.TransactionImpl; } });
var valueWithChangeEvent_1 = require("./utils/valueWithChangeEvent");
Object.defineProperty(exports, "observableFromValueWithChangeEvent", { enumerable: true, get: function () { return valueWithChangeEvent_1.observableFromValueWithChangeEvent; } });
Object.defineProperty(exports, "ValueWithChangeEventFromObservable", { enumerable: true, get: function () { return valueWithChangeEvent_1.ValueWithChangeEventFromObservable; } });
var runOnChange_1 = require("./utils/runOnChange");
Object.defineProperty(exports, "runOnChange", { enumerable: true, get: function () { return runOnChange_1.runOnChange; } });
Object.defineProperty(exports, "runOnChangeWithCancellationToken", { enumerable: true, get: function () { return runOnChange_1.runOnChangeWithCancellationToken; } });
Object.defineProperty(exports, "runOnChangeWithStore", { enumerable: true, get: function () { return runOnChange_1.runOnChangeWithStore; } });
var utils_2 = require("./experimental/utils");
Object.defineProperty(exports, "derivedConstOnceDefined", { enumerable: true, get: function () { return utils_2.derivedConstOnceDefined; } });
Object.defineProperty(exports, "latestChangedValue", { enumerable: true, get: function () { return utils_2.latestChangedValue; } });
var observableFromEvent_2 = require("./observables/observableFromEvent");
Object.defineProperty(exports, "observableFromEvent", { enumerable: true, get: function () { return observableFromEvent_2.observableFromEvent; } });
var observableValue_2 = require("./observables/observableValue");
Object.defineProperty(exports, "observableValue", { enumerable: true, get: function () { return observableValue_2.observableValue; } });
var set_1 = require("./set");
Object.defineProperty(exports, "ObservableSet", { enumerable: true, get: function () { return set_1.ObservableSet; } });
var map_1 = require("./map");
Object.defineProperty(exports, "ObservableMap", { enumerable: true, get: function () { return map_1.ObservableMap; } });
var debugLocation_1 = require("./debugLocation");
Object.defineProperty(exports, "DebugLocation", { enumerable: true, get: function () { return debugLocation_1.DebugLocation; } });
const logging_1 = require("./logging/logging");
const consoleObservableLogger_1 = require("./logging/consoleObservableLogger");
const devToolsLogger_1 = require("./logging/debugger/devToolsLogger");
const process_1 = require("../process");
const baseObservable_1 = require("./observables/baseObservable");
const debugGetDependencyGraph_1 = require("./logging/debugGetDependencyGraph");
(0, baseObservable_1._setDebugGetDependencyGraph)(debugGetDependencyGraph_1.debugGetDependencyGraph);
(0, logging_1.setLogObservableFn)(consoleObservableLogger_1.logObservableToConsole);
// Remove "//" in the next line to enable logging
const enableLogging = false;
if (enableLogging) {
    (0, logging_1.addLogger)(new consoleObservableLogger_1.ConsoleObservableLogger());
}
if (process_1.env && process_1.env['VSCODE_DEV_DEBUG_OBSERVABLES']) {
    // To debug observables you also need the extension "ms-vscode.debug-value-editor"
    (0, logging_1.addLogger)(devToolsLogger_1.DevToolsLogger.getInstance());
}
//# sourceMappingURL=index.js.map