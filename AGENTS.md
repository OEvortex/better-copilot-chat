<?xml version="1.0" encoding="UTF-8"?>
<project_knowledge_base>
    <title>PROJECT KNOWLEDGE BASE</title>

    <description>Aether is a VS Code extension that enhances GitHub Copilot Chat with multiple AI providers including ZhipuAI, MiniMax, MoonshotAI, DeepSeek, Codex (OpenAI), Chutes, OpenCode, and custom OpenAI/Anthropic compatible models.</description>

    <section name="STRUCTURE">
        <file_tree>
            <folder name="copilot-helper">
                <folder name="src">
                    <folder name="accounts">Account management</folder>
                    <folder name="copilot">Core Copilot integration</folder>
                    <folder name="providers">AI provider implementations</folder>
                    <folder name="status">Status bar components</folder>
                    <folder name="ui">User interface components</folder>
                    <folder name="utils">Shared utilities</folder>
                    <folder name="utils">
                        <file name="knownProvidersData.ts">Pure provider data — NO vscode imports</file>
                        <file name="knownProviders.ts">Extension logic — imports from knownProvidersData.ts</file>
                    </folder>
                    <folder name="tools">Tool implementations</folder>
                    <folder name="types">Type definitions</folder>
                    <folder name="prompt">AI prompts and instructions</folder>
                </folder>
                <folder name="aether">Aether CLI (src/aether)</folder>
                <folder name="dist">Compiled output</folder>
                <folder name="fonts">Custom fonts</folder>
                <folder name=".vscode">VS Code configuration</folder>
                <file name="esbuild.config.js">Build configuration</file>
                <file name="tsconfig.json">TypeScript configuration</file>
                <file name="biome.config.json">Biome linting/formatting configuration (replaces ESLint)</file>
                <file name="package.json">Extension manifest</file>
                <file name="README.md">Documentation</file>
            </folder>
        </file_tree>
    </section>

    <section name="WHERE_TO_LOOK">
        <table>
            <row>
                <cell>Task</cell>
                <cell>Location</cell>
                <cell>Notes</cell>
            </row>
            <row>
                <cell>Add new AI provider</cell>
                <cell>src/utils/knownProvidersData.ts</cell>
                <cell>Add to knownProviderOverrides, then run npm run sync-providers</cell>
            </row>
            <row>
                <cell>Aether CLI source</cell>
                <cell>src/aether/</cell>
                <cell>Reads from knownProvidersData.ts (no vscode imports)</cell>
            </row>
            <row>
                <cell>Account management</cell>
                <cell>src/accounts/</cell>
                <cell>Multi-account support</cell>
            </row>
            <row>
                <cell>Status bar features</cell>
                <cell>src/status/</cell>
                <cell>Provider status indicators</cell>
            </row>
            <row>
                <cell>UI components</cell>
                <cell>src/ui/</cell>
                <cell>Settings pages, managers</cell>
            </row>
            <row>
                <cell>Core Copilot integration</cell>
                <cell>src/copilot/</cell>
                <cell>Completion providers, adapters</cell>
            </row>
            <row>
                <cell>Utility functions</cell>
                <cell>src/utils/</cell>
                <cell>Shared code across modules</cell>
            </row>
            <row>
                <cell>Type definitions</cell>
                <cell>src/types/</cell>
                <cell>VS Code and custom types</cell>
            </row>
            <row>
                <cell>AI prompts</cell>
                <cell>src/prompt/</cell>
                <cell>Instructions for different models</cell>
            </row>
        </table>
    </section>

    <section name="CODE_MAP">
        <note>No LSP available - project uses TypeScript without LSP server installed</note>
    </section>

    <section name="CONVENTIONS">
        <list>
            <item>Use 4-space indentation (except package.json: 2 spaces)</item>
            <item>Single quotes for strings</item>
            <item>No trailing commas</item>
            <item>Curly braces required</item>
            <item>Strict TypeScript mode enabled</item>
            <item>ES2022 target, Node16 modules</item>
            <item>Source maps enabled for debugging</item>
        </list>
    </section>

    <section name="ANTI_PATTERNS">
        <list>
            <item>Do not use deprecated VS Code APIs (see src/types/vscode.proposed.d.ts)</item>
            <item>Do not amend commits unless explicitly requested</item>
            <item>Do not use destructive git commands without approval</item>
            <item>Do not swallow errors in provider implementations</item>
            <item>Do not block on configuration retrieval</item>
            <item>Do not depend on chat-lib for commands in shim</item>
            <item>Do not use markdown code blocks in output</item>
            <item>Do not log error if request is aborted</item>
            <item>Do not enable MCP Search Mode without user option</item>
            <item>Do not wait for background execution result</item>
            <item>Do not close panel if user cancels editing</item>
            <item>Do not use maxResults unless necessary</item>
            <item>Do not use | in includePattern</item>
            <item>Do not await background cache updates</item>
            <item>Do not trigger user interaction in silent mode</item>
            <item>Do not render a native message box</item>
        </list>
    </section>

    <section name="UNIQUE_STYLES">
        <list>
            <item>Provider-specific status bar colors defined in package.json</item>
            <item>Custom font icons for each provider</item>
            <item>Multi-account load balancing with auto-switching</item>
            <item>Web search integration via MCP protocol</item>
            <item>FIM (Fill In the Middle) and NES (Next Edit Suggestions) completion</item>
            <item>Token usage tracking with visual indicators</item>
        </list>
    </section>

    <section name="ADDING_NEW_PROVIDER">
        <title>How to Add a New AI Provider</title>
        <description>The Aether extension uses a dual-source architecture. Provider data lives in knownProvidersData.ts (pure data, no vscode imports), while extension logic lives in knownProviders.ts. Aether CLI reads directly from knownProvidersData.ts.</description>

        <section name="CRITICAL_RULE_FOR_AI">
            <title>⚠️ IMPORTANT: Where to Add Provider Data</title>
            <warning>ALWAYS add provider entries to src/utils/knownProvidersData.ts — NOT knownProviders.ts.</warning>
            <list>
                <item>knownProvidersData.ts = pure data only (no vscode, no AccountManager, no configProviders imports)</item>
                <item>knownProviders.ts = extension logic only (imports from knownProvidersData.ts)</item>
                <item>Aether CLI imports from knownProvidersData.ts to avoid vscode bundling errors</item>
                <item>sync-providers.js parses knownProvidersData.ts to generate dependent files</item>
            </list>
        </section>

        <step_list>
            <step order="1">
                <title>Define provider in knownProvidersData.ts</title>
                <description>Add the provider configuration to src/utils/knownProvidersData.ts in the knownProviderOverrides object. This is the ONLY file you need to manually edit for basic provider setup.</description>
                <code_block language="typescript">
// Example: Adding NanoGPT provider
const knownProviderOverrides: Record&lt;string, KnownProviderConfig&gt; = {
    // ... existing providers ...
    nanogpt: {
        displayName: "NanoGPT",
        family: "NanoGPT",
        openai: { baseUrl: "https://nano-gpt.com/api/v1" },
        fetchModels: true,
        modelsEndpoint: "/models",
        modelParser: {
            arrayPath: "data",
            descriptionField: "id",
            cooldownMinutes: 10,
        },
    },
    // ... other providers ...
};
                </code_block>
                <notes>
                    <item>Use only openai config for OpenAI SDK-only providers</item>
                    <item>Add anthropic config too if the provider supports both SDKs</item>
                    <item>Add responses config for OpenAI Responses SDK compatibility</item>
                    <item>fetchModels: true enables automatic model list fetching</item>
                    <item>modelsEndpoint defaults to "/models" if not specified</item>
                    <item>supportsApiKey: false for providers that don't require API keys</item>
                    <item>DO NOT import vscode, AccountManager, or configProviders in this file</item>
                </notes>
            </step>

            <step order="2">
                <title>Run the sync script</title>
                <description>Run the provider synchronization script to auto-generate all dependent artifacts.</description>
                <code_block language="bash">npm run sync-providers</code_block>
                <description>This script parses knownProvidersData.ts and will:</description>
                <list>
                    <item>Generate ProviderKey enum entry in src/types/providerKeys.ts</item>
                    <item>Register provider capabilities in src/accounts/accountManager.ts</item>
                    <item>Add setApiKey command in package.json</item>
                    <item>Add baseUrl configuration setting in package.json</item>
                    <item>Add activation event for the provider</item>
                    <item>Register languageModelChatProviders entry</item>
                    <item>Update src/providers/config/index.ts with JSON config file import</item>
                </list>
            </step>

            <step order="3">
                <title>Create initial config file (optional)</title>
                <description>Create src/providers/config/{provider}.json with initial placeholder models. This file is used by the extension (not Aether CLI).</description>
                <code_block language="json">
{
    "displayName": "NanoGPT",
    "baseUrl": "https://nano-gpt.com/api/v1",
    "apiKeyTemplate": "sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "models": [
        {
            "id": "gpt-4o",
            "name": "GPT-4o",
            "tooltip": "GPT-4o - OpenAI's latest multimodal model",
            "maxInputTokens": 128000,
            "maxOutputTokens": 4096,
            "capabilities": {
                "toolCalling": true,
                "imageInput": true
            }
        }
    ]
}
                </code_block>
            </step>

            <step order="4">
                <title>Build and test</title>
                <code_block language="bash">npm run compile:dev    # Extension build
npm run aether:build   # Aether CLI build</code_block>
                <description>The provider should now:</description>
                <list>
                    <item>Appear in Aether Settings page (extension)</item>
                    <item>Support API key configuration via aether.{provider}.setApiKey command</item>
                    <item>Appear in Aether CLI provider list</item>
                    <item>Auto-fetch models from the configured endpoint when API key is set</item>
                </list>
            </step>
        </step_list>

        <section name="Provider_Configuration_Reference">
            <title>KnownProviderConfig Options</title>
            <table>
                <row>
                    <cell>Property</cell>
                    <cell>Type</cell>
                    <cell>Description</cell>
                </row>
                <row>
                    <cell>displayName</cell>
                    <cell>string</cell>
                    <cell>Human-readable provider name</cell>
                </row>
                <row>
                    <cell>family</cell>
                    <cell>string</cell>
                    <cell>Provider family identifier</cell>
                </row>
                <row>
                    <cell>sdkMode</cell>
                    <cell>string?</cell>
                    <cell>Default SDK mode: "openai", "anthropic", "oai-response"</cell>
                </row>
                <row>
                    <cell>openai</cell>
                    <cell>{baseUrl: string}?</cell>
                    <cell>OpenAI SDK configuration</cell>
                </row>
                <row>
                    <cell>anthropic</cell>
                    <cell>{baseUrl: string}?</cell>
                    <cell>Anthropic SDK configuration</cell>
                </row>
                <row>
                    <cell>responses</cell>
                    <cell>{baseUrl: string}?</cell>
                    <cell>OpenAI Responses SDK configuration</cell>
                </row>
                <row>
                    <cell>fetchModels</cell>
                    <cell>boolean?</cell>
                    <cell>Enable automatic model fetching</cell>
                </row>
                <row>
                    <cell>modelsEndpoint</cell>
                    <cell>string?</cell>
                    <cell>Endpoint for fetching models (default: "/models")</cell>
                </row>
                <row>
                    <cell>modelParser</cell>
                    <cell>object?</cell>
                    <cell>Configuration for parsing model list response</cell>
                </row>
                <row>
                    <cell>supportsApiKey</cell>
                    <cell>boolean?</cell>
                    <cell>Whether provider requires API key (default: true)</cell>
                </row>
                <row>
                    <cell>apiKeyTemplate</cell>
                    <cell>string?</cell>
                    <cell>Template shown in API key input placeholder</cell>
                </row>
                <row>
                    <cell>openModelEndpoint</cell>
                    <cell>boolean?</cell>
                    <cell>Whether provider has open/unauthenticated model endpoint</cell>
                </row>
                <row>
                    <cell>customHeader</cell>
                    <cell>Record&lt;string,string&gt;?</cell>
                    <cell>Custom headers for all requests</cell>
                </row>
                <row>
                    <cell>rateLimit</cell>
                    <cell>object?</cell>
                    <cell>Provider rate-limit tuning configuration</cell>
                </row>
            </table>
        </section>
    </section>

    <section name="COMMANDS">
        <code_block language="bash">npm run compile          # Build extension to dist/
npm run compile:dev      # Build in development mode
npm run watch            # Watch mode for development
npm run lint             # Run Biome lint checks
npm run format           # Format code with Biome
npm run sync-providers   # Sync provider metadata from knownProvidersData.ts
npm run package          # Create .vsix package
npm run publish          # Publish to VS Code marketplace

# Aether CLI commands
npm run aether:build     # Build Aether CLI
npm run aether:start     # Start Aether CLI
npm run aether:dev       # Build and start Aether CLI (dev mode)</code_block>
    </section>

    <section name="RULES">
        <list>
            <item>Follow Biome linting rules as per biome.config.json</item>
            <item>Adhere to TypeScript strict mode</item>
            <item>Ensure compatibility with VS Code API version 1.80.0</item>
            <item>Maintain modular structure for providers and utilities</item>
            <item>Use batch eddits for large refactors</item>
        </list>
    </section>

    <section name="CRITICAL_Context_Window_Management">
        <warning>Your context window is limited - especially the output size. To avoid truncation and ensure reliable execution:</warning>
        <list>
            <item>ALWAYS work in discrete, focused steps</item>
            <item>ALWAYS use `runSubagent` for complex multi-step tasks - delegate research, analysis, or multi-file operations to subagents</item>
            <item>You can use `runSubagent` unlimited times within a single agent task</item>
            <item>Break large tasks into smaller chunks - process files in batches, not all at once</item>
            <item>Avoid reading large files entirely - use search code tools to find specific code first</item>
            <item>Never batch too many operations - if you need to modify 10+ files, use a subagent or work in groups of 3-5</item>
        </list>
        <note>When in doubt, delegate to a subagent rather than risk output truncation.</note>
    </section>
</project_knowledge_base>