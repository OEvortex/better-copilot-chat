import * as vscode from 'vscode';
import type { ModelConfig } from '../types/sharedTypes';

const GEMINI_UNSUPPORTED_FIELDS = new Set([
    '$ref',
    '$defs',
    'definitions',
    '$id',
    '$anchor',
    '$dynamicRef',
    '$dynamicAnchor',
    '$schema',
    '$vocabulary',
    '$comment',
    'exclusiveMinimum',
    'exclusiveMaximum',
    'minimum',
    'maximum',
    'multipleOf',
    'additionalProperties',
    'minLength',
    'maxLength',
    'pattern',
    'minItems',
    'maxItems',
    'uniqueItems',
    'minContains',
    'maxContains',
    'minProperties',
    'maxProperties',
    'if',
    'then',
    'else',
    'dependentSchemas',
    'dependentRequired',
    'unevaluatedItems',
    'unevaluatedProperties',
    'contentEncoding',
    'contentMediaType',
    'contentSchema',
    'dependencies',
    'allOf',
    'anyOf',
    'oneOf',
    'not',
    'strict',
    'input_examples',
    'examples',
    // Remove 'value' field as it causes proto parsing errors when it contains arrays
    // with 'type' fields inside (e.g., {value: [{type: "string", ...}]})
    'value'
]);

export interface GeminiSdkContent {
    role: 'user' | 'model';
    parts: Array<Record<string, unknown>>;
}

export interface ConvertMessagesToGeminiOptions {
    resolvedModelName?: string;
    sessionId?: string;
    getThoughtSignature?: (callId: string, sessionId?: string) => string | undefined;
    storeThoughtSignature?: (callId: string, signature: string) => void;
    fallbackThoughtSignature?: string;
    normalizeToolCallArgs?: boolean;
    skipThinkingPartWhenToolCalls?: boolean;
}

export interface ValidateGeminiPartsOptions {
    prefix?: string;
    onWarning?: (message: string) => void;
}

function normalizeToolCallArgs(input: unknown): Record<string, unknown> {
    let args: unknown = input;
    if (typeof args === 'string') {
        try {
            args = JSON.parse(args) as unknown;
        } catch {
            args = { value: args };
        }
    }
    if (!args || typeof args !== 'object' || Array.isArray(args)) {
        return { value: args };
    }
    return args as Record<string, unknown>;
}

function convertToolCallsToGeminiParts(
    toolCalls: readonly vscode.LanguageModelToolCallPart[],
    options: ConvertMessagesToGeminiOptions
): Array<Record<string, unknown>> {
    return toolCalls.map((toolCall) => {
        const resolvedSignature = options.getThoughtSignature
            ? options.getThoughtSignature(toolCall.callId, options.sessionId)
            : undefined;
        const fallbackSignature = options.fallbackThoughtSignature;
        const signature = resolvedSignature || fallbackSignature;

        if (
            signature &&
            fallbackSignature &&
            signature === fallbackSignature &&
            options.storeThoughtSignature
        ) {
            options.storeThoughtSignature(toolCall.callId, signature);
        }

        const args = options.normalizeToolCallArgs
            ? normalizeToolCallArgs(toolCall.input)
            : toolCall.input;

        const part: Record<string, unknown> = {
            functionCall: {
                name: toolCall.name,
                id: toolCall.callId,
                args
            }
        };

        if (signature) {
            part.thoughtSignature = signature;
        }

        return part;
    });
}

export function sanitizeGeminiToolSchema(schema: unknown): Record<string, unknown> {
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
        return { type: 'object', properties: {} };
    }

    let sanitized: Record<string, unknown>;
    try {
        sanitized = JSON.parse(JSON.stringify(schema));
    } catch {
        return { type: 'object', properties: {} };
    }

    const cleanRecursive = (target: Record<string, unknown>) => {
        for (const composite of ['anyOf', 'oneOf', 'allOf']) {
            const branch = target[composite] as unknown;
            if (Array.isArray(branch) && branch.length > 0) {
                let preferred: Record<string, unknown> | undefined;
                for (const option of branch) {
                    if (option && typeof option === 'object' && !Array.isArray(option)) {
                        preferred = option as Record<string, unknown>;
                        if (preferred.type === 'string') {
                            break;
                        }
                    }
                }
                const selected = preferred ?? (branch[0] as Record<string, unknown>);
                for (const key of Object.keys(target)) {
                    delete target[key];
                }
                Object.assign(target, selected);
                break;
            }
        }

        if (Array.isArray(target.type)) {
            const typeCandidates = target.type.filter((item) => item !== 'null');
            const preferredType = typeCandidates.find(
                (item) => typeof item === 'string' && item.trim() !== ''
            );
            target.type = preferredType ?? 'object';
        }

        if (target.nullable === true) {
            delete target.nullable;
        }

        if (Array.isArray(target.properties)) {
            const mapped: Record<string, unknown> = {};
            for (const item of target.properties) {
                if (!item || typeof item !== 'object' || Array.isArray(item)) {
                    continue;
                }
                const entry = item as Record<string, unknown>;
                const name = entry.name ?? entry.key;
                const value = entry.value ?? entry.schema ?? entry.property;
                if (typeof name === 'string' && value && typeof value === 'object') {
                    mapped[name] = value;
                }
            }
            target.properties = mapped;
        }

        if (Array.isArray(target.items)) {
            const firstItem = target.items[0];
            target.items =
                firstItem && typeof firstItem === 'object' && !Array.isArray(firstItem)
                    ? firstItem
                    : undefined;
        }

        if (typeof target.type === 'string') {
            target.type = target.type.toLowerCase();
        }

        for (const key of Object.keys(target)) {
            if (GEMINI_UNSUPPORTED_FIELDS.has(key)) {
                delete target[key];
            }
        }

        const properties = target.properties;
        if (properties && typeof properties === 'object' && !Array.isArray(properties)) {
            const cleanedProperties: Record<string, unknown> = {};
            for (const key of Object.keys(properties)) {
                const value = (properties as Record<string, unknown>)[key];
                if (!value || typeof value !== 'object' || Array.isArray(value)) {
                    continue;
                }
                const safeKey = key.replace(/[^a-zA-Z0-9_]/g, '_');
                cleanedProperties[safeKey] = value;
                cleanRecursive(value as Record<string, unknown>);
            }
            target.properties = cleanedProperties;
        }

        if (target.required && Array.isArray(target.required)) {
            const requiredKeys = target.required.filter(
                (key): key is string => typeof key === 'string'
            );

            if (
                target.properties &&
                typeof target.properties === 'object' &&
                !Array.isArray(target.properties)
            ) {
                const propertyKeys = new Set(Object.keys(target.properties));
                const filteredRequired = requiredKeys
                    .map((key) => key.replace(/[^a-zA-Z0-9_]/g, '_'))
                    .filter((key) => propertyKeys.has(key));

                if (filteredRequired.length > 0) {
                    target.required = filteredRequired;
                } else {
                    delete target.required;
                }
            } else {
                delete target.required;
            }
        }

        const items = target.items;
        if (items) {
            if (Array.isArray(items)) {
                for (const item of items) {
                    if (item && typeof item === 'object' && !Array.isArray(item)) {
                        cleanRecursive(item as Record<string, unknown>);
                    }
                }
            } else if (typeof items === 'object') {
                cleanRecursive(items as Record<string, unknown>);
            }
        }

        if (
            target.additionalProperties &&
            typeof target.additionalProperties === 'object' &&
            !Array.isArray(target.additionalProperties)
        ) {
            cleanRecursive(target.additionalProperties as Record<string, unknown>);
        }

        if (
            target.patternProperties &&
            typeof target.patternProperties === 'object' &&
            !Array.isArray(target.patternProperties)
        ) {
            for (const value of Object.values(target.patternProperties)) {
                if (value && typeof value === 'object' && !Array.isArray(value)) {
                    cleanRecursive(value as Record<string, unknown>);
                }
            }
        }

        if (
            target.propertyNames &&
            typeof target.propertyNames === 'object' &&
            !Array.isArray(target.propertyNames)
        ) {
            cleanRecursive(target.propertyNames as Record<string, unknown>);
        }

        if (target.contains && typeof target.contains === 'object' && !Array.isArray(target.contains)) {
            cleanRecursive(target.contains as Record<string, unknown>);
        }
    };

    cleanRecursive(sanitized);

    if (
        typeof sanitized.type !== 'string' ||
        !sanitized.type.trim() ||
        sanitized.type === 'None'
    ) {
        sanitized.type = 'object';
    }
    if (!sanitized.properties || typeof sanitized.properties !== 'object') {
        sanitized.properties = {};
    }

    return sanitized;
}

export function convertMessagesToGemini(
    messages: readonly vscode.LanguageModelChatMessage[],
    modelConfig: ModelConfig,
    options: ConvertMessagesToGeminiOptions = {}
): {
    contents: GeminiSdkContent[];
    systemInstruction?: { role: 'user'; parts: Array<{ text: string }> };
} {
    const contents: GeminiSdkContent[] = [];
    let systemText = '';
    const toolIdToName = new Map<string, string>();

    for (const message of messages) {
        if (message.role !== vscode.LanguageModelChatMessageRole.Assistant) {
            continue;
        }

        for (const part of message.content) {
            if (part instanceof vscode.LanguageModelToolCallPart) {
                toolIdToName.set(part.callId, part.name);
            }
        }
    }

    const modelName = (options.resolvedModelName || modelConfig.model || '').toLowerCase();
    const isClaudeModel = modelName.includes('claude');
    const includeThinking =
        !isClaudeModel &&
        (modelConfig.includeThinking === true || modelConfig.outputThinking !== false);

    const nonSystemMessages = messages.filter(
        (message) => message.role !== vscode.LanguageModelChatMessageRole.System
    );
    const messageCount = nonSystemMessages.length;
    let currentMessageIndex = 0;

    for (const message of messages) {
        if (message.role === vscode.LanguageModelChatMessageRole.System) {
            systemText = message.content
                .filter((part) => part instanceof vscode.LanguageModelTextPart)
                .map((part) => (part as vscode.LanguageModelTextPart).value)
                .join('\n');
            continue;
        }

        currentMessageIndex++;

        if (message.role === vscode.LanguageModelChatMessageRole.User) {
            const parts: Array<Record<string, unknown>> = [];
            const text = message.content
                .filter((part) => part instanceof vscode.LanguageModelTextPart)
                .map((part) => (part as vscode.LanguageModelTextPart).value)
                .join('\n');

            if (text) {
                parts.push({ text });
            }

            for (const part of message.content) {
                if (
                    part instanceof vscode.LanguageModelDataPart &&
                    part.mimeType.toLowerCase().startsWith('image/')
                ) {
                    parts.push({
                        inlineData: {
                            mimeType: part.mimeType,
                            data: Buffer.from(part.data).toString('base64')
                        }
                    });
                }

                if (part instanceof vscode.LanguageModelToolResultPart) {
                    const name = toolIdToName.get(part.callId) || 'unknown';
                    let content = '';

                    if (typeof part.content === 'string') {
                        content = part.content;
                    } else if (Array.isArray(part.content)) {
                        content = part.content
                            .map((resultPart) =>
                                resultPart instanceof vscode.LanguageModelTextPart
                                    ? resultPart.value
                                    : JSON.stringify(resultPart)
                            )
                            .join('\n');
                    } else {
                        content = JSON.stringify(part.content);
                    }

                    let response: Record<string, unknown> = { content };
                    try {
                        const parsed = JSON.parse(content.trim()) as unknown;
                        if (parsed && typeof parsed === 'object') {
                            response = Array.isArray(parsed)
                                ? { result: parsed }
                                : (parsed as Record<string, unknown>);
                        }
                    } catch {
                        // Ignore JSON parse errors.
                    }

                    parts.push({
                        functionResponse: {
                            name,
                            id: part.callId,
                            response
                        }
                    });
                }
            }

            if (parts.length > 0) {
                contents.push({ role: 'user', parts });
            }
            continue;
        }

        if (message.role === vscode.LanguageModelChatMessageRole.Assistant) {
            let parts: Array<Record<string, unknown>> = [];
            const toolCalls = message.content.filter(
                (part) => part instanceof vscode.LanguageModelToolCallPart
            ) as vscode.LanguageModelToolCallPart[];

            const shouldSkipThinkingForToolCalls =
                options.skipThinkingPartWhenToolCalls === true && toolCalls.length > 0;

            if (includeThinking && !shouldSkipThinkingForToolCalls) {
                for (const part of message.content) {
                    if (part instanceof vscode.LanguageModelThinkingPart) {
                        const value = Array.isArray(part.value)
                            ? part.value.join('')
                            : part.value;
                        if (value) {
                            parts.push({ text: value, thought: true });
                        }
                        break;
                    }
                }
            }

            const text = message.content
                .filter((part) => part instanceof vscode.LanguageModelTextPart)
                .map((part) => (part as vscode.LanguageModelTextPart).value)
                .join('\n');
            if (text) {
                parts.push({ text });
            }

            if (toolCalls.length > 0) {
                parts.push(...convertToolCallsToGeminiParts(toolCalls, options));
            }

            if (isClaudeModel) {
                parts = parts.filter((part) => part.thought !== true);
            }

            if (
                includeThinking &&
                !isClaudeModel &&
                !shouldSkipThinkingForToolCalls &&
                currentMessageIndex === messageCount &&
                !parts.some((part) => part.thought === true)
            ) {
                parts.unshift({ text: 'Thinking...', thought: true });
            }

            if (parts.length > 0) {
                contents.push({
                    role: 'model',
                    parts
                });
            }
        }
    }

    return {
        contents,
        systemInstruction: systemText
            ? {
                  role: 'user',
                  parts: [{ text: systemText }]
              }
            : undefined
    };
}

export function validateGeminiPartsBalance(
    contents: GeminiSdkContent[],
    options: ValidateGeminiPartsOptions = {}
): void {
    let totalFunctionCalls = 0;
    let totalFunctionResponses = 0;
    let totalOrphanThoughtSignatures = 0;

    for (const content of contents) {
        for (const part of content.parts) {
            if (part.functionCall) {
                totalFunctionCalls++;
            }
            if (part.functionResponse) {
                totalFunctionResponses++;
            }
            if (part.thoughtSignature && !part.functionCall) {
                totalOrphanThoughtSignatures++;
            }
        }
    }

    const warn = options.onWarning;
    const prefix = options.prefix || 'Gemini SDK';

    if (warn && totalFunctionCalls !== totalFunctionResponses) {
        warn(
            `${prefix}: function call/response mismatch detected (calls=${totalFunctionCalls}, responses=${totalFunctionResponses}).`
        );
    }

    if (warn && totalOrphanThoughtSignatures > 0) {
        warn(
            `${prefix}: found ${totalOrphanThoughtSignatures} thoughtSignature part(s) without functionCall.`
        );
    }
}

export function balanceGeminiFunctionCallResponses(contents: GeminiSdkContent[]): void {
    const callsById = new Map<string, { name?: string; contentIndex: number; partIndex: number }>();
    const responsesById = new Map<string, Array<{ contentIndex: number; partIndex: number }>>();

    const orphanThoughts: Array<{
        signature: string;
        contentIndex: number;
        partIndex: number;
    }> = [];

    for (let contentIndex = 0; contentIndex < contents.length; contentIndex++) {
        const content = contents[contentIndex];
        for (let partIndex = 0; partIndex < content.parts.length; partIndex++) {
            const part = content.parts[partIndex] as Record<string, unknown>;

            const functionCall =
                part.functionCall &&
                typeof part.functionCall === 'object' &&
                !Array.isArray(part.functionCall)
                    ? (part.functionCall as Record<string, unknown>)
                    : undefined;

            const functionResponse =
                part.functionResponse &&
                typeof part.functionResponse === 'object' &&
                !Array.isArray(part.functionResponse)
                    ? (part.functionResponse as Record<string, unknown>)
                    : undefined;

            if (functionCall) {
                const idRaw = functionCall.id || functionCall.callId;
                const id = typeof idRaw === 'string' ? idRaw : `call_${contentIndex}_${partIndex}`;
                const name = typeof functionCall.name === 'string' ? functionCall.name : undefined;
                callsById.set(id, {
                    name,
                    contentIndex,
                    partIndex
                });
                if (part.thoughtSignature) {
                    part.thoughtSignature = String(part.thoughtSignature);
                }
            } else if (functionResponse) {
                const id = typeof functionResponse.id === 'string' ? functionResponse.id : '';
                const name = typeof functionResponse.name === 'string' ? functionResponse.name : '';
                const key = id || `__name_${name}`;
                const entries = responsesById.get(key) || [];
                entries.push({ contentIndex, partIndex });
                responsesById.set(key, entries);
            }

            if (part.thoughtSignature && !functionCall) {
                orphanThoughts.push({
                    signature: String(part.thoughtSignature),
                    contentIndex,
                    partIndex
                });
            }
        }
    }

    for (const [id, info] of callsById.entries()) {
        if (!responsesById.has(id)) {
            contents.push({
                role: 'user',
                parts: [
                    {
                        functionResponse: {
                            name: info.name || '',
                            id,
                            response: {}
                        }
                    }
                ]
            });
        }
    }

    for (const [responseKey, locations] of responsesById.entries()) {
        if (callsById.has(responseKey)) {
            continue;
        }

        for (let i = locations.length - 1; i >= 0; i--) {
            const location = locations[i];
            const content = contents[location.contentIndex];
            const part = content.parts[location.partIndex] as Record<string, unknown>;

            const responseWrapper =
                part.functionResponse &&
                typeof part.functionResponse === 'object' &&
                !Array.isArray(part.functionResponse)
                    ? (part.functionResponse as Record<string, unknown>)
                    : undefined;

            const responsePayload =
                responseWrapper?.response &&
                typeof responseWrapper.response === 'object' &&
                !Array.isArray(responseWrapper.response)
                    ? (responseWrapper.response as Record<string, unknown>)
                    : undefined;

            if (responsePayload && Object.keys(responsePayload).length > 0) {
                content.parts[location.partIndex] = { text: JSON.stringify(responsePayload) };
            } else {
                content.parts.splice(location.partIndex, 1);
            }
        }
    }

    for (const orphan of orphanThoughts) {
        const { signature, contentIndex, partIndex } = orphan;
        let attached = false;

        const currentContent = contents[contentIndex];
        if (currentContent) {
            const callPartIndex = currentContent.parts.findIndex((part) => {
                const record = part as Record<string, unknown>;
                return !!record.functionCall;
            });
            if (callPartIndex !== -1) {
                (currentContent.parts[callPartIndex] as Record<string, unknown>).thoughtSignature = signature;
                delete (currentContent.parts[partIndex] as Record<string, unknown>).thoughtSignature;
                attached = true;
            }
        }

        if (!attached) {
            for (let i = contentIndex - 1; i >= 0 && !attached; i--) {
                const callPartIndex = contents[i].parts.findIndex((part) => {
                    const record = part as Record<string, unknown>;
                    return !!record.functionCall;
                });
                if (callPartIndex !== -1) {
                    (contents[i].parts[callPartIndex] as Record<string, unknown>).thoughtSignature = signature;
                    delete (contents[contentIndex].parts[partIndex] as Record<string, unknown>).thoughtSignature;
                    attached = true;
                }
            }
        }

        if (!attached) {
            for (let i = contentIndex + 1; i < contents.length && !attached; i++) {
                const callPartIndex = contents[i].parts.findIndex((part) => {
                    const record = part as Record<string, unknown>;
                    return !!record.functionCall;
                });
                if (callPartIndex !== -1) {
                    (contents[i].parts[callPartIndex] as Record<string, unknown>).thoughtSignature = signature;
                    delete (contents[contentIndex].parts[partIndex] as Record<string, unknown>).thoughtSignature;
                    attached = true;
                }
            }
        }

        if (!attached) {
            delete (contents[contentIndex].parts[partIndex] as Record<string, unknown>).thoughtSignature;
        }
    }

    for (let i = contents.length - 1; i >= 0; i--) {
        if (!contents[i].parts || contents[i].parts.length === 0) {
            contents.splice(i, 1);
        }
    }
}
