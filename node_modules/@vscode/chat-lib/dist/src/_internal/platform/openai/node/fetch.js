"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatFailKind = exports.FetchResponseKind = void 0;
var FetchResponseKind;
(function (FetchResponseKind) {
    FetchResponseKind["Success"] = "success";
    FetchResponseKind["Failed"] = "failed";
    FetchResponseKind["Canceled"] = "canceled";
})(FetchResponseKind || (exports.FetchResponseKind = FetchResponseKind = {}));
var ChatFailKind;
(function (ChatFailKind) {
    ChatFailKind["OffTopic"] = "offTopic";
    ChatFailKind["TokenExpiredOrInvalid"] = "tokenExpiredOrInvalid";
    ChatFailKind["ServerCanceled"] = "serverCanceled";
    ChatFailKind["ClientNotSupported"] = "clientNotSupported";
    ChatFailKind["RateLimited"] = "rateLimited";
    ChatFailKind["QuotaExceeded"] = "quotaExceeded";
    ChatFailKind["ExtensionBlocked"] = "extensionBlocked";
    ChatFailKind["ServerError"] = "serverError";
    ChatFailKind["ContentFilter"] = "contentFilter";
    ChatFailKind["AgentUnauthorized"] = "unauthorized";
    ChatFailKind["AgentFailedDependency"] = "failedDependency";
    ChatFailKind["ValidationFailed"] = "validationFailed";
    ChatFailKind["InvalidPreviousResponseId"] = "invalidPreviousResponseId";
    ChatFailKind["NotFound"] = "notFound";
    ChatFailKind["Unknown"] = "unknown";
})(ChatFailKind || (exports.ChatFailKind = ChatFailKind = {}));
//# sourceMappingURL=fetch.js.map