"use strict";
//!!! DO NOT modify, this file was COPIED from 'microsoft/vscode'
Object.defineProperty(exports, "__esModule", { value: true });
exports.ObservableLazyPromise = exports.PromiseResult = exports.ObservablePromise = exports.ObservableLazy = void 0;
const transaction_1 = require("../transaction");
const derived_1 = require("../observables/derived");
const observableValue_1 = require("../observables/observableValue");
class ObservableLazy {
    /**
     * The cached value.
     * Does not force a computation of the value.
     */
    get cachedValue() { return this._value; }
    constructor(_computeValue) {
        this._computeValue = _computeValue;
        this._value = (0, observableValue_1.observableValue)(this, undefined);
    }
    /**
     * Returns the cached value.
     * Computes the value if the value has not been cached yet.
     */
    getValue() {
        let v = this._value.get();
        if (!v) {
            v = this._computeValue();
            this._value.set(v, undefined);
        }
        return v;
    }
}
exports.ObservableLazy = ObservableLazy;
/**
 * A promise whose state is observable.
 */
class ObservablePromise {
    static fromFn(fn) {
        return new ObservablePromise(fn());
    }
    static resolved(value) {
        return new ObservablePromise(Promise.resolve(value));
    }
    constructor(promise) {
        this._value = (0, observableValue_1.observableValue)(this, undefined);
        /**
         * The current state of the promise.
         * Is `undefined` if the promise didn't resolve yet.
         */
        this.promiseResult = this._value;
        this.resolvedValue = (0, derived_1.derived)(this, reader => {
            const result = this.promiseResult.read(reader);
            if (!result) {
                return undefined;
            }
            return result.getDataOrThrow();
        });
        this.promise = promise.then(value => {
            (0, transaction_1.transaction)(tx => {
                /** @description onPromiseResolved */
                this._value.set(new PromiseResult(value, undefined), tx);
            });
            return value;
        }, error => {
            (0, transaction_1.transaction)(tx => {
                /** @description onPromiseRejected */
                this._value.set(new PromiseResult(undefined, error), tx);
            });
            throw error;
        });
    }
}
exports.ObservablePromise = ObservablePromise;
class PromiseResult {
    constructor(
    /**
     * The value of the resolved promise.
     * Undefined if the promise rejected.
     */
    data, 
    /**
     * The error in case of a rejected promise.
     * Undefined if the promise resolved.
     */
    error) {
        this.data = data;
        this.error = error;
    }
    /**
     * Returns the value if the promise resolved, otherwise throws the error.
     */
    getDataOrThrow() {
        if (this.error) {
            throw this.error;
        }
        return this.data;
    }
}
exports.PromiseResult = PromiseResult;
/**
 * A lazy promise whose state is observable.
 */
class ObservableLazyPromise {
    constructor(_computePromise) {
        this._computePromise = _computePromise;
        this._lazyValue = new ObservableLazy(() => new ObservablePromise(this._computePromise()));
        /**
         * Does not enforce evaluation of the promise compute function.
         * Is undefined if the promise has not been computed yet.
         */
        this.cachedPromiseResult = (0, derived_1.derived)(this, reader => this._lazyValue.cachedValue.read(reader)?.promiseResult.read(reader));
    }
    getPromise() {
        return this._lazyValue.getValue().promise;
    }
}
exports.ObservableLazyPromise = ObservableLazyPromise;
//# sourceMappingURL=promise.js.map