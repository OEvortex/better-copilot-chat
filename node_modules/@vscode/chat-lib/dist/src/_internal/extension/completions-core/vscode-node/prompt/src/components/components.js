"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.Text = Text;
exports.Chunk = Chunk;
/**
 * Basic component to represent text in a prompt.
 */
function Text(props) {
    if (props.children) {
        if (Array.isArray(props.children)) {
            return props.children.join('');
        }
        return props.children;
    }
    return;
}
/**
 * Basic component to represent a group of components that gets elided all together or not at all.
 */
function Chunk(props) {
    return props.children;
}
//# sourceMappingURL=components.js.map