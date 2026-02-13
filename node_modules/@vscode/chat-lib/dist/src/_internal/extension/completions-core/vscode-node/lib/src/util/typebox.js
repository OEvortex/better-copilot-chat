"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertShape = void 0;
const value_1 = require("@sinclair/typebox/value");
/**
 * Validates that the `payload` argument matches the input schema. This function will throw an exception if this doesnt match.
 * Note: This function isnt indended to handle user valdiation, as access to errors, or messages will be up to you.
 *
 * @example
 * ```ts
 * const mySchema = Type.Object({ x: T.Number() });
 *
 * expect(assertType(mySchema, { x: 123 })).toEqual({ x: 123 });
 * ```
 **/
const assertShape = (schema, payload) => {
    if (value_1.Value.Check(schema, payload)) {
        return payload;
    }
    const error = `Typebox schema validation failed:\n${[...value_1.Value.Errors(schema, payload)]
        .map(i => `${i.path} ${i.message}`)
        .join('\n')}`;
    throw new Error(error);
};
exports.assertShape = assertShape;
//# sourceMappingURL=typebox.js.map