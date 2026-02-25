# Changelog

All notable changes to this project will be documented in this file.

## [0.2.5] - 2026-02-25

### Added

**Simplified Provider Settings:**
- **Unified Provider Catalog**: New streamlined settings panel showing all 22+ providers in one place with search functionality.
- **SDK-Based Categories**: Providers now organized by SDK type for easier navigation:
  - `openai` - Providers using OpenAI SDK (OpenAI, Claude, DeepSeek, etc.)
  - `anthropic` - Providers using Anthropic SDK
  - `oauth` - OAuth-only providers (Gemini CLI, Qwen CLI, etc.)
- **In-Panel Provider Configuration**: Direct editing of API key, Base URL, and endpoint directly in the settings panel without needing to open VS Code settings.

**No-Configuration Providers:**
- **Blackbox AI**: Now works without API key configuration - ready to use out of the box.
- **ChatJimmy**: Free public API provider - no authentication required.

**Universal Wizard Support:**
- **Run Wizard for All Providers**: Fixed the wizard button to work for ALL providers (previously only worked for zhipu, minimax, lightningai).
  - Now uses generic ProviderWizard that adapts to each provider's capabilities.
  - No-config providers (blackbox, chatjimmy) hide the wizard button since they don't need configuration.

**Codex Provider Enhancements:**
- **Dual Authentication Support**: Codex now supports both API key and OAuth authentication methods.
  - Users can configure API key directly in the settings panel.
  - "Run Wizard" button launches the Codex OAuth login flow for token-based authentication.
- **Fixed Base URL**: Codex uses the fixed endpoint `https://chatgpt.com/backend-api/codex` - Base URL configuration is not available.

**Antigravity Provider Enhancements:**
- **OAuth Login Wizard**: Antigravity now has "Run Wizard" button in settings panel that launches the Google Cloud OAuth login flow.
- **OAuth Category**: Antigravity appears in "OAuth Required" section of settings.

**OpenAI/Anthropic Compatible Provider:**
- **Full Configuration Support**: Compatible provider now supports API key, Base URL, and endpoint configuration in settings panel.
- **Endpoint Options**: Added endpoint dropdown with options for OpenAI, Anthropic, or Custom endpoint.
- **Mixed SDK Mode**: Properly marked as "mixed" SDK mode since it supports both OpenAI and Anthropic compatible models.

**Ollama Description Update:**
- Updated description to clarify it uses Ollama's OpenAI compatible API: "Ollama - use Ollama's OpenAI compatible API (v1/chat/completions)"

**Dynamic Default Base URL:**
- All providers now display their default base URL in settings panel when no custom URL is configured.
- Base URLs are automatically loaded from each provider's JSON config file.

### Removed

- **Save Button from OAuth Providers**: Removed the Save button from OAuth-only providers in the settings panel since they don't require API key configuration.
  - Antigravity, Qwen CLI, Gemini CLI - these use OAuth authentication only.

- **Base URL Field from OAuth Providers**: Removed Base URL field from settings for OAuth-only providers:
  - Antigravity, Qwen CLI, Gemini CLI - these use OAuth authentication and don't support custom base URLs.
  - Blackbox, ChatJimmy - these work without any configuration.
  - Codex - uses fixed default URL `https://chatgpt.com/backend-api/codex`.

- **Non-Existent Command Removed**: Removed `chp.showAntigravityQuota` command from package.json since it was never implemented.

- **Account Manager UI Removed**: Removed the standalone Account Manager webview page.
  - All provider configuration is now handled through the Settings page.
  - Removed commands `chp.accounts.openManager` and `chp.accounts.manage`.
  - Account management features (API keys, OAuth, quota tracking) remain functional via Settings.

- **Copilot Overview Page Removed**: Removed the Overview webview page and its command.
  - Removed `chp.copilot.openOverview` command from package.json.
  - Deleted copilotOverview.ts, copilotOverview.js, and copilotOverview.css files.
  - Provider configuration is available in the Settings page.

- **OAuth Login Commands Removed**: Removed OAuth login commands that were not working.
  - Removed `chp.geminicli.login` (Gemini CLI Login)
  - Removed `chp.qwencli.login` (Qwen CLI Login)
  - OAuth authentication is available in the Settings page via the "Run Wizard" button.

- **Refresh Status Commands Removed**: Removed status refresh commands that don't work.
  - Removed `chp.copilot.refreshStatus` (Refresh Copilot ++ Status)
  - Removed `chp.mistral.refreshStatus` (Refresh Mistral AI Status)

### Changed

**New AI Provider Integration & Multi-Account:**
- **Kilo AI Provider**: Added comprehensive support for Kilo AI (`https://api.kilo.ai/api/gateway`).
  - Implemented dynamic model fetching from `/models` endpoint to automatically keep configurations up-to-date.
  - Full integration with OpenAI-compatible streaming and tool calling.
  - Available across all extension interfaces (Account Manager, Model Editor, Quick Switch).

**Universal Multi-Account Support:**
- **Full Provider Coverage**: Expanded the Account Manager to support all 22 integrated providers.
  - Added multi-account support for Lightning AI, Ollama, Zenmux, MiniMax Coding, Kimi, OpenAI, Mistral, Hugging Face, Blackbox, Chutes, OpenCode, and Kilo AI.
- **Enhanced Account Synchronization**: 
  - Automatically syncs Gemini CLI credentials from `~/.gemini/oauth_creds.json` into the Account Manager on startup.
  - Automatically syncs Qwen CLI credentials from `~/.qwen/oauth_creds.json` into the Account Manager on startup.
  - Improved `AccountSyncAdapter` to handle all supported API key providers (Zhipu, DeepSeek, etc.) ensuring backward compatibility with existing API key storage.

### Changed

**Account Management UI/UX:**
- **Modern Account Manager UI**: Complete visual overhaul with a clean "glassmorphism" aesthetic and sidebar navigation.
  - Real-time updates: Additions, deletions, and default account changes are now reflected instantly without restarts.
  - Floating toast notifications for immediate action feedback.
- **Direct Model Configuration**: Added a new "Config Models" button directly within the Account Manager view, allowing seamless transition to the visual model editor for the selected provider.

**Enhanced Model Organization:**
- **Unified Model Families**: Implemented consistent model family identification across all 22 providers.
  - Models are now grouped by their provider name (e.g., "minimax", "deepseek", "kilo") in the VS Code model selector when `editToolMode` is disabled.
  - Dynamic family switching based on `editToolMode` configuration to ensure compatibility with advanced VS Code features like Copilot's "Edit" mode.
- **Universal Provider Menu**: The `Manage API Keys` quick pick menu now displays all built-in providers, allowing you to configure providers (like Kilo or Zenmux) even before adding custom models for them.
- **Improved Account Manager Page**: Updated the WebView interface to include all supported providers in the "Add Account" list.
- **Standardized Display Names**: Consistent and clear provider naming across the `AccountUI` QuickPick menus and the main Account Manager page.
- **Robust Syncing**: `AccountSyncAdapter` now ensures that active accounts in the manager are always mirrored back to the legacy `ApiKeyManager` for seamless transition.
- **Control Hub Updates**: Added missing providers (Kilo, Zenmux, etc.) to the Copilot Usage overview panel to track their token usage effectively.

### Fixed

**Tool Calling & API Reliability:**
- **Ollama Tool Calling Support**: Fixed issue where all Ollama models were reporting tool calling as disabled.
  - Dynamic model fetching now defaults to tool calling enabled for all Ollama models (unless explicitly marked as `no_tool_calling`).
  - Resolves issue where tool calling capability was not being detected from the Ollama API response.

- **Codex Token Limits**: Fixed token limits for all Codex GPT model variants.
  - All Codex GPT models now correctly configured with 400K context window (409,600 tokens) and 64K output (65,536 tokens).
  - Input tokens correctly calculated as 344,064 (409,600 - 65,536) using binary units (1K = 1024).

- **Schema Sanitization**: Resolved critical 400 `INVALID_ARGUMENT` errors in Antigravity and Gemini CLI providers by implementing strict tool schema cleaning.
  - Automatically filters the `required` property array to only include existing fields.
  - Sanitizes property names and tool names to strictly match Gemini's naming requirements (`[a-zA-Z0-9_-]`).
  - Fixed recursion logic error that incorrectly processed property maps as schemas.
- **Improved Tool Call Stability**: Enhanced handling for models with large numbers of tool definitions (60+ tools) to ensure protocol compliance.
- **XML-Style Tool Parsing**: Added support for XML-style `<function_calls>` blocks in the Antigravity stream processor for better compatibility with newer Gemini models.
- **Message Balancing**: Implemented automatic balancing of function calls and responses in message history to prevent "parts mismatch" errors.

## [0.2.4] - 2026-02-24
- **Robust Schema Sanitization**: Resolved critical 400 `INVALID_ARGUMENT` errors in Antigravity and Gemini CLI providers by implementing strict tool schema cleaning.
  - Automatically filters the `required` property array to only include existing fields.
  - Sanitizes property names and tool names to strictly match Gemini's naming requirements (`[a-zA-Z0-9_-]`).
  - Fixed recursion logic error that incorrectly processed property maps as schemas.
- **Improved Tool Call Stability**: Enhanced handling for models with large numbers of tool definitions (60+ tools) to ensure protocol compliance.
- **XML-Style Tool Parsing**: Added support for XML-style `<function_calls>` blocks in the Antigravity stream processor for better compatibility with newer Gemini models.
- **Message Balancing**: Implemented automatic balancing of function calls and responses in message history to prevent "parts mismatch" errors.

## [0.2.4] - 2026-02-24

### Added

**MiniMax Model Support Enhancements:**
- **MiniMax M2.5 & M2.5-highspeed**: Added full support for latest MiniMax models
  - MiniMax-M2.5 with ~60 TPS throughput
  - MiniMax-M2.5-highspeed with ~100 TPS throughput
- **MiniMax Coding Plan Subscriptions**: New Coding Plan models with subscription-based pricing
  - MiniMax-M2.5-Coding-Plan: ¥98/month (100 prompts/5h)
  - MiniMax-M2.1-Coding-Plan: ¥29-¥119/month (40-300 prompts/5h)
  - MiniMax-M2-Coding-Plan: Efficient coding workflows

### Changed

**MiniMax Context Window Correction:**
- **Corrected MiniMax M2 series context length from 256K to 204.8K**
  - All MiniMax models now use: 204,800 total tokens (172,032 input / 32,768 output)
  - Updated `globalContextLengthManager.ts` with new `MINIMAX` constants
  - Separated MiniMax (204.8K) from Kimi K2 series (256K) in token resolution logic
  - All model entries in `minimax.json` updated with correct token limits

### Removed

- **MiniMax-M2.5-highspeed-Coding-Plan**: Removed duplicate highspeed coding plan model
- **MiniMax-M2.1-highspeed-Coding-Plan**: Removed duplicate highspeed coding plan model

## [0.2.3] - 2026-02-24

### Added

**Model Support Expansions:**
- **New Models in `globalContextLengthManager.ts`**:
  - **Gemma 3 Models**: 128K total context (114K input / 16K output)
    - `gemma-3`, `gemma-3-pro`, `gemma-3-flash`, `gemma-3-4b`, etc.
  - **Llama 3.2 Series**: 128K total context (114K input / 16K output)
    - `llama-3-2-1b`, `llama-3-2-3b`, and all Llama 3.2 variants
  - **DeepSeek Models**: 160K total context (147K input / 16K output)
    - `deepseek-r1`, `deepseek-tng`, `deepseek-v3-1`, `deepseek-v3.2`
  - **GLM-4.5 Special Case**: 128K total context with 32K output (98K input)
  - **MiniMax M2.5**: 256K total context (229K input / 32K output)

- **NVIDIA NIM Provider**: New OpenAI SDK-compatible provider
  - Configured at `https://integrate.api.nvidia.com/v1`
  - Rate limit: 40 requests per minute
  - Dynamic model discovery via `/models` endpoint with retry logic

- **Devstral Model Support**: 256K context (224K input / 32K output)

- **ChatJimmy FIM Support**: New provider for Fill-In-the-Middle (FIM) completions
  - Implemented `chatjimmyFimHandler.ts` for FIM requests
  - Public API without authentication

- **Ollama Dynamic Model Fetching**: Fetches available models from `/v1/models` endpoint
  - Automatic capability detection (tool calling, vision) from metadata tags
  - Graceful fallback to static configuration with 10-second timeout

- **Universal Reasoning Content Support**: All OpenAI SDK providers now support `reasoning_content` by default
  - Works out of the box for: OpenAI, OpenCode, Blackbox, Chutes, DeepInfra, HuggingFace, LightningAI, Zenmux, Ollama, Compatible providers
  - Thinking content automatically detected and reported to VS Code

- **Gemini CLI Provider Enhancements**:
  - Added `gemini-3.1-pro-preview` model
  - Now respects global token limits from `globalContextLengthManager.ts`
  - Added `isGemini2Model()` and updated `isGemini3Model()` helper functions

- **Gemini CLI Web Search Tool**: New `google_web_search` tool
  - Uses Google's "web-search" utility model via Gemini CLI OAuth
  - Returns synthesized answers with citations and source URIs
  - Registered as `chp_google_web_search`

**Core Improvements:**
- **Token Count Standardization**: All token calculations now use 1K = 1024 tokens (fixed from 1000)
  - Updated all constants in `globalContextLengthManager.ts` and provider files
  - Fixed `FIXED_128K`, `FIXED_256K`, `FIXED_64K`, and model-specific constants

### Changed

**Model Detection & Configuration:**
- **Refactored Model Detection Functions**:
  - Consolidated `isMinimaxModel()` and `isMinimaxM25Model()` into single function
  - Now matches all MiniMax M2 series: `minimax-m2`, `minimax-m2.1`, `minimax-m2-5`, etc.
  - Updated `isKimiModel()` to match all Kimi K2 series: `kimi-k2`, `kimi-k2.1`, `kimi-k2.5`
  - `isKimiK25Model()` remains separate for vision capability detection
  - All M2/K2 series models use 256K context with 32K output

- **Provider Token Defaults**: All providers now use 1K=1024 token calculations
  - Updated: `blackbox`, `chutes`, `deepinfra`, `huggingface`, `lightningai`, `nvidia`, `ollama`, `opencode`, `zenmux`

- **Chutes Provider**: Refactored to use `resolveGlobalTokenLimits()`
  - Removed local token threshold constants
  - Properly handles GLM-5, GLM-4.6, GLM-4.7 with 256K context

- **Zhipu Provider**: Simplified to use `resolveGlobalTokenLimits()` for all GLM models
  - Removed hardcoded model metadata lookup table
  - GLM-4.5 correctly gets 128K/32K, GLM-4.6/4.7/5 get 256K/32K

- **Gemini Model Token Limits**: Updated all Gemini models
  - Gemini 3 / 3.1 models: 1M total context → 936K input / 64K output
  - Gemini 2.5 models: 1M total context → 968K input / 32K output
  - Gemini 2 models: 1M total context → 968K input / 32K output

- **Blackbox Free Models**: Support for free models without API key
  - Added `supportsApiKey` property to `ProviderConfig` type
  - Free models use default API key ("xxx")
  - All model names updated with "(free)" suffix

### Fixed

- **ChatJimmy Response Parsing**: Fixed JSON stream parsing errors by converting ChatJimmy plain-text responses into OpenAI-compatible SSE format
  - Added `stripChatJimmyStats()` to remove `<|stats|>...</|stats|>` metadata blocks
  - Added `buildChatJimmyCompletionSse()` to wrap response text in proper JSON SSE format
  - Updated `getBody()` to handle ChatJimmy FIM responses for chat-lib compatibility

- **ChatJimmy API Key Check**: Fixed API key validation to skip authentication for public API

- **ChatJimmy Cancellation Token**: Fixed AbortSignal usage in ChatJimmy FIM handler for proper request cancellation

- **Gemini Web Search Tool**: Improved response parsing to handle wrapped Gemini API response payloads
  - Added shared parsing helpers in handler.ts for reuse across Gemini CLI provider and search tool
  - Removed deprecated web-search model alias fallback chain
  - Simplified to return raw content without source formatting

- **Blackbox Duplicate Tool Calls**: Fixed issue where each tool was being called twice in Blackbox provider
  - Added deduplication logic using event key tracking (`tool_call_{name}_{index}_{argsLength}`)
  - Events Set cleared at start of each request

### Removed

- **Delegate to Agent Tool**: Removed the `delegateToAgent` tool as it was never fully functional and had issues with VS Code command execution

## [0.2.2] - 2026-02-15

### Added
- **Global capability normalization**: Added centralized `resolveGlobalCapabilities()` and `isVisionGptModel()` functions in `globalContextLengthManager.ts` to enforce consistent capability flags across all providers.
  - All models now have `toolCalling: true` by default
  - All GPT models (except gpt-oss) and Kimi-2.5 models have `imageInput: true` by default
- **Blackbox provider**: New OpenAI-compatible Blackbox provider and model list (src/providers/blackbox). Includes streaming support, model registration, and config integration.
- **Chutes API-driven token limits**: Chutes provider now uses the API's `context_length` field to determine token limits dynamically, instead of using global defaults. Output tokens are calculated as: >= 200K context → 32K output, >= 128K → 16K output, < 128K → 8K output. Input tokens = context_length - output_tokens.
- **Config maintenance scripts**: Added scripts to enforce/verify model token limits across provider configs:
  - `scripts/set-kimi-minimax-context.js` — set MiniMax/Kimi entries to 256K and correct image-capabilities
  - `scripts/verify-kimi-minimax-context.js` — sanity-checks for MiniMax/Kimi token/capability settings

### Changed
- **Standardised large-context models**: All MiniMax and Kimi models updated to 256K total context (maxInputTokens = 224000, maxOutputTokens = 32000). Only `kimi-k2.5` exposes vision input.
- **Global output-size rule**: Models with reported context >= 200K now default to maxOutputTokens = 32K; otherwise maxOutputTokens = 16K. Applied consistently across static configs and dynamic model loaders.
- **Runtime normalization**: Dynamic model fetchers (Chutes, DeepInfra, HuggingFace, LightningAI, Zenmux, OpenCode, Antigravity, Zhipu, etc.) now normalize token limits and capabilities at runtime to match static config rules.
- **GPT‑5 family token limits**: GPT‑5 class models updated to a 400K total context budget — maxOutputTokens = 64K and maxInputTokens = 336K. This was applied across static configs (opencode, codex, zenmux, lightningai, etc.) and the runtime normalization (resolveTokenLimits) so GPT‑5 metadata is preserved during model discovery; UI/tooltips updated to reflect "400K context / 64K output".

### Fixed
- **Ollama fixed**: Updated the Ollama provider's model definitions to reflect the correct context length (see `src/providers/config/ollama.json`). This resolves token-counting and stream-finalization issues.
- **Mistral config corrected**: Mistral models' token limits updated so 256K-context models use maxInputTokens = 224000 and maxOutputTokens = 32000 (`src/providers/config/mistral.json`).
- **Tooltips & UI text**: Corrected tooltips that incorrectly referenced “200K” to say “256K” where applicable.
- **Config drift fixes**: Fixed multiple providers where dynamic model metadata could drift from project-wide token/capability rules; now enforced both in config files and at runtime.
## [0.2.1] - 2026-02-13

### Removed

- **CLI Participants**: Removed `@gemini` and `@claude` chat participants and the entire CLI spawner infrastructure (`src/cli/`).
  - These CLI-based chat participants were deprecated in favor of direct API providers.
  
- **Codex Provider**: Removed the entire Codex provider (`src/providers/codex/`) including:
  - `CodexProvider`, `CodexHandler`, `CodexAuth`, and related types
  - Related commands: `chp.codex.login`, `chp.codex.logout`, `chp.codex.selectWorkspace`
  - Related prompts: `codex_default_instructions.txt`, `codex_vscode_tools_instructions.txt`, `gpt_5_codex_instructions.txt`
  - This removes the GPT-5/OpenAI Codex integration

### Added

- **Zhipu Dynamic Model Discovery**: Zhipu provider now fetches model lists dynamically from Zhipu API endpoints and updates model metadata accordingly.

- **Zhipu Plan Selection**: Added `chp.zhipu.plan` setting and wizard support:
  - `coding` → `/api/coding/paas/v4`
  - `normal` → `/api/paas/v4`

- **Zhipu Thinking Controls**: Added configurable thinking controls for Zhipu chat completions:
  - `chp.zhipu.thinking`: `enabled` / `disabled` / `auto`
  - `chp.zhipu.clearThinking`: controls `clear_thinking` behavior for cross-turn reasoning context

- **Hardcoded Zhipu Flash Models**: Added fallback hardcoded models for continuous availability:
  - `glm-4.7-flash` (free)
  - `glm-4.7-flashx` (paid version of flash)

- **Improved Token Counting Accuracy**: Enhanced token counting for VS Code chat message parts (`LanguageModelTextPart`, `LanguageModelToolCallPart`, `LanguageModelToolResultPart`, `LanguageModelPromptTsxPart`)
  - Robust fallbacks for tokenizer operations to prevent undefined/zero token counts
  - Token telemetry recording for Compatible custom SSE handler
  - Enhanced system message token counting with array-based content support
  - Safe optional chaining with null coalescing

### Changed

- **Zhipu SDK Routing**: Switched Zhipu model request handling to OpenAI-compatible mode for chat completion requests.

- **Zhipu Config Refresh Behavior**: Dynamic config synchronization now keeps OpenAI-compatible model definitions and applies thinking-related extra body parameters when appropriate.

### Fixed

- **Context Window Meter**: Fixed showing 0% for providers by implementing proper token counting for structured message parts
- **Token Counting Issues**: Resolved token counting issues in CompatibleProvider custom SSE flow
- **Tokenizer Operations**: Corrected potential undefined access in tokenizer operations that could cause zero token counts
- **Refactored token counting logic** in `src/utils/tokenCounter.ts` to handle VS Code language model parts explicitly
- **Updated `countMessagesTokens`** to properly handle array-based message content
- **Modified CompatibleProvider** to capture and report final usage statistics from stream responses
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
