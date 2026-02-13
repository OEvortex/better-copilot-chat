"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.UseData = exports.UseState = void 0;
class UseState {
    constructor(states) {
        this.states = states;
        this.currentIndex = 0;
        this.stateChanged = false;
    }
    useState(initialState) {
        const index = this.currentIndex;
        // Initialize state if not exists
        if (this.states[index] === undefined) {
            const initial = typeof initialState === 'function' ? initialState() : initialState;
            this.states[index] = initial;
        }
        const setState = (newState) => {
            const nextState = typeof newState === 'function' ? newState(this.states[index]) : newState;
            this.states[index] = nextState;
            this.stateChanged = true;
        };
        this.currentIndex++;
        return [this.states[index], setState];
    }
    hasChanged() {
        return this.stateChanged;
    }
}
exports.UseState = UseState;
class UseData {
    constructor(measureUpdateTime) {
        this.measureUpdateTime = measureUpdateTime;
        this.consumers = [];
    }
    useData(typePredicate, consumer) {
        this.consumers.push((data) => {
            if (typePredicate(data)) {
                return consumer(data);
            }
        });
    }
    async updateData(data) {
        if (this.consumers.length > 0) {
            const start = performance.now();
            for (const consumer of this.consumers) {
                await consumer(data);
            }
            this.measureUpdateTime(performance.now() - start);
        }
    }
}
exports.UseData = UseData;
//# sourceMappingURL=hooks.js.map