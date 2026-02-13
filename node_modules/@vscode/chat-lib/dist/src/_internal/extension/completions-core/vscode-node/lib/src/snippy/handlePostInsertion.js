"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchCitations = fetchCitations;
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const value_1 = require("@sinclair/typebox/value");
const instantiation_1 = require("../../../../../../util/vs/platform/instantiation/common/instantiation");
const citationManager_1 = require("../citationManager");
const logger_1 = require("../logger");
const textDocumentManager_1 = require("../textDocumentManager");
const Snippy = __importStar(require("./"));
const SnippyCompute = __importStar(require("./compute"));
const logger_2 = require("./logger");
const snippy_proto_1 = require("./snippy.proto");
const telemetryHandlers_1 = require("./telemetryHandlers");
function isError(payload) {
    return value_1.Value.Check(snippy_proto_1.MatchError, payload);
}
async function snippyRequest(accessor, requestFn) {
    const instantiationService = accessor.get(instantiation_1.IInstantiationService);
    const res = await requestFn();
    if (isError(res)) {
        telemetryHandlers_1.snippyTelemetry.handleSnippyNetworkError({
            instantiationService,
            origin: String(res.code),
            reason: res.reason,
            message: res.msg,
        });
        return;
    }
    return res;
}
function isMatchError(response) {
    return 'kind' in response && response.kind === 'failure';
}
async function fetchCitations(accessor, uri, completionText, insertionOffset) {
    const instantiationService = accessor.get(instantiation_1.IInstantiationService);
    const logTarget = accessor.get(logger_1.ICompletionsLogTargetService);
    const documentManager = accessor.get(textDocumentManager_1.ICompletionsTextDocumentManagerService);
    const citationManager = accessor.get(citationManager_1.ICompletionsCitationManager);
    const insertionDoc = await documentManager.getTextDocument({ uri });
    // If the match occurred in a file that no longer exists, bail.
    if (!insertionDoc) {
        logger_2.codeReferenceLogger.debug(logTarget, `Expected document matching ${uri}, got nothing.`);
        return;
    }
    // The document text will include the completion at this point
    const docText = insertionDoc.getText();
    // If the document + the completion isn't long enough, we know we shouldn't call snippy
    if (!SnippyCompute.hasMinLexemeLength(docText)) {
        return;
    }
    // If the document + the completion isn't long enough, we know we shouldn't call snippy
    if (!SnippyCompute.hasMinLexemeLength(docText)) {
        return;
    }
    let potentialMatchContext = completionText;
    // In many cases, we will get completion that is shorter than 65 tokens,
    // e.g. a single line or word completion.
    // When a completion is too short, we should try and get the preceding tokens and
    // pass that to snippy as part of the context.
    if (!SnippyCompute.hasMinLexemeLength(completionText)) {
        const textWithoutCompletion = docText.slice(0, insertionOffset);
        const minLexemeStartOffset = SnippyCompute.offsetLastLexemes(textWithoutCompletion, SnippyCompute.MinTokenLength);
        potentialMatchContext = docText.slice(minLexemeStartOffset, insertionOffset + completionText.length);
    }
    // Depending on where in the document the suggestion was inserted, we may still not have enough context
    // to detect a match.
    if (!SnippyCompute.hasMinLexemeLength(potentialMatchContext)) {
        return;
    }
    const matchResponse = await instantiationService.invokeFunction(acc => snippyRequest(acc, () => Snippy.Match(acc, potentialMatchContext)));
    if (!matchResponse || isMatchError(matchResponse) || !matchResponse.snippets.length) {
        // No match response from Snippy
        logger_2.codeReferenceLogger.info(logTarget, 'No match found');
        return;
    }
    logger_2.codeReferenceLogger.info(logTarget, 'Match found');
    const { snippets } = matchResponse;
    const citationPromises = snippets.map(async (snippet) => {
        const response = await instantiationService.invokeFunction(acc => snippyRequest(acc, () => Snippy.FilesForMatch(acc, { cursor: snippet.cursor })));
        if (!response || isMatchError(response)) {
            return;
        }
        const files = response.file_matches;
        const licenseStats = response.license_stats;
        return {
            match: snippet,
            files,
            licenseStats,
        };
    });
    const citations = await Promise.all(citationPromises);
    const filtered = citations.filter(c => c !== undefined);
    // This shouldn't ever happen, but we should handle it nonetheless.
    if (!filtered.length) {
        return;
    }
    for (const citation of filtered) {
        const licensesSet = new Set(Object.keys(citation.licenseStats?.count ?? {}));
        if (licensesSet.has('NOASSERTION')) {
            licensesSet.delete('NOASSERTION');
            licensesSet.add('unknown');
        }
        const allLicenses = Array.from(licensesSet).sort();
        const offsetStart = insertionOffset;
        const offsetEnd = insertionOffset + citation.match.matched_source.length;
        const start = insertionDoc.positionAt(offsetStart);
        const end = insertionDoc.positionAt(offsetEnd);
        await citationManager.handleIPCodeCitation({
            inDocumentUri: uri,
            offsetStart,
            offsetEnd,
            version: insertionDoc.version,
            location: { start, end },
            matchingText: potentialMatchContext,
            details: allLicenses.map(license => ({
                license,
                url: citation.match.github_url,
            })),
        });
    }
}
//# sourceMappingURL=handlePostInsertion.js.map