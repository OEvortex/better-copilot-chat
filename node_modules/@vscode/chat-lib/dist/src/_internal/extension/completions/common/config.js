"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.BlockMode = void 0;
exports.shouldDoParsingTrimming = shouldDoParsingTrimming;
exports.shouldDoServerTrimming = shouldDoServerTrimming;
/** How to determine where to terminate the completion to the current block. */
var BlockMode;
(function (BlockMode) {
    /**
     * Parse the context + completion on the client using treesitter to
     * determine blocks.
     */
    BlockMode["Parsing"] = "parsing";
    /**
     * Let the server parse out blocks and assume that the completion terminates
     * at the end of a block.
     */
    BlockMode["Server"] = "server";
    /**
     * Runs both the treesitter parsing on the client plus indentation-based
     * truncation on the proxy.
     */
    BlockMode["ParsingAndServer"] = "parsingandserver";
    /**
     * Client-based heuristic to display more multiline completions.
     * It almost always requests a multiline completion from the server and tries to break it up to something useful on the client.
     *
     * This should not be rolled out at the moment (latency impact is high, UX needs further fine-tuning),
     * but can  be used for internal experimentation.
     */
    BlockMode["MoreMultiline"] = "moremultiline";
})(BlockMode || (exports.BlockMode = BlockMode = {}));
function shouldDoParsingTrimming(blockMode) {
    return [BlockMode.Parsing, BlockMode.ParsingAndServer, BlockMode.MoreMultiline].includes(blockMode);
}
function shouldDoServerTrimming(blockMode) {
    return [BlockMode.Server, BlockMode.ParsingAndServer].includes(blockMode);
}
//# sourceMappingURL=config.js.map