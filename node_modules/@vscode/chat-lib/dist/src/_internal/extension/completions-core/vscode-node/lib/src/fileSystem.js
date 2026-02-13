"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.ICompletionsFileSystemService = exports.FileType = void 0;
const services_1 = require("../../../../../util/common/services");
/**
 * `FileType` identifies the type of a file. `SymbolicLink` may be combined
 * with other types, e.g. `FileType.Directory | FileType.SymbolicLink`.
 */
var FileType;
(function (FileType) {
    /** The file type is not known. */
    FileType[FileType["Unknown"] = 0] = "Unknown";
    /** The file is a regular file. */
    FileType[FileType["File"] = 1] = "File";
    /** The file is a directory. */
    FileType[FileType["Directory"] = 2] = "Directory";
    /** The file is a symbolic link. */
    FileType[FileType["SymbolicLink"] = 64] = "SymbolicLink";
})(FileType || (exports.FileType = FileType = {}));
exports.ICompletionsFileSystemService = (0, services_1.createServiceIdentifier)('ICompletionsFileSystemService');
//# sourceMappingURL=fileSystem.js.map