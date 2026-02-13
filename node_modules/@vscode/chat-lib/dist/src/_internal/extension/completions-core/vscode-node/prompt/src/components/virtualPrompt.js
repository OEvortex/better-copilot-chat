"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.VirtualPrompt = void 0;
const reconciler_1 = require("./reconciler");
/**
 * The `VirtualPrompt` class holds the in-memory representation of the prompt, and is responsible for updating it with context, and generating immutable snapshots which can be passed to a prompt renderer.
 */
class VirtualPrompt {
    constructor(prompt) {
        this.reconciler = new reconciler_1.VirtualPromptReconciler(prompt);
    }
    snapshotNode(node, cancellationToken) {
        if (!node) {
            return;
        }
        if (cancellationToken?.isCancellationRequested) {
            return 'cancelled';
        }
        const children = [];
        for (const child of node.children ?? []) {
            const result = this.snapshotNode(child, cancellationToken);
            if (result === 'cancelled') {
                return 'cancelled';
            }
            if (result !== undefined) {
                children.push(result);
            }
        }
        return {
            value: node.props?.value?.toString(),
            name: node.name,
            path: node.path,
            props: node.props,
            children,
            statistics: {
                updateDataTimeMs: node.lifecycle?.lifecycleData.getUpdateTimeMsAndReset(),
            },
        };
    }
    snapshot(cancellationToken) {
        try {
            const vTree = this.reconciler.reconcile(cancellationToken);
            if (cancellationToken?.isCancellationRequested) {
                return { snapshot: undefined, status: 'cancelled' };
            }
            if (!vTree) {
                throw new Error('Invalid virtual prompt tree');
            }
            const snapshotNode = this.snapshotNode(vTree, cancellationToken);
            if (snapshotNode === 'cancelled' || cancellationToken?.isCancellationRequested) {
                return { snapshot: undefined, status: 'cancelled' };
            }
            return { snapshot: snapshotNode, status: 'ok' };
        }
        catch (e) {
            return { snapshot: undefined, status: 'error', error: e };
        }
    }
    createPipe() {
        return this.reconciler.createPipe();
    }
}
exports.VirtualPrompt = VirtualPrompt;
//# sourceMappingURL=virtualPrompt.js.map