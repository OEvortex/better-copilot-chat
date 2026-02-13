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
exports.languageDetection = exports.LanguageDetection = exports.Language = void 0;
exports.detectLanguage = detectLanguage;
const generatedLanguages_1 = require("./generatedLanguages");
const languages_1 = require("./languages");
const uri_1 = require("../util/uri");
const path = __importStar(require("node:path"));
class Language {
    constructor(languageId, isGuess, fileExtension) {
        this.languageId = languageId;
        this.isGuess = isGuess;
        this.fileExtension = fileExtension;
    }
}
exports.Language = Language;
class LanguageDetection {
}
exports.LanguageDetection = LanguageDetection;
const knownExtensions = new Map();
const knownFilenames = new Map();
for (const [languageId, { extensions, filenames }] of Object.entries(generatedLanguages_1.knownLanguages)) {
    for (const extension of extensions) {
        knownExtensions.set(extension, [...(knownExtensions.get(extension) ?? []), languageId]);
    }
    for (const filename of filenames ?? []) {
        knownFilenames.set(filename, [...(knownFilenames.get(filename) ?? []), languageId]);
    }
}
class FilenameAndExensionLanguageDetection extends LanguageDetection {
    detectLanguage(doc) {
        const filename = (0, uri_1.basename)(doc.uri);
        const extension = path.extname(filename).toLowerCase();
        const extensionWithoutTemplate = this.extensionWithoutTemplateLanguage(filename, extension);
        const languageIdWithGuessing = this.detectLanguageId(filename, extensionWithoutTemplate);
        const ext = this.computeFullyQualifiedExtension(extension, extensionWithoutTemplate);
        if (!languageIdWithGuessing) {
            return new Language(doc.languageId, true, ext);
        }
        return new Language(languageIdWithGuessing.languageId, languageIdWithGuessing.isGuess, ext);
    }
    extensionWithoutTemplateLanguage(filename, extension) {
        if (languages_1.knownTemplateLanguageExtensions.includes(extension)) {
            const filenameWithoutExtension = filename.substring(0, filename.lastIndexOf('.'));
            const extensionWithoutTemplate = path.extname(filenameWithoutExtension).toLowerCase();
            const isTemplateLanguage = extensionWithoutTemplate.length > 0 &&
                languages_1.knownFileExtensions.includes(extensionWithoutTemplate) &&
                this.isExtensionValidForTemplateLanguage(extension, extensionWithoutTemplate);
            if (isTemplateLanguage) {
                return extensionWithoutTemplate;
            }
        }
        return extension;
    }
    isExtensionValidForTemplateLanguage(extension, extensionWithoutTemplate) {
        const limitations = languages_1.templateLanguageLimitations[extension];
        return !limitations || limitations.includes(extensionWithoutTemplate);
    }
    detectLanguageId(filename, extension) {
        if (knownFilenames.has(filename)) {
            return { languageId: knownFilenames.get(filename)[0], isGuess: false };
        }
        const extensionCandidates = knownExtensions.get(extension) ?? [];
        if (extensionCandidates.length > 0) {
            return { languageId: extensionCandidates[0], isGuess: extensionCandidates.length > 1 };
        }
        while (filename.includes('.')) {
            filename = filename.replace(/\.[^.]*$/, '');
            if (knownFilenames.has(filename)) {
                return { languageId: knownFilenames.get(filename)[0], isGuess: false };
            }
        }
    }
    computeFullyQualifiedExtension(extension, extensionWithoutTemplate) {
        if (extension !== extensionWithoutTemplate) {
            return extensionWithoutTemplate + extension;
        }
        return extension;
    }
}
// This class is used to group similar languages together.
// The main drawback of trying to keep them apart is that for related files (e.g. header files),
// the language detection might be wrong and thus features like neighbor tabs might not work as expected.
// In the end, this feature should be moved to neighborTabs.ts (but that's hard to do behind a feature flag)
class GroupingLanguageDetection extends LanguageDetection {
    constructor(delegate) {
        super();
        this.delegate = delegate;
    }
    detectLanguage(doc) {
        const language = this.delegate.detectLanguage(doc);
        const languageId = language.languageId;
        if (languageId === 'c' || languageId === 'cpp') {
            return new Language('cpp', language.isGuess, language.fileExtension);
        }
        return language;
    }
}
class ClientProvidedLanguageDetection extends LanguageDetection {
    constructor(delegate) {
        super();
        this.delegate = delegate;
    }
    detectLanguage(doc) {
        if (doc.uri.startsWith('untitled:') || doc.uri.startsWith('vscode-notebook-cell:')) {
            return new Language(doc.languageId, true, '');
        }
        return this.delegate.detectLanguage(doc);
    }
}
exports.languageDetection = new GroupingLanguageDetection(new ClientProvidedLanguageDetection(new FilenameAndExensionLanguageDetection()));
function detectLanguage({ uri, languageId }) {
    const language = exports.languageDetection.detectLanguage({ uri, languageId: 'UNKNOWN' });
    if (language.languageId === 'UNKNOWN') {
        return languageId;
    }
    return language.languageId;
}
//# sourceMappingURL=languageDetection.js.map