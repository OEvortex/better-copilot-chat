import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => {
    class EventEmitter<T> {
        public event = (): void => undefined;

        fire(_value: T): void {
            return;
        }

        dispose(): void {
            return;
        }
    }

    class LanguageModelThinkingPart {
        constructor(
            public value: string | string[],
            public id?: string
        ) {}
    }

    class LanguageModelTextPart {
        constructor(public value: string) {}
    }

    class LanguageModelToolCallPart {
        constructor(
            public callId: string,
            public name: string,
            public input: Record<string, unknown>
        ) {}
    }

    return {
        EventEmitter,
        LanguageModelChatMessageRole: {
            Assistant: 'assistant',
            System: 'system',
            User: 'user'
        },
        LanguageModelThinkingPart,
        LanguageModelTextPart,
        LanguageModelToolCallPart
    };
});

import * as vscode from 'vscode';
import { OpenAIHandler } from './openaiHandler';
import { tryNormalizePythonStyleCompletionChunk } from './openaiSseNormalizer';

describe('tryNormalizePythonStyleCompletionChunk', () => {
    it('normalizes python-style completion dumps into OpenAI chunk JSON', () => {
        const payload = tryNormalizePythonStyleCompletionChunk(
            "ChatCompletion(id='chatcmpl-kilo', model='x-ai/grok-code-fast-1:optimized:free', choices=[Choice(finish_reason='stop', index=0, message=ChatCompletionMessage(content='Hello\\nMaslow\\'s ladder', refusal=None, role='assistant', annotations=None, audio=None, function_call=None, tool_calls=None, reasoning='plan first'))])",
            '',
            ''
        );

        expect(payload).not.toBeNull();
        if (!payload) {
            throw new Error('Expected normalized payload');
        }

        expect(payload.id).toBe('chatcmpl-kilo');
        expect(payload.model).toBe('x-ai/grok-code-fast-1:optimized:free');
        expect(payload.choices).toHaveLength(1);
        expect(payload.choices[0]).toMatchObject({
            index: 0,
            finish_reason: 'stop',
            delta: {
                role: 'assistant',
                content: "Hello\nMaslow's ladder",
                reasoning_content: 'plan first'
            }
        });
    });
});

describe('OpenAIHandler assistant message serialization', () => {
    const modelConfig = {
        id: 'kimi-k2-5',
        name: 'Kimi K2.5',
        tooltip: 'Kimi K2.5',
        maxInputTokens: 229376,
        maxOutputTokens: 32768,
        capabilities: {
            toolCalling: true,
            imageInput: true
        },
        includeThinking: true
    } as const;

    let handler: OpenAIHandler;

    beforeEach(() => {
        handler = new OpenAIHandler('opencodego', 'OpenCode Zen Go');
    });

    afterEach(() => {
        handler?.dispose();
    });

    it('preserves reasoning_content when assistant message contains thinking and tool calls', () => {
        const message = {
            role: vscode.LanguageModelChatMessageRole.Assistant,
            content: [
                new vscode.LanguageModelThinkingPart(
                    'plan first',
                    'thinking-1'
                ),
                new vscode.LanguageModelToolCallPart('call-1', 'read_file', {
                    path: 'src/index.ts'
                })
            ]
        } as unknown as vscode.LanguageModelChatMessage;

        const result = (handler as any).convertAssistantMessage(
            message,
            modelConfig
        );

        expect(result).not.toBeNull();
        expect(result).toMatchObject({
            role: 'assistant',
            content: null,
            reasoning_content: 'plan first',
            tool_calls: [
                {
                    id: 'call-1',
                    type: 'function',
                    function: {
                        name: 'read_file',
                        arguments: JSON.stringify({
                            path: 'src/index.ts'
                        })
                    }
                }
            ]
        });
    });

    it('adds empty reasoning_content placeholder for assistant tool calls when thinking is enabled', () => {
        const message = {
            role: vscode.LanguageModelChatMessageRole.Assistant,
            content: [
                new vscode.LanguageModelToolCallPart('call-2', 'read_file', {
                    path: 'src/app.ts'
                })
            ]
        } as unknown as vscode.LanguageModelChatMessage;

        const result = (handler as any).convertAssistantMessage(
            message,
            modelConfig
        );

        expect(result).not.toBeNull();
        expect(result).toMatchObject({
            role: 'assistant',
            content: null,
            reasoning_content: '',
            tool_calls: [
                {
                    id: 'call-2',
                    type: 'function',
                    function: {
                        name: 'read_file',
                        arguments: JSON.stringify({
                            path: 'src/app.ts'
                        })
                    }
                }
            ]
        });
    });
});
