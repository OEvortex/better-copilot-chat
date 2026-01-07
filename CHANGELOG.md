# Changelog

All notable changes to this project will be documented in this file.

## [0.1.1] - 2026-01-07

### Fixed
- Fixed Qwen Code CLI authentication issue by correctly passing OAuth token as API key to OpenAI handler.
- Fixed Qwen3 Coder Flash model name in configuration (changed from `qwen3-coder-flash` to `qwen2.5-coder-32b-instruct`).

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

## [0.15.26] - Previous Version
- Initial release with ZhipuAI, MiniMax, MoonshotAI, DeepSeek, Antigravity, and Codex support.
