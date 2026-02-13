"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.autorunWithChanges = autorunWithChanges;
const observable_1 = require("../../../../util/vs/base/common/observable");
function autorunWithChanges(owner, observables, handler) {
    const observableToKey = new Map(Object.entries(observables).map(([key, value]) => [value, key]));
    const previousValues = new Map(Object.keys(observables).map(key => [key, undefined]));
    return (0, observable_1.autorunHandleChanges)({
        owner,
        changeTracker: {
            createChangeSummary: () => ({}),
            handleChange: (ctx, changeSummary) => {
                const key = observableToKey.get(ctx.changedObservable);
                if (changeSummary[key] === undefined) {
                    changeSummary[key] = { value: undefined, changes: [] };
                }
                changeSummary[key].changes.push(ctx.change);
                return true;
            }
        }
    }, (reader, data) => {
        for (const [key, value] of Object.entries(observables)) {
            const v = value.read(reader);
            if (data[key] === undefined) {
                data[key] = { value: v, changes: [], previous: previousValues.get(key) };
            }
            data[key].value = v;
            data[key].previous = previousValues.get(key) === undefined ? undefined : previousValues.get(key);
            previousValues.set(key, v);
        }
        handler(data);
    });
}
//# sourceMappingURL=observable.js.map