"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExpConfig = exports.ExpTreatmentVariables = void 0;
const telemetry_1 = require("../telemetry");
const telemetryNames_1 = require("./telemetryNames");
// All variables we pull from Exp and might want to use
var ExpTreatmentVariables;
(function (ExpTreatmentVariables) {
    // the engine we want to request, used in actual experiment(s)
    ExpTreatmentVariables["CustomEngine"] = "copilotcustomengine";
    // if set, any custom engine (see previous) will only apply when the current engine matches the value of this variable
    ExpTreatmentVariables["CustomEngineTargetEngine"] = "copilotcustomenginetargetengine";
    ExpTreatmentVariables["OverrideBlockMode"] = "copilotoverrideblockmode";
    ExpTreatmentVariables["SuffixPercent"] = "CopilotSuffixPercent";
    ExpTreatmentVariables["CppHeadersEnableSwitch"] = "copilotcppheadersenableswitch";
    ExpTreatmentVariables["UseSubsetMatching"] = "copilotsubsetmatching";
    // granularity specification
    ExpTreatmentVariables["SuffixMatchThreshold"] = "copilotsuffixmatchthreshold";
    ExpTreatmentVariables["MaxPromptCompletionTokens"] = "maxpromptcompletionTokens";
    /**
     * Enable the use of the Workspace Context Coordinator to coordinate context from providers of workspace snippets.
     */
    ExpTreatmentVariables["StableContextPercent"] = "copilotstablecontextpercent";
    ExpTreatmentVariables["VolatileContextPercent"] = "copilotvolatilecontextpercent";
    /**
     * Flags that control the enablement of the related files extensibility for various languages in VSCode.
     */
    ExpTreatmentVariables["RelatedFilesVSCodeCSharp"] = "copilotrelatedfilesvscodecsharp";
    ExpTreatmentVariables["RelatedFilesVSCodeTypeScript"] = "copilotrelatedfilesvscodetypescript";
    ExpTreatmentVariables["RelatedFilesVSCode"] = "copilotrelatedfilesvscode";
    /**
     * Flags that control the inclusion of open tab files as neighboring files for various languages.
     */
    ExpTreatmentVariables["ContextProviders"] = "copilotcontextproviders";
    ExpTreatmentVariables["IncludeNeighboringFiles"] = "copilotincludeneighboringfiles";
    ExpTreatmentVariables["ExcludeRelatedFiles"] = "copilotexcluderelatedfiles";
    ExpTreatmentVariables["ContextProviderTimeBudget"] = "copilotcontextprovidertimebudget";
    /**
     * Values to control the ContextProvider API's CodeSnippets provided by the C++ Language Service.
     */
    ExpTreatmentVariables["CppContextProviderParams"] = "copilotcppContextProviderParams";
    /**
     * Values to control the ContextProvider API's CodeSnippets provided by the C# Language Service.
     */
    ExpTreatmentVariables["CSharpContextProviderParams"] = "copilotcsharpcontextproviderparams";
    /**
     * Values to control the ContextProvider API's CodeSnippets provided by the Java Language Service.
     */
    ExpTreatmentVariables["JavaContextProviderParams"] = "copilotjavacontextproviderparams";
    /**
     * Values to control the MultiLanguageContextProvider parameters.
     */
    ExpTreatmentVariables["MultiLanguageContextProviderParams"] = "copilotmultilanguagecontextproviderparams";
    /**
     * Values to control the TsContextProvider parameters.
     */
    ExpTreatmentVariables["TsContextProviderParams"] = "copilottscontextproviderparams";
    /**
     * Controls the delay to apply to debouncing of completion requests.
     */
    ExpTreatmentVariables["CompletionsDebounce"] = "copilotcompletionsdebounce";
    /**
     * Enable the electron networking in VS Code.
     */
    ExpTreatmentVariables["ElectronFetcher"] = "copilotelectronfetcher";
    ExpTreatmentVariables["FetchFetcher"] = "copilotfetchfetcher";
    /**
     * Sets the timeout for waiting for async completions in flight before
     * issuing a new network request. Set to -1 to disable the timeout entirely.
     */
    ExpTreatmentVariables["AsyncCompletionsTimeout"] = "copilotasynccompletionstimeout";
    /**
     * Controls whether the prompt context for code completions needs to be split from the document prefix.
     */
    ExpTreatmentVariables["EnablePromptContextProxyField"] = "copilotenablepromptcontextproxyfield";
    /**
     * Controls progressive reveal of completions.
     */
    ExpTreatmentVariables["ProgressiveReveal"] = "copilotprogressivereveal";
    // part of progressive reveal, controls whether the model or client terminates single-line completions
    ExpTreatmentVariables["ModelAlwaysTerminatesSingleline"] = "copilotmodelterminatesingleline";
    // long look-ahead window size (in lines) for progressive reveal
    ExpTreatmentVariables["ProgressiveRevealLongLookaheadSize"] = "copilotprogressivereveallonglookaheadsize";
    // short look-ahead window size (in lines) for progressive reveal
    ExpTreatmentVariables["ProgressiveRevealShortLookaheadSize"] = "copilotprogressiverevealshortlookaheadsize";
    // maximum token count when requesting multi-line completions
    ExpTreatmentVariables["MaxMultilineTokens"] = "copilotmaxmultilinetokens";
    /**
     * Controls number of lines to trim to after accepting a completion.
     */
    ExpTreatmentVariables["MultilineAfterAcceptLines"] = "copilotmultilineafteracceptlines";
    /**
     * Add a delay before rendering completions.
     */
    ExpTreatmentVariables["CompletionsDelay"] = "copilotcompletionsdelay";
    /**
     * Request single line completions unless the previous completion was just accepted.
     */
    ExpTreatmentVariables["SingleLineUnlessAccepted"] = "copilotsinglelineunlessaccepted";
})(ExpTreatmentVariables || (exports.ExpTreatmentVariables = ExpTreatmentVariables = {}));
class ExpConfig {
    constructor(variables, features) {
        this.variables = variables;
        this.features = features;
    }
    static createFallbackConfig(accessor, reason) {
        (0, telemetry_1.telemetryExpProblem)(accessor, { reason });
        return this.createEmptyConfig();
    }
    static createEmptyConfig() {
        return new ExpConfig({}, '');
    }
    /**
     * Adds (or overwrites) the given experiment config to the telemetry data.
     * @param telemetryData telemetryData object. If previous ExpConfigs are already present, they will be overwritten.
     */
    addToTelemetry(telemetryData) {
        telemetryData.properties[telemetryNames_1.ExpServiceTelemetryNames.featuresTelemetryPropertyName] = this.features;
    }
}
exports.ExpConfig = ExpConfig;
//# sourceMappingURL=expConfig.js.map