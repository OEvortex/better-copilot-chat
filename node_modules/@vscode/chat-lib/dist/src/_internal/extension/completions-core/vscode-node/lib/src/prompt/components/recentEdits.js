"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RecentEdits = void 0;
exports.editIsTooCloseToCursor = editIsTooCloseToCursor;
const jsx_runtime_1 = require("../../../../prompt/jsx-runtime//jsx-runtime");
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/** @jsxRuntime automatic */
/** @jsxImportSource ../../../../prompt/jsx-runtime/ */
const components_1 = require("../../../../prompt/src/components/components");
const languageMarker_1 = require("../../../../prompt/src/languageMarker");
const componentsCompletionsPromptFactory_1 = require("../completionsPromptFactory/componentsCompletionsPromptFactory");
function editIsTooCloseToCursor(edit, filterByCursorLine = false, cursorLine = undefined, activeDocDistanceLimitFromCursor) {
    if (filterByCursorLine) {
        if (cursorLine === undefined || activeDocDistanceLimitFromCursor === undefined) {
            throw new Error('cursorLine and activeDocDistanceLimitFromCursor are required when filterByCursorLine is true');
        }
    }
    const startLineNumber = edit.startLine - 1;
    const endLineNumber = edit.endLine - 1;
    if (filterByCursorLine &&
        (Math.abs(startLineNumber - cursorLine) <= activeDocDistanceLimitFromCursor ||
            Math.abs(endLineNumber - cursorLine) <= activeDocDistanceLimitFromCursor)) {
        // skip over a diff that's too close to the cursor
        // this isn't cached since the cursor moves
        return true;
    }
    return false;
}
/**
 * Render the most recent edits in the prompt.
 * @param props
 * @param context
 * @returns a <Text> element containing recent edit summaries, or undefined if there are no recent edits
 */
const RecentEdits = (props, context) => {
    const [prompt, setPrompt] = context.useState();
    context.useData(componentsCompletionsPromptFactory_1.isCompletionRequestData, async (request) => {
        if (!request.document) {
            return;
        }
        const recentEditProvider = props.recentEditsProvider;
        if (recentEditProvider.isEnabled()) {
            recentEditProvider.start();
        }
        else {
            return;
        }
        const recentEditsConfig = recentEditProvider.config;
        const recentEdits = recentEditProvider.getRecentEdits();
        const filesIncluded = new Set();
        const tdm = props.tdms;
        const editSummaries = [];
        // Walk backwards through the recent edits (most recent first) until we hit the max files or max edits, whichever comes first
        for (let i = recentEdits.length - 1; i >= 0; i--) {
            // if we've hit the max edits, stop
            if (editSummaries.length >= recentEditsConfig.maxEdits) {
                break;
            }
            const edit = recentEdits[i];
            // If the file is excluded, skip it
            if (!(await tdm.getTextDocument({ uri: edit.file }))) {
                continue;
            }
            // If adding an edit from this file would exceed the max files, skip it
            const isNewFile = !filesIncluded.has(edit.file);
            const projectedFileCount = filesIncluded.size + (isNewFile ? 1 : 0);
            if (projectedFileCount > recentEditsConfig.maxFiles) {
                break;
            }
            const filterByCursorLine = edit.file === request.document?.uri;
            const activeDocCursorLine = filterByCursorLine ? request.position.line : undefined;
            // Check if the edit is too close to the cursor line, if applicable, in which case we skip it
            const editTooClose = editIsTooCloseToCursor(edit, filterByCursorLine, activeDocCursorLine, recentEditsConfig.activeDocDistanceLimitFromCursor);
            if (editTooClose) {
                continue;
            }
            const summarizedEdit = recentEditProvider.getEditSummary(edit);
            if (summarizedEdit) {
                filesIncluded.add(edit.file);
                const relativePathOrUri = tdm.getRelativePath({ uri: edit.file });
                editSummaries.unshift((0, languageMarker_1.newLineEnded)(`File: ${relativePathOrUri}`) + (0, languageMarker_1.newLineEnded)(summarizedEdit));
            }
        }
        if (editSummaries.length === 0) {
            setPrompt(undefined);
            return;
        }
        const newPrompt = (0, languageMarker_1.newLineEnded)('These are recently edited files. Do not suggest code that has been deleted.') +
            editSummaries.join('') +
            (0, languageMarker_1.newLineEnded)('End of recent edits');
        setPrompt(newPrompt);
    });
    return prompt ? ((0, jsx_runtime_1.jsx)(components_1.Chunk, { children: (0, jsx_runtime_1.jsx)(components_1.Text, { children: prompt }) })) : undefined;
};
exports.RecentEdits = RecentEdits;
//# sourceMappingURL=recentEdits.js.map