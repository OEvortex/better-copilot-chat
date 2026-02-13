"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalFileSystem = void 0;
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const fs_1 = require("fs");
const path_1 = require("path");
const fileSystem_1 = require("./fileSystem");
const uri_1 = require("./util/uri");
class LocalFileSystem {
    async readFileString(uri) {
        return (await fs_1.promises.readFile((0, uri_1.fsPath)(uri))).toString();
    }
    async stat(uri) {
        const { targetStat, lstat, stat } = await this.statWithLink((0, uri_1.fsPath)(uri));
        return {
            ctime: targetStat.ctimeMs,
            mtime: targetStat.mtimeMs,
            size: targetStat.size,
            type: this.getFileType(targetStat, lstat, stat),
        };
    }
    async readDirectory(uri) {
        const filePath = (0, uri_1.fsPath)(uri);
        const readDir = await fs_1.promises.readdir(filePath, { withFileTypes: true });
        const result = [];
        for (const file of readDir) {
            const { targetStat, lstat, stat } = await this.statWithLink((0, path_1.join)(filePath, file.name));
            result.push([file.name, this.getFileType(targetStat, lstat, stat)]);
        }
        return result;
    }
    async statWithLink(fsPath) {
        const lstat = await fs_1.promises.lstat(fsPath);
        if (lstat.isSymbolicLink()) {
            try {
                const stat = await fs_1.promises.stat(fsPath);
                return { lstat, stat, targetStat: stat };
            }
            catch {
                // likely a dangling link or access error
            }
        }
        return { lstat, targetStat: lstat };
    }
    getFileType(targetStat, lstat, stat) {
        let type = fileSystem_1.FileType.Unknown;
        if (targetStat.isFile()) {
            type = fileSystem_1.FileType.File;
        }
        if (targetStat.isDirectory()) {
            type = fileSystem_1.FileType.Directory;
        }
        // dangling links have FileType.Unknown
        if (lstat.isSymbolicLink() && stat) {
            type |= fileSystem_1.FileType.SymbolicLink;
        }
        return type;
    }
}
exports.LocalFileSystem = LocalFileSystem;
//# sourceMappingURL=localFileSystem.js.map