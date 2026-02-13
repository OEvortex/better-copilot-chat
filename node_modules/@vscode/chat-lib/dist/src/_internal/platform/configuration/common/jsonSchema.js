"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.Format = void 0;
var Format;
(function (Format) {
    Format.dateTime = "date-time";
    Format.date = "date";
    Format.time = "time";
    Format.email = "email";
    Format.idnEmail = "idn-email";
    Format.hostname = "hostname";
    Format.idnHostname = "idn-hostname";
    Format.ipv4 = "ipv4";
    Format.ipv6 = "ipv6";
    Format.uri = "uri";
    Format.uriReference = "uri-reference";
    Format.iri = "iri";
    Format.iriReference = "iri-reference";
    Format.uriTemplate = "uri-template";
    Format.jsonPointer = "json-pointer";
    Format.relativeJsonPointer = "relative-json-pointer";
    Format.regex = "regex";
})(Format || (exports.Format = Format = {}));
var JsonSchemaType;
(function (JsonSchemaType) {
    JsonSchemaType.number = "number";
    JsonSchemaType.integer = "integer";
    JsonSchemaType.array = "array";
    JsonSchemaType.object = "object";
    JsonSchemaType.string = "string";
})(JsonSchemaType || (JsonSchemaType = {}));
//# sourceMappingURL=jsonSchema.js.map