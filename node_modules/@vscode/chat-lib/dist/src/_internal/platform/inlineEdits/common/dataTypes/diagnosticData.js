"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiagnosticData = void 0;
const resources_1 = require("../../../../util/vs/base/common/resources");
class DiagnosticData {
    constructor(documentUri, message, severity, range, code, source) {
        this.documentUri = documentUri;
        this.message = message;
        this.severity = severity;
        this.range = range;
        this.code = code;
        this.source = source;
    }
    toString() {
        return `${this.severity.toUpperCase()}: ${this.message} (${this.range})`;
    }
    equals(other) {
        return (0, resources_1.isEqual)(this.documentUri, other.documentUri)
            && this.message === other.message
            && this.severity === other.severity
            && this.range.equals(other.range)
            && this.code === other.code
            && this.source === other.source;
    }
}
exports.DiagnosticData = DiagnosticData;
//# sourceMappingURL=diagnosticData.js.map