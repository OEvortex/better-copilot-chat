"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.FilterSettings = exports.Release = exports.Filter = void 0;
/** The prefix used for related plugin version headers. */
const CopilotRelatedPluginVersionPrefix = 'X-Copilot-RelatedPluginVersion-';
/** The filter headers that ExP knows about. */
var Filter;
(function (Filter) {
    // Default VSCode filters
    Filter["ExtensionRelease"] = "X-VSCode-ExtensionRelease";
    // Copilot-specific filters
    /** The machine ID concatenated with a 1-hour bucket. */
    Filter["CopilotClientTimeBucket"] = "X-Copilot-ClientTimeBucket";
    /** The model currently in use. Not included in fallback filters */
    Filter["CopilotEngine"] = "X-Copilot-Engine";
    /** The engine override value from settings, if present. */
    Filter["CopilotOverrideEngine"] = "X-Copilot-OverrideEngine";
    /** Git repo info. Not included in fallback filters */
    Filter["CopilotRepository"] = "X-Copilot-Repository";
    /** Language of the file on which a given request is being made. Not included in fallback filters */
    Filter["CopilotFileType"] = "X-Copilot-FileType";
    /** The organization the user belongs to. Not included in fallback filters */
    Filter["CopilotUserKind"] = "X-Copilot-UserKind";
    /** Declare experiment dogfood program if any. Not included in fallback filters */
    Filter["CopilotDogfood"] = "X-Copilot-Dogfood";
    /** For custom Model Alpha. Not included in fallback filters */
    Filter["CopilotCustomModel"] = "X-Copilot-CustomModel";
    /** Organizations. */
    Filter["CopilotOrgs"] = "X-Copilot-Orgs";
    /** Identifiers for Custom Model(s) */
    Filter["CopilotCustomModelNames"] = "X-Copilot-CustomModelNames";
    /** Copilot Tracking ID */
    Filter["CopilotTrackingId"] = "X-Copilot-CopilotTrackingId";
    /** The Copilot Client Version */
    Filter["CopilotClientVersion"] = "X-Copilot-ClientVersion";
    Filter["CopilotRelatedPluginVersionCppTools"] = "X-Copilot-RelatedPluginVersion-msvscodecpptools";
    Filter["CopilotRelatedPluginVersionCMakeTools"] = "X-Copilot-RelatedPluginVersion-msvscodecmaketools";
    Filter["CopilotRelatedPluginVersionMakefileTools"] = "X-Copilot-RelatedPluginVersion-msvscodemakefiletools";
    Filter["CopilotRelatedPluginVersionCSharpDevKit"] = "X-Copilot-RelatedPluginVersion-msdotnettoolscsdevkit";
    Filter["CopilotRelatedPluginVersionPython"] = "X-Copilot-RelatedPluginVersion-mspythonpython";
    Filter["CopilotRelatedPluginVersionPylance"] = "X-Copilot-RelatedPluginVersion-mspythonvscodepylance";
    Filter["CopilotRelatedPluginVersionJavaPack"] = "X-Copilot-RelatedPluginVersion-vscjavavscodejavapack";
    Filter["CopilotRelatedPluginVersionJavaManager"] = "X-Copilot-RelatedPluginVersion-vscjavavscodejavadependency";
    Filter["CopilotRelatedPluginVersionTypescript"] = "X-Copilot-RelatedPluginVersion-vscodetypescriptlanguagefeatures";
    Filter["CopilotRelatedPluginVersionTypescriptNext"] = "X-Copilot-RelatedPluginVersion-msvscodevscodetypescriptnext";
    Filter["CopilotRelatedPluginVersionCSharp"] = "X-Copilot-RelatedPluginVersion-msdotnettoolscsharp";
    Filter["CopilotRelatedPluginVersionGithubCopilotChat"] = "X-Copilot-RelatedPluginVersion-githubcopilotchat";
    Filter["CopilotRelatedPluginVersionGithubCopilot"] = "X-Copilot-RelatedPluginVersion-githubcopilot";
})(Filter || (exports.Filter = Filter = {}));
var Release;
(function (Release) {
    Release["Stable"] = "stable";
    Release["Nightly"] = "nightly";
})(Release || (exports.Release = Release = {}));
const telmetryNames = {
    [Filter.CopilotClientTimeBucket]: 'timeBucket',
    [Filter.CopilotOverrideEngine]: 'engine',
    [Filter.CopilotRepository]: 'repo',
    [Filter.CopilotFileType]: 'fileType',
    [Filter.CopilotUserKind]: 'userKind',
};
/**
 * The class FilterSettings holds the variables that were used to filter
 * experiment groups.
 */
class FilterSettings {
    constructor(filters) {
        this.filters = filters;
        // empyt string is equivalent to absent, so remove it
        for (const [filter, value] of Object.entries(this.filters)) {
            if (value === '') {
                delete this.filters[filter];
            }
        }
    }
    /**
     * Extends the telemetry Data with the current filter variables.
     * @param telemetryData Extended in place.
     */
    addToTelemetry(telemetryData) {
        // add all values:
        for (const [filter, value] of Object.entries(this.filters)) {
            const telemetryName = telmetryNames[filter];
            if (telemetryName === undefined) {
                continue;
            }
            telemetryData.properties[telemetryName] = value;
        }
    }
    /** Returns a copy of the filters. */
    toHeaders() {
        return { ...this.filters };
    }
}
exports.FilterSettings = FilterSettings;
//# sourceMappingURL=filters.js.map