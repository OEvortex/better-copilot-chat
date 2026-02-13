"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.getKey = getKey;
/** Type guard to check if an unknown value is an object with a given key. */
function hasKey(value, key) {
    return value !== null && typeof value === 'object' && key in value;
}
/**
 * Attempts to index an unknown value as an object.
 * Returns undefined if the key does not exist on the object.
 */
function getKey(value, key) {
    return hasKey(value, key) ? value[key] : undefined;
}
//# sourceMappingURL=unknown.js.map