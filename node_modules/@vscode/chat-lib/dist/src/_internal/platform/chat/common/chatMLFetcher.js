"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.FetchStreamRecorder = exports.FetchStreamSource = exports.IChatMLFetcher = void 0;
const services_1 = require("../../../util/common/services");
const async_1 = require("../../../util/vs/base/common/async");
exports.IChatMLFetcher = (0, services_1.createServiceIdentifier)('IChatMLFetcher');
class FetchStreamSource {
    get stream() {
        return this._stream.asyncIterable;
    }
    constructor() {
        this._stream = new async_1.AsyncIterableSource();
        // This means that we will only show one instance of each annotation type, but the IDs are not correct and there is no other way
        this._seenAnnotationTypes = new Set();
    }
    pause() {
        this._paused ??= [];
    }
    unpause() {
        const toEmit = this._paused;
        if (!toEmit) {
            return;
        }
        this._paused = undefined;
        for (const part of toEmit) {
            if (part) {
                this.update(part.text, part.delta);
            }
            else {
                this.resolve();
            }
        }
    }
    update(text, delta) {
        if (this._paused) {
            this._paused.push({ text, delta });
            return;
        }
        if (delta.codeVulnAnnotations) {
            // We can only display vulnerabilities inside codeblocks, and it's ok to discard annotations that fell outside of them
            const numTripleBackticks = text.match(/(^|\n)```/g)?.length ?? 0;
            const insideCodeblock = numTripleBackticks % 2 === 1;
            if (!insideCodeblock || text.match(/(^|\n)```\w*\s*$/)) { // Not inside a codeblock, or right on the start triple-backtick of a codeblock
                delta.codeVulnAnnotations = undefined;
            }
        }
        if (delta.codeVulnAnnotations) {
            delta.codeVulnAnnotations = delta.codeVulnAnnotations.filter(annotation => !this._seenAnnotationTypes.has(annotation.details.type));
            delta.codeVulnAnnotations.forEach(annotation => this._seenAnnotationTypes.add(annotation.details.type));
        }
        this._stream.emitOne({ delta });
    }
    resolve() {
        if (this._paused) {
            this._paused.push(undefined);
            return;
        }
        this._stream.resolve();
    }
}
exports.FetchStreamSource = FetchStreamSource;
class FetchStreamRecorder {
    get firstTokenEmittedTime() {
        return this._firstTokenEmittedTime;
    }
    constructor(callback) {
        this.deltas = [];
        this.callback = async (text, index, delta) => {
            if (this._firstTokenEmittedTime === undefined && (delta.text || delta.beginToolCalls || (typeof delta.thinking?.text === 'string' && delta.thinking?.text || delta.thinking?.text?.length) || delta.copilotToolCalls)) {
                this._firstTokenEmittedTime = Date.now();
            }
            const result = callback ? await callback(text, index, delta) : undefined;
            this.deltas.push(delta);
            return result;
        };
    }
}
exports.FetchStreamRecorder = FetchStreamRecorder;
//# sourceMappingURL=chatMLFetcher.js.map