"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * File inspired by snippy at /proto/snippy.proto
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileMatchResponse = exports.FileMatchRequest = exports.MatchResponse = exports.MatchRequest = exports.MatchError = void 0;
const typebox_1 = require("@sinclair/typebox");
exports.MatchError = typebox_1.Type.Object({
    kind: typebox_1.Type.Literal('failure'),
    reason: typebox_1.Type.String(),
    code: typebox_1.Type.Number(),
    msg: typebox_1.Type.String(),
    meta: typebox_1.Type.Optional(typebox_1.Type.Any()),
});
const Snippet = typebox_1.Type.Object({
    matched_source: typebox_1.Type.String(),
    occurrences: typebox_1.Type.String(),
    capped: typebox_1.Type.Boolean(),
    cursor: typebox_1.Type.String(),
    github_url: typebox_1.Type.String(),
});
exports.MatchRequest = typebox_1.Type.Object({
    source: typebox_1.Type.String(),
});
const MatchSuccess = typebox_1.Type.Object({
    snippets: typebox_1.Type.Array(Snippet),
});
exports.MatchResponse = typebox_1.Type.Union([
    // Snippet type
    MatchSuccess,
    // Error type
    exports.MatchError,
]);
exports.FileMatchRequest = typebox_1.Type.Object({
    cursor: typebox_1.Type.String(),
});
const FileMatch = typebox_1.Type.Object({
    commit_id: typebox_1.Type.String(),
    license: typebox_1.Type.String(),
    nwo: typebox_1.Type.String(),
    path: typebox_1.Type.String(),
    url: typebox_1.Type.String(),
});
const PageInfo = typebox_1.Type.Object({
    has_next_page: typebox_1.Type.Boolean(),
    cursor: typebox_1.Type.String(),
});
const LicenseStats = typebox_1.Type.Object({
    count: typebox_1.Type.Record(typebox_1.Type.String(), typebox_1.Type.String()),
});
const FileMatchSuccess = typebox_1.Type.Object({
    file_matches: typebox_1.Type.Array(FileMatch),
    page_info: PageInfo,
    license_stats: LicenseStats,
});
exports.FileMatchResponse = typebox_1.Type.Union([FileMatchSuccess, exports.MatchError]);
//# sourceMappingURL=snippy.proto.js.map