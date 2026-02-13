"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserKind = getUserKind;
/**
 * A function used to determine if the org list contains an known organization
 * @param orgs The list of organizations the user is a member of
 * @returns The first known organization or undefined if none are known.
 */
function findKnownOrg(orgs) {
    // Do not add org mapping
    const known_orgs = [
        'a5db0bcaae94032fe715fb34a5e4bce2',
        '7184f66dfcee98cb5f08a1cb936d5225',
        'faef89d9169d5eacf1d8c8dde3412e37',
        '4535c7beffc844b46bb1ed4aa04d759a',
    ];
    return known_orgs.find(o => orgs.includes(o));
}
function getUserKind(token) {
    const orgs = token.organizationList ?? [];
    return findKnownOrg(orgs) ?? '';
}
//# sourceMappingURL=orgs.js.map