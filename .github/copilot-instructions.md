# Copilot Helper Codebase Instructions

## Architecture Overview

This extension provides multi-provider support for GitHub Copilot Chat. The core architecture revolves around a plugin-based provider system.

- **Entry Point**: `src/extension.ts` handles activation, parallel provider registration, and service initialization (AccountManager, StatusBarManager).
- **Providers**: Located in `src/providers/`. Most extend `GenericModelProvider` (in `src/providers/common/`) which handles common logic like API key management and token counting.
  - **Key Providers**: `Antigravity` (Google Cloud Code), `Codex` (OpenAI), `Zhipu`, `MiniMax`, `Moonshot`, `DeepSeek`, `Compatible`.
  - **Configuration**: Model definitions are stored in `src/providers/config/*.json` and aggregated in `src/providers/config/index.ts`.
- **Services**:
  - **AccountManager** (`src/accounts/`): Centralized multi-account management with OAuth and API key support.
  - **Auth**: `src/providers/*/auth.ts` handles provider-specific authentication (e.g., OAuth for Antigravity/Codex).
  - **Status Bar**: `src/status/` manages UI indicators for quotas and active accounts.
  - **Tools**: `src/tools/` registers MCP-compatible tools (e.g., web search).

## Developer Workflows

- **Build & Watch**:
  - Run `npm run watch` to build in development mode with file watching.
  - Run `npm run compile` for a production build.
  - Uses `esbuild` configured in `esbuild.config.js`.
- **Debugging**:
  - Use the "Extension" launch configuration in VS Code.
  - Logs are written via `Logger` class to the "Copilot ++" output channel.

## Key Patterns & Conventions

- **Provider Implementation**:
  - Extend `GenericModelProvider` for standard providers.
  - Implement `LanguageModelChatProvider` interface.
  - Use `createAndActivate` static method for registration.
  - Define models in `src/providers/config/[provider].json`.
- **Authentication**:
  - Use `ApiKeyManager` (`src/utils/apiKeyManager.ts`) for secure storage.
  - For OAuth providers (Antigravity, Codex), implement a local callback server (see `src/providers/antigravity/auth.ts`).
- **Configuration**:
  - Access settings via `ConfigManager` (`src/utils/configManager.ts`).
  - Do not read `vscode.workspace.getConfiguration` directly for core settings; use the manager.
- **Status Bar**:
  - Do not create `vscode.StatusBarItem` directly. Use `StatusBarManager` or extend `BaseStatusBarItem`.
- **Logging**:
  - ALWAYS use `Logger.info()`, `Logger.warn()`, `Logger.error()` instead of `console.log`.

## Critical Integration Points

- **Copilot Chat**: The extension registers as a chat provider (`vscode.lm.registerLanguageModelChatProvider`).
- **Secret Storage**: Credentials are stored using `context.secrets` via `AccountManager` or `ApiKeyManager`.
- **Global State**: `globalThis.__chp_singletons` is used to share singleton instances with `copilot.bundle.ts`.

## Important Paths

- `src/extension.ts`: Main activation logic.
- `src/providers/`: Provider implementations.
- `src/providers/config/`: Model configuration JSONs.
- `src/accounts/accountManager.ts`: Multi-account logic.
- `src/utils/`: Shared utilities (Logger, ConfigManager, etc.).
