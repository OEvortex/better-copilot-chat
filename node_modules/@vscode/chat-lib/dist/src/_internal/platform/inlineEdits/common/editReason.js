"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.EditReasons = exports.TextModelEditReason = exports.EditReason = void 0;
class EditReason {
    static create(metadata) {
        if (!metadata) {
            return EditReason.unknown;
        }
        return new EditReason(metadata);
    }
    constructor(metadata) {
        this.metadata = metadata;
    }
    static { this.unknown = new EditReason({ source: 'unknown', name: undefined }); }
    toKey(level) {
        return new TextModelEditReason(this.metadata, privateSymbol).toKey(level);
    }
}
exports.EditReason = EditReason;
const privateSymbol = Symbol('TextModelEditReason');
class TextModelEditReason {
    constructor(metadata, _privateCtorGuard) {
        this.metadata = metadata;
    }
    toString() {
        return `${this.metadata.source}`;
    }
    getType() {
        const metadata = this.metadata;
        switch (metadata.source) {
            case 'cursor':
                return metadata.kind;
            case 'inlineCompletionAccept':
                return metadata.source + (metadata.$nes ? ':nes' : '');
            case 'unknown':
                return metadata.name || 'unknown';
            default:
                return metadata.source;
        }
    }
    /**
     * Converts the metadata to a key string.
     * Only includes properties/values that have `level` many `$` prefixes or less.
    */
    toKey(level) {
        const metadata = this.metadata;
        const keys = Object.entries(metadata).filter(([key, value]) => {
            const prefixCount = (key.match(/\$/g) || []).length;
            return prefixCount <= level && value !== undefined && value !== null && value !== '';
        }).map(([key, value]) => `${key}:${value}`);
        return keys.join('-');
    }
}
exports.TextModelEditReason = TextModelEditReason;
function createEditReason(metadata) {
    return new TextModelEditReason(metadata, privateSymbol);
}
exports.EditReasons = {
    unknown(data) {
        return createEditReason({
            source: 'unknown',
            name: data.name,
        });
    },
    chatApplyEdits(data) {
        return createEditReason({
            source: 'Chat.applyEdits',
            $modelId: data.modelId,
        });
    },
    inlineCompletionAccept(data) {
        return createEditReason({
            source: 'inlineCompletionAccept',
            $nes: data.nes,
            $extensionId: data.extensionId,
            $$requestUuid: data.requestUuid,
        });
    },
    inlineCompletionPartialAccept(data) {
        return createEditReason({
            source: 'inlineCompletionPartialAccept',
            type: data.type,
            $extensionId: data.extensionId,
            $$requestUuid: data.requestUuid,
        });
    },
    inlineChatApplyEdit(data) {
        return createEditReason({
            source: 'inlineChat.applyEdits',
            $modelId: data.modelId,
        });
    },
    reloadFromDisk: () => createEditReason({ source: 'reloadFromDisk' }),
    cursor(data) {
        return createEditReason({
            source: 'cursor',
            kind: data.kind,
            detailedSource: data.detailedSource,
        });
    },
    setValue: () => createEditReason({ source: 'setValue' }),
    eolChange: () => createEditReason({ source: 'eolChange' }),
    applyEdits: () => createEditReason({ source: 'applyEdits' }),
    snippet: () => createEditReason({ source: 'snippet' }),
    suggest: (data) => createEditReason({ source: 'suggest', $extensionId: data.extensionId }),
};
//# sourceMappingURL=editReason.js.map