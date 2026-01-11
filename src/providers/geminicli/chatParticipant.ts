/*---------------------------------------------------------------------------------------------
 *  Gemini CLI Chat Participant using ACP
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Logger } from '../../utils/logger';
import { AcpClient } from './acpClient';

export class GeminiCliChatParticipant {
    private participant: vscode.ChatParticipant | null = null;
    private acpClient: AcpClient | null = null;

    constructor(private readonly context: vscode.ExtensionContext) {}

    async initialize(): Promise<void> {
        try {
            // Create chat participant first (so it appears in the menu)
            // The ID must match the one in package.json chatParticipants contribution
            // Properties like name, fullName, description, icon are defined in package.json
            this.participant = vscode.chat.createChatParticipant(
                'geminicli',
                async (request, context, response, token) => {
                    return await this.handleChatRequest(request, context, response, token);
                }
            );

            // Set additional properties that can be set programmatically
            if (this.participant) {
                this.participant.additionalWelcomeMessage = new vscode.MarkdownString(
                    "I'm Gemini CLI, powered by Google's Gemini models. I can help you with code generation, refactoring, and debugging"
                );
            }

            // Try to find and initialize Gemini CLI (but don't fail if not found)
            const geminiCliPath = await this.findGeminiCli();
            if (geminiCliPath) {
                Logger.info(`[Gemini CLI Chat] Found Gemini CLI at: ${geminiCliPath}`);
                try {
                    // Initialize ACP client with --experimental-acp flag
                    // If using npx, we need to pass the package name as well
                    if (geminiCliPath === 'npx') {
                        Logger.debug('[Gemini CLI Chat] Using npx to run Gemini CLI');
                        this.acpClient = new AcpClient('npx', ['@google/gemini-cli', '--experimental-acp']);
                    } else {
                        Logger.debug(`[Gemini CLI Chat] Using Gemini CLI at: ${geminiCliPath}`);
                        this.acpClient = new AcpClient(geminiCliPath, ['--experimental-acp']);
                    }
                    await this.acpClient.initialize();
                    Logger.info('[Gemini CLI Chat] ACP client initialized successfully');
                } catch (error) {
                    Logger.error('[Gemini CLI Chat] Failed to initialize ACP client:', error);
                    // Continue without ACP client - will show error when user tries to use it
                    this.acpClient = null;
                }
            } else {
                Logger.warn(
                    '[Gemini CLI Chat] Gemini CLI not found. Please install it: npm install -g @google/gemini-cli'
                );
            }

            Logger.info('[Gemini CLI Chat] Chat participant initialized');
        } catch (error) {
            Logger.error('[Gemini CLI Chat] Failed to initialize:', error);
            throw error;
        }
    }

    private async findGeminiCli(): Promise<string | null> {
        const isWindows = process.platform === 'win32';
        const findCommand = isWindows ? 'where.exe' : 'which';

        // First, try to find gemini using which/where
        try {
            const geminiPath = await new Promise<string | null>(resolve => {
                const proc = require('child_process').spawn(findCommand, ['gemini'], {
                    shell: true,
                    stdio: ['ignore', 'pipe', 'ignore']
                });
                let output = '';
                proc.stdout?.on('data', (data: Buffer) => {
                    output += data.toString();
                });
                proc.on('close', (code: number | null) => {
                    if (code === 0 && output.trim()) {
                        // On Windows, where.exe can return multiple paths, take the first one
                        const path = output.trim().split('\n')[0].trim();
                        resolve(path || null);
                    } else {
                        resolve(null);
                    }
                });
                proc.on('error', () => resolve(null));
            });

            if (geminiPath) {
                Logger.debug(`[Gemini CLI] Found at: ${geminiPath}`);
                return geminiPath;
            }
        } catch {
            // Continue to try other methods
        }

        // If not found with which/where, try running gemini directly
        try {
            const result = await new Promise<string>((resolve, reject) => {
                const proc = require('child_process').spawn('gemini', ['--version'], {
                    shell: true,
                    stdio: ['ignore', 'pipe', 'ignore']
                });
                let output = '';
                proc.stdout?.on('data', (data: Buffer) => {
                    output += data.toString();
                });
                proc.on('close', (code: number | null) => {
                    if (code === 0) {
                        resolve(output);
                    } else {
                        reject(new Error(`Exit code: ${code}`));
                    }
                });
                proc.on('error', reject);
            });

            if (result && result.includes('gemini')) {
                Logger.debug('[Gemini CLI] Found via direct execution');
                return 'gemini';
            }
        } catch {
            // Continue to try npx
        }

        // Finally, try npx as fallback
        try {
            const result = await new Promise<string>((resolve, reject) => {
                const proc = require('child_process').spawn('npx', ['@google/gemini-cli', '--version'], {
                    shell: true,
                    stdio: ['ignore', 'pipe', 'ignore']
                });
                let output = '';
                proc.stdout?.on('data', (data: Buffer) => {
                    output += data.toString();
                });
                proc.on('close', (code: number | null) => {
                    if (code === 0) {
                        resolve(output);
                    } else {
                        reject(new Error(`Exit code: ${code}`));
                    }
                });
                proc.on('error', reject);
            });

            if (result) {
                Logger.debug('[Gemini CLI] Found via npx');
                return 'npx';
            }
        } catch {
            // Not found
        }

        Logger.warn('[Gemini CLI] Not found using which/where or direct execution');
        return null;
    }

    private async handleChatRequest(
        request: vscode.ChatRequest,
        _context: vscode.ChatContext,
        response: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult | undefined> {
        if (!this.acpClient) {
            response.markdown(
                'Gemini CLI is not available. Please ensure it is installed: `npm install -g @google/gemini-cli`'
            );
            return;
        }

        try {
            // Extract prompt from request
            const prompt = this.extractPrompt(request);

            if (!prompt) {
                response.markdown('Please provide a prompt or question.');
                return;
            }

            // Show progress
            response.progress('Connecting to Gemini CLI via ACP...');

            // Get workspace path for proper context
            const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

            // Track different types of content - match Copilot's style
            let messageBuffer = '';
            let thoughtBuffer = '';
            let currentThinkingId: string | undefined;
            let lastThoughtUpdate = Date.now();
            const THOUGHT_DEBOUNCE_MS = 200; // Debounce thought updates

            // Stream response chunks as they arrive
            const result = await this.acpClient.sendPrompt(
                prompt,
                workspacePath,
                (chunk: string, type: 'text' | 'thought' | 'tool', metadata?: any) => {
                    switch (type) {
                        case 'text':
                            messageBuffer += chunk;
                            // End thinking when regular content starts (like Copilot does)
                            if (currentThinkingId) {
                                response.thinkingProgress({ text: '', id: currentThinkingId });
                                currentThinkingId = undefined;
                                thoughtBuffer = '';
                            }
                            // Stream message chunks immediately - Copilot style
                            response.markdown(chunk);
                            break;
                        case 'thought':
                            thoughtBuffer += chunk;
                            // Initialize thinking ID if needed
                            if (!currentThinkingId) {
                                currentThinkingId = `gemini_thinking_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                            }
                            // Debounce thought updates to avoid too many UI updates
                            const now = Date.now();
                            if (now - lastThoughtUpdate > THOUGHT_DEBOUNCE_MS) {
                                lastThoughtUpdate = now;
                                // Use proper thinkingProgress API like Copilot
                                response.thinkingProgress({
                                    text: thoughtBuffer,
                                    id: currentThinkingId
                                });
                            }
                            break;
                        case 'tool':
                            // End thinking before tool calls (like Copilot does)
                            if (currentThinkingId) {
                                response.thinkingProgress({ text: '', id: currentThinkingId });
                                currentThinkingId = undefined;
                                thoughtBuffer = '';
                            }
                            // Use proper tool invocation API like Copilot
                            if (metadata?.toolCall) {
                                const toolCall = metadata.toolCall;
                                response.prepareToolInvocation(toolCall.title || 'Tool');
                                response.push(
                                    new vscode.ChatToolInvocationPart(
                                        toolCall.title || 'Tool',
                                        toolCall.id || `tool_${Date.now()}`
                                    )
                                );
                            } else {
                                // Fallback to markdown if metadata is missing
                                response.markdown(chunk);
                            }
                            break;
                    }
                }
            );

            // Finalize thinking if still active
            if (currentThinkingId) {
                response.thinkingProgress({ text: '', id: currentThinkingId });
            }

            // If no chunks were streamed, use the full result
            if (!messageBuffer && !thoughtBuffer && result) {
                response.markdown(result);
            } else if (!messageBuffer && !thoughtBuffer && !result) {
                response.markdown('No response received from Gemini CLI.');
            }
        } catch (error) {
            Logger.error('[Gemini CLI Chat] Request failed:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            response.markdown(
                `**Error:** ${errorMessage}\n\nPlease ensure Gemini CLI is installed and authenticated. Run \`gemini auth login\` in your terminal first.`
            );
        }
    }

    private extractPrompt(request: vscode.ChatRequest): string {
        // Extract prompt from the request
        // ChatRequest may have different structures depending on VS Code version
        const req = request as any;

        // Try prompt property first
        if (req.prompt && typeof req.prompt === 'string') {
            return req.prompt;
        }

        // Try command property
        if (req.command && typeof req.command === 'string') {
            return req.command;
        }

        // Try text property
        if (req.text && typeof req.text === 'string') {
            return req.text;
        }

        // Try message property
        if (req.message && typeof req.message === 'string') {
            return req.message;
        }

        // Try to get from variables
        const variables = req.variables;
        if (variables && typeof variables === 'object') {
            for (const [key, value] of Object.entries(variables)) {
                if (key === 'prompt' || key === 'message' || key === 'text') {
                    const varValue = value as any;
                    if (varValue && typeof varValue === 'object' && 'value' in varValue) {
                        const val = varValue.value;
                        if (typeof val === 'string') {
                            return val;
                        }
                        if (val instanceof vscode.Uri) {
                            // If it's a URI, we might need to read the file
                            return val.fsPath;
                        }
                    }
                    if (typeof varValue === 'string') {
                        return varValue;
                    }
                }
            }
        }

        // Try to get from prompt references
        const promptReferences = req.promptReferences;
        if (Array.isArray(promptReferences) && promptReferences.length > 0) {
            // Get text from first reference if available
            const firstRef = promptReferences[0];
            if (firstRef && typeof firstRef === 'object' && 'value' in firstRef) {
                return String(firstRef.value);
            }
        }

        // Fallback: try to stringify the whole request (for debugging)
        Logger.warn('[Gemini CLI Chat] Could not extract prompt from request:', JSON.stringify(req, null, 2));
        return 'Hello';
    }

    dispose(): void {
        if (this.acpClient) {
            this.acpClient.dispose();
            this.acpClient = null;
        }
        if (this.participant) {
            // Chat participants are automatically disposed by VS Code
            this.participant = null;
        }
    }

    static async createAndActivate(
        context: vscode.ExtensionContext
    ): Promise<{ participant: GeminiCliChatParticipant; disposables: vscode.Disposable[] }> {
        const chatParticipant = new GeminiCliChatParticipant(context);
        await chatParticipant.initialize();

        const disposables: vscode.Disposable[] = [
            {
                dispose: () => chatParticipant.dispose()
            }
        ];

        return { participant: chatParticipant, disposables };
    }
}
