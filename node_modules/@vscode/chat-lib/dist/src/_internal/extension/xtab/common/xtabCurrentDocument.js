"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.CurrentDocument = void 0;
class CurrentDocument {
    constructor(content, cursorPosition) {
        this.content = content;
        this.cursorPosition = cursorPosition;
        this.lines = content.getLines();
        this.transformer = content.getTransformer();
        this.cursorOffset = this.transformer.getOffset(cursorPosition);
        this.cursorLineOffset = this.cursorPosition.lineNumber - 1;
    }
}
exports.CurrentDocument = CurrentDocument;
//# sourceMappingURL=xtabCurrentDocument.js.map