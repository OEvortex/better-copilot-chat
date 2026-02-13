"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.vString = vString;
exports.vNumber = vNumber;
exports.vBoolean = vBoolean;
exports.vObjAny = vObjAny;
exports.vUndefined = vUndefined;
exports.vUnchecked = vUnchecked;
exports.vUnknown = vUnknown;
exports.vRequired = vRequired;
exports.vObj = vObj;
exports.vArray = vArray;
exports.vTuple = vTuple;
exports.vUnion = vUnion;
exports.vEnum = vEnum;
exports.vLiteral = vLiteral;
exports.vLazy = vLazy;
class TypeofValidator {
    constructor(type) {
        this.type = type;
    }
    validate(content) {
        if (typeof content !== this.type) {
            return { content: undefined, error: { message: `Expected ${this.type}, but got ${typeof content}` } };
        }
        return { content: content, error: undefined };
    }
    toSchema() {
        return { type: this.type };
    }
}
const vStringValidator = new TypeofValidator("string");
function vString() { return vStringValidator; }
const vNumberValidator = new TypeofValidator("number");
function vNumber() { return vNumberValidator; }
const vBooleanValidator = new TypeofValidator("boolean");
function vBoolean() { return vBooleanValidator; }
const vObjAnyValidator = new TypeofValidator("object");
function vObjAny() { return vObjAnyValidator; }
const vUndefinedValidator = new TypeofValidator("undefined");
function vUndefined() { return vUndefinedValidator; }
function vUnchecked() {
    return {
        validate(content) {
            return { content: content, error: undefined };
        },
        toSchema() {
            return {};
        },
    };
}
function vUnknown() {
    return vUnchecked();
}
function vRequired(validator) {
    return {
        validate(content) {
            if (content === undefined) {
                return { content: undefined, error: { message: "Required field is missing" } };
            }
            return validator.validate(content);
        },
        toSchema() {
            return validator.toSchema();
        },
        isRequired() {
            return true;
        }
    };
}
function vObj(properties) {
    return {
        validate(content) {
            if (typeof content !== "object" || content === null) {
                return { content: undefined, error: { message: "Expected object" } };
            }
            const result = {};
            for (const key in properties) {
                const validator = properties[key];
                const fieldValue = content[key];
                // Check if field is required and missing
                const isRequired = validator.isRequired?.() ?? false;
                if (isRequired && fieldValue === undefined) {
                    return { content: undefined, error: { message: `Required field '${key}' is missing` } };
                }
                // If field is not required and is missing, skip validation
                if (!isRequired && fieldValue === undefined) {
                    continue;
                }
                const { content: value, error } = validator.validate(fieldValue);
                if (error) {
                    return { content: undefined, error: { message: `Error in property '${key}': ${error.message}` } };
                }
                result[key] = value;
            }
            return { content: result, error: undefined };
        },
        toSchema() {
            const requiredFields = [];
            const schemaProperties = {};
            for (const [key, validator] of Object.entries(properties)) {
                schemaProperties[key] = validator.toSchema();
                if (validator.isRequired?.()) {
                    requiredFields.push(key);
                }
            }
            const schema = {
                type: "object",
                properties: schemaProperties,
                ...(requiredFields.length > 0 ? { required: requiredFields } : {})
            };
            return schema;
        }
    };
}
function vArray(validator) {
    return {
        validate(content) {
            if (!Array.isArray(content)) {
                return { content: undefined, error: { message: "Expected array" } };
            }
            const result = [];
            for (let i = 0; i < content.length; i++) {
                const { content: value, error } = validator.validate(content[i]);
                if (error) {
                    return { content: undefined, error: { message: `Error in element ${i}: ${error.message}` } };
                }
                result.push(value);
            }
            return { content: result, error: undefined };
        },
        toSchema() {
            return {
                type: "array",
                items: validator.toSchema(),
            };
        }
    };
}
function vTuple(...validators) {
    return {
        validate(content) {
            if (!Array.isArray(content)) {
                return { content: undefined, error: { message: "Expected array" } };
            }
            if (content.length !== validators.length) {
                return { content: undefined, error: { message: `Expected tuple of length ${validators.length}, but got ${content.length}` } };
            }
            const result = [];
            for (let i = 0; i < validators.length; i++) {
                const validator = validators[i];
                const { content: value, error } = validator.validate(content[i]);
                if (error) {
                    return { content: undefined, error: { message: `Error in element ${i}: ${error.message}` } };
                }
                result.push(value);
            }
            return { content: result, error: undefined };
        },
        toSchema() {
            return {
                type: "array",
                items: validators.map(validator => validator.toSchema()),
            };
        }
    };
}
function vUnion(...validators) {
    return {
        validate(content) {
            let lastError;
            for (const validator of validators) {
                const { content: value, error } = validator.validate(content);
                if (!error) {
                    return { content: value, error: undefined };
                }
                lastError = error;
            }
            return { content: undefined, error: lastError };
        },
        toSchema() {
            return {
                oneOf: validators.map(validator => validator.toSchema()),
            };
        }
    };
}
function vEnum(...values) {
    return {
        validate(content) {
            if (values.indexOf(content) === -1) {
                return { content: undefined, error: { message: `Expected one of: ${values.join(", ")}` } };
            }
            return { content, error: undefined };
        },
        toSchema() {
            return {
                enum: values,
            };
        }
    };
}
function vLiteral(value) {
    return {
        validate(content) {
            if (content !== value) {
                return { content: undefined, error: { message: `Expected: ${value}` } };
            }
            return { content, error: undefined };
        },
        toSchema() {
            return {
                const: value,
            };
        }
    };
}
function vLazy(fn) {
    return {
        validate(content) {
            return fn().validate(content);
        },
        toSchema() {
            return fn().toSchema();
        }
    };
}
//# sourceMappingURL=validator.js.map