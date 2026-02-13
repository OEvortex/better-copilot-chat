"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.virtualNode = virtualNode;
exports.lineNode = lineNode;
exports.blankNode = blankNode;
exports.topNode = topNode;
exports.isBlank = isBlank;
exports.isLine = isLine;
exports.isVirtual = isVirtual;
exports.isTop = isTop;
exports.cutTreeAfterLine = cutTreeAfterLine;
exports.duplicateTree = duplicateTree;
/** Construct a virtual node */
function virtualNode(indentation, subs, label) {
    return { type: 'virtual', indentation, subs, label };
}
/** Construct a line node */
function lineNode(indentation, lineNumber, sourceLine, subs, label) {
    if (sourceLine === '') {
        throw new Error('Cannot create a line node with an empty source line');
    }
    return { type: 'line', indentation, lineNumber, sourceLine, subs, label };
}
/** Return a blank node */
function blankNode(line) {
    return { type: 'blank', lineNumber: line, subs: [] };
}
/** Return a node representing the top node */
function topNode(subs) {
    return {
        type: 'top',
        indentation: -1,
        subs: subs ?? [],
    };
}
function isBlank(tree) {
    return tree.type === 'blank';
}
function isLine(tree) {
    return tree.type === 'line';
}
function isVirtual(tree) {
    return tree.type === 'virtual';
}
function isTop(tree) {
    return tree.type === 'top';
}
/**
 * Return the tree which consists of everything up to the line node with the
 * given number. All later siblings of that line node, recursively, are removed.
 *
 * This function does not assume the line numbers appear contiguously, but will
 * return anything before the numbered line, whether its line number is greater
 * or not.
 *
 * This is destructive and modifies the tree.
 */
function cutTreeAfterLine(tree, lineNumber) {
    function cut(tree) {
        if (!isVirtual(tree) && !isTop(tree) && tree.lineNumber === lineNumber) {
            tree.subs = [];
            return true;
        }
        for (let i = 0; i < tree.subs.length; i++) {
            if (cut(tree.subs[i])) {
                tree.subs = tree.subs.slice(0, i + 1);
                return true;
            }
        }
        return false;
    }
    cut(tree);
}
/**
 * Return a deep duplicate of the tree -- this will only work if the labels can be stringified to parseable JSON.
 */
function duplicateTree(tree) {
    return JSON.parse(JSON.stringify(tree));
}
//# sourceMappingURL=classes.js.map