"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResponseTags = exports.PromptTags = void 0;
var PromptTags;
(function (PromptTags) {
    PromptTags.CURSOR = "<|cursor|>";
    function createTag(key) {
        return {
            start: `<|${key}|>`,
            end: `<|/${key}|>`
        };
    }
    PromptTags.EDIT_WINDOW = createTag("code_to_edit");
    PromptTags.AREA_AROUND = createTag("area_around_code_to_edit");
    PromptTags.CURRENT_FILE = createTag("current_file_content");
    PromptTags.EDIT_HISTORY = createTag("edit_diff_history");
    PromptTags.RECENT_FILES = createTag("recently_viewed_code_snippets");
    PromptTags.RECENT_FILE = createTag("recently_viewed_code_snippet");
})(PromptTags || (exports.PromptTags = PromptTags = {}));
var ResponseTags;
(function (ResponseTags) {
    ResponseTags.NO_CHANGE = {
        start: '<NO_CHANGE>'
    };
    ResponseTags.EDIT = {
        start: '<EDIT>',
        end: '</EDIT>'
    };
    ResponseTags.INSERT = {
        start: '<INSERT>',
        end: '</INSERT>'
    };
})(ResponseTags || (exports.ResponseTags = ResponseTags = {}));
//# sourceMappingURL=tags.js.map