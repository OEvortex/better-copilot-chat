<?xml version="1.0" encoding="UTF-8"?>
<project_knowledge_base>
    <title>PROJECT KNOWLEDGE BASE</title>

    <description>Copilot ++ is a VS Code extension that enhances GitHub Copilot Chat with multiple AI providers including ZhipuAI, MiniMax, MoonshotAI, DeepSeek, Antigravity (Google Cloud Code), Codex (OpenAI), Chutes, OpenCode, and custom OpenAI/Anthropic compatible models.</description>

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
                    <folder name="tools">Tool implementations</folder>
                    <folder name="types">Type definitions</folder>
                    <folder name="prompt">AI prompts and instructions</folder>
                </folder>
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
                <cell>src/providers/</cell>
                <cell>Follow existing provider pattern</cell>
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

    <section name="COMMANDS">
        <code_block language="bash">npm run compile          # Build extension to dist/
npm run compile:dev      # Build in development mode
npm run watch            # Watch mode for development
npm run lint             # Run Biome lint checks
npm run format           # Format code with Biome
npm run package          # Create .vsix package
npm run publish          # Publish to VS Code marketplace</code_block>
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