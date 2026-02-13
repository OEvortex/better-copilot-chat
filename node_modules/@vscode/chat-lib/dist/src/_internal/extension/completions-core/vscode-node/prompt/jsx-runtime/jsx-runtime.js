"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.Fragment = fragmentFunction;
exports.jsx = functionComponentFunction;
exports.jsxs = functionComponentFunction;
/**
 * JSX factory function called for any JSX element.
 *
 * @param type Type of the element: `type` is the function that instantiate a prompt component. We store it so that we can render the component later in the virtual prompt.
 * @param props Properties of the element, with children
 */
function functionComponentFunction(type, props, key) {
    let children = [];
    if (Array.isArray(props.children)) {
        children = props.children;
    }
    else if (props.children) {
        children = [props.children];
    }
    const componentProps = { ...props, children };
    if (key) {
        componentProps.key = key;
    }
    return { type, props: componentProps };
}
/**
 * JSX factory function called for any JSX fragment.
 * It is used as the function when the jsx element is a fragment. It gets invoked from the reconciler when it encounters a fragment.
 */
function fragmentFunction(children) {
    return { type: 'f', children };
}
fragmentFunction.isFragmentFunction = true;
//# sourceMappingURL=jsx-runtime.js.map