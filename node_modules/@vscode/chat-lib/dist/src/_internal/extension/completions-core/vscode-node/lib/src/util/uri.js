"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeFsUri = makeFsUri;
exports.validateUri = validateUri;
exports.normalizeUri = normalizeUri;
exports.fsPath = fsPath;
exports.getFsPath = getFsPath;
exports.getFsUri = getFsUri;
exports.joinPath = joinPath;
exports.basename = basename;
exports.dirname = dirname;
const os_1 = require("os");
const path_1 = require("path");
const resources_1 = require("../../../../../../util/vs/base/common/resources");
const uri_1 = require("../../../../../../util/vs/base/common/uri");
// Borrowed from vscode-uri internals
function decodeURIComponentGraceful(str) {
    try {
        return decodeURIComponent(str);
    }
    catch {
        if (str.length > 3) {
            return str.substring(0, 3) + decodeURIComponentGraceful(str.substring(3));
        }
        else {
            return str;
        }
    }
}
const _rEncodedAsHex = /(%[0-9A-Za-z][0-9A-Za-z])+/g;
function percentDecode(str) {
    if (!str.match(_rEncodedAsHex)) {
        return str;
    }
    return str.replace(_rEncodedAsHex, match => decodeURIComponentGraceful(match));
}
function makeFsUri(fsPath) {
    if (/^[A-Za-z][A-Za-z0-9+.-]+:/.test(fsPath)) {
        throw new Error('Path must not contain a scheme');
    }
    else if (!fsPath) {
        throw new Error('Path must not be empty');
    }
    return uri_1.URI.file(fsPath).toString();
}
function parseUri(uri) {
    if (typeof uri !== 'string') {
        uri = uri.uri;
    }
    if (/^[A-Za-z]:\\/.test(uri)) {
        throw new Error(`Could not parse <${uri}>: Windows-style path`);
    }
    try {
        // Based on the regexp vscode-uri uses for parsing
        const match = uri.match(/^(?:([^:/?#]+?:)?\/\/)(\/\/.*)$/);
        if (match) {
            return uri_1.URI.parse(match[1] + match[2], true);
        }
        else {
            return uri_1.URI.parse(uri, true);
        }
    }
    catch (cause) {
        throw new Error(`Could not parse <${uri}>`, { cause });
    }
}
/**
 * Throw an exception if the URI is unparsable.
 */
/** @public KEEPING FOR TESTS */
function validateUri(uri) {
    parseUri(uri);
    return uri;
}
function normalizeUri(uri) {
    try {
        return parseUri(uri).toString();
    }
    catch {
        // not normalizable, return as is
        return uri;
    }
}
/**
 * URI schemes that map to real file system paths.
 */
const fsSchemes = new Set(['file', 'notebook', 'vscode-notebook', 'vscode-notebook-cell']);
/**
 * For a file system URI, returns the corresponding file system path. Otherwise
 * throws an error.
 */
function fsPath(arg) {
    const uri = parseUri(arg);
    if (!fsSchemes.has(uri.scheme)) {
        throw new Error(`Copilot currently does not support URI with scheme: ${uri.scheme}`);
    }
    if ((0, os_1.platform)() === 'win32') {
        let path = uri.path;
        if (uri.authority) {
            path = `//${uri.authority}${uri.path}`; // UNC path
        }
        else if (/^\/[A-Za-z]:/.test(path)) {
            // omit leading slash from paths with a drive letter
            path = path.substring(1);
        }
        return (0, path_1.normalize)(path);
    }
    else if (uri.authority) {
        throw new Error('Unsupported remote file path');
    }
    else {
        return uri.path;
    }
}
/**
 * For a file system URI, returns the corresponding file system path. Returns
 * undefined otherwise.
 */
function getFsPath(uri) {
    try {
        return fsPath(uri);
    }
    catch {
        return undefined;
    }
}
/**
 * Ensure a file system URI has a file: scheme.  If it's not a file system URI, return undefined.
 */
function getFsUri(uri) {
    const fsPath = getFsPath(uri);
    if (fsPath) {
        return uri_1.URI.file(fsPath).toString();
    }
}
function joinPath(arg, ...paths) {
    const uri = uri_1.URI.joinPath(parseUri(arg), ...paths.map(pathToURIPath)).toString();
    return typeof arg === 'string' ? uri : { uri };
}
function pathToURIPath(fileSystemPath) {
    if (isWinPath(fileSystemPath)) {
        return fileSystemPath.replaceAll('\\', '/');
    }
    return fileSystemPath;
}
/**
 * Returns true if backlash proceeds any use of forward slash in the string. E.g.:
 *
 *  - ..\path\to\file.txt is a Win path
 *  - C:\path\to\file.txt is a Win path
 *  - /unix/style/path is not
 *  - ../path/to/unusal\file.txt is not
 */
function isWinPath(path) {
    return /^[^/\\]*\\/.test(path);
}
/**
 * Returns the base filename (no directory path) of a URI.
 */
function basename(uri) {
    return percentDecode((typeof uri === 'string' ? uri : uri.uri)
        .replace(/[#?].*$/, '')
        .replace(/\/$/, '')
        .replace(/^.*[/:]/, ''));
}
function dirname(arg) {
    const directoryName = (0, resources_1.dirname)(parseUri(arg));
    let uri;
    if (fsSchemes.has(directoryName.scheme) && directoryName.scheme !== 'file') {
        uri = directoryName.with({ scheme: 'file', fragment: '' }).toString();
    }
    else {
        uri = directoryName.toString();
    }
    return typeof arg === 'string' ? uri : { uri };
}
//# sourceMappingURL=uri.js.map