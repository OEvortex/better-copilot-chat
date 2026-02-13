"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.TikTokenImpl = void 0;
const tiktokenizer_1 = require("@microsoft/tiktokenizer");
const numbers_1 = require("../../../util/vs/base/common/numbers");
const stopwatch_1 = require("../../../util/vs/base/common/stopwatch");
const parseTikTokens_1 = require("./parseTikTokens");
class TikTokenImpl {
    constructor() {
        this._values = [];
        this._stats = {
            encodeDuration: new numbers_1.MovingAverage(),
            textLength: new numbers_1.MovingAverage(),
            callCount: 0,
        };
    }
    static get instance() {
        if (!this._instance) {
            this._instance = new TikTokenImpl();
        }
        return this._instance;
    }
    init(tokenFilePath, encoderName, useBinaryTokens) {
        const handle = this._values.length;
        const parser = useBinaryTokens ? parseTikTokens_1.parseTikTokenBinary : f => f;
        this._values.push((0, tiktokenizer_1.createTokenizer)(parser(tokenFilePath), (0, tiktokenizer_1.getSpecialTokensByEncoder)(encoderName), (0, tiktokenizer_1.getRegexByEncoder)(encoderName), 64000));
        return handle;
    }
    encode(handle, text, allowedSpecial) {
        const sw = stopwatch_1.StopWatch.create(true);
        const result = this._values[handle].encode(text, allowedSpecial);
        this._stats.callCount += 1;
        this._stats.encodeDuration.update(sw.elapsed());
        this._stats.textLength.update(text.length);
        return result;
    }
    destroy(handle) {
        this._values[handle] = undefined;
    }
    resetStats() {
        const oldValue = this._stats;
        const result = {
            callCount: oldValue.callCount,
            encodeDuration: oldValue.encodeDuration.value,
            textLength: oldValue.textLength.value
        };
        this._stats.encodeDuration = new numbers_1.MovingAverage();
        this._stats.textLength = new numbers_1.MovingAverage();
        this._stats.callCount = 0;
        return result;
    }
}
exports.TikTokenImpl = TikTokenImpl;
//# sourceMappingURL=tikTokenizerImpl.js.map