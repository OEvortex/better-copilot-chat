"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseTikTokenBinary = void 0;
const fs_1 = require("fs");
const variableLengthQuantity_1 = require("../../../util/common/variableLengthQuantity");
const buffer_1 = require("../../../util/vs/base/common/buffer");
/** See `script/build/compressTikToken.ts` */
const parseTikTokenBinary = (file) => {
    const contents = (0, fs_1.readFileSync)(file);
    const result = new Map();
    for (let i = 0; i < contents.length;) {
        const termLength = (0, variableLengthQuantity_1.readVariableLengthQuantity)(buffer_1.VSBuffer.wrap(contents), i);
        i += termLength.consumed;
        result.set(contents.subarray(i, i + termLength.value), result.size);
        i += termLength.value;
    }
    return result;
};
exports.parseTikTokenBinary = parseTikTokenBinary;
//# sourceMappingURL=parseTikTokens.js.map