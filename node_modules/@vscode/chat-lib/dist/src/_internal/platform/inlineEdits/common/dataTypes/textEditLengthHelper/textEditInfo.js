"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.TextEditInfo = void 0;
const length_1 = require("./length");
class TextEditInfo {
    /*public static fromModelContentChanges(changes: IModelContentChange[]): TextEditInfo[] {
        // Must be sorted in ascending order
        const edits = changes.map(c => {
            const range = Range.lift(c.range);
            return new TextEditInfo(
                positionToLength(range.getStartPosition()),
                positionToLength(range.getEndPosition()),
                lengthOfString(c.text)
            );
        }).reverse();
        return edits;
    }*/
    constructor(startOffset, endOffset, newLength) {
        this.startOffset = startOffset;
        this.endOffset = endOffset;
        this.newLength = newLength;
    }
    toString() {
        return `[${(0, length_1.lengthToObj)(this.startOffset)}...${(0, length_1.lengthToObj)(this.endOffset)}) -> ${(0, length_1.lengthToObj)(this.newLength)}`;
    }
}
exports.TextEditInfo = TextEditInfo;
//# sourceMappingURL=textEditInfo.js.map