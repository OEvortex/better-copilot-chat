# PROJECT KNOWLEDGE BASE

Copilot ++ is a VS Code extension that enhances GitHub Copilot Chat with multiple AI providers including ZhipuAI, MiniMax, MoonshotAI, DeepSeek, Antigravity (Google Cloud Code), Codex (OpenAI), Chutes, OpenCode, and custom OpenAI/Anthropic compatible models.

## STRUCTURE

```
copilot-helper/
├── src/                    # Source code
│   ├── accounts/           # Account management
│   ├── copilot/            # Core Copilot integration
│   ├── providers/          # AI provider implementations
│   ├── status/             # Status bar components
│   ├── ui/                 # User interface components
│   ├── utils/              # Shared utilities
│   ├── tools/              # Tool implementations
│   ├── types/              # Type definitions
│   └── prompt/             # AI prompts and instructions
├── dist/                   # Compiled output
├── fonts/                  # Custom fonts
├── .vscode/                # VS Code configuration
├── esbuild.config.js       # Build configuration
├── tsconfig.json           # TypeScript configuration
├── biome.config.json       # Biome linting/formatting configuration (replaces ESLint)
├── package.json            # Extension manifest
└── README.md               # Documentation
```

## WHERE TO LOOK

| Task                     | Location       | Notes                             |
| ------------------------ | -------------- | --------------------------------- |
| Add new AI provider      | src/providers/ | Follow existing provider pattern  |
| Account management       | src/accounts/  | Multi-account support             |
| Status bar features      | src/status/    | Provider status indicators        |
| UI components            | src/ui/        | Settings pages, managers          |
| Core Copilot integration | src/copilot/   | Completion providers, adapters    |
| Utility functions        | src/utils/     | Shared code across modules        |
| Type definitions         | src/types/     | VS Code and custom types          |
| AI prompts               | src/prompt/    | Instructions for different models |

## CODE MAP

(No LSP available - project uses TypeScript without LSP server installed)

## CONVENTIONS

- Use 4-space indentation (except package.json: 2 spaces)
- Single quotes for strings
- No trailing commas
- Curly braces required
- Strict TypeScript mode enabled
- ES2022 target, Node16 modules
- Source maps enabled for debugging

## ANTI-PATTERNS (THIS PROJECT)

- Do not use deprecated VS Code APIs (see src/types/vscode.proposed.d.ts)
- Do not amend commits unless explicitly requested
- Do not use destructive git commands without approval
- Do not swallow errors in provider implementations
- Do not block on configuration retrieval
- Do not depend on chat-lib for commands in shim
- Do not use markdown code blocks in output
- Do not log error if request is aborted
- Do not enable MCP Search Mode without user option
- Do not wait for background execution result
- Do not close panel if user cancels editing
- Do not use maxResults unless necessary
- Do not use | in includePattern
- Do not await background cache updates
- Do not trigger user interaction in silent mode
- Do not render a native message box

## UNIQUE STYLES

- Provider-specific status bar colors defined in package.json
- Custom font icons for each provider
- Multi-account load balancing with auto-switching
- Web search integration via MCP protocol
- FIM (Fill In the Middle) and NES (Next Edit Suggestions) completion
- Token usage tracking with visual indicators

## COMMANDS

```bash
npm run compile          # Build extension to dist/
npm run compile:dev      # Build in development mode
npm run watch            # Watch mode for development
npm run lint             # Run Biome lint checks
npm run format           # Format code with Biome
npm run package          # Create .vsix package
npm run publish          # Publish to VS Code marketplace
```

## RULES
- Follow Biome linting rules as per biome.config.json
- Adhere to TypeScript strict mode
- Ensure compatibility with VS Code API version 1.80.0
- Maintain modular structure for providers and utilities
- Use batch eddits for large refactors

## ⚠️ CRITICAL: Context Window Management

Your context window is limited - especially the output size. To avoid truncation and ensure reliable execution:

- **ALWAYS work in discrete, focused steps**
- **ALWAYS use `runSubagent` for complex multi-step tasks** - delegate research, analysis, or multi-file operations to subagents
- **You can use `runSubagent` unlimited times within a single agent task**
- **Break large tasks into smaller chunks** - process files in batches, not all at once
- **Avoid reading large files entirely** - use search code tools to find specific code first
- **Never batch too many operations** - if you need to modify 10+ files, use a subagent or work in groups of 3-5

When in doubt, delegate to a subagent rather than risk output truncation.