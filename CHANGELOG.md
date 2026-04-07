# Changelog

All notable changes to this project will be documented in this file.

## [0.3.9] - Unreleased

### Fixed

- **OpenAI Responses API (`oai-response` mode) — System Messages**: System-role messages are now correctly sent via the `instructions` parameter of the Responses API instead of being embedded as `role: "system"` items inside the `input` array. This matches the Responses API spec and improves compatibility with providers that implement it.

- **OpenAI Responses API — `store: false`**: Requests through the Responses API now explicitly set `store: false` so that conversations are not stored server-side without user consent.

- **OpenAI Responses API — Richer error messages**: `response.failed` and `response.incomplete` stream events now include the server's error message/reason in the thrown error, making failures easier to diagnose.

- **OpenAI Responses API — SDK-level error extraction**: When the OpenAI SDK raises an `APIError` (e.g. 4xx / 5xx from the provider), the human-readable `error.message` field is now extracted and surfaced to the user instead of the raw SDK error wrapper.

- **Settings page config namespace**: Fixed four calls to `vscode.workspace.getConfiguration('chp')` in `settingsPage.ts` that were reading/writing the old `chp.*` namespace instead of the migrated `aether.*` namespace. This caused settings like `sdkMode`, `hideThinkingInUI`, and API keys to be read from the wrong location on fresh installs.

- **Provider error messages**: When a provider returns HTTP 200 with a JSON error body (e.g. `{"error":{"message":"upstream service error…"}}`), the readable `error.message` field is now extracted and shown to the user instead of the raw JSON string that was previously thrown by `preprocessSSEResponse`.

## [0.3.8] - Unreleased

### Added

- **Interactive Provider Picker for Aether CLI**: `/provider` now opens an interactive TUI picker (matching `/model` behavior) instead of showing static status text.
    - Type to fuzzy-search providers by display name or ID.
    - Arrow keys to navigate, Enter to select, Esc to cancel.
    - Shows model count or "dynamic model fetching" indicator per provider.
    - Current provider marked with "(current)".
    - Footer shows exit hint with Ctrl+C key binding.

- **`/provider set` Dual Mode**: `/provider set` now supports two interaction patterns.
    - **Interactive picker** (no args): Same TUI as `/provider` for fuzzy provider selection.
    - **Direct fuzzy matching** (with args): `/provider set Apertis AI` directly selects the provider by fuzzy-matching display name.

- **New `/provider status` and `/provider list` Subcommands**: Static status view moved to `/provider status`, provider listing available via `/provider list`.

- **Provider-Model Persistence**: Selecting a provider in Aether CLI now persists both provider ID and model together, enabling proper `provider::model` format tracking.

- **Default Config Directory Changed to ~/.aether**: Changed default config directory from `~/.openclaude` to `~/.aether`.
    - Added migration compatibility to fall back to `~/.openclaude` or `~/.claude` if they exist but `~/.aether` doesn't.
    - Existing users will continue using their existing config directory.

- **OpenAI-to-Anthropic Adapter Message Coalescing**: Added message coalescing pass to `src/aether/src/services/api/openaiClientAdapter.ts` to match openclaude behavior.
    - Merges consecutive messages of the same role (except `tool` and `system`).
    - Required for compatibility with Ollama/vLLM/Mistral models that enforce strict user↔assistant message alternation.
    - Prevents Jinja template errors like "roles must alternate" (Devstral, Mistral models).

### Fixed

- **Aether CLI Model Filtering for Providers Without Config Files**: Fixed `/model` showing ALL models from ALL providers when a provider without a config JSON file is active (e.g., Cline with `fetchModels:true`). Now correctly shows only the current model and dynamically fetched models for the active provider.

- **Aether CLI KnownProviders Import Path**: Fixed `knownProvidersData` import in Aether CLI provider picker that resolved to a stub module, causing an empty provider list. Import path corrected to include `src/` prefix.

- **Aether CLI Provider Picker Rendering**: Fixed terminal rendering errors caused by incorrect component usage (`Byline` with string children replaced with `Text dimColor`, added `Pane color="permission"` for proper TUI styling).

- **Provider Snapshot Loading**: Removed automatic fallback loading of default provider snapshot file (`~/.copilot-helper/aether-provider-snapshot.json`). Provider configuration now loads only from explicit environment variables (`AETHER_PROVIDER_SNAPSHOT_JSON` or `AETHER_PROVIDER_SNAPSHOT_FILE`), with fallback to built-in `KnownProviders` from `knownProvidersData.ts`.

- **Aether Command Prefix Migration**: Fixed missing provider command registration by updating runtime and generated command IDs to `aether.*` consistently.
    - Resolved missing commands such as `aether.kilo.setApiKey`.
    - Updated provider vendor IDs, activation events, and schema URI wiring to match the new prefix.

- **OpenAI Responses Stream Compatibility**: Fixed crashes in the Responses handler caused by treating the SDK stream like a Node event emitter.
    - Switched to async iteration over the Responses stream events.
    - Uses the `response.completed` event for the final payload instead of unsupported `.done()` / `.finalResponse()` calls.

## [0.3.7] - 2026-04-06

### Fixed

- **Aether CLI Dynamic Model Configuration**: Fixed broken dynamic model loading in the Aether CLI.
    - Corrected `configProviders` import paths in 3 source files from `../../../providers/config/index.js` to `../../../../providers/config/index.js`.
    - Files fixed: `src/aether/src/commands/model/model.tsx`, `src/aether/src/utils/model/knownProviders.ts`, `src/aether/src/utils/model/modelOptions.ts`.
    - Fixed runtime path resolver in `src/aether/src/utils/model/providerConfigModels.ts` to correctly resolve to `src/providers/config` from the bundle location.
    - Model picker now includes all models from all configured providers.

- **Provider-Filtered Model Picker**: `/model` now shows only models for the currently active provider instead of all providers.
    - Added `activeProvider` field to AppState for tracking the selected provider.
    - `getModelOptions()` accepts an optional `activeProvider` parameter to filter models by provider.
    - When `activeProvider` is set, only that provider's models from `configProviders` JSON config are shown.
    - When `activeProvider` is null, all provider models are shown (previous behavior).

- **Fuzzy Search in Model Picker**: Added real-time fuzzy search filtering to the `/model` picker.
    - Type any characters to filter models by name, label, description, or model ID.
    - Backspace removes the last search character.
    - Escape clears the search filter.
    - Search hint shows current filter and active provider in the header.
    - Uses simple subsequence matching for fast, intuitive model discovery across large model lists.

### Added

- **Aether CLI Rebranded**: Updated the integrated Aether CLI branding to use consistent naming.
    - Startup screen now displays the Aether ASCII logo with sunset gradient.
    - Build output shows "Built Aether CLI" instead of "Built openclaude".
    - All previous references to chpcli in the CLI have been updated to Aether CLI.
    - Command renamed: `aether.cli.start` (was `aether.aether-cli.launch`).
    - NPM scripts: `aether:build`, `aether:start`, `aether:dev` (was `aether-cli:*`).

- **Provider Registry Split**: Split `knownProviders.ts` into two files for clean separation of concerns.
    - **`src/utils/knownProvidersData.ts`** — pure provider data only (no `vscode`, `AccountManager`, or `configProviders` imports). Safe for CLI bundling.
    - **`src/utils/knownProviders.ts`** — extension-only logic. Imports from `knownProvidersData.ts`. Contains provider registration, rate limiting, SDK adaptation.
    - **Aether CLI** now imports from `knownProvidersData.ts` to avoid `vscode` resolution errors during Bun bundling.
    - **Extension** continues using `configProviders` from JSON config files (old method preserved).
    - `sync-providers.js` updated to parse `knownProvidersData.ts` instead of `knownProviders.ts`.
    - `vscode` stub added to Aether build script for any remaining extension imports.

- **OpenCode Zen Go New Models**: Added MiMo V2 Pro and MiMo V2 Omni models to the OpenCode Zen Go provider.

- **Automatic Rate Limit Retry**: Enhanced rate limiter to automatically retry requests on 429 errors instead of raising errors to the user.
    - All provider handlers (OpenAI, Anthropic, Responses, Codex, Zhipu, Seraphyn) now use `executeWithRetry()` for transparent retries.
    - Configurable retry settings: 5 max attempts, 2s initial delay, 60s max delay, 2.5x exponential backoff with jitter.
    - Rate limit errors are now handled internally - users see no error, requests just take longer while retries happen transparently.
    - Improved `RetryManager` with specialized `RATE_LIMIT_RETRY_CONFIG` for better 429 handling.
    - Enhanced `genericModelProvider` to detect rate limit errors and continue/retry automatically with account switching.

- **MoonshotAI Coding/Normal Plan Support**: Moonshot provider now mirrors Zhipu's dual-plan architecture with dedicated provider class.
    - **Normal Plan**: `https://api.moonshot.ai/v1` — standard Moonshot AI Open Platform access.
    - **Coding Plan**: `https://api.kimi.com/coding/v1` — Kimi coding-plan endpoint for professional programming scenarios.
    - New `chp.moonshot.plan` setting with `coding` and `normal` options.
    - Dedicated `MoonshotProvider` class with dynamic model fetching from `/models` endpoint.
    - Simplified configuration wizard — single API key with plan selection, removed separate Kimi dedicated key flow.
    - Automatic model discovery and config file updates.

- **LLMGateway Provider**: Added new LLMGateway provider integration with unified access to multiple AI models.
    - OpenAI SDK compatibility via `https://api.llmgateway.io/v1` (Chat Completions).
    - Anthropic SDK compatibility via `https://api.llmgateway.io` (Messages API).
    - Dynamic model discovery via `/models` endpoint with 10-minute cooldown.
    - **Free Models Mode**: Dedicated `free` model that routes to available free models. Sends `"model": "auto"` + `free_models_only: true` in the API request body.
    - Dedicated `LLGGatewayProvider` class mirroring Zhipu's architecture with `LLMGatewayWizard` for configuration.
    - Model capabilities (tool calling, vision) inferred from provider metadata.
    - Full integration with account management, settings UI, and provider configuration.
    - Automatic model list fetching and config file updates.

- **Puter AI Provider**: Added new Puter AI provider - free API access to 500+ models including GPT, Claude, Gemini, Grok, DeepSeek, Llama, and Qwen.
    - OpenAI SDK compatible endpoint: `https://api.puter.com/puterai/openai/v1`.
    - Authentication via Puter auth token (from puter.com/dashboard).
    - Uses generic provider architecture for clean integration.
    - 10 pre-configured models: GPT-5 Nano, GPT-5.2 Chat, Claude Sonnet 4.5, Claude Opus 4.5, Gemini 2.5 Flash Lite, Gemini 2.5 Flash, Grok 4.1 Fast, DeepSeek Chat, Llama 3.1 70B, Qwen3 32B.
    - All models include `extraBody: { "temperature": 1 }` to fix Puter API restriction on non-default temperature values.
    - Registered command: `chp.puter.setApiKey` for API key configuration.

- **HicapAI Provider**: Added new HicapAI provider integration with OpenAI SDK compatibility.
    - OpenAI SDK compatibility via `https://api.hicap.ai/v1`.
    - Dynamic model discovery via `/models` endpoint with 10-minute cooldown.
    - Full integration with account management, settings UI, and provider configuration.
    - Automatic model list fetching and config file updates.

### Changed

- **Project Renamed to Aether**: The extension has been renamed from "better-copilot-chat" / "Copilot ++" to "Aether".
    - Extension name changed from `better-copilot-chat` to `aether`.
    - Display name changed from "Copilot ++" to "Aether".
    - All command categories updated from "Copilot ++" to "Aether".
    - Configuration title changed to "Aether - AI Chat Models".
    - Extension ID changed from `OEvortex.better-copilot-chat` to `OEvortex.aether`.
    - All documentation, comments, and user-facing messages updated.
    - Repository URLs updated to point to the new `OEvortex/aether` repository.

- **Settings Prefix Migration**: Configuration settings have migrated from `chp.*` to `aether.*` prefix.
    - VS Code settings like `chp.temperature` are now `aether.temperature`
    - Provider settings like `chp.zhipu.plan` are now `aether.zhipu.plan`
    - Activation events changed from `onLanguageModelProvider:chp.*` to `onLanguageModelProvider:aether.*`
    - **Automatic migration**: On first launch, the extension automatically migrates all existing settings, API keys, and global state from `chp.*` to `aether.*`
    - Users will see a notification confirming migration completed successfully
    - Command IDs remain unchanged (e.g., `chp.zhipu.setApiKey`) for backward compatibility

- **Provider registry cleanup**: Removed `description` field from all provider entries in `knownProviderOverrides`. Descriptions are redundant with `displayName` and not consumed by any runtime path.

- **Moonshot provider architecture**: Converted from generic provider to dedicated provider class, matching Zhipu's pattern.
    - Removed duplicate Kimi-specific endpoint logic from model config files.
    - All Moonshot models now use OpenAI-compatible SDK mode with plan-aware base URLs.
    - Removed `chp.moonshot.sdkMode` setting in favor of `chp.moonshot.plan`.

- **Temperature parameter handling**: Enhanced `extraBody` parameter merging to allow providers to override temperature/top_p settings.
    - Added support for provider-specific `extraBody` configuration in model configs.
    - Puter AI provider uses this to force `temperature: 1` for all models (required by Puter API).

- **Aether CLI OpenAI SDK Migration**: Replaced `openaiShim.ts` (raw `fetch` + manual SSE parsing) with native `openai` SDK usage in `aether`.
    - OpenAI-compatible providers (OpenAI, GitHub Models, Gemini, Ollama, OpenRouter, Groq, DeepSeek, Mistral, Azure, Codex) now use the official `openai` npm package natively.
    - Eliminates 1,244 lines of hand-rolled HTTP/SSE shim code.
    - Both Anthropic and OpenAI SDKs are now used natively — no format conversion at the transport layer.
    - OpenAI streaming chunks are translated to Anthropic-compatible events at the adapter boundary, preserving full compatibility with the existing request pipeline.
    - Added `openai` as a runtime dependency.

- **Command Prefix Migration**: All registered commands migrated from `chp.*` to `aether.*` prefix to match new extension name.
    - `chp.openSettings` → `aether.openSettings`
    - `chp.accounts.*` → `aether.accounts.*`
    - `chp.codex.*` → `aether.codex.*`
    - `chp.copilot.*` → `aether.copilot.*`
    - `chp.showAllApiKeys` → `aether.showAllApiKeys`
    - Tool names: `chp_zhipuWebSearch` → `aether_zhipuWebSearch`, `chp_minimaxWebSearch` → `aether_minimaxWebSearch`

- **Configuration Schema Update**: Updated package.json configuration schema from `chp.*` to `aether.*` prefix.
    - All settings properties now use `aether.` prefix (e.g., `aether.temperature`, `aether.zhipu.plan`)
    - Migration now successfully writes to registered configurations

### Removed

- **`chp.editToolMode` setting removed**: The editing tool mode configuration (`claude`, `gpt-5`, `none`) has been removed. The extension now handles editing operations internally without requiring a user-facing tool mode selection.

- **Aether CLI Integration**: Introduced `aether` — a modified fork of OpenClaude, integrated into the extension as `src/aether`.
    - Provides standalone CLI access to 200+ models including OpenAI, Gemini, DeepSeek, Ollama, and more.
    - Cleaned up standalone-package artifacts (Python scripts, Python tests, nested `.git`, `.github`, docs) for bundled usage.

### Fixed

- **`.withResponse()` Error on Non-Anthropic Providers**: Fixed `withResponse is not a function` crash when using OpenAI-compatible providers (e.g. OpenCode Zen Go) that don't expose the Anthropic SDK's `APIPromise.withResponse()` method.
    - The streaming code now checks for `.withResponse()` availability and falls back to awaiting the promise directly when absent.

- **Command Registration Conflicts**: Fixed "command already exists" errors when registering commands that were already registered by a previous extension instance.
    - All command registrations now use `aether.*` prefix instead of `chp.*`
    - Provider vendor strings updated from `chp.codex` to `aether.codex`

- **Configuration Not Registered Errors**: Fixed "aether.X is not a registered configuration" errors during settings migration.
    - Added all `aether.*` configuration entries to package.json
    - Settings migration now successfully writes to registered configurations

- **Tool Registration Conflicts**: Fixed "Tool already registered" errors for MCP web search tools.
    - Tool names changed from `chp_zhipuWebSearch` to `aether_zhipuWebSearch`
    - Tool names changed from `chp_minimaxWebSearch` to `aether_minimaxWebSearch`

- **OpenAI Provider withResponse() API**: Fixed `anthropic.beta.messages.create(...).withResponse is not a function` error when using non-Anthropic providers.
    - Added `withResponse()` method to `OpenAIStream` class
    - Added `withResponse()` to non-streaming response objects
    - Now matches Anthropic SDK API for all provider types

## [0.3.6] - 2026-04-03

### Added

- **Qwen3.6 1M Context Support**: Added context window and capability configuration for Qwen3.6 models.
    - 1M total context window (≈1,017K input / 32K output), matching the Gemini 1M family.
    - New detector function `isQwen36OneMillionContextModel` matches `qwen3.6`, `qwen-3.6`, `qwen3.6:397b`, and provider-prefixed variants.
    - Vision (image input) support enabled for all Qwen3.6 models, consistent with the Qwen3.5 family.

- **Qwen3.5 1M Vision Support**: Added `isQwen35OneMillionContextModel` to the vision-capable models list.
    - Qwen3.5 Flash/Plus models (1M context) now correctly advertise image input capability alongside the standard Qwen3.5 series.

## [0.3.5] - 2026-03-28

### Added

- **Apertis AI Provider**: Added new Apertis AI provider integration with full multi-SDK support.
    - OpenAI SDK compatibility via `https://api.apertis.ai/v1` (Chat Completions).
    - Anthropic SDK compatibility via `https://api.apertis.ai` (Messages API).
    - OpenAI Responses SDK compatibility via `https://api.apertis.ai/v1` (Responses API).
    - API key authentication required (`sk-xxxxxxxx` format).
    - Dynamic model discovery via `/models` endpoint with 10-minute cooldown.
    - Auto-fetches model list when API key is configured.
    - Full integration with account management, settings UI, and provider configuration.
    - Multi-account support with load balancing.

- **Nemotron-3 Model Support**: Added context window configuration for NVIDIA Nemotron-3 models.
    - 256K total context (224K input / 32K output).
    - Matches pattern: `nemotron-3`, `nemotron3`, `nemotron-3-8b`, etc.

- **Nova-2 Model Support**: Added context window configuration for Nova-2 models.
    - 1M total context (960K input / 64K output).
    - Matches pattern: `nova-2`, `nova2`, `nova-2-pro`, `nova-2-lite`, etc.

## [0.3.4] - 2026-03-23

### Added

- **MiniMax M2.7 Model**: Added MiniMax M2.7 model to OpenCode Zen Go provider configuration with Anthropic SDK mode support.

- **Seraphyn Provider**: Added new standalone AI provider integration for Seraphyn AI.
    - Custom fetch-based implementation with dedicated SSE parser.
    - OpenAI-compatible endpoint at `https://seraphyn.ai/api/v1`.
    - API key authentication support (`sk-xxxxxxxx` format).
    - Dynamic model discovery via `/models` endpoint with 10-minute cooldown.
    - Robust JSON recovery for malformed tool-call arguments (bare keys, invalid backslashes, code fences).
    - Full integration with account management, settings UI, and provider configuration.
    - Multi-account support with load balancing.

### Changed

- **Code Formatting**: Standardized code formatting across multiple files.
    - Converted tabs to spaces for consistent indentation.
    - Standardized string quotes from single quotes to double quotes.
    - Improved code readability and maintainability in account management and provider configuration files.

- **Default SDK Mode**: Changed default SDK compatibility mode for OpenCode and OpenCode Zen Go from `anthropic` to `openai`.

### Fixed

- **SSE Stream Parsing Robustness**: Fixed `Unexpected end of JSON input` error when providers (e.g., Seraphyn) send non-standard SSE data.
    - Skip empty `data:` lines before JSON parsing.
    - Skip SSE comment lines (e.g., `:cost:0.00084:7`) that some providers send as metadata.
    - Skip truncated/incomplete JSON objects that occur when TCP chunking splits SSE events across reads.
    - Buffer partial SSE lines across TCP chunks to prevent premature JSON parsing.

- **Tool-Call Argument Recovery**: Fixed tool calls failing when providers emit malformed JSON arguments.
    - Added aggressive JSON normalization: quote bare keys, quote bare string values, escape invalid backslashes, strip code fences.
    - Falls back to `{ raw: "<original>" }` when recovery fails instead of dropping the tool call entirely.
    - Fixed TypeScript type errors in the Seraphyn handler module.

## [0.3.3] - 2026-03-20

### Added

- **MiMo v2 Model Support**: Added context window and capability configuration for Xiaomi MiMo v2 models.
    - **MiMo v2 Pro**: 1M total context (960K input / 64K output).
    - **MiMo v2 Omni**: 256K total context (224K input / 32K output) with image input (vision) support.

- **Custom Model Management Panel**: Added a new featured panel in the Settings page for managing OpenAI/Anthropic Compatible custom models.
    - Direct "Add custom model" action from the provider card.
    - "Manage models" button to view and edit existing custom models.
    - Surfaced custom model count in the provider card.

- **Enhanced Load Balancing Toggle**: Improved load balancing toggle to update only affected provider cards and header stats instead of full-page rerenders.

### Changed

- **Settings Page UX Refinement**: Made the unified Settings page more streamlined for provider management.
    - Removed deprecated load balance settings and strategies from state management.
    - Unified provider management section for configuring provider settings and load balancing.
    - Streamlined rendering for provider configurations and load balancing options.
    - Enhanced toggle functionality with in-place card updates.

### Fixed

- **Add Custom Models UI Not Showing**: Fixed the Model Editor form failing to render and the compatible provider card potentially not appearing in the Settings page.
    - The Model Editor webview used `document.addEventListener('DOMContentLoaded', ...)` which could fail to fire in VS Code webview contexts, leaving the form blank. Replaced with a `document.readyState` check that initializes immediately if the DOM is already loaded.
    - The `compatible` provider fallback in `getAllProviders()` was missing the `icon` field and had no defensive `description` fallback, which could cause rendering issues in the settings page UI.
    - The `getProvidersInfo` method used `Promise.all` where a single provider's error would cause ALL providers to fail silently. Added per-provider `try-catch` blocks with fallback entries so one failing provider no longer prevents others (including the custom models provider) from appearing.

- **Settings Page Blink / Flicker**: Reduced visible blinking in the unified Settings page by replacing full-page rerenders with in-place card/header updates for provider load-balance changes.

- **Thinking/Reasoning UI Split on OpenAI Providers**: Fixed thinking blocks being prematurely ended and reopened during streaming on OpenAI-compatible providers (including custom models).
    - Root cause: OpenAI Chat Completions streams do not provide explicit thinking-block boundaries like Anthropic does, so the handler was inferring them incorrectly.
    - Previous behavior: visible content was interleaved with late reasoning deltas, causing thinking to show as multiple ugly blocks in the UI.
    - New behavior: visible content is buffered until the reasoning block is fully finalized, then emitted as one clean output — matching how Anthropic providers already work.
    - Affected path: `src/providers/openai/openaiHandler.ts` stream loop.

### Code Quality

- **Biome Linting**: Updated codebase to pass Biome linter checks with improved code style consistency.

## [0.3.2] - 2026-03-16

### Fixed

- **OpenCode Zen Go Provider Registration**: Fixed provider not being registered properly in VS Code.
    - Added `fetchModels` property to `ProviderConfig` interface.
    - Added merge logic for `fetchModels` in `buildConfigProvider` function.
    - Disabled dynamic model fetching for `opencodego` to use static models from JSON config instead.
- **Hide thinking/reasoning UI setting**: Prevented failures when `chp.hideThinkingInUI` isn't registered in the active VS Code configuration schema by falling back to storing the preference in extension global state.

- Fixed reasoning content appearing interspersed with regular content in the UI by adding direct processing of delta.content in the SSE handler for normalized Python-style completion chunks.

- **Token Counter Initialization**: Fixed `Failed to load from BPE encoder file stream: ENOENT` error by updating the token counter to use `createByEncoderName()` from `@microsoft/tiktokenizer`, which automatically downloads and caches the required BPE encoder file instead of requiring it to be bundled.
    - Removed dependency on external `.tiktoken` files in the `dist` folder.
    - Tokenizer now downloads `o200k_base.tiktoken` on first use and caches it in `node_modules/@microsoft/tiktokenizer/model/`.
    - Removed `TokenCounter.setExtensionPath()` method (no longer needed).
    - Updated all token counting methods to properly handle async tokenizer initialization.

- **OpenAI SDK Version Conflict**: Fixed `client.chat.completions.stream is not a function` error by updating the OpenAI SDK dependency from v4.52.7 to v6.7.0.
    - The `.stream()` method is only available in OpenAI SDK v5+.
    - Updated dependency to match the version required by `@vscode/chat-lib`.

- **OpenAI Handler Streaming Logic**: Replaced broken event-based streaming with reliable `for await...of` loop approach.
    - Changed from `client.chat.completions.stream()` with `.on()` events to `client.chat.completions.create()` with direct chunk iteration.
    - Improved compatibility with OpenAI-compatible providers that don't fully support the event-based API.
    - Manual tool call argument accumulation instead of relying on SDK auto-accumulation.
    - Tool call completion detected via `choice.finish_reason` instead of events.
    - Preserved all existing features: thinking/reasoning content, tool calls, cancellation, activity reporting, usage stats, error handling.
    - More consistent with Anthropic handler implementation.

- **Empty Response Fallback**: Added fallback mechanism to handle cases where no content is received during streaming.
    - Tracks last complete message from API chunks for fallback usage.
    - Reports complete message if streaming fails to produce incremental content.
    - Handles providers that return single complete response instead of streaming chunks.
    - Logs warning when no response content is received at all.

- **Tool Calling Fix**: Fixed tool name capture in streaming handler.
    - Added `toolCallNames` map to track tool names from delta chunks.
    - Tool names are now captured from the first delta that contains `function.name`.
    - Fixed issue where tools were reported as "unknown_tool" instead of actual names like "read_file".
    - Tool name capture happens before argument accumulation to ensure correct ordering.

- **Content After Reasoning Fix**: Fixed issue where content wasn't received after `reasoning_content`.
    - Changed fallback logic to `else if` chain to avoid conflicts with native delta processing.
    - Fallback now only triggers when `delta.content` is missing but `message.content` exists.
    - Handles providers that put regular content in `message` instead of `delta` after reasoning blocks.
    - Ensures content is only extracted when delta is present, with message.content as fallback.

- **Thinking Content Display Fix**: Fixed broken thinking/reasoning output display.
    - Changed from immediate reporting to buffer accumulation for thinking content.
    - Thinking content is now reported as a single block when thinking ends.
    - Prevents VS Code from treating each thinking delta as a separate bullet point.
    - Thinking buffer is flushed when regular content starts or stream ends.

## [0.3.1] - 2026-03-16

### Added

- **Ollama Provider Base URL Override**: Added provider-level `baseUrl` override capability specifically for the Ollama provider.
    - Users can now configure a custom base URL in `chp.providerOverrides.ollama.baseUrl` settings.
    - This allows connecting to local Ollama instances (e.g., `http://localhost:11434`) or custom Ollama endpoints.
    - The base URL field appears in VS Code settings intellisense only for Ollama provider.
    - When configured, all Ollama models will use the custom base URL.

- **OpenCode Zen Go Provider**: Added a new OpenCode Zen Go provider with dedicated endpoints for GLM-5, Kimi K2.5, and MiniMax M2.5 models.
    - OpenAI SDK endpoint: `https://opencode.ai/zen/go/v1/chat/completions`
    - Anthropic SDK endpoint: `https://opencode.ai/zen/go/v1/messages`
    - Added `opencodego.json` provider configuration with model-specific endpoints.
    - GLM-5 and Kimi K2.5 use OpenAI SDK at `/chat/completions`.
    - MiniMax M2.5 uses Anthropic SDK at `/messages`.
    - Added provider support in account management, account UI, and status bar components.
    - Added `chp.opencodego.setApiKey` command for API key configuration.

- **AVA Supernova Provider**: Added a new free AVA Supernova provider with OpenAI SDK compatibility via proxying requests to `https://ava-supernova.com/api/v1/free/chat`.
    - Added `ava-supernova.json` provider config and `KnownProviders` entry.
    - Updated model token limits to match AVA docs (128K context, 4K output; input max = 126,976).

- **Knox Provider**: Added a new OpenAI SDK-compatible Knox provider (`https://api.knox.chat/v1`) with model discovery support.
    - Added `knox.json` provider config and `KnownProviders` entry.
    - Added `chp.knox.setApiKey` command registration.

- **Hide thinking/reasoning UI option**: Added global setting `chp.hideThinkingInUI` and a toggle in the Settings page to completely suppress thinking/reasoning output blocks across all providers.

### Fixed

- **Knox token limit calculation**: Fixed token-limit logic for Knox models so `maxInputTokens = context_length - max_completion_tokens` (when reported by Knox) rather than relying on `max_tokens`.

## [0.3.0] - 2026-03-13

### Added

- **Pollinations AI Provider**: Added a new Pollinations AI provider with OpenAI-compatible API and diverse model selection.
    - Added `pollinations.json` provider configuration with 28 static models including GPT-5 variants, Gemini, Claude, DeepSeek, and more.
    - Added provider support in account management, account UI, and status bar components.
    - Added `chp.pollinations.setApiKey` command for API key configuration.
    - Configured with static models (fetchModels: false) instead of dynamic API fetching.

### Changed

- **Qwen CLI Provider OAuth Flow**: Updated the qwencli provider to use a proper OAuth device flow with PKCE support.
    - Added complete OAuth Device Authorization Grant (RFC 8628) implementation
    - Added PKCE support for secure authentication
    - Added support for multiple OAuth accounts with automatic switching when quota is exhausted
    - Added CLI fallback for when OAuth quota is exceeded
    - Added proper DashScope headers for API compatibility
    - Added new commands: `chp.qwencli.login` and `chp.qwencli.addAccount`
    - Improved token refresh and credential management

- **Settings Page UI Refresh**: Refined the unified settings page to feel smoother and easier to scan.
    - Added a cleaner header with quick provider/setup summary stats.
    - Improved provider search, result summary text, and provider status badges.
    - Polished card spacing, hover transitions, editor sections, and save actions for a more modern settings experience.

### Removed

- **Provider Base URL Override**: Removed provider-level `baseUrl` override support from the settings experience and runtime config merge path.
    - Removed the base URL option from the generic provider wizard.
    - Removed generated `chp.<provider>.baseUrl` settings and related provider metadata flags.
    - Kept explicit model-level `baseUrl` support where model configuration already supports it.

### Fixed

- **Copilot Chat Context Window Token Counting**: Improved token counting for VS Code Copilot Chat so the Context Window panel can render usage more accurately for custom models.
    - Extended the shared token counter to support newer VS Code language-model message/content shapes such as `LanguageModelChatMessage2`, `LanguageModelToolResultPart2`, `LanguageModelDataPart`, and thinking parts.
    - Updated generic provider token-count handling so VS Code can request counts using the newer chat message API types.
    - Improved counting for structured tool result content and text-like data payloads used in modern chat requests.

## [0.2.9] - 2026-03-10

### Changed

- **Blackbox AI Provider Settings**: Blackbox now uses the official API flow and requires a user-configured API key.
    - Removed the old built-in/default-key behavior.
    - Added provider-level `sdkMode` selection for Blackbox, similar to Ollama.
    - Renamed the Responses mode identifier to `oai-response`.
    - Default Blackbox SDK mode now targets the official Responses API route.
    - Synced generated provider settings and commands through `sync-providers.js` and `package.json`.
- **OpenCode Provider SDK Modes**: OpenCode now supports provider-level `anthropic`, `openai`, and `oai-response` SDK modes.
    - Default OpenCode SDK mode now prefers `anthropic`, similar to Ollama.
    - Synced the generated `chp.opencode.sdkMode` setting into `package.json`.
- **Vercel AI Provider**: Added a new OpenAI-SDK-only `vercelai` provider for the Vercel AI Gateway.
    - Uses `https://ai-gateway.vercel.sh/v1` with `/models` model discovery.
    - Enables open model endpoint fetching and generated provider settings/commands.
- **Cline Provider**: Added a new OpenAI-SDK-only `cline` provider.
    - Uses `https://api.cline.bot/api/v1` with authenticated model discovery from `https://api.cline.bot/api/v1/ai/cline/models`.
    - Respects the shared global context-length manager path for dynamically fetched models.
- **Vercel AI Context Handling**: Added a dedicated Vercel AI context resolver built on top of the global context manager.
    - Uses Vercel model metadata fields like `context_window` and `max_tokens` when available.
    - Imports model tags from the Vercel `/models` response for fetched models.
- **Qwen 3.5 Large-Context Overrides**: Added 1M-context special handling for Qwen 3.5 Flash and Plus model variants.
    - Covers naming variants such as `qwen3.5-flash`, `qwen3.5-plus`, `qwen3-5-flash`, and `qwen3-5-plus`.
- **Provider Sync Coverage**: Expanded `scripts/sync-providers.js` so provider additions now sync more account-related artifacts automatically.
    - Also updates the Add Account provider list, provider display-name map, and API-key account sync list from known provider metadata.
- **Settings Page Provider Settings**: The Settings page now renders provider settings from the extension configuration schema instead of relying on a small hardcoded field list.
    - Supports client-side editing of provider settings like base URL, endpoint, SDK mode, and other manifest-backed provider options.

### Fixed

- **Settings Page Search**: Fixed the provider search input in the unified settings page so filtering works while typing instead of effectively resetting interaction on re-render.
- **Settings Page Provider Controls**: Fixed Blackbox so it is no longer treated like a no-config provider and now exposes provider settings consistently.
- **Known Provider Merge Typing**: Fixed a `knownProviders.ts` type error when applying preferred provider base URLs during config merging.
- **Vercel AI Model Import Filtering**: Vercel AI model discovery now only imports entries where `type === "language"`.
- **Vercel AI Vision Capability Detection**: Imported Vercel models now enable vision support when their tags include `vision`.
- **Vercel AI Token Limit Mapping**: Vercel AI imported models now map `maxInputTokens` from `context_window - max_tokens` and `maxOutputTokens` from `max_tokens`.
- **Dynamic Model Parser Typing**: Fixed TypeScript typing for custom model-parser filter fields used during dynamic model imports.
- **Cline Account Flows**: Fixed Cline so it participates in the explicit Add Account and account-sync flows.
- **Settings Page API Key Refresh**: Fixed account-based API key changes from the Settings page so providers refresh and appear correctly in the VS Code language-model picker.

## [0.2.8] - 2026-03-04

### Removed

- **Gemini CLI and Antigravity Providers**: Removed both providers as they were leading to account banning.
- **Gemini SDK Utilities**: Completely removed Gemini SDK-related code, including `GeminiStreamProcessor`, `GeminiSdkCommon`, and `GeminiSearchTool`.

## [0.2.7] - 2026-03-03

### Added

- **Blackbox AI Default API Key**: Added `defaultApiKey: "xxx"` to Blackbox AI provider, allowing it to work without explicit user configuration.
- **User-Agent Pool**: All providers now use rotating browser-like User-Agent strings from `USER_AGENT_POOL` for better compatibility.

### Fixed

- **Open Model Endpoint Support**: Fixed `openModelEndpoint` flag not being respected in `DynamicModelProvider`. Providers with open model endpoints (NVIDIA, Chutes, Hugging Face, Kilo AI, LightningAI, Ollama, OpenCode, Zenmux, Blackbox, etc.) now correctly fetch models without requiring an API key.
- **Blackbox AI Authorization**: Fixed `401 Unauthorized` errors by properly using the default API key when no user-configured key exists.

## [0.2.6] - 2026-03-02

### Added

- **Open Model Endpoint Support**: Added `openModelEndpoint` flag to `knownProviders.ts` for providers that allow model fetching without an API key.
    - Enabled for: AIHubMix, Blackbox AI, Chutes AI, DeepInfra, Hugging Face, Kilo AI, LightningAI, ModelScope, NanoGPT, NVIDIA NIM, Ollama, OpenCode, and Zenmux.
- **Blackbox AI Headers**: Added required custom headers (`customerId`, `userId`, `version`) to Blackbox AI provider configuration.

### Fixed

- **Dynamic Model Update Logic**: Fixed an issue where background model updates were skipped when models were already cached. The system now always triggers a background fetch for providers with dynamic model support to ensure config files and cache stay up-to-date.

- **Production Config File Paths**: Fixed issue where provider config files could not be found in production builds.
    - Updated esbuild configuration to copy provider JSON configs from `src/providers/config/` to `dist/providers/config/` during build.
    - Changed all provider file paths from `src/providers/config/` to `dist/providers/config/` to match production bundle structure.
    - Affected providers: Zhipu, MiniMax, Moonshot, and all dynamic model providers.

## [0.2.6] - 2026-03-02

### Added

**Provider Sync Automation:**

- **`sync-providers.js` Script**: Created automated synchronization script to generate all provider-related artifacts from a single source of truth (`knownProviders.ts`).
    - Auto-generates `ProviderKey` enum in `src/types/providerKeys.ts`
    - Auto-updates provider configurations in `src/accounts/accountManager.ts`
    - Auto-syncs commands, settings, and activation events in `package.json`
    - Run with: `npm run sync-providers`

**New Providers:**

- **NanoGPT**: Added support for NanoGPT provider (OpenAI SDK-compatible)
    - Endpoint: `https://nano-gpt.com/api/v1`
    - Dynamic model fetching enabled
    - API key configuration via `chp.nanogpt.setApiKey` command

**Declarative Provider System:**

- **Zero-Code Provider Definition**: Providers can now be defined entirely in `knownProviders.ts` without needing individual provider folders, classes, or JSON config files.
- **Unified SDK Compatibility**: All providers now support a unified configuration structure with `openai` and `anthropic` SDK compatibility modes.
- **Automatic SDK Switching**: Added `sdkMode` setting for dual-SDK providers (DeepSeek, Moonshot, AIHubMix, Ollama, etc.), allowing users to switch between OpenAI and Anthropic protocols with a single setting.
- **Auto-Sync package.json**: Implemented logic to automatically keep `package.json` settings, activation events, and registrations in sync with the provider registry.

**Dynamic Model Discovery Refactor:**

- **Generic Dynamic Provider**: Introduced `DynamicModelProvider` which centralizes model discovery logic for all OpenAI-compatible providers.
- **Auto-Update Static Configs**: The system now automatically creates and updates `.json` configuration files in `src/providers/config/` when new models are discovered via API.
- **Intelligent URL Construction**: Improved model endpoint resolution with automatic path normalization (prevents redundant `/v1` segments).
- **Duplicate Prevention**: Added robust deduplication to prevent multiple registrations of the same model during dynamic updates.

**Enhanced Model Support:**

- **Claude Opus 4.6**: Added specialized support for Claude Opus 4.6 with a 1,000,000 token context window and 64,000 token output limit.
- **Ollama Dynamic Support**: Fully integrated Ollama with dynamic model fetching and dual-SDK (OpenAI/Anthropic) support.
- **AIHubMix Dynamic Support**: Enabled dynamic model discovery for AIHubMix via the `/models` endpoint.

### Changed

**Codebase Simplification:**

- **Removed 10+ Provider Folders**: Deleted specialized provider implementations for `kilo`, `chutes`, `huggingface`, `lightningai`, `opencode`, `zenmux`, `nvidia`, `mistral`, `minimax`, and `moonshot`. These are now handled by the generic dynamic system, reducing codebase complexity by ~40%.
- **Unified Registration Flow**: All providers (except specialized ones like Gemini/Antigravity) now use a single, consistent registration path.

### Fixed

- **Settings Page Rendering**: Fixed an issue where declarative providers were not appearing in the modern settings interface.
- **Mistral Duplicate Models**: Resolved a bug where Mistral models were being registered multiple times.
- **URL Construction**: Fixed incorrect model endpoint URLs for providers with nested path structures.
- **Wizard Compatibility**: Ensured specialized configuration wizards (MiniMax, Moonshot) still work correctly within the new dynamic system.

- **Quota Display in Status Bar**: Added Antigravity (Cloud Code) quota status bar showing remaining quota for Gemini and Claude models.
    - Separate status and bar items for Gemini Claude quotas.
    - Color-coded display: Red when <10% or over budget, Orange when <30% or slightly over pace, Green when >=30% and on track.
    - Click to refresh and view detailed quota in QuickPick.
    - Shows model-specific quota information with reset times.
    - **All Models Display**: Tooltip now shows all available models (no 5-model limit) with colored quota badges.
    - **Real-time Refresh**: Status bar always fetches fresh data on click (no caching).
- **Leader Election**: Implemented master instance election to ensure only one VS Code instance runs periodic status updates.
- **User Activity Detection**: Pauses background status updates when user is inactive (30 min timeout).

**Gemini Vision Support:**

- All Gemini models (gemini-2, gemini-2.5, gemini-3, etc.) now support vision capabilities across all providers.
- Excludes gemini-cli provider which handles Gemini models through a separate path.

### Fixed

- **Removed `<think/>` Placeholder Logic**: Removed unnecessary `<think/>` placeholder output when thinking models return only thinking content without text content. This eliminates redundant placeholder tokens in chat responses across all providers (Anthropic, Claude, DeepInfra, Zenmux, Gemini, Mistral, LightningAI, HuggingFace, Blackbox, OpenAI, OpenCode).

- **TypeScript Type Compatibility**: Fixed type errors where several provider implementations had private `updateConfigFileAsync` methods that conflicted with the base class `GenericModelProvider`'s protected method signature. Renamed provider-specific methods to unique names (e.g., `updateOpenCodeConfigFile`, `updateZhipuConfigFile`, etc.) to resolve the type incompatibility.
- **Ollama Vision Capabilities**: Fixed an issue where Ollama models (like `kimi-k2.5`) were not correctly reporting vision capabilities. Now uses the centralized `resolveGlobalCapabilities` for consistent capability detection across all providers.
- **NVIDIA Auto-Registration**: Fixed an issue where the NVIDIA provider was not automatically registering with VS Code on startup without an API key. It now correctly inherits the background-fetching logic from `GenericModelProvider`.
- **Ollama Base URL Normalization**: Fixed potential double slashes in API URLs when `baseUrl` ends with a trailing slash.
- **Ollama Provider Migration to Anthropic SDK**: Shifted Ollama provider to use Anthropic SDK instead of OpenAI SDK for API requests. This aligns with Ollama's Anthropic compatibility API (`https://ollama.com`). Also disabled thinking/thinking_content output by default for Ollama requests to avoid unnecessary reasoning content.

**Gemini CLI Provider Fixes:**

- **Model Name Resolution (404 Fix)**: Fixed "Requested entity was not found" error by stripping the `google/` prefix from model names before sending to the Gemini API. The API expects bare model names like `gemini-2.5-pro` instead of `google/gemini-2.5-pro`.
- **Tool Schema Sanitization**: Fixed `Invalid JSON payload received` errors by implementing comprehensive tool schema cleaning:
    - Removes unsupported JSON Schema fields (`exclusiveMinimum`, `exclusiveMaximum`, `value`, etc.) that cause 400 `INVALID_ARGUMENT` errors.
    - Sanitizes property names to match `[a-zA-Z0-9_]*` pattern.
    - Handles nested schemas in `anyOf`, `oneOf`, `allOf` composite types.
    - Filters `required` fields to only include properties that exist in the schema.
- **Authentication Fallback**: Improved authentication error handling to properly fall back to local CLI credentials when managed accounts fail.
- **Thinking Configuration**: Corrected thinking config format for Gemini 3 (uses `thinkingLevel` string) vs Gemini 2.5 (uses `thinkingBudget` numeric).
- **Request Headers**: Added proper Gemini CLI headers (`X-Goog-Api-Client`, `Client-Metadata`) to match official `google-gemini/gemini-cli` behavior.

### Changed

- **Faster Startup**: Extension now returns static config models immediately during startup (silent mode) for faster initialization.
- **Improved Model Discovery**: In non-silent mode (when user interacts with chat), models are fetched from the API in the background and the model list is automatically refreshed.

### Fixed

**Gemini CLI Token Refresh:**

- **Fixed Token Endpoint**: Updated OAuth token endpoint from `accounts.google.com` to `oauth2.googleapis.com` for more reliable token refresh.
- **In-Flight Request Deduplication**: Added request deduplication to prevent race conditions when multiple requests trigger token refresh simultaneously.
- **Improved Error Handling**: Added detection for `invalid_grant` errors (revoked refresh tokens) and automatic cleanup of stale credentials.
- **Retry Logic**: Added exponential backoff with jitter for transient network failures during token refresh.
- **Better Debug Logging**: Added logging for token rotation detection and refresh status.

### Code Refactoring

**Gemini SDK Consolidation:**

- **New `gemini` SDK Mode**: Introduced dedicated `sdkMode: "gemini"` type for providers using Gemini-compatible APIs (Antigravity and Gemini CLI).
- **Shared Gemini SDK Utilities** (`src/utils/geminiSdkCommon.ts`): Centralized common logic for Gemini-compatible providers:
    - `sanitizeGeminiToolSchema`: Tool schema sanitization for Gemini API compatibility.
    - `convertMessagesToGemini`: Message format conversion to Gemini-compatible structure.
    - `validateGeminiPartsBalance`: Validation for function call/response pairing.
    - `balanceGeminiFunctionCallResponses`: Automatic balancing of function calls and responses.
- **Shared Stream Processor** (`src/utils/geminiStreamProcessor.ts`): Unified `GeminiStreamProcessor` class for SSE streaming:
    - Handles SSE streaming, thinking tags, tool calls, adaptive buffering.
    - Supports both Antigravity and Gemini CLI providers via `GeminiStreamHandler` interface.
    - Consolidated ~1,500 lines of duplicate code from separate processor implementations.
- **Updated Model Configs**: Changed sdkMode from `"anthropic"`/`"openai"` to `"gemini"` for all Gemini-compatible models in `antigravity.json` and `geminicli.json`.
- **Token Counter Updates**: Gemini mode now uses Anthropic-style token counting (system message + tool definition costs).

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

- Updated description to clarify it uses Ollama's Anthropic compatible API: "Ollama - use Ollama's Anthropic compatible API (v1/messages)"

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
    - Models are now grouped by their provider name (e.g., "minimax", "deepseek", "kilo") in the VS Code model selector.
    - Dynamic family switching to ensure compatibility with advanced VS Code features like Copilot's "Edit" mode.
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
