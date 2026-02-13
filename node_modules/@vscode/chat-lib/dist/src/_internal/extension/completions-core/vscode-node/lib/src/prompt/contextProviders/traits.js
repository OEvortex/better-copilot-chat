"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTraitsFromContextItems = getTraitsFromContextItems;
exports.ReportTraitsTelemetry = ReportTraitsTelemetry;
const telemetry_1 = require("../../telemetry");
const contextProviderStatistics_1 = require("../contextProviderStatistics");
const contextItemSchemas_1 = require("./contextItemSchemas");
function getTraitsFromContextItems(accessor, completionId, resolvedContextItems) {
    const traitsContextItems = (0, contextItemSchemas_1.filterContextItemsByType)(resolvedContextItems, 'Trait');
    // Set expectations for the traits
    for (const item of traitsContextItems) {
        setupExpectationsForTraits(accessor, completionId, item.data, item.providerId);
    }
    // Flatten and sort the traits by importance.
    // TODO: once we deprecate the old API, importance should also dictate elision.
    const traits = traitsContextItems.flatMap(p => p.data);
    return traits.sort((a, b) => (a.importance ?? 0) - (b.importance ?? 0));
}
function setupExpectationsForTraits(accessor, completionId, traits, providerId) {
    const statistics = accessor.get(contextProviderStatistics_1.ICompletionsContextProviderService).getStatisticsForCompletion(completionId);
    traits.forEach(t => {
        statistics.addExpectations(providerId, [[t, 'included']]);
    });
}
// Maintain a list of names for traits we'd like to report in telemetry.
// The key is the trait name, and the value is the corresponding name of the telemetry property as listed in the hydro schema.
const traitNamesForTelemetry = new Map([
    ['TargetFrameworks', 'targetFrameworks'],
    ['LanguageVersion', 'languageVersion'],
]);
function ReportTraitsTelemetry(accessor, eventName, traits, detectedLanguageId, clientLanguageId, telemetryData) {
    if (traits.length > 0) {
        const properties = {};
        properties.detectedLanguageId = detectedLanguageId;
        properties.languageId = clientLanguageId;
        for (const trait of traits) {
            const mappedTraitName = traitNamesForTelemetry.get(trait.name);
            if (mappedTraitName) {
                properties[mappedTraitName] = trait.value;
            }
        }
        const telemetryDataExt = telemetryData.extendedBy(properties, {});
        return (0, telemetry_1.telemetry)(accessor, eventName, telemetryDataExt);
    }
}
//# sourceMappingURL=traits.js.map