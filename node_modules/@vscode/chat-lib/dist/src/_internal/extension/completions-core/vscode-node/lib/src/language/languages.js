"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.knownFileExtensions = exports.templateLanguageLimitations = exports.knownTemplateLanguageExtensions = void 0;
const generatedLanguages_1 = require("./generatedLanguages");
exports.knownTemplateLanguageExtensions = [
    '.ejs',
    '.erb',
    '.haml',
    '.hbs',
    '.j2',
    '.jinja',
    '.jinja2',
    '.liquid',
    '.mustache',
    '.njk',
    '.php',
    '.pug',
    '.slim',
    '.webc',
];
exports.templateLanguageLimitations = {
    '.php': ['.blade'],
};
exports.knownFileExtensions = Object.keys(generatedLanguages_1.knownLanguages).flatMap(language => generatedLanguages_1.knownLanguages[language].extensions);
//# sourceMappingURL=languages.js.map