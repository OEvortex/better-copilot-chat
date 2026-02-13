"use strict";
//!!! DO NOT modify, this file was COPIED from 'microsoft/vscode'
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var Location_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.Location = void 0;
const uri_1 = require("../../../../base/common/uri");
const es5ClassCompat_1 = require("./es5ClassCompat");
const position_1 = require("./position");
const range_1 = require("./range");
let Location = Location_1 = class Location {
    static isLocation(thing) {
        if (thing instanceof Location_1) {
            return true;
        }
        if (!thing) {
            return false;
        }
        return range_1.Range.isRange(thing.range)
            && uri_1.URI.isUri(thing.uri);
    }
    constructor(uri, rangeOrPosition) {
        this.uri = uri;
        if (!rangeOrPosition) {
            //that's OK
        }
        else if (range_1.Range.isRange(rangeOrPosition)) {
            this.range = range_1.Range.of(rangeOrPosition);
        }
        else if (position_1.Position.isPosition(rangeOrPosition)) {
            this.range = new range_1.Range(rangeOrPosition, rangeOrPosition);
        }
        else {
            throw new Error('Illegal argument');
        }
    }
    toJSON() {
        return {
            uri: this.uri,
            range: this.range
        };
    }
};
exports.Location = Location;
exports.Location = Location = Location_1 = __decorate([
    es5ClassCompat_1.es5ClassCompat
], Location);
//# sourceMappingURL=location.js.map