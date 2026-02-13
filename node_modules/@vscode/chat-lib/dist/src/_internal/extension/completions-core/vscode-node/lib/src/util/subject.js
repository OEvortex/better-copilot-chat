"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReplaySubject = exports.Subject = void 0;
/** A simple implementation of an observable Subject.  */
class Subject {
    constructor() {
        this.observers = new Set();
    }
    subscribe(observer) {
        this.observers.add(observer);
        return () => this.observers.delete(observer);
    }
    next(value) {
        for (const observer of this.observers) {
            observer.next(value);
        }
    }
    error(err) {
        for (const observer of this.observers) {
            observer.error?.(err);
        }
    }
    complete() {
        for (const observer of this.observers) {
            observer.complete?.();
        }
    }
}
exports.Subject = Subject;
/** A variant of Subject that replays the last value to new subscribers. */
class ReplaySubject extends Subject {
    subscribe(observer) {
        const subscription = super.subscribe(observer);
        if (this._value !== undefined) {
            observer.next(this._value);
        }
        return subscription;
    }
    next(value) {
        this._value = value;
        super.next(value);
    }
}
exports.ReplaySubject = ReplaySubject;
//# sourceMappingURL=subject.js.map