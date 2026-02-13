"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.filterContextItemsByType = filterContextItemsByType;
exports.filterSupportedContextItems = filterSupportedContextItems;
exports.addOrValidateContextItemsIDs = addOrValidateContextItemsIDs;
const typebox_1 = require("@sinclair/typebox");
const compiler_1 = require("@sinclair/typebox/compiler");
const uuid_1 = require("../../../../../../../util/vs/base/common/uuid");
const logger_1 = require("../../logger");
/**
 * Redefine all the types from contextProviderV1 as typebox schema and verify equality.
 * None of these types should be exported, they are only used for type checking.
 */
const _ContextItemSchema = typebox_1.Type.Object({
    importance: typebox_1.Type.Optional(typebox_1.Type.Integer({ minimum: 0, maximum: 100 })),
    id: typebox_1.Type.Optional(typebox_1.Type.String()),
    origin: typebox_1.Type.Optional(typebox_1.Type.Union([typebox_1.Type.Literal('request'), typebox_1.Type.Literal('update')])),
});
const _TraitSchema = typebox_1.Type.Intersect([
    typebox_1.Type.Object({
        name: typebox_1.Type.String(),
        value: typebox_1.Type.String(),
    }),
    _ContextItemSchema,
]);
const _CodeSnippetSchema = typebox_1.Type.Intersect([
    typebox_1.Type.Object({
        uri: typebox_1.Type.String(),
        value: typebox_1.Type.String(),
        additionalUris: typebox_1.Type.Optional(typebox_1.Type.Array(typebox_1.Type.String())),
    }),
    _ContextItemSchema,
]);
const _SupportedContextItemSchema = [_TraitSchema, _CodeSnippetSchema];
const _SupportedContextItemSchemaUnion = typebox_1.Type.Union(_SupportedContextItemSchema);
const supportedContextItemValidators = new Map([
    ['Trait', compiler_1.TypeCompiler.Compile(_TraitSchema)],
    ['CodeSnippet', compiler_1.TypeCompiler.Compile(_CodeSnippetSchema)],
]);
function filterContextItemsByType(resolvedContextItems, type) {
    return resolvedContextItems
        .map(item => {
        const filteredData = item.data.filter(data => data.type === type);
        return filteredData.length > 0 ? { ...item, data: filteredData } : undefined;
    })
        .filter(r => r !== undefined);
}
function filterSupportedContextItems(contextItems) {
    const filteredItems = [];
    let invalidItemsCounter = 0;
    contextItems.forEach(item => {
        let matched = false;
        for (const [type, validator] of supportedContextItemValidators.entries()) {
            if (validator.Check(item)) {
                filteredItems.push({
                    ...item,
                    type,
                });
                matched = true;
                break;
            }
        }
        if (!matched) {
            invalidItemsCounter++;
        }
    });
    return [filteredItems, invalidItemsCounter];
}
/**
 *
 * Only allow alphanumeric characters and hyphens to remove symbols that could
 * be problematic when used as prompt components keys.
 */
function validateContextItemId(id) {
    return id.length > 0 && id.replaceAll(/[^a-zA-Z0-9-]/g, '').length === id.length;
}
/**
 * Assigns a random ID if it wasn't assigned by the context provider.
 * Invalid or duplicate IDs are replaced with valid ones and logged to avoid dropping the context
 * and worsen the user experience.
 */
function addOrValidateContextItemsIDs(accessor, contextItems) {
    const seenIds = new Set();
    const logTarget = accessor.get(logger_1.ICompletionsLogTargetService);
    const contextItemsWithId = [];
    for (const item of contextItems) {
        let id = item.id ?? (0, uuid_1.generateUuid)();
        if (!validateContextItemId(id)) {
            const newID = (0, uuid_1.generateUuid)();
            logger_1.logger.error(logTarget, `Invalid context item ID ${id}, replacing with ${newID}`);
            id = newID;
        }
        if (seenIds.has(id)) {
            const newID = (0, uuid_1.generateUuid)();
            logger_1.logger.error(logTarget, `Duplicate context item ID ${id}, replacing with ${newID}`);
            id = newID;
        }
        seenIds.add(id);
        contextItemsWithId.push({ ...item, id });
    }
    return contextItemsWithId;
}
//# sourceMappingURL=contextItemSchemas.js.map