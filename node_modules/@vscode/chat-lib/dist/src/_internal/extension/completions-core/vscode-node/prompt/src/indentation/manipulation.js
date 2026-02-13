"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearLabels = clearLabels;
exports.clearLabelsIf = clearLabelsIf;
exports.mapLabels = mapLabels;
exports.resetLineNumbers = resetLineNumbers;
exports.visitTree = visitTree;
exports.visitTreeConditionally = visitTreeConditionally;
exports.foldTree = foldTree;
exports.rebuildTree = rebuildTree;
const classes_1 = require("./classes");
/**
 * Clear all labels (and their types) from the tree.
 * This will modify the tree in place, or return a retyped tree.
 */
function clearLabels(tree) {
    visitTree(tree, (tree) => {
        tree.label = undefined;
    }, 'bottomUp');
    return tree;
}
/** clear labels if condition is true */
function clearLabelsIf(tree, condition) {
    visitTree(tree, (tree) => {
        tree.label = tree.label ? (condition(tree.label) ? undefined : tree.label) : undefined;
    }, 'bottomUp');
    return tree;
}
/**
 * Apply a type changing function to all labels.
 * This will return a new, retyped tree.
 * (For applying a type keeping function to a tree
 * that modifies it in place, use `visitTree`.)
 */
function mapLabels(tree, map) {
    switch (tree.type) {
        case 'line':
        case 'virtual': {
            const newSubs = tree.subs.map(sub => mapLabels(sub, map));
            return { ...tree, subs: newSubs, label: tree.label ? map(tree.label) : undefined };
        }
        case 'blank':
            return { ...tree, label: tree.label ? map(tree.label) : undefined };
        case 'top':
            return {
                ...tree,
                subs: tree.subs.map(sub => mapLabels(sub, map)),
                label: tree.label ? map(tree.label) : undefined,
            };
    }
}
/**
 * Renumber the line numbers of the tree contiguously from 0 and up.
 */
function resetLineNumbers(tree) {
    let lineNumber = 0;
    function visitor(tree) {
        if (!(0, classes_1.isVirtual)(tree) && !(0, classes_1.isTop)(tree)) {
            tree.lineNumber = lineNumber;
            lineNumber++;
        }
    }
    visitTree(tree, visitor, 'topDown');
}
/**
 * Visit the tree with a function that is called on each node.
 *
 * If direction is topDown, then parents are visited before their children.
 * If direction is bottomUp, children are visited in order before their parents,
 * so that leaf nodes are visited first.
 */
function visitTree(tree, visitor, direction) {
    function _visit(tree) {
        if (direction === 'topDown') {
            visitor(tree);
        }
        tree.subs.forEach(subtree => {
            _visit(subtree);
        });
        if (direction === 'bottomUp') {
            visitor(tree);
        }
    }
    _visit(tree);
}
/**
 * Visit the tree with a function that is called on each node --
 * if it returns false, children are not visited (in case of topDown),
 * or the parent is not visited anymore (in case of bottomUp).
 *
 * If direction is topDown, then parents are visited before their children.
 * If direction is bottomUp, children are visited in order before their parents,
 * so that leaf nodes are visited first.
 */
function visitTreeConditionally(tree, visitor, direction) {
    // IDEA: rewrite visitTree to reuse this code
    function _visit(tree) {
        if (direction === 'topDown') {
            if (!visitor(tree)) {
                return false;
            }
        }
        let shouldContinue = true;
        tree.subs.forEach(subtree => {
            shouldContinue = shouldContinue && _visit(subtree);
        });
        if (direction === 'bottomUp') {
            shouldContinue = shouldContinue && visitor(tree);
        }
        return shouldContinue;
    }
    _visit(tree);
}
/**
 * Fold an accumulator function over the tree.
 *
 * If direction is topDown, then parents are visited before their children.
 * If direction is bottomUp, children are visited in order before their parents,
 * so that leaf nodes are visited first.
 */
function foldTree(tree, init, accumulator, direction) {
    let acc = init;
    function visitor(tree) {
        acc = accumulator(tree, acc);
    }
    visitTree(tree, visitor, direction);
    return acc;
}
/**
 * Rebuild the tree from the bottom up by applying a function to each node.
 * The visitor function takes a node whose children have already been rebuilt,
 * and returns a new node to replace it (or undefined if it should be deleted).
 * Optionally, a function can be provided to skip nodes that should just be kept
 * without visiting them or their sub-nodes.
 */
function rebuildTree(tree, visitor, skip) {
    const rebuild = (tree) => {
        if (skip !== undefined && skip(tree)) {
            return tree;
        }
        else {
            const newSubs = tree.subs.map(rebuild).filter(sub => sub !== undefined);
            tree.subs = newSubs;
            return visitor(tree);
        }
    };
    const rebuilt = rebuild(tree);
    if (rebuilt !== undefined) {
        return rebuilt;
    }
    else {
        return (0, classes_1.topNode)();
    }
}
//# sourceMappingURL=manipulation.js.map