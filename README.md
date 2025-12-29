# Copilot Helper Pro

An extension that provides model support for GitHub Copilot Chat, including ZhipuAI, MiniMax, MoonshotAI, DeepSeek, Alibaba Cloud Bailian, and custom OpenAI/Anthropic compatible models.

## Features

- Multiple AI Model Support
    - ZhipuAI (GLM Coding Plan)
    - MiniMax (Coding Plan)
    - MoonshotAI (Kimi For Coding)
    - DeepSeek
    - Antigravity (Google Cloud Code)
        - Streaming responses with real-time output
        - Rate limit monitoring and automatic fallback
        - Quota tracking with usage statistics
        - Multi-account support with auto-switching
        - Signature-based request validation
        - Backoff and retry strategies for quota limits
    - Codex (OpenAI)
        - Full access sandbox mode with unrestricted filesystem and network access
        - Apply patch tool for efficient batch file editing
        - Shell command execution for terminal operations
        - Manage todo list for task tracking and planning
        - Streaming responses with thinking blocks
        - Rate limit monitoring and automatic account switching
        - Custom OpenAI/Anthropic Compatible models

- Advanced Features
    - Web Search integration (ZhipuAI, MiniMax)
    - FIM (Fill In the Middle) completion
    - NES (Next Edit Suggestions) completion
    - Account management with multi-account support
    - Token usage tracking
    - Quota monitoring

## Installation

1. Install the extension from the VSCode Marketplace
2. Open VSCode and go to Extensions
3. Search for "Copilot Helper Pro"
4. Click Install

## Configuration

### ZhipuAI

```bash
Cmd+Shift+P > "ZhipuAI Configuration Wizard"
```

### MiniMax

```bash
Cmd+Shift+P > "Start MiniMax Configuration Wizard"
```

### MoonshotAI

```bash
Cmd+Shift+P > "Start MoonshotAI Configuration Wizard"
```

### DeepSeek

```bash
Cmd+Shift+P > "Set DeepSeek API Key"
```

### Custom Models

```bash
Cmd+Shift+P > "Compatible Provider Settings"
```

## Keybindings

- `Alt+/` - Trigger inline completion
- `Shift+Alt+/` - Toggle NES manual trigger mode
- `Ctrl+Shift+A` / `Cmd+Shift+A` - Attach selection to Copilot Chat
- `Ctrl+Shift+H` / `Cmd+Shift+H` - Insert handle reference
- `Ctrl+Shift+Q` / `Cmd+Shift+Q` - Quick switch account

## License

MIT

## Credits

Special thanks to:

- [LLMux](https://github.com/Pimzino/LLMux)
- [GCMP](https://github.com/VicBilibily/GCMP)
- [AntigravityQuotaWatcher](https://github.com/wusimpl/AntigravityQuotaWatcher)
