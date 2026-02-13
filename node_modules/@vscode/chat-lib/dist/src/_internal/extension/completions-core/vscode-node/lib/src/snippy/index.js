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
exports.Match = Match;
exports.FilesForMatch = FilesForMatch;
const typebox_1 = require("../util/typebox");
const capiClient_1 = require("../../../../../../platform/endpoint/common/capiClient");
const Network = __importStar(require("./network"));
const Schema = __importStar(require("./snippy.proto"));
async function Match(accessor, source, signal) {
    const result = await Network.call(accessor, accessor.get(capiClient_1.ICAPIClientService).snippyMatchPath, {
        method: 'POST',
        body: (0, typebox_1.assertShape)(Schema.MatchRequest, { source }),
    }, signal);
    const payload = (0, typebox_1.assertShape)(Schema.MatchResponse, result);
    return payload;
}
async function FilesForMatch(accessor, { cursor }, signal) {
    const result = await Network.call(accessor, accessor.get(capiClient_1.ICAPIClientService).snippyFilesForMatchPath, {
        method: 'POST',
        body: (0, typebox_1.assertShape)(Schema.FileMatchRequest, { cursor }),
    }, signal);
    const payload = (0, typebox_1.assertShape)(Schema.FileMatchResponse, result);
    return payload;
}
//# sourceMappingURL=index.js.map