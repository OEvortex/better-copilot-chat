# Changelog

All notable changes to this project will be documented in this file.

## [0.2.1] - 2026-02-13

### Removed

- **CLI Participants**: Removed `@gemini` and `@claude` chat participants and the entire CLI spawner infrastructure (`src/cli/`).
  - These CLI-based chat participants were deprecated in favor of direct API providers.
- **Codex Provider**: Removed the entire Codex provider (`src/providers/codex/`) including:
  - `CodexProvider`, `CodexHandler`, `CodexAuth`, and related types
  - Related commands: `chp.codex.login`, `chp.codex.logout`, `chp.codex.selectWorkspace`
  - Related prompts: `codex_default_instructions.txt`, `codex_vscode_tools_instructions.txt`, `gpt_5_codex_instructions.txt`
  - This removes the GPT-5/OpenAI Codex integration

---

### Added

- **Zhipu Dynamic Model Discovery**: Zhipu provider now fetches model lists dynamically from Zhipu API endpoints and updates model metadata accordingly.
- **Zhipu Plan Selection**: Added `chp.zhipu.plan` setting and wizard support to switch between:
    - `coding` → `/api/coding/paas/v4`
    - `normal` → `/api/paas/v4`
- **Zhipu Thinking Controls**: Added configurable thinking controls for Zhipu chat completions:
    - `chp.zhipu.thinking`: `enabled` / `disabled` / `auto`
    - `chp.zhipu.clearThinking`: controls `clear_thinking` behavior for cross-turn reasoning context
- **Hardcoded Zhipu Flash Models**: Added fallback hardcoded models to ensure availability even if omitted by API listing:
    - `glm-4.7-flash` (free)
    - `glm-4.7-flashx` (paid version of flash)

---

### Changed

- **Zhipu SDK Routing**: Switched Zhipu model request handling to OpenAI-compatible mode for chat completion requests.
- **Zhipu Config Refresh Behavior**: Dynamic config synchronization now keeps OpenAI-compatible model definitions and applies thinking-related extra body parameters when appropriate.

---

### Added

- **Improved token counting accuracy for VS Code chat message parts** (`LanguageModelTextPart`, `LanguageModelToolCallPart`, `LanguageModelToolResultPart`, `LanguageModelPromptTsxPart`)
- **Robust fallbacks for tokenizer operations** to prevent undefined/zero token counts
- **Token telemetry recording** for Compatible custom SSE handler to ensure proper usage meter updates
- **Enhanced system message token counting** to support array-based content
- **Safe optional chaining with null coalescing** for tokenizer operations

---

### Fixed

- **Fixed context window meter showing 0% for providers** by implementing proper token counting for structured message parts
- **Resolved token counting issues** in CompatibleProvider custom SSE flow
- **Corrected potential undefined access** in tokenizer operations that could cause zero token counts

---

### Changed

- **Refactored token counting logic** in `src/utils/tokenCounter.ts` to handle VS Code language model parts explicitly
- **Updated `countMessagesTokens`** to properly handle array-based message content
- **Modified CompatibleProvider** to capture and report final usage statistics from stream responses

---

### Security

- **Added proper null-safety checks** in token counting operations

## [0.2.0] - 2026-02-10

### Added
- **New Qwen Code CLI Models**: Added three new Qwen models to the Qwen Code CLI provider:
  - **Qwen Coder (CLI Default)**: General-purpose coding model with 1M input tokens and 65K output tokens
  - **Qwen Vision**: Vision-capable model supporting image input with same token limits
  - **Qwen3 Coder Plus**: Advanced coding model with enhanced capabilities

### Fixed
- **QwenCliProvider Rate Limiting**: Fixed rate limiting issues in QwenCliProvider that caused "Rate limited: please try again in a few seconds" errors.
  - Added QwenRateLimitManager class with exponential backoff (1s, 2s, 4s, 8s, 16s, max 30s)
  - Implemented per-model rate limit state tracking with automatic cooldown expiration
  - Added early cooldown check that prevents immediate retries with meaningful error messages
  - Integrated with account load balancing to try alternative accounts when rate limited
  - Matches the robust pattern used by Antigravity provider for consistency
- **Gemini CLI Tool Schema Validation**: Fixed invalid JSON payload errors when sending tool schemas to Gemini CLI.
  - Normalized composite schemas (anyOf/oneOf/allOf) by collapsing branches into a single schema
  - Normalized nullable/type arrays by selecting the first non-null type or defaulting to "object"
  - Normalized array-style properties into an object map to avoid invalid schema payloads
  - Ensured tool call args are always valid objects by parsing JSON strings and wrapping primitives
  - Aligns with google-gemini/gemini-cli schema expectations for function declarations and parameters

## [0.1.9] - 2026-02-01

### Added
- **Token Telemetry Tracker**: Added a token telemetry tracker to capture token usage events and surface metrics for analytics and debugging (src/utils/tokenTelemetryTracker.ts).

### Improved
- **Gemini CLI**: Improved OAuth/session handling to reduce failures from stale tokens and improve reliability for CLI-driven participants.
- **Handlers (OpenAI/Mistral/Antigravity)**: Increased streaming robustness and improved handler refresh logic so clients update correctly when configuration changes.
- **UI**: Updated Copilot Overview to better reflect provider status and token telemetry indicators.
- **Utilities**: Export improvements in anthopric-related handlers and central utils index for easier reuse.

### Fixed
- Miscellaneous bug fixes and stability improvements across providers and UI.

## [0.1.8] - 2026-01-27

### Fixed
- **Ollama Provider Stream Finalization**: Fixed "missing finish_reason for choice 0" error that occurred when Ollama's stream ended without sending a final chunk with `finish_reason`.
  - Wrapped `stream.finalChatCompletion()` call in try-catch block to gracefully handle streams that complete without the expected final chunk.
  - Added specific error handling for "missing finish_reason" errors with debug logging.
  - Ensures Ollama provider works correctly with local LLM servers that don't send the final `finish_reason` chunk.

## [0.1.7] - 2026-01-23

### Added
- **Lightning AI Provider**: Integrated a dedicated provider for Lightning AI (`https://lightning.ai/api/v1`).
  - **Dynamic Model Fetching**: Automatically retrieves available models from the Lightning AI endpoint with real-time metadata (context length, vision support, etc.).
  - **Configuration Wizard**: Added an interactive setup wizard to guide users through the required API key format (`APIKey/Username/StudioName`).
  - **Robust Tool Calling**: Implemented advanced tool calling support with schema sanitization and parameter-aware conversion, optimized for Lightning AI's model backends.
  - **Enhanced Error Handling**: Added specific handling for `401 Unauthorized` (auth/format issues) and `402 Payment Required` (quota/balance issues) with user-friendly guidance.
  - **Parameter Optimization**: Automatically handles Lightning AI's restriction on specifying both `temperature` and `top_p` in a single request.
- **Ollama Cloud Provider**: Added a dedicated provider with static model definitions from `src/providers/config/ollama.json`.
  - **Proper Tool Calling Support**: Implemented full tool calling with OpenAI SDK streaming, matching HuggingFace pattern exactly.
  - **Handles Thinking Content**: Supports reasoning/thinking content similar to other advanced providers.
  - **Client Caching**: Efficient connection reuse with client caching per base URL.
  - **Default Base URL**: `https://ollama.com/v1` with proxy endpoint override support.
- **Proxy Endpoint Support**: Added universal proxy endpoint configuration (`baseUrl`) for all providers.
  - Users can now override API endpoints for all providers via VS Code's native "Manage Language Models" UI.
  - Fully integrated into package.json languageModelChatProviders configuration.
  - Supports per-model and provider-wide overrides.

### Improved
- **Provider Registration**: Refactored extension activation logic to include Lightning AI and Ollama in parallel registration and UI overview.
- **Account Manager UI**: Restricted custom account manager to only Antigravity and ZhipuAI for focused credential management.
- **Ollama Integration**: Fully linked Ollama provider alongside HuggingFace and LightningAI in all infrastructure (imports, type unions, registration patterns, config loading).
- **Type Safety**: Improved internal type casting for specialized providers during extension startup.
- **CLI Authentication**: Gemini CLI and Qwen CLI now use OAuth-only authentication without requiring manual API key entry in package.json.

### Changed
- **Provider Configuration**: Removed Compatible Provider from activation events (`onLanguageModelProvider:chp.compatible`).
  - Users can still manage compatible providers through the settings UI but activation is no longer automatic.

### Fixed
- **Model Deduplication**: Fixed duplicate model registration issue in chatLanguageModels.json by adding deduplication logic to all providers.
  - Added `dedupeModelInfos()` utility function to remove duplicate models based on model ID and vendor.
  - Applied deduplication in `GenericModelProvider` and all dedicated providers (Chutes, DeepInfra, OpenCode, LightningAI, HuggingFace, Zenmux, Ollama).
  - Deduplication ensures that model lists are cleaned before registration with VS Code's language model API.
- **Custom BaseUrl Support**: Fixed custom baseUrl overrides not being respected in provider implementations.
  - Updated all providers to use the effective (overridden) baseUrl from ConfigManager when instantiating API clients and making HTTP requests.
  - Fixed API endpoint resolution in Chutes, DeepInfra, OpenCode, LightningAI, HuggingFace, and Zenmux providers.
  - Ensured that `_chatEndpoints` and OpenAI client initialization respect custom baseUrl configuration.
- **Handler Refresh on Config Changes**: Added handler refresh logic to ensure SDK handlers are updated when provider configuration changes.
  - `GenericModelProvider` now refreshes handlers when configuration is updated to reflect new baseUrl or other settings.
- **OpenAI Client Cache Clearing**: Fixed issue where OpenAI client caches were not cleared when configuration changed.
  - Added `refreshHandlers()` override in all providers (DeepInfra, Zenmux, OpenCode, Ollama, LightningAI, HuggingFace, Chutes) to clear provider-specific `clientCache` on config updates.
  - Ensures that new clients are created with the updated baseUrl after settings changes.
  - Added null checks for `clientCache` initialization to handle constructor timing issues.
- **Extension Activation**: Fixed formatting/branching in provider registration to avoid malformed control flow.
- **Ollama Tool Calling**: Fixed tool calling in Ollama provider to properly handle `tool_calls.function.arguments.done` events with accurate tool ID tracking.
- **Authentication Flow**: Simplified Gemini CLI and Qwen CLI authentication by removing unnecessary API key requirements in native VS Code settings.

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
