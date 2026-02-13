"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.t = t;
function t(...params) {
    if (typeof params[0] === 'string') {
        const key = params.shift();
        // We have either rest args which are Array<string | number | boolean> or an array with a single Record<string, any>.
        // This ensures we get a Record<string | number, any> which will be formatted correctly.
        const argsFormatted = !params || typeof params[0] !== 'object' ? params : params[0];
        return getMessage({ message: key, args: argsFormatted });
    }
    return getMessage(params[0]);
}
function getMessage(details) {
    const { message, args } = details;
    return format2(message, (args ?? {}));
}
const _format2Regexp = /{([^}]+)}/g;
function format2(template, values) {
    return template.replace(_format2Regexp, (match, group) => (values[group] ?? match));
}
//# sourceMappingURL=l10n.js.map