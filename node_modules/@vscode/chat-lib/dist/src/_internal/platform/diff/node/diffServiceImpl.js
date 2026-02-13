"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
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
exports.DiffServiceImpl = void 0;
exports.toLineRangeMappings = toLineRangeMappings;
const worker_1 = require("../../../util/node/worker");
const lazy_1 = require("../../../util/vs/base/common/lazy");
const path = __importStar(require("../../../util/vs/base/common/path"));
const range_1 = require("../../../util/vs/editor/common/core/range");
const lineRange_1 = require("../../../util/vs/editor/common/core/ranges/lineRange");
const fs_1 = require("fs");
const linesDiffComputer_1 = require("../../../util/vs/editor/common/diff/linesDiffComputer");
const rangeMapping_1 = require("../../../util/vs/editor/common/diff/rangeMapping");
const diffWorker = __importStar(require("../common/diffWorker"));
class DiffServiceImpl {
    constructor(_useWorker = true) {
        this._useWorker = _useWorker;
        this._worker = new lazy_1.Lazy(() => {
            const workerPath = firstExistingPath([
                path.join(__dirname, 'diffWorker.js'), // after bundling by esbuild
                path.join(__dirname, '../../../../dist/diffWorker.js'), // relative to the typescript source file (for tsx)
            ]);
            if (workerPath === undefined) {
                throw new Error('DiffServiceImpl: worker file not found');
            }
            return new worker_1.WorkerWithRpcProxy(workerPath, {
                name: 'Diff worker',
            });
        });
    }
    dispose() {
        this._worker.rawValue?.terminate();
    }
    async computeDiff(original, modified, options) {
        const result = this._useWorker ?
            await this._worker.value.proxy.computeDiff(original, modified, options) :
            await diffWorker.computeDiff(original, modified, options);
        // Convert from space efficient JSON data to rich objects.
        const diff = {
            identical: result.identical,
            quitEarly: result.quitEarly,
            changes: toLineRangeMappings(result.changes),
            moves: result.moves.map(m => new linesDiffComputer_1.MovedText(new rangeMapping_1.LineRangeMapping(new lineRange_1.LineRange(m[0], m[1]), new lineRange_1.LineRange(m[2], m[3])), toLineRangeMappings(m[4])))
        };
        return diff;
    }
}
exports.DiffServiceImpl = DiffServiceImpl;
function toLineRangeMappings(changes) {
    return changes.map((c) => new rangeMapping_1.DetailedLineRangeMapping(new lineRange_1.LineRange(c[0], c[1]), new lineRange_1.LineRange(c[2], c[3]), c[4]?.map((c) => new rangeMapping_1.RangeMapping(new range_1.Range(c[0], c[1], c[2], c[3]), new range_1.Range(c[4], c[5], c[6], c[7])))));
}
function firstExistingPath(paths) {
    for (const p of paths) {
        if ((0, fs_1.existsSync)(p)) {
            return p;
        }
    }
}
//# sourceMappingURL=diffServiceImpl.js.map