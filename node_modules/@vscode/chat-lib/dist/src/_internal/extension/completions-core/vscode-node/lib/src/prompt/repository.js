"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.ComputationStatus = void 0;
exports.tryGetGitHubNWO = tryGetGitHubNWO;
exports.extractRepoInfoInBackground = extractRepoInfoInBackground;
exports.extractRepoInfo = extractRepoInfo;
const gitService_1 = require("../../../../../../platform/git/common/gitService");
const fileSystem_1 = require("../fileSystem");
const cache_1 = require("../helpers/cache");
const uri_1 = require("../util/uri");
function tryGetGitHubNWO(repoInfo) {
    if (repoInfo === undefined) {
        return undefined;
    }
    if (repoInfo === ComputationStatus.PENDING) {
        return undefined;
    }
    if (repoInfo.repoId?.type === 'github') {
        return (repoInfo.repoId.org + '/' + repoInfo.repoId.repo).toLowerCase();
    }
    return undefined;
}
/**
 * Sends off a computation to extract information about which git repo the file belongs to in the background.
 * @param fileUri URI of a file under the repo
 * @returns
 *  - If the computation is still running (in particular for the first time), returns ComputationStatus.PENDING.
 *  - If a file from this path has been looked at before, and no repository has been identified, returns undefined.
 *  - If a file from this path has been looked at before, and a repository has been identified, returns the repo info.
 */
function extractRepoInfoInBackground(accessor, uri) {
    const baseFolder = (0, uri_1.dirname)(uri);
    return backgroundRepoInfo(accessor, baseFolder);
}
// Note that we assume that the same filesystem path always returns the same repository information.
// If this changes on disk, or if two different contexts with different FileSystem implementations
// are passed for the same path, such as for a test, then the cached value may be incorrect
const backgroundRepoInfo = computeInBackgroundAndMemoize(extractRepoInfo, 10000);
/**
 * If the file is part of a git repository, return the information about the repository.
 * @param uri URI of a folder or file in the repository
 * @param fs The file system to be used
 * @returns A RepoInfo object, or undefined if the file is not part of a git repository.
 * If it does appear to be part of a git repository, but its information is not parsable,
 * it returns a RepoInfo object with hostname, user and repo set to "".
 */
async function extractRepoInfo(accessor, uri) {
    const fs = accessor.get(fileSystem_1.ICompletionsFileSystemService);
    const fsUri = (0, uri_1.getFsUri)(uri);
    if (!fsUri) {
        return undefined;
    }
    const baseUri = await getRepoBaseUri(fs, fsUri);
    if (!baseUri) {
        return undefined;
    }
    const configUri = (0, uri_1.joinPath)(baseUri, '.git', 'config');
    let gitConfig;
    try {
        gitConfig = await fs.readFileString(configUri);
    }
    catch (_) {
        // typically an ENOENT or EPERM, wrapped in varying ways depending on which FileSystem implementation is used
        return undefined;
    }
    const url = getRepoUrlFromConfigText(gitConfig) ?? '';
    const parsedResult = parseRepoUrl(url);
    const baseFolder = { uri: baseUri };
    if (parsedResult === undefined) {
        return { baseFolder, url, hostname: '', pathname: '', repoId: undefined };
    }
    else {
        return { baseFolder, url, hostname: parsedResult.host, pathname: parsedResult.path, repoId: parsedResult.repoId };
    }
}
function parseRepoUrl(url) {
    const res = (0, gitService_1.parseRemoteUrl)(url);
    if (!res) {
        return undefined;
    }
    const repoId = (0, gitService_1.getGithubRepoIdFromFetchUrl)(url) ?? (0, gitService_1.getAdoRepoIdFromFetchUrl)(url);
    return { ...res, repoId };
}
/**
 * Returns the base folder of the git repository containing the file, or undefined if none is found.
 * Will search recursively for a .git folder containing a config file.
 */
async function getRepoBaseUri(fileSystemService, uri) {
    // to make sure the while loop terminates, we make sure the path variable decreases in length
    let previousUri = uri + '_add_to_make_longer';
    while (uri !== 'file:///' && uri.length < previousUri.length) {
        const configUri = (0, uri_1.joinPath)(uri, '.git', 'config');
        let result = false;
        try {
            await fileSystemService.stat(configUri);
            result = true;
        }
        catch (reason) {
            result = false;
        }
        if (result) {
            return uri;
        }
        else {
            previousUri = uri;
            uri = (0, uri_1.dirname)(uri);
        }
    }
    return undefined;
}
/**
 * Parses a git config file, returning
 * 1. remote.origin.url if it exists,
 * 2. any remote.[name].url if it exists but not 1.,
 * 3. undefined if neither exist.
 * Will throw if the file does not exist.
 *
 * The config format is expected to follow https://git-scm.com/docs/git-config#_configuration_file
 * e.g. it could include lines like
    [remote "origin"]
        url = git@github.com:microsoft/vscode-copilot-chat.git
        fetch = +refs/heads/*:refs/remotes/origin/*
 *
 * Known limitations:
 * - This will not respect include and includeIf directions
 *
 * @param gitConfig the contents of the git config file
 * @returns the url, or undefined if none found
 */
function getRepoUrlFromConfigText(gitConfig) {
    // We're looking for [remote "origin"] and [remote "name"] sections
    // section headers must be one line,
    // except for whitespace, they're [section "subsection"]
    // where subsection can contain " by escaping \" and
    // can escape \ by \\ (so that e.g. it can be the last character before the ")
    const remoteSectionRegex = /^\s*\[\s*remote\s+"((\\\\|\\"|[^\\"])+)"/;
    // deprecated syntax: [section.subsection]
    const deprecatedRemoteSectionRegex = /^\s*\[remote.([^"\s]+)/;
    // extract the name of the remote -- assume it doesn't contain whitespace, and remember # and ; start comments
    const setUrlRegex = /^\s*url\s*=\s*([^\s#;]+)/;
    // use the following to check whether the current section ended
    const newSectionRegex = /^\s*\[/;
    let remoteUrl = undefined;
    let remoteSection = undefined;
    let isWithinMultilineUrl = false;
    for (const line of gitConfig.split('\n')) {
        if (isWithinMultilineUrl && remoteUrl !== undefined) {
            remoteUrl += line;
            if (line.endsWith('\\')) {
                remoteUrl = remoteUrl.substring(0, remoteUrl.length - 1);
            }
            else {
                isWithinMultilineUrl = false;
                if (remoteSection === 'origin') {
                    // we're already finished
                    return remoteUrl;
                }
            }
        }
        else {
            // check whether a new section starts
            const remoteSectionMatch = line.match(remoteSectionRegex) ?? line.match(deprecatedRemoteSectionRegex);
            if (remoteSectionMatch) {
                remoteSection = remoteSectionMatch[1];
            }
            else if (line.match(newSectionRegex)) {
                remoteSection = undefined;
            }
            else if (remoteUrl && remoteSection !== 'origin') {
                // if we already have any remote url, only "origin" is more interesting
                continue;
            }
            else {
                const urlMatch = line.match(setUrlRegex);
                if (urlMatch) {
                    remoteUrl = urlMatch[1];
                    if (remoteUrl.endsWith('\\')) {
                        remoteUrl = remoteUrl.substring(0, remoteUrl.length - 1);
                        isWithinMultilineUrl = true;
                    }
                    else if (remoteSection === 'origin') {
                        // we're already finished
                        return remoteUrl;
                    }
                }
            }
        }
    }
    return remoteUrl;
}
/**
 * Helper functionality for doing the computation in the background
 */
var ComputationStatus;
(function (ComputationStatus) {
    ComputationStatus[ComputationStatus["PENDING"] = 0] = "PENDING";
})(ComputationStatus || (exports.ComputationStatus = ComputationStatus = {}));
class CompletedComputation {
    constructor(result) {
        this.result = result;
    }
}
/**
 * Function wrapper that memoizes a given function to be computed in the background.
 * Until the first computation is complete, the wrapper returns ComputationStatus.PENDING.
 * The context is not taken into account for computing the cache key so the function may
 * behave incorrectly if called with different contexts.
 * @param fct A function returning a promise whose arguments are amenable to JSON.stringify.
 * @param cacheSize Number of elements to cache.
 * @returns The memoized function, which returns ComputationStatus.PENDING until the first computation is complete.
 */
function computeInBackgroundAndMemoize(fct, cacheSize) {
    const resultsCache = new cache_1.LRUCacheMap(cacheSize);
    const inComputation = new Set();
    return (accessor, ...args) => {
        const key = JSON.stringify(args);
        const memorizedComputation = resultsCache.get(key);
        if (memorizedComputation) {
            return memorizedComputation.result;
        }
        if (inComputation.has(key)) {
            // already being computed from a different call
            return ComputationStatus.PENDING;
        }
        const computation = fct(accessor, ...args);
        inComputation.add(key);
        void computation.then(computedResult => {
            // remove from inComputation
            resultsCache.set(key, new CompletedComputation(computedResult));
            inComputation.delete(key);
        });
        return ComputationStatus.PENDING;
    };
}
//# sourceMappingURL=repository.js.map