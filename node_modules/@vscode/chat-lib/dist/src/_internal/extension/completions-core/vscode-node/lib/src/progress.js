"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NoOpStatusReporter = exports.StatusReporter = exports.ICompletionsStatusReporter = void 0;
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const services_1 = require("../../../../../util/common/services");
exports.ICompletionsStatusReporter = (0, services_1.createServiceIdentifier)('ICompletionsStatusReporter');
class StatusReporter {
    #inProgressCount = 0;
    #kind = 'Normal';
    #message;
    #command;
    #startup = true;
    get busy() {
        return this.#inProgressCount > 0;
    }
    withProgress(callback) {
        if (this.#kind === 'Warning') {
            this.forceNormal();
        }
        if (this.#inProgressCount++ === 0) {
            this.#didChange();
        }
        return callback().finally(() => {
            if (--this.#inProgressCount === 0) {
                this.#didChange();
            }
        });
    }
    forceStatus(kind, message, command) {
        if (this.#kind === kind && this.#message === message && !command && !this.#command && !this.#startup) {
            return;
        }
        this.#kind = kind;
        this.#message = message;
        this.#command = command;
        this.#startup = false;
        this.#didChange();
    }
    forceNormal() {
        if (this.#kind === 'Inactive') {
            return;
        }
        this.forceStatus('Normal');
    }
    setError(message, command) {
        this.forceStatus('Error', message, command);
    }
    setWarning(message) {
        if (this.#kind === 'Error') {
            return;
        }
        this.forceStatus('Warning', message);
    }
    setInactive(message) {
        if (this.#kind === 'Error' || this.#kind === 'Warning') {
            return;
        }
        this.forceStatus('Inactive', message);
    }
    clearInactive() {
        if (this.#kind !== 'Inactive') {
            return;
        }
        this.forceStatus('Normal');
    }
    #didChange() {
        const event = { kind: this.#kind, message: this.#message, busy: this.busy, command: this.#command };
        this.didChange(event);
    }
}
exports.StatusReporter = StatusReporter;
// Don't delete. Needed for tests that don't care about status changes
class NoOpStatusReporter extends StatusReporter {
    didChange() { }
}
exports.NoOpStatusReporter = NoOpStatusReporter;
//# sourceMappingURL=progress.js.map