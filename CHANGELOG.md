# Changelog

All notable changes to this project will be documented in this file.

## [0.1.6] - 2026-01-14

### Added
- **Chat Participants Module**: Introduced a new extensible architecture for CLI-based chat participants (`@gemini` and `@claude`).
  - **Gemini CLI Support**: Integrated `@gemini` participant for direct interaction with Google's Gemini AI via CLI.
  - **Claude CLI Support**: Integrated `@claude` participant for direct interaction with Anthropic's Claude AI via CLI.
  - **Session Management**: Implemented invisible session ID tracking in chat history to maintain continuity across multiple chat turns.
  - **Native Icons**: Added custom SVG icons for both participants in the chat interface.

### Improved
- **Windows CLI Detection**: Fixed a critical issue on Windows where CLI tools (like `gemini` or `claude`) installed via npm weren't detectable. Now uses `shell: true` for robust command resolution.
- **Tool Progress UI**: Cleaned up the chat interface by removing emojis and improving tool invocation messages (e.g., "Using: Search File Content" instead of raw tool names).
- **Tool Result Display**: Optimized how tool results are shown in the chat, including truncation for very long outputs to keep the UI responsive.

### Changed
- **Simplified Command Set**: Removed the `/doctor` command in favor of automatic error reporting and guidance during standard interactions.
- User-facing messages and progress indicators are now cleaner and more professional.

## [0.1.5] - 2026-01-14

### Added
- **Zenmux Provider**: Added dynamic Zenmux provider (`https://zenmux.ai/api/v1`) with automatic model fetching and configuration.
  - Supports all Zenmux models with real-time context length, reasoning, and tool calling capabilities.
  - Auto-updates local config file (`src/providers/config/zenmux.json`) with latest models and metadata.
  - Fully integrated with OpenAI SDK for robust streaming, reasoning content, and tool calls.
  - Provider is registered in extension, config, knownProviders, and UI overview.
  - API key can be set via `Copilot ++: Set Zenmux API Key` command.

- **Gemini CLI Multi-Invocation Support**: Enhanced Gemini CLI integration with multiple ways to invoke and interact with the agent.
  - **Programmatic API**: Exported `invokeViaCommand` and `invokeDirect` functions allowing other extensions or internal modules to trigger Gemini CLI actions programmatically.
  - **New Command**: Added `chp.geminicli.invoke` command to quickly start a Gemini CLI chat session with a pre-filled prompt.
  - **Subagent Delegation**: Implemented support for the `delegate_to_agent` tool. Gemini CLI can now delegate tasks to other VS Code chat participants (like GitHub Copilot) and receive their responses back into its context.
  - **Comprehensive Documentation**: Added a detailed `USAGE.md` for Gemini CLI covering all invocation methods and delegation workflows.
  - **Automated Testing**: Added a full suite of tests for the new invocation flows and delegation logic.

- **Global Rate Limiting**: Implemented a consistent rate limiting mechanism across all AI providers.
  - Standardized limit of **2 requests per 1 second** per provider to prevent API flooding.
  - New `RateLimiter` utility with fixed-window throttling and automatic wait logic.
  - Integrated into OpenAI, Anthropic, Mistral, Codex, Antigravity, Gemini CLI, and all dedicated providers (Chutes, HuggingFace, etc.).

### Changed
- **Unified Token Counting**: Migrated all providers (HuggingFace, Chutes, DeepInfra, MiniMax, Mistral, OpenCode) to use the centralized `@microsoft/tiktokenizer` via `TokenCounter` for more accurate token estimation.
- **Improved Token Allocation Logic**: Implemented a smarter token limit calculation for HuggingFace and Chutes providers.
  - Prevents "1 token input" issues by ensuring at least 1,024 tokens are always reserved for input.
  - Automatically caps output tokens at half the context length if the reported limit is suspiciously large.
- **Enhanced Mistral & OpenAI SDK Robustness**:
  - Added automatic `type: "function"` injection for tool calls in `MistralHandler` and `OpenAIHandler`. This fixes crashes (e.g., `missing choices[0].tool_calls[0].type`) when using providers that omit mandatory fields in their streaming responses.
  - Improved `OpenAIHandler` to also check `message.tool_calls` for providers that send final tool calls in a message object instead of a delta.
- Replaced deprecated "managementCommand" entries in contributes.languageModelChatProviders with vendor-specific "configuration" schemas (for example, adding apiKey secret properties). This aligns the extension with the VS Code Language Model API and removes deprecation warnings.
- Removed unsupported "canDelegate" property from chatParticipants (Gemini CLI participant) to resolve package.json schema validation errors.

### Fixed
- **Tool Call ID Consistency**: Fixed a critical issue where tool calling would fail in multi-turn conversations due to ID mismatches.
  - `OpenAIHandler` now captures and preserves the original `tool_call_id` from the provider instead of generating random ones.
  - Fixed missing tool call reporting in **Chutes**, **HuggingFace**, and **DeepInfra** providers.
- **Stream Finalization**: Fixed "missing finish_reason for choice 0" error by automatically injecting a final chunk with `finish_reason: "stop"` if the stream ends prematurely.
- Fixed package.json JSON schema/lint error caused by the deprecated managementCommand usage and the unsupported canDelegate property. Lint was run to validate the change.

### Chore
- Updated package.json and created a commit: "chore: replace deprecated managementCommand with configuration schemas for languageModelChatProviders; remove unsupported canDelegate property".

## [0.1.4] - 2026-01-11

### Added
- **Gemini CLI Chat Participant with ACP Integration**: Added a new chat participant that integrates Gemini CLI using the Agent Communication Protocol (ACP).
  - Uses the official `@agentclientprotocol/sdk` for standardized ACP communication
  - Automatically detects Gemini CLI installation using `which` (Unix) or `where.exe` (Windows)
  - Supports both global installation (`gemini`) and npx execution (`npx @google/gemini-cli`)
  - Creates workspace-specific ACP sessions for proper context handling
  - Streams responses in real-time to the VS Code chat interface
  - Supports delegation to other chat participants (similar to Claude Code)
  - Properly handles workspace directory context for file operations
  - **Native VS Code Chat UI Integration**: Uses VS Code's native chat APIs for thinking and tool calls
    - Uses `ChatResponseStream.thinkingProgress()` for displaying agent reasoning/thinking
    - Uses `ChatToolInvocationPart` for displaying tool calls with proper UI components
    - Matches GitHub Copilot Chat's UI style and behavior exactly
  - **Enhanced Tool Visualization**: Specialized UI mapping for all core Gemini CLI tools:
    - `run_shell_command` (Bash): Shows exact command and streams output in shell-formatted blocks.
    - `read_file`, `write_file`, `replace` (Edit): Clear file-specific status and past-tense messages.
    - `list_directory` (LS), `search_file_content` (Grep): Parameter-aware invocation messages.
    - `google_web_search`, `web_fetch`, `delegate_to_agent`, `save_memory`: Rich tool-specific UI treatments.

### Changed / Improved
- **ACP Client Architecture**: 
  - Migrated from custom ACP implementation to official `@agentclientprotocol/sdk`
  - Improved session management with workspace-aware session creation
  - Better error handling and logging for ACP communication
  - Fixed working directory issue - now uses workspace path instead of extension directory
- **Gemini CLI Detection**: 
  - Enhanced detection logic using system commands (`which`/`where.exe`)
  - Better fallback mechanisms for different installation methods
  - Improved error messages when Gemini CLI is not found
- **UI/UX Improvements**:
  - Removed custom markdown formatting for thinking and tool calls
  - Now uses VS Code's native chat UI components for consistent appearance
  - Thinking/reasoning content is displayed inline using proper `ThinkingDelta` API
  - Tool calls are displayed using `ChatToolInvocationPart` for native UI rendering
  - Proper state management: thinking ends when regular content or tool calls start
  - Debounced thinking updates for better performance

### Fixed
- **Working Directory Context**: Fixed issue where Gemini CLI was operating in the wrong directory. Now correctly uses the workspace root path for all operations.
- **Session Management**: Fixed session creation to use workspace-specific paths, ensuring proper file context for Gemini CLI operations.
- **API Proposal Error**: Removed programmatic property assignments that required `defaultChatParticipant` API proposal.
- **UI Consistency**: Fixed UI formatting to match GitHub Copilot Chat's native style by using proper VS Code Chat APIs instead of custom markdown.

### Removed
- **Complete Removal of Status Bars**: Removed all status bar items, managers, and related UI components from the extension for a cleaner interface.
  - Deleted `src/status` directory and `src/accounts/accountStatusBar.ts`.
  - Removed status bar initialization and disposal from `extension.ts`.
  - Cleaned up status bar update logic from all AI providers and UI components.

### Changed / Improved
- **Code Cleanup & Refactoring**:
  - Removed unused imports, variables, and dead code across the entire project.
  - Replaced `forEach` loops with `for...of` loops in provider activation logic to fix callback return issues.
  - Refactored `while` loops to avoid assignments in expressions for better readability and lint compliance.
- **Type Safety Improvements**:
  - Eliminated `any` usage in `AccountSyncAdapter`, `GeminiCliHandler`, and `DeepInfraProvider` in favor of more specific types like `Record<string, unknown>`.
  - Improved type casting in `extension.ts` for provider registration.
  - Replaced unsafe non-null assertions (`!`) with safe nullish coalescing (`??`) or proper conditional checks.
- **Linting & Formatting**: Fixed hundreds of linting issues identified by Biome to improve code quality and consistency.
- **Project Maintenance**: Updated `package.json` to version `0.1.4`.

### Fixed
- **Fixed Function Call/Response Mismatch Error**: Resolved "Please ensure that the number of function response parts is equal to the number of function call parts of the function call turn" error by adding automatic balancing logic in the OpenAI handler to ensure every tool call has a corresponding tool result message and vice versa.

## [0.1.3] - 2026-01-09

### Added
- **Mistral AI Dedicated SDK**: Implemented a native Mistral AI SDK handler (`MistralHandler`) to replace the generic OpenAI SDK for Mistral models.
  - Native support for Mistral's streaming protocol and tool-calling format.
  - Robust tool call ID mapping between VS Code and Mistral API.
  - Improved stability for `devstral` models.
- **DeepInfra Dynamic Models**: DeepInfra provider now dynamically fetches available models from the API.
  - Filters models to only show those with `max_tokens` and `context_length` in metadata.
  - Automatically detects vision support via tags.
  - All DeepInfra models now support tool calling.
  - Migrated to OpenAI SDK for robust streaming and reasoning content support.

### Changed / Improved
- **OpenAI SDK Robustness**: Added automatic `type: 'function'` injection for tool call deltas in `OpenAIHandler`. This fixes crashes (e.g., `missing choices[0].tool_calls[0].type`) when using providers that omit the mandatory `type` field in their streaming responses.
- **Multi-Account UI**: Added Mistral AI and DeepInfra support to the Account Status Bar and Account Manager.
- Replaced ESLint with Biome for linting and formatting. Added `biome.config.json`, updated `package.json` scripts (`lint`, `lint:fix`, `format`, `format:check`) and removed `eslint.config.mjs`. Updated documentation references in `AGENTS.md`.

### Fixed
- **Fixed Tool Calling Crash**: Resolved `Error: missing choices[0].tool_calls[0].type` which affected several OpenAI-compatible providers.
- Fixed DeepInfra registration in `package.json` to ensure it appears in the Language Models list.
- Fixed Mistral and DeepInfra status bar colors and display names in the account management UI.


### Fixed
- **Fixed Function Call/Response Mismatch Error**: Resolved "Please ensure that the number of function response parts is equal to the number of function call parts of the function call turn" error by adding automatic balancing logic in the OpenAI handler to ensure every tool call has a corresponding tool result message and vice versa.

## [0.1.2] - 2026-01-08

### Changed / Improved
- **Provider streaming architecture**: Migrated Chutes, HuggingFace, and OpenCode providers to use official OpenAI TypeScript SDK for robust streaming:
  - **Chutes**: Refactored to use OpenAI SDK, eliminating premature response stopping issues. Added dynamic model fetching from API with auto-update of config file (`src/providers/chutes/chutesProvider.ts`).
  - **HuggingFace**: Migrated to OpenAI SDK for reliable streaming and proper reasoning content handling (`src/providers/huggingface/provider.ts`).
  - **OpenCode**: Already using OpenAI SDK via GenericModelProvider (no changes needed).
  - All providers now properly handle reasoning/reasoning_content (thinking content) similar to OpenAI handler.
- Authentication and provider reliability:
  - Antigravity: improved OAuth/auth flow and provider handling (`src/providers/antigravity/auth.ts`, `src/providers/antigravity/provider.ts`).
  - Codex: authentication and handler fixes (`src/providers/codex/codexAuth.ts`, `src/providers/codex/codexHandler.ts`).
  - GenericModelProvider: refactor and improved ExtensionContext/token counting support (`src/providers/common/genericModelProvider.ts`).
  - Compatible & MiniMax: reliability and model handling improvements (`src/providers/compatible/compatibleProvider.ts`, `src/providers/minimax/minimaxProvider.ts`).
  - OpenAI: handler and streaming fixes and robustness improvements (`src/providers/openai/openaiHandler.ts`, `src/providers/openai/openaiStreamProcessor.ts`).
  - Qwen Code CLI: always reload CLI OAuth credentials before requests, added rate-limit cooldowns, and integrated with AccountManager for managed accounts and optional load balancing (`src/providers/qwencli/auth.ts`, `src/providers/qwencli/provider.ts`).
  - Gemini CLI: added rate-limit cooldowns, invalidateCredentials support for 401 responses, and integrated with AccountManager for managed accounts and optional load balancing (`src/providers/geminicli/auth.ts`, `src/providers/geminicli/provider.ts`).
- Completion and editor integration:
  - Improved completion behavior and inline completion shim for better suggestions and stability (`src/copilot/completionProvider.ts`, `src/copilot/inlineCompletionShim.ts`).
  - Extension activation and provider registration updates (`src/extension.ts`).
- User interface and status bar:
  - Account UI and status updates, including account manager and status bar improvements (`src/accounts/accountStatusBar.ts`, `src/accounts/accountUI.ts`, `src/ui/accountManager.js`, `src/ui/modelEditor.js`, `src/ui/settingsPage.js`, `src/ui/settingsPage.ts`).
  - Token usage and combined quota popup fixes/enhancements (`src/status/tokenUsageStatusBar.ts`, `src/status/combinedQuotaPopup.ts`, `src/status/antigravityStatusBar.ts`).
- Tools and utilities:
  - Minimax and Zhipu search improvements and registry updates (`src/tools/minimaxSearch.ts`, `src/tools/zhipuSearch.ts`, `src/tools/registry.ts`).
  - Improvements to configuration, logging, and web search utilities (`src/utils/configManager.ts`, `src/utils/logger.ts`, `src/utils/mcpWebSearchClient.ts`).
  - OpenAI stream processing and token counting fixes (`src/utils/openaiStreamProcessor.ts`, `src/utils/tokenCounter.ts`).

### Fixed
- **Fixed premature response stopping**: Chutes and HuggingFace providers now use OpenAI SDK which properly handles stream completion, eliminating premature stopping issues.
- **Fixed reasoning content rendering**: Chutes and HuggingFace now properly render thinking/reasoning content similar to other providers.
- Various bug fixes addressing completion, streaming, authentication, and concurrency issues that improved stability across providers and the extension.

### Miscellaneous
- Minor code style, refactor, and maintenance updates.

## [0.1.1] - 2026-01-07

### Chore
- Release and publishing: Build VS Code extension (.vsix), create GitHub release, and publish the release to Visual Studio Marketplace (OEvortex.better-copilot-chat).

## [0.1.0] - 2026-01-07

### Added
- New provider: **Chutes** (`https://llm.chutes.ai/v1`) with 14 models including Qwen3, GLM-4.7, DeepSeek-R1, and more.
- New provider: **OpenCode** (`https://opencode.ai/zen/v1`) with 26 models including Claude 4.5, Gemini 3, GPT-5, and more.
- New provider: **Qwen Code CLI** (OAuth via CLI) with models like Qwen3 Coder Plus/Flash.
- Added "(Free)" suffix to OpenCode models with zero pricing (MiniMax M2.1, GLM-4.7, Grok Code, Big Pickle).
- Global request limit tracking for Chutes provider (5,000 requests/day).
- Status bar items for Chutes and OpenCode providers.

### Fixed
- Import issue in `TokenCounter.ts` that caused build failures.
- Refactored `GenericModelProvider` to expose `ExtensionContext` for subclasses.
- Fixed Qwen Code CLI authentication issue ("Missing API key") by properly passing OAuth tokens to the OpenAI handler.
- Fixed Gemini CLI provider: align request payload with Google Code Assist API (use model/project/user_prompt_id/request schema), call loadCodeAssist to detect project/tier before streaming, and avoid sending unsupported fields (userAgent/requestId/sessionId) which could return HTTP 500 INTERNAL errors. (PR: geminicli provider initial implementation and bugfix)
- **Updated Gemini CLI OAuth authentication** to match reference implementation:
  - Replaced environment variable OAuth credentials with official Google OAuth client credentials
  - Improved token refresh logic with proper concurrency control using refresh locks
  - Enhanced error handling with proper HTTP status code responses
  - Added `invalidateCredentials()` method for handling 401 authentication errors
  - Added `forceRefresh()` method for manual token refresh
  - Updated `ensureAuthenticated()` to always reload credentials from file for external updates
  - Fixed path construction issue with Windows path separators
  - Added debug logging for credential path resolution
- **Fixed configuration error**: Added missing `antigravityQuotaWatcher.apiKey` configuration to prevent runtime errors.

## [0.0.0] - Previous Version
- Initial release with ZhipuAI, MiniMax, MoonshotAI, DeepSeek, Antigravity, and Codex support.
