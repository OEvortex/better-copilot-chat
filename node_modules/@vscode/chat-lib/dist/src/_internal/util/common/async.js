"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.BatchedProcessor = exports.TaskQueue = void 0;
exports.raceFilter = raceFilter;
const async_1 = require("../vs/base/common/async");
const errors_1 = require("../vs/base/common/errors");
/**
 * Processes tasks in the order they were scheduled.
*/
class TaskQueue {
    constructor() {
        this._runningTask = undefined;
        this._pendingTasks = [];
    }
    /**
     * Waits for the current and pending tasks to finish, then runs and awaits the given task.
     * If the task is skipped because of clearPending, the promise is rejected with a CancellationError.
    */
    schedule(task) {
        const deferred = new async_1.DeferredPromise();
        this._pendingTasks.push({ task, deferred, setUndefinedWhenCleared: false });
        this._runIfNotRunning();
        return deferred.p;
    }
    /**
     * Waits for the current and pending tasks to finish, then runs and awaits the given task.
     * If the task is skipped because of clearPending, the promise is resolved with undefined.
    */
    scheduleSkipIfCleared(task) {
        const deferred = new async_1.DeferredPromise();
        this._pendingTasks.push({ task, deferred, setUndefinedWhenCleared: true });
        this._runIfNotRunning();
        return deferred.p;
    }
    _runIfNotRunning() {
        if (this._runningTask === undefined) {
            this._processQueue();
        }
    }
    async _processQueue() {
        if (this._pendingTasks.length === 0) {
            return;
        }
        const next = this._pendingTasks.shift();
        if (!next) {
            return;
        }
        if (this._runningTask) {
            throw new errors_1.BugIndicatingError();
        }
        this._runningTask = next.task;
        try {
            const result = await next.task();
            next.deferred.complete(result);
        }
        catch (e) {
            next.deferred.error(e);
        }
        finally {
            this._runningTask = undefined;
            this._processQueue();
        }
    }
    /**
     * Clears all pending tasks. Does not cancel the currently running task.
    */
    clearPending() {
        const tasks = this._pendingTasks;
        this._pendingTasks = [];
        for (const task of tasks) {
            if (task.setUndefinedWhenCleared) {
                task.deferred.complete(undefined);
            }
            else {
                task.deferred.error(new errors_1.CancellationError());
            }
        }
    }
}
exports.TaskQueue = TaskQueue;
class BatchedProcessor {
    constructor(_fn, _waitingTimeMs) {
        this._fn = _fn;
        this._waitingTimeMs = _waitingTimeMs;
        this._queue = [];
        this._timeout = null;
    }
    request(arg) {
        if (this._timeout === null) {
            this._timeout = setTimeout(() => this._flush(), this._waitingTimeMs);
        }
        const p = new async_1.DeferredPromise();
        this._queue.push({ arg, promise: p });
        return p.p;
    }
    async _flush() {
        const queue = this._queue;
        this._queue = [];
        this._timeout = null;
        const args = queue.map(e => e.arg);
        let results;
        try {
            results = await this._fn(args);
        }
        catch (e) {
            for (const entry of queue) {
                entry.promise.error(e);
            }
            return;
        }
        for (const [i, result] of results.entries()) {
            queue[i].promise.complete(result);
        }
    }
}
exports.BatchedProcessor = BatchedProcessor;
function raceFilter(promises, filter) {
    return new Promise((resolve, reject) => {
        if (promises.length === 0) {
            resolve(undefined);
            return;
        }
        let resolved = false;
        let unresolvedCount = promises.length;
        for (const promise of promises) {
            promise.then(result => {
                unresolvedCount--;
                if (!resolved) {
                    if (filter(result)) {
                        resolved = true;
                        resolve(result);
                    }
                    else if (unresolvedCount === 0) {
                        // Last one has to resolve the promise
                        resolve(undefined);
                    }
                }
            }).catch(reject);
        }
    });
}
//# sourceMappingURL=async.js.map