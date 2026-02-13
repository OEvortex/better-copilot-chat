"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.NeighborSource = exports.NeighboringFileType = void 0;
exports.considerNeighborFile = considerNeighborFile;
exports.isIncludeNeighborFilesActive = isIncludeNeighborFilesActive;
const instantiation_1 = require("../../../../../../../util/vs/platform/instantiation/common/instantiation");
const prompt_1 = require("../../../../prompt/src/prompt");
const featuresService_1 = require("../../experiments/featuresService");
const logger_1 = require("../../logger");
const textDocumentManager_1 = require("../../textDocumentManager");
const openTabFiles_1 = require("./openTabFiles");
const relatedFiles_1 = require("./relatedFiles");
// There is a limitation of the number of the neighbor files. So I use the next strategies to pick the most relevant cursor focused files.
var NeighboringFileType;
(function (NeighboringFileType) {
    NeighboringFileType["None"] = "none";
    NeighboringFileType["OpenTabs"] = "opentabs";
    NeighboringFileType["CursorMostRecent"] = "cursormostrecent";
    NeighboringFileType["CursorMostCount"] = "cursormostcount";
    NeighboringFileType["WorkspaceSharingSameFolder"] = "workspacesharingsamefolder";
    NeighboringFileType["WorkspaceSmallestPathDist"] = "workspacesmallestpathdist";
    NeighboringFileType["OpenTabsAndCocommitted"] = "opentabsandcocommitted";
    NeighboringFileType["RelatedCSharp"] = "related/csharp";
    NeighboringFileType["RelatedCSharpRoslyn"] = "related/csharproslyn";
    NeighboringFileType["RelatedCpp"] = "related/cpp";
    NeighboringFileType["RelatedTypeScript"] = "related/typescript";
    NeighboringFileType["RelatedCppSemanticCodeContext"] = "related/cppsemanticcodecontext";
    NeighboringFileType["RelatedOther"] = "related/other";
})(NeighboringFileType || (exports.NeighboringFileType = NeighboringFileType = {}));
/**
 * We found out that considering
 * all **open** neighbor files (independent of the language) was not helpful. However, some
 * specific languages (e.g. frontend frameworks) benefit from this approach. Leaving this
 * function here for future reference, in case we want to experiment this approach again for
 * specific languages that always use cross-language files.
 *
 * @param languageId Language ID of the current file
 * @param neighborLanguageId Language ID of the neighbor file
 * @returns Boolean value indicating whether the neighbor file should be considered
 *          (currently matching the current file's language with neighbors')
 */
function considerNeighborFile(languageId, neighborLanguageId) {
    return (0, prompt_1.normalizeLanguageId)(languageId) === (0, prompt_1.normalizeLanguageId)(neighborLanguageId);
}
class NeighborSource {
    // Limit the amount of neighbor data to pass to promptlib.
    static { this.MAX_NEIGHBOR_AGGREGATE_LENGTH = 200000; }
    static { this.MAX_NEIGHBOR_FILES = 20; }
    static { this.EXCLUDED_NEIGHBORS = ['node_modules', 'dist', 'site-packages']; }
    static defaultEmptyResult() {
        return {
            docs: new Map(),
            neighborSource: new Map(),
            traits: [],
        };
    }
    /** Reset the singleton instance for unit test only */
    static reset() {
        NeighborSource.instance = undefined;
    }
    static async getNeighborFilesAndTraits(accessor, uri, fileType, telemetryData, cancellationToken, data, forceRelatedFilesComputation) {
        const featuresService = accessor.get(featuresService_1.ICompletionsFeaturesService);
        const logTarget = accessor.get(logger_1.ICompletionsLogTargetService);
        const instantiationService = accessor.get(instantiation_1.IInstantiationService);
        const docManager = accessor.get(textDocumentManager_1.ICompletionsTextDocumentManagerService);
        if (NeighborSource.instance === undefined) {
            NeighborSource.instance = instantiationService.createInstance(openTabFiles_1.OpenTabFiles);
        }
        const result = {
            ...(await NeighborSource.instance.getNeighborFiles(uri, fileType, NeighborSource.MAX_NEIGHBOR_FILES)),
            traits: [],
        };
        if (featuresService.excludeRelatedFiles(fileType, telemetryData)) {
            return result;
        }
        const doc = await docManager.getTextDocument({ uri });
        if (!doc) {
            relatedFiles_1.relatedFilesLogger.debug(logTarget, 'neighborFiles.getNeighborFilesAndTraits', `Failed to get the related files: failed to get the document ${uri}`);
            return result;
        }
        const wksFolder = docManager.getWorkspaceFolder(doc);
        if (!wksFolder) {
            relatedFiles_1.relatedFilesLogger.debug(logTarget, 'neighborFiles.getNeighborFilesAndTraits', `Failed to get the related files: ${uri} is not under the workspace folder`);
            return result;
        }
        const relatedFiles = await instantiationService.invokeFunction(relatedFiles_1.getRelatedFilesAndTraits, doc, telemetryData, cancellationToken, data, forceRelatedFilesComputation);
        if (relatedFiles.entries.size === 0) {
            relatedFiles_1.relatedFilesLogger.debug(logTarget, 'neighborFiles.getNeighborFilesAndTraits', `0 related files found for ${uri}`);
            // make sure we include traits if there's any
            result.traits.push(...relatedFiles.traits);
            return result;
        }
        relatedFiles.entries.forEach((uriToContentMap, type) => {
            const addedDocs = [];
            uriToContentMap.forEach((source, uri) => {
                const relativePath = NeighborSource.getRelativePath(uri, wksFolder.uri);
                if (!relativePath) {
                    return;
                }
                // Check that results.docs does not already contain an entry for the given uri.
                if (result.docs.has(uri)) {
                    return;
                }
                const relatedFileDocInfo = { relativePath, uri, source };
                addedDocs.unshift(relatedFileDocInfo);
                result.docs.set(uri, relatedFileDocInfo);
            });
            if (addedDocs.length > 0) {
                result.neighborSource.set(type, addedDocs.map(doc => doc.uri.toString()));
            }
        });
        result.traits.push(...relatedFiles.traits);
        return result;
    }
    static basename(uri) {
        return decodeURIComponent(uri.replace(/[#?].*$/, '').replace(/^.*[/:]/, ''));
    }
    /**
     * Get the fileUri relative to the provided basePath
     * or its basename if basePath is not its ancestor.
     */
    static getRelativePath(fileUri, baseUri) {
        const parentURI = baseUri
            .toString()
            .replace(/[#?].*/, '')
            .replace(/\/?$/, '/');
        if (fileUri.toString().startsWith(parentURI)) {
            return fileUri.toString().slice(parentURI.length);
        }
        return NeighborSource.basename(fileUri);
    }
}
exports.NeighborSource = NeighborSource;
function isIncludeNeighborFilesActive(accessor, languageId, telemetryData) {
    const featuresService = accessor.get(featuresService_1.ICompletionsFeaturesService);
    return featuresService.includeNeighboringFiles(languageId, telemetryData);
}
//# sourceMappingURL=neighborFiles.js.map