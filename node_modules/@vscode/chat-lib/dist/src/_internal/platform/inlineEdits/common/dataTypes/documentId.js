"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentId = void 0;
const cache_1 = require("../../../../util/vs/base/common/cache");
const path_1 = require("../../../../util/vs/base/common/path");
const uri_1 = require("../../../../util/vs/base/common/uri");
/**
 * Refers to a document, independent of its content or a point in time.
 * Two document ids are equal if they are triple-equal.
*/
class DocumentId {
    static { this._cache = new cache_1.CachedFunction({ getCacheKey: JSON.stringify }, (arg) => new DocumentId(arg.uri)); }
    static create(uri) {
        return DocumentId._cache.get({ uri });
    }
    constructor(uri) {
        this.uri = uri;
        this._uri = uri_1.URI.parse(this.uri);
    }
    get path() {
        return this._uri.path;
    }
    get fragment() {
        return this._uri.fragment;
    }
    toString() {
        return this.uri;
    }
    get baseName() {
        return (0, path_1.basename)(this.uri);
    }
    get extension() {
        return (0, path_1.extname)(this.uri);
    }
    toUri() {
        return this._uri;
    }
}
exports.DocumentId = DocumentId;
//# sourceMappingURL=documentId.js.map