"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NullBaseOctoKitService = void 0;
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const githubService_1 = require("./githubService");
class NullBaseOctoKitService extends githubService_1.BaseOctoKitService {
    async getCurrentAuthedUserWithToken(token) {
        return { avatar_url: '', login: 'NullUser', name: 'Null User' };
    }
    async getTeamMembershipWithToken(teamId, token, username) {
        return undefined;
    }
    async _makeGHAPIRequest(routeSlug, method, token, body) {
        return undefined;
    }
}
exports.NullBaseOctoKitService = NullBaseOctoKitService;
//# sourceMappingURL=nullOctokitServiceImpl.js.map