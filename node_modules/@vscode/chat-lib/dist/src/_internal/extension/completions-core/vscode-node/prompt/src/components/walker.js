"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.SnapshotWalker = void 0;
exports.defaultTransformers = defaultTransformers;
const components_1 = require("./components");
/**
 * A utility class for traversing a prompt snapshot tree.
 * The walker applies transformers to modify the context at each node
 * and calls a visitor function with the transformed context.
 */
class SnapshotWalker {
    /**
     * Creates a new SnapshotWalker.
     *
     * @param snapshot - The root node of the snapshot tree to walk
     * @param transformers - Optional array of context transformers to apply during traversal
     */
    constructor(snapshot, transformers = defaultTransformers()) {
        this.snapshot = snapshot;
        this.transformers = transformers;
    }
    /**
     * Walks the snapshot tree and applies the visitor function to each node.
     *
     * @param visitor - Function called for each node during traversal. Return false to skip traversing children.
     * @param options - Optional configuration for the walk
     */
    walkSnapshot(visitor) {
        this.walkSnapshotNode(this.snapshot, undefined, visitor, {});
    }
    walkSnapshotNode(node, parent, visitor, context) {
        // Apply all transformers to create the new context for this node
        const newContext = this.transformers.reduce((ctx, transformer) => transformer(node, parent, ctx), { ...context });
        // Visit the node with the transformed context
        const accept = visitor(node, parent, newContext);
        if (!accept) {
            return;
        }
        // Process children with the new context
        for (const child of node.children ?? []) {
            this.walkSnapshotNode(child, node, visitor, newContext);
        }
    }
}
exports.SnapshotWalker = SnapshotWalker;
function defaultTransformers() {
    return [
        // Weight transformer - computes the weight of the current relative to the parent
        (node, _, context) => {
            if (context.weight === undefined) {
                context.weight = 1;
            }
            const weight = node.props?.weight ?? 1;
            const clampedWeight = typeof weight === 'number' ? Math.max(0, Math.min(1, weight)) : 1;
            return { ...context, weight: clampedWeight * context.weight };
        },
        // Chunk transformer
        (node, _, context) => {
            if (node.name === components_1.Chunk.name) {
                // Initialize chunk set if it doesn't exist
                const chunks = context.chunks ? new Set(context.chunks) : new Set();
                // Add current node path to the set
                chunks.add(node.path);
                return { ...context, chunks };
            }
            return context;
        },
        // Source transformer
        (node, _, context) => {
            if (node.props?.source !== undefined) {
                return { ...context, source: node.props.source };
            }
            return context;
        },
    ];
}
//# sourceMappingURL=walker.js.map