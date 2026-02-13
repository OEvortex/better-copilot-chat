"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseRaw = parseRaw;
exports.labelLines = labelLines;
exports.labelVirtualInherited = labelVirtualInherited;
exports.buildLabelRules = buildLabelRules;
exports.combineClosersAndOpeners = combineClosersAndOpeners;
exports.groupBlocks = groupBlocks;
exports.flattenVirtual = flattenVirtual;
exports.registerLanguageSpecificParser = registerLanguageSpecificParser;
exports.parseTree = parseTree;
const classes_1 = require("./classes");
const manipulation_1 = require("./manipulation");
/**
 * Perform a raw indentation-tree parse of a string. This is completely
 * language-agnostic and the returned tree is unlabeled.
 *
 *  - Blank lines pertain to the top-most node that they may, as restricted
 *    by next non-blank line. So e.g.
 *
 *         E
 *           e1
 *             e2
 *
 *           e3
 *
 *     Then e1.subs = [e2], and E.subs = [ e1, blank, e3 ].
 *
 */
function parseRaw(source) {
    const rawLines = source.split('\n');
    // TODO: How to handle mix of tabs and spaces?
    const indentations = rawLines.map(line => line.match(/^\s*/)[0].length);
    const lines = rawLines.map(line => line.trimLeft());
    function parseNode(line) {
        const [subs, nextLine] = parseSubs(line + 1, indentations[line]);
        const node = (0, classes_1.lineNode)(indentations[line], line, lines[line], subs);
        return [node, nextLine];
    }
    function parseSubs(initialLine, parentIndentation) {
        let sub;
        const subs = [];
        let line = initialLine;
        let lastBlank = undefined;
        while (line < lines.length && (lines[line] === '' || indentations[line] > parentIndentation)) {
            if (lines[line] === '') {
                if (lastBlank === undefined) {
                    lastBlank = line;
                }
                line += 1;
            }
            else {
                if (lastBlank !== undefined) {
                    for (let i = lastBlank; i < line; i++) {
                        subs.push((0, classes_1.blankNode)(i));
                    }
                    lastBlank = undefined;
                }
                [sub, line] = parseNode(line);
                subs.push(sub);
            }
        }
        // Trailing blanks are left for the grandparent
        if (lastBlank !== undefined) {
            line = lastBlank;
        }
        return [subs, line];
    }
    const [subs, parsedLine] = parseSubs(0, -1);
    let line = parsedLine;
    // Special case: trailing blank lines at end of file
    while (line < lines.length && lines[line] === '') {
        subs.push((0, classes_1.blankNode)(line));
        line += 1;
    }
    if (line < lines.length) {
        throw new Error(`Parsing did not go to end of file. Ended at ${line} out of ${lines.length}`);
    }
    return (0, classes_1.topNode)(subs);
}
/** Labels the line elements of the tree in-place according to rules */
function labelLines(tree, labelRules) {
    function visitor(tree) {
        if ((0, classes_1.isLine)(tree)) {
            const rule = labelRules.find(rule => rule.matches(tree.sourceLine));
            if (rule) {
                tree.label = rule.label;
            }
        }
    }
    (0, manipulation_1.visitTree)(tree, visitor, 'bottomUp');
}
/**
 * For each virtual node, if the node has only one non-blank sub, then label
 * the virtual node as that sub.
 */
function labelVirtualInherited(tree) {
    function visitor(tree) {
        if ((0, classes_1.isVirtual)(tree) && tree.label === undefined) {
            const subs = tree.subs.filter(sub => !(0, classes_1.isBlank)(sub));
            if (subs.length === 1) {
                tree.label = subs[0].label;
            }
        }
    }
    (0, manipulation_1.visitTree)(tree, visitor, 'bottomUp');
}
/**
 * Function to convert a mapped object to a list of rules.
 * This allows some type magic for extracting a label type from a mapping of rules.
 */
function buildLabelRules(ruleMap) {
    return Object.keys(ruleMap).map(key => {
        let matches;
        if (ruleMap[key].test) {
            matches = sourceLine => ruleMap[key].test(sourceLine);
        }
        else {
            matches = ruleMap[key];
        }
        return {
            matches,
            label: key,
        };
    });
}
/**
 * Fills the opener and closer indentation spec
 * 1. Openers alone in a line whose older sibling is a line are moved to be the first of that sibling's children,
 *    and their children integrated as subsequent children of their new parent.
 * 2. Closers following an older sibling (maybe with blanks in between) are moved to be the last of that sibling.
 * 3. If the closer in 2 has children themselves, their older siblings are wrapped in a virtual node
 */
function combineClosersAndOpeners(tree) {
    const rebuilder = function (tree) {
        if (tree.subs.length === 0 ||
            tree.subs.findIndex(sub => sub.label === 'closer' || sub.label === 'opener') === -1) {
            return tree;
        }
        const newSubs = [];
        let lastNew;
        for (let i = 0; i < tree.subs.length; i++) {
            const sub = tree.subs[i];
            const directOlderSibling = tree.subs[i - 1];
            // 1. if opener whose older sibling is a line, move to first of that sibling's children
            if (sub.label === 'opener' && directOlderSibling !== undefined && (0, classes_1.isLine)(directOlderSibling)) {
                // Move the bracket to be the last child of it
                directOlderSibling.subs.push(sub);
                sub.subs.forEach(sub => directOlderSibling.subs.push(sub));
                sub.subs = [];
            }
            // 2. if a closer following an older sibling
            else if (sub.label === 'closer' &&
                lastNew !== undefined &&
                ((0, classes_1.isLine)(sub) || (0, classes_1.isVirtual)(sub)) &&
                sub.indentation >= lastNew.indentation) {
                // Move intervening blanks from newSubs to lastNew.subs
                let j = newSubs.length - 1;
                while (j > 0 && (0, classes_1.isBlank)(newSubs[j])) {
                    j -= 1;
                }
                lastNew.subs.push(...newSubs.splice(j + 1));
                // 3.if the closer in 2 has children themselves, their older siblings are wrapped in a virtual node to distinguish them
                // Except for leading blocks of virtual nodes which have already been wrapped that way
                // i.e. take the longest initial subsequence of lastNew.subs that are all labeled 'virtual' and don't wrap those again
                if (sub.subs.length > 0) {
                    const firstNonVirtual = lastNew.subs.findIndex(sub => sub.label !== 'newVirtual');
                    const subsToKeep = lastNew.subs.slice(0, firstNonVirtual);
                    const subsToWrap = lastNew.subs.slice(firstNonVirtual);
                    const wrappedSubs = subsToWrap.length > 0 ? [(0, classes_1.virtualNode)(sub.indentation, subsToWrap, 'newVirtual')] : [];
                    lastNew.subs = [...subsToKeep, ...wrappedSubs, sub];
                }
                else {
                    lastNew.subs.push(sub);
                }
            }
            else {
                // nothing to do here, just add it normally
                newSubs.push(sub);
                if (!(0, classes_1.isBlank)(sub)) {
                    lastNew = sub;
                }
            }
        }
        tree.subs = newSubs;
        return tree;
    };
    const returnTree = (0, manipulation_1.rebuildTree)(tree, rebuilder);
    (0, manipulation_1.clearLabelsIf)(tree, (arg) => arg === 'newVirtual');
    // now returnTree does not have the helper label 'newVirtual' anymore
    return returnTree;
}
/**
 * If there are more than 1 consecutive sibling separated from others by delimiters,
 * combine them into a virtual node.
 * The possibly several consecutive delimiters will be put with the preceding siblings into the virtual node.
 * Note that offside groupings should be done before this.
 */
function groupBlocks(tree, isDelimiter = classes_1.isBlank, label) {
    const rebuilder = function (tree) {
        if (tree.subs.length <= 1) {
            return tree;
        }
        const newSubs = [];
        let nodesSinceLastFlush = [];
        let currentBlockIndentation;
        let lastNodeWasDelimiter = false;
        // we write to nodesSinceLastDelimiter as cache
        // if we have a non-delimiter after a delimiter, we flush
        // to a new virtual node appended to the newSubs array
        function flushBlockIntoNewSubs(final = false // if final, only wrap in virtual if there are newSubs already
        ) {
            if (currentBlockIndentation !== undefined && (newSubs.length > 0 || !final)) {
                const virtual = (0, classes_1.virtualNode)(currentBlockIndentation, nodesSinceLastFlush, label);
                newSubs.push(virtual);
            }
            else {
                nodesSinceLastFlush.forEach(node => newSubs.push(node));
            }
        }
        for (let i = 0; i < tree.subs.length; i++) {
            const sub = tree.subs[i];
            const subIsDelimiter = isDelimiter(sub);
            if (!subIsDelimiter && lastNodeWasDelimiter) {
                flushBlockIntoNewSubs();
                nodesSinceLastFlush = [];
            }
            lastNodeWasDelimiter = subIsDelimiter;
            nodesSinceLastFlush.push(sub);
            if (!(0, classes_1.isBlank)(sub)) {
                currentBlockIndentation = currentBlockIndentation ?? sub.indentation;
            }
        }
        // treat the end of node like a block end, and make the virtual block if it wouldn't be a singleton
        flushBlockIntoNewSubs(true);
        tree.subs = newSubs;
        return tree;
    };
    return (0, manipulation_1.rebuildTree)(tree, rebuilder);
}
/**
 * Remove unlabeled virtual nodes which either:
 *  - Have one or no children
 *  - Are the only child of their parent
 * In either case, it is replaced by their children.
 */
function flattenVirtual(tree) {
    const rebuilder = function (tree) {
        if ((0, classes_1.isVirtual)(tree) && tree.label === undefined && tree.subs.length <= 1) {
            if (tree.subs.length === 0) {
                return undefined;
            }
            else {
                //tree.subs.length === 1
                return tree.subs[0];
            }
        }
        else if (tree.subs.length === 1 && (0, classes_1.isVirtual)(tree.subs[0]) && tree.subs[0].label === undefined) {
            tree.subs = tree.subs[0].subs;
        }
        return tree;
    };
    return (0, manipulation_1.rebuildTree)(tree, rebuilder);
}
/**
 * Generic labels.
 *
 *  * opener: A line starting with an opening parens, square bracket, or curly brace
 *  * closer: A line starting with a closing parens, square bracket, or curly brace
 */
const _genericLabelRules = {
    opener: /^[[({]/,
    closer: /^[\])}]/,
};
const genericLabelRules = buildLabelRules(_genericLabelRules);
const LANGUAGE_SPECIFIC_PARSERS = {};
/**
 * Register a language-specific parser for a language.
 * This should normally be called in index.ts.
 */
function registerLanguageSpecificParser(language, parser) {
    LANGUAGE_SPECIFIC_PARSERS[language] = parser;
}
function parseTree(source, languageId) {
    const raw = parseRaw(source);
    const languageSpecificParser = LANGUAGE_SPECIFIC_PARSERS[languageId ?? ''];
    if (languageSpecificParser) {
        return languageSpecificParser(raw);
    }
    else {
        labelLines(raw, genericLabelRules);
        const processedTree = combineClosersAndOpeners(raw);
        return processedTree;
    }
}
//# sourceMappingURL=parsing.js.map