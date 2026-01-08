# Changelog

All notable changes to this project will be documented in this file.

## [0.1.2] - 2026-01-08

### Changed / Improved
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
