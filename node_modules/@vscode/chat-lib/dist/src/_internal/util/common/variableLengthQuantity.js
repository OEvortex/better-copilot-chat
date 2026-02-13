"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.readVariableLengthQuantity = readVariableLengthQuantity;
exports.writeVariableLengthQuantity = writeVariableLengthQuantity;
const buffer_1 = require("../vs/base/common/buffer");
/** Reads a 32-bit integer from the buffer */
function readVariableLengthQuantity(buffer, offset) {
    let result = 0;
    let consumed = 0;
    let byte;
    do {
        byte = buffer.readUInt8(offset + consumed);
        result |= (byte & 0x7f) << (consumed * 7);
        consumed++;
    } while (byte & 0x80);
    return { value: result, consumed };
}
/** Writes a 32 bit integer to the buffer */
function writeVariableLengthQuantity(i) {
    if (i !== (i | 0)) {
        throw new Error(`${i} is not an int32.`);
    }
    const result = [];
    do {
        let byte = i & 0x7f;
        i >>>= 7;
        if (i !== 0) {
            byte |= 0x80;
        }
        result.push(byte);
    } while (i !== 0);
    return buffer_1.VSBuffer.fromByteArray(result);
}
//# sourceMappingURL=variableLengthQuantity.js.map