"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.VirtualPromptReconciler = void 0;
const hooks_1 = require("./hooks");
/**
 * Translate a `PromptComponentChild` object into a virtual prompt node.
 */
class VirtualPromptReconciler {
    constructor(prompt) {
        this.lifecycleData = new Map();
        // Initial virtualization
        this.vTree = this.virtualizeElement(prompt, '$', 0);
    }
    reconcile(cancellationToken) {
        if (!this.vTree) {
            throw new Error('No tree to reconcile, make sure to pass a valid prompt');
        }
        if (cancellationToken?.isCancellationRequested) {
            return this.vTree;
        }
        this.vTree = this.reconcileNode(this.vTree, '$', 0, cancellationToken);
        return this.vTree;
    }
    reconcileNode(node, parentNodePath, nodeIndex, cancellationToken) {
        // If the node has no children or does not have a lifecycle, return it as is (primitive nodes)
        if (!node.children && !node.lifecycle) {
            return node;
        }
        let newNode = node;
        const needsReconciliation = node.lifecycle?.isRemountRequired();
        // If the node needs reconciliation, virtualize it again
        if (needsReconciliation) {
            const oldChildrenPaths = this.collectChildPaths(node);
            newNode = this.virtualizeElement(node.component, parentNodePath, nodeIndex);
            const newChildrenPaths = this.collectChildPaths(newNode);
            this.cleanupState(oldChildrenPaths, newChildrenPaths);
            // Otherwise, check if the children need reconciliation
        }
        else if (node.children) {
            const children = [];
            for (let i = 0; i < node.children.length; i++) {
                const child = node.children[i];
                if (child) {
                    const reconciledChild = this.reconcileNode(child, node.path, i, cancellationToken);
                    if (reconciledChild !== undefined) {
                        children.push(reconciledChild);
                    }
                }
            }
            newNode.children = children;
        }
        return newNode;
    }
    virtualizeElement(component, parentNodePath, nodeIndex) {
        if (typeof component === 'undefined') {
            return undefined;
        }
        if (typeof component === 'string' || typeof component === 'number') {
            return {
                name: typeof component,
                path: `${parentNodePath}[${nodeIndex}]`,
                props: { value: component },
                component,
            };
        }
        if (isFragmentFunction(component.type)) {
            const fragment = component.type(component.props.children);
            const indexIndicator = parentNodePath !== '$' ? `[${nodeIndex}]` : ``;
            const componentPath = `${parentNodePath}${indexIndicator}.${fragment.type}`;
            const children = fragment.children.map((c, i) => this.virtualizeElement(c, componentPath, i));
            this.ensureUniqueKeys(children);
            return {
                name: fragment.type,
                path: componentPath,
                children: children.flat().filter(c => c !== undefined),
                component,
            };
        }
        return this.virtualizeFunctionComponent(parentNodePath, nodeIndex, component, component.type);
    }
    virtualizeFunctionComponent(parentNodePath, nodeIndex, component, functionComponent) {
        const indexIndicator = component.props.key ? `["${component.props.key}"]` : `[${nodeIndex}]`;
        const componentPath = `${parentNodePath}${indexIndicator}.${functionComponent.name}`;
        const lifecycle = new PromptElementLifecycle(this.getOrCreateLifecycleData(componentPath));
        const element = functionComponent(component.props, lifecycle);
        const elementToVirtualize = Array.isArray(element) ? element : [element];
        const virtualizedChildren = elementToVirtualize.map((e, i) => this.virtualizeElement(e, componentPath, i));
        const children = virtualizedChildren.flat().filter(e => e !== undefined);
        this.ensureUniqueKeys(children);
        return {
            name: functionComponent.name,
            path: componentPath,
            props: component.props,
            children,
            component,
            lifecycle,
        };
    }
    ensureUniqueKeys(nodes) {
        const keyCount = new Map();
        for (const node of nodes) {
            if (!node) {
                continue;
            }
            const key = node.props?.key;
            if (key) {
                keyCount.set(key, (keyCount.get(key) || 0) + 1);
            }
        }
        // Find all duplicates
        const duplicates = Array.from(keyCount.entries())
            .filter(([_, count]) => count > 1)
            .map(([key]) => key);
        if (duplicates.length > 0) {
            throw new Error(`Duplicate keys found: ${duplicates.join(', ')}`);
        }
    }
    collectChildPaths(node) {
        const paths = [];
        if (node?.children) {
            for (const child of node.children) {
                if (child) {
                    paths.push(child.path);
                    paths.push(...this.collectChildPaths(child));
                }
            }
        }
        return paths;
    }
    cleanupState(oldChildrenPaths, newChildrenPaths) {
        for (const path of oldChildrenPaths) {
            if (!newChildrenPaths.includes(path)) {
                this.lifecycleData.delete(path);
            }
        }
    }
    getOrCreateLifecycleData(path) {
        if (!this.lifecycleData.has(path)) {
            this.lifecycleData.set(path, new PromptElementLifecycleData([]));
        }
        return this.lifecycleData.get(path);
    }
    createPipe() {
        return {
            pump: async (data) => {
                await this.pumpData(data);
            },
        };
    }
    async pumpData(data) {
        if (!this.vTree) {
            throw new Error('No tree to pump data into. Pumping data before initializing?');
        }
        await this.recursivelyPumpData(data, this.vTree);
    }
    async recursivelyPumpData(data, node) {
        if (!node) {
            throw new Error("Can't pump data into undefined node.");
        }
        await node.lifecycle?.dataHook.updateData(data);
        for (const child of node.children || []) {
            await this.recursivelyPumpData(data, child);
        }
    }
}
exports.VirtualPromptReconciler = VirtualPromptReconciler;
class PromptElementLifecycleData {
    constructor(state) {
        this.state = state;
        this._updateTimeMs = 0;
    }
    getUpdateTimeMsAndReset() {
        const value = this._updateTimeMs;
        this._updateTimeMs = 0;
        return value;
    }
}
class PromptElementLifecycle {
    constructor(lifecycleData) {
        this.lifecycleData = lifecycleData;
        this.stateHook = new hooks_1.UseState(lifecycleData.state);
        this.dataHook = new hooks_1.UseData((updateTimeMs) => {
            lifecycleData._updateTimeMs = updateTimeMs;
        });
    }
    useState(initialState) {
        return this.stateHook.useState(initialState);
    }
    useData(typePredicate, consumer) {
        this.dataHook.useData(typePredicate, consumer);
    }
    isRemountRequired() {
        return this.stateHook.hasChanged();
    }
}
function isFragmentFunction(element) {
    return typeof element === 'function' && 'isFragmentFunction' in element;
}
//# sourceMappingURL=reconciler.js.map