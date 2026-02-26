<div align="center">

# Copilot ++

<img src="logo_ai.png" alt="Copilot ++" width="150" height="150">

### **Supercharge your GitHub Copilot with 20+ AI providers**

[![Version](https://img.shields.io/visual-studio-marketplace/v/OEvortex.better-copilot-chat?style=for-the-badge&logo=visual-studio-code&logoColor=white&label=Version&color=007ACC)](https://marketplace.visualstudio.com/items?itemName=OEvortex.better-copilot-chat)
[![Downloads](https://img.shields.io/visual-studio-marketplace/d/OEvortex.better-copilot-chat?style=for-the-badge&logo=visual-studio-code&logoColor=white&label=Downloads&color=28A745)](https://marketplace.visualstudio.com/items?itemName=OEvortex.better-copilot-chat)
[![Rating](https://img.shields.io/visual-studio-marketplace/r/OEvortex.better-copilot-chat?style=for-the-badge&logo=visual-studio-code&logoColor=white&label=Rating&color=FFC107)](https://marketplace.visualstudio.com/items?itemName=OEvortex.better-copilot-chat)

[![License](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.104.0+-007ACC.svg?style=for-the-badge&logo=visual-studio-code&logoColor=white)](https://code.visualstudio.com/)
[![Node.js](https://img.shields.io/badge/Node.js-20.0+-339933.svg?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/) 

<br/>

[Install](#installation) · [Quick Start](#quick-start) · [Features](#key-features) · [Providers](#supported-providers)

</div>

---

## Overview

A powerful VS Code extension that provides model support for **GitHub Copilot Chat**, seamlessly integrating **20+ AI providers** including ZhipuAI, MiniMax, MoonshotAI, DeepSeek, Antigravity (Google Cloud Code), Codex (OpenAI), Chutes, OpenCode, Blackbox, and custom OpenAI/Anthropic compatible models.

---

## Supported Providers

<div align="center">

| Provider | Description | Key Models | Highlights |
| :------- | :---------- | :--------- | :--------- |
| **Antigravity** | Google Cloud Code | Gemini 3 Pro, Gemini 3.1 Pro, Gemini 3 Flash | `1M context` `Image Input` `OAuth` `Quota Tracking` |
| **Codex** | OpenAI Codex | GPT-5.2 Codex, GPT-5.3 Codex | `400k context` `Image Input` `OAuth` `Reasoning Modes` |
| **ZhipuAI** | GLM Coding Plan | GLM-4.5, GLM-4.6, GLM-4.7, GLM-5, GLM-4.7-Flash | `256K context` `Web Search` `MCP SDK` `Free Tier` |
| **MiniMax** | Coding Plan | MiniMax-M2.5, MiniMax-M2.1 | `205K context` `Web Search` `Thinking Mode` |
| **MoonshotAI** | Kimi For Coding | Kimi-K2-Thinking, Kimi-K2-0905-Preview | `256K context` `Agentic Coding` `Thinking Mode` |
| **DeepSeek** | DeepSeek AI | DeepSeek-V3.2, DeepSeek-V3.2 Reasoner | `128K context` `GPT-5 Level Reasoning` |
| **Chutes** | Chutes AI | Various models | `Global Request Limit` |
| **OpenCode** | OpenCode AI | Claude 4.5, GPT-5 | `Multi-model Access` |
| **Blackbox** | Blackbox AI | kimi-k2.5, blackbox-base-2 | `Free Tier Available` |
| **DeepInfra** | DeepInfra | OpenAI-compatible models | `LLM & Image Models` |
| **Kilo AI** | Kilo AI | Dynamic model fetching | `High Performance` |
| **Zenmux** | Zenmux AI | Dynamic model fetching | `OpenAI-compatible` |
| **Lightning AI** | Lightning AI | Various models | `Dynamic Models` |
| **Hugging Face** | Hugging Face | Various models | `Router Integration` |
| **Mistral AI** | Mistral AI | Mistral models | `OpenAI-compatible` |
| **NVIDIA NIM** | NVIDIA NIM | NVIDIA models | `40 RPM Throttle` `Model Discovery` |
| **Ollama Cloud** | Ollama | Local & Cloud models | `OpenAI-compatible` |
| **Qwen CLI** | Qwen Code CLI | Qwen models | `OAuth via CLI` |
| **Gemini CLI** | Gemini CLI | Gemini models | `OAuth via CLI` `Google Web Search` |
| **Compatible** | Custom API | User-defined models | `OpenAI/Anthropic Compatible` |

</div>

---

## Key Features

### 🔄 Multi-Account Management

> **Manage multiple accounts per provider with ease**

- Add **unlimited accounts** for each AI provider
- Quick switch between accounts with `Ctrl+Shift+Q` / `Cmd+Shift+Q`
- Visual account status in the status bar
- Secure credential storage using VS Code Secret Storage

---

### ⚖️ Load Balancing & Auto-Switching

> **Automatic load distribution across accounts**

- Auto-switch when hitting rate limits or quota exhaustion
- Intelligent retry with exponential backoff strategy
- Real-time quota monitoring and usage statistics
- Seamless failover without interrupting your workflow

---

### 🔐 OAuth Authentication

> **Secure login for supported providers**

| Provider | Auth Method | Command |
| :------- | :---------- | :------ |
| Antigravity | Google OAuth | `Copilot ++: Antigravity Login` |
| Codex | OpenAI OAuth | `Copilot ++: Codex Login` |
| Gemini CLI | Google OAuth | `gemini auth login` (CLI) |
| Qwen CLI | Alibaba OAuth | `qwen auth login` (CLI) |

---

### 🌐 Web Search Integration

> **Real-time information retrieval**

| Tool | Provider | Description |
| :--- | :------- | :---------- |
| `#zhipuWebSearch` | ZhipuAI | Multi-engine search (Sogou, Quark, Standard) |
| `#minimaxWebSearch` | MiniMax | Coding Plan web search |
| `#googleWebSearch` | Gemini CLI | Grounded Google Search with citations |

**Example usage in Copilot Chat:**
```
@workspace #zhipuWebSearch What are the latest features in TypeScript 5.5?
```

---

### ✨ Advanced Code Completion

> **Smart code completion features**

| Feature | Description | Default |
| :------ | :---------- | :------ |
| **FIM (Fill In the Middle)** | Intelligent code completion based on context | Disabled |
| **NES (Next Edit Suggestions)** | Predictive editing suggestions | Disabled |

**Enable in Settings:**
```json
{
    "chp.fimCompletion.enabled": true,
    "chp.nesCompletion.enabled": true
}
```

**Keybindings:**
| Action | Windows/Linux | macOS |
| :----- | :------------ | :---- |
| Trigger inline suggestion | `Alt+/` | `Alt+/` |
| Toggle NES manual mode | `Shift+Alt+/` | `Shift+Alt+/` |

---

### 🛠️ Editing Tool Modes

> **Optimized editing for different AI models**

| Mode | Tool | Best For |
| :--- | :--- | :------- |
| `claude` | ReplaceString | Efficient single replacements (default) |
| `gpt-5` | ApplyPatch | Batch editing, complex refactoring |
| `none` | Direct file editing | Fallback for edge cases |

**Configure:**
```json
{
    "chp.editToolMode": "claude"
}
```

---

## Installation

<details>
<summary><b>📦 From VS Code Marketplace (Recommended)</b></summary>

1. Open **VS Code**
2. Go to Extensions (`Ctrl+Shift+X` / `Cmd+Shift+X`)
3. Search for **"Copilot ++"**
4. Click **Install**

Or visit the Marketplace page directly: [Copilot ++ on Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=OEvortex.better-copilot-chat)

</details>

<details>
<summary><b>📁 From .vsix File</b></summary>

1. Download the `.vsix` file from [Releases](https://github.com/OEvortex/better-copilot-chat/releases)
2. In VS Code, press `Ctrl+Shift+P` / `Cmd+Shift+P`
3. Type **"Extensions: Install from VSIX..."**
4. Select the downloaded file

</details>

<details>
<summary><b>🔨 Build from Source</b></summary>

```bash
# Clone the repository
git clone https://github.com/OEvortex/better-copilot-chat.git
cd better-copilot-chat

# Install dependencies
npm install

# Build the extension
npm run compile

# Package as .vsix
npm run package

# Install the packaged extension
code --install-extension better-copilot-chat-*.vsix
```

</details>

---

## Quick Start

### Step 1: Configure Your Provider

| Provider | Command |
| :------- | :------ |
| Antigravity | `Cmd+Shift+P` → `Copilot ++: Antigravity Login` |
| Codex (OpenAI) | `Cmd+Shift+P` → `Copilot ++: Codex Login` |
| ZhipuAI | `Cmd+Shift+P` → `Copilot ++: ZhipuAI Configuration Wizard` |
| MiniMax | `Cmd+Shift+P` → `Copilot ++: MiniMax Configuration Wizard` |
| MoonshotAI | `Cmd+Shift+P` → `Copilot ++: MoonshotAI Configuration Wizard` |
| DeepSeek | `Cmd+Shift+P` → `Copilot ++: Configure DeepSeek` |
| Chutes | `Cmd+Shift+P` → `Copilot ++: Configure Chutes` |
| Zenmux | `Cmd+Shift+P` → `Copilot ++: Configure Zenmux` |
| OpenCode | `Cmd+Shift+P` → `Copilot ++: Configure OpenCode` |
| Blackbox | `Cmd+Shift+P` → `Copilot ++: Configure Blackbox` |
| Hugging Face | `Cmd+Shift+P` → `Copilot ++: Configure Hugging Face` |
| Kilo AI | `Cmd+Shift+P` → `Copilot ++: Configure Kilo AI` |
| Lightning AI | `Cmd+Shift+P` → `Copilot ++: Lightning AI Configuration Wizard` |
| DeepInfra | `Cmd+Shift+P` → `Copilot ++: Configure DeepInfra` |
| NVIDIA NIM | `Cmd+Shift+P` → `Copilot ++: Configure NVIDIA NIM` |
| Mistral AI | `Cmd+Shift+P` → `Copilot ++: Configure Mistral AI` |
| Ollama Cloud | `Cmd+Shift+P` → `Copilot ++: Configure Ollama Cloud` |
| Custom Models | `Cmd+Shift+P` → `Copilot ++: Compatible Provider Settings` |

### Step 2: Select Your Model

1. Open GitHub Copilot Chat
2. Click the model dropdown
3. Select a model from your configured provider (e.g., `⦿ ZhipuAI > glm-4.5`)

### Step 3: Configure Multiple Accounts (Optional)

```
Cmd+Shift+P → "Copilot ++: Settings"
→ Select a provider
→ Add accounts with API keys
```

### Step 4: Enable Load Balancing

```
Cmd+Shift+P → "Copilot ++: Settings"
→ Select a provider
→ Toggle "Load Balance" for automatic account switching
```

---

## Detailed Guide: Managing Providers

### How to Configure Providers

Follow these simple steps to add and manage providers using the Settings page:

#### **Step 1: Open Settings**

Press `Cmd+Shift+P` (macOS) or `Ctrl+Shift+P` (Windows/Linux) and type:

```
Copilot ++: Settings
```

<div align="center">
<img src="1.png" alt="Open Settings" width="800"/>
</div>

#### **Step 2: Select Your Provider**

Click on the provider you want to configure (e.g., ZhipuAI, MiniMax, MoonshotAI, etc.)

<div align="center">
<img src="2.png" alt="Select Provider" width="800"/>
</div>

#### **Step 3: Add Account Credentials**

Enter your API key and configure provider settings:

- **API Key**: Your provider's API key
- **Base URL**: Custom API endpoint (optional)
- **Additional Settings**: Provider-specific configurations

<div align="center">
<img src="3.png" alt="Add Credentials" width="800"/>
</div>

#### **Step 4: Enable Load Balancing (Optional)**

Toggle the **"Load Balance"** switch to enable automatic account switching when rate limits are hit.

<div align="center">
<img src="4.png" alt="Enable Load Balancing" width="800"/>
</div>

### Provider Management Features

- **Add Multiple Accounts**: Add multiple API keys per provider for load balancing
- **Edit Settings**: Click the edit icon to modify provider details
- **Delete Account**: Remove accounts you no longer need
- **Switch Account**: Use `Ctrl+Shift+Q` / `Cmd+Shift+Q` for quick switching
- **Load Balance**: Automatically distribute requests across accounts
- **Quota Tracking**: Monitor usage and remaining quota in real-time

---

## Configuration Reference

### Global Settings

| Setting | Type | Default | Description |
| :------ | :--- | :------ | :---------- |
| `chp.temperature` | number | `0.1` | Controls output randomness (0-2) |
| `chp.topP` | number | `1` | Controls output diversity (0-1) |
| `chp.maxTokens` | number | `8192` | Maximum output tokens (32-256000) |
| `chp.editToolMode` | string | `"claude"` | Editing tool mode (`claude`, `gpt-5`, `none`) |
| `chp.rememberLastModel` | boolean | `true` | Remember last used model |

### Provider-Specific Settings

#### ZhipuAI

| Setting | Type | Default | Description |
| :------ | :--- | :------ | :---------- |
| `chp.zhipu.search.enableMCP` | boolean | `true` | Enable MCP SDK mode for web search |
| `chp.zhipu.endpoint` | string | `"open.bigmodel.cn"` | API endpoint (`open.bigmodel.cn` or `api.z.ai`) |
| `chp.zhipu.plan` | string | `"coding"` | Plan type (`coding` or `normal`) |
| `chp.zhipu.thinking` | string | `"auto"` | Thinking mode (`enabled`, `disabled`, `auto`) |
| `chp.zhipu.clearThinking` | boolean | `true` | Clear thinking context between turns |

#### MiniMax

| Setting | Type | Default | Description |
| :------ | :--- | :------ | :---------- |
| `chp.minimax.endpoint` | string | `"minimaxi.com"` | API endpoint (`minimaxi.com` or `minimax.io`) |

### Completion Settings

#### FIM (Fill In the Middle)

| Setting | Type | Default | Description |
| :------ | :--- | :------ | :---------- |
| `chp.fimCompletion.enabled` | boolean | `false` | Enable FIM completion |
| `chp.fimCompletion.debounceMs` | number | `500` | Debounce delay (50-1000ms) |
| `chp.fimCompletion.timeoutMs` | number | `5000` | Request timeout (1000-30000ms) |

#### NES (Next Edit Suggestions)

| Setting | Type | Default | Description |
| :------ | :--- | :------ | :---------- |
| `chp.nesCompletion.enabled` | boolean | `false` | Enable NES completion |
| `chp.nesCompletion.manualOnly` | boolean | `false` | Only trigger manually (`Alt+/`) |
| `chp.nesCompletion.debounceMs` | number | `500` | Debounce delay (50-1000ms) |
| `chp.nesCompletion.timeoutMs` | number | `5000` | Request timeout (1000-30000ms) |

---

## Available Models

### ZhipuAI (GLM Coding Plan)

| Model | Input | Output | Features |
| :---- | :------ | :----- | :------- |
| GLM-4.5 | 98K | 32K | Tool Calling |
| GLM-4.5-air | 98K | 32K | Tool Calling |
| GLM-4.6 | 229K | 32K | Tool Calling |
| GLM-4.7 | 229K | 32K | Tool Calling |
| GLM-5 | 229K | 32K | Tool Calling |
| GLM-4.7-Flash | 229K | 32K | **Free** |

### MiniMax

| Model | Input | Output | Features |
| :---- | :------ | :----- | :------- |
| MiniMax-M2.5 | 172K | 32K | Thinking, Tool Calling |
| MiniMax-M2.5-highspeed | 172K | 32K | ~100 TPS, Thinking |
| MiniMax-M2.1 | 172K | 32K | Thinking, Tool Calling |

### MoonshotAI (Kimi)

| Model | Input | Output | Features |
| :---- | :------ | :----- | :------- |
| Kimi For Coding | 224K | 32K | Tool Calling |
| Kimi-K2-Thinking | 224K | 32K | Thinking, Agentic |
| Kimi-K2-Thinking-Turbo | 224K | 32K | Thinking, Fast |
| Kimi-K2-0905-Preview | 224K | 32K | Agentic Coding |

### DeepSeek

| Model | Input | Output | Features |
| :---- | :------ | :----- | :------- |
| DeepSeek-V3.2 | 128K | 16K | Tool Calling |
| DeepSeek-V3.2 Reasoner | 128K | 16K | Thinking, Tool Calling |

### Antigravity (Google Cloud Code)

| Model | Input | Output | Features |
| :---- | :------ | :----- | :------- |
| Gemini 3 Pro Low | 935K | 65K | Image Input, Tool Calling |
| Gemini 3 Pro High | 935K | 65K | Image Input, Tool Calling |
| Gemini 3.1 Pro Low | 935K | 65K | Image Input, Tool Calling |
| Gemini 3.1 Pro High | 935K | 65K | Image Input, Tool Calling |
| Gemini 3 Flash | 935K | 65K | Image Input, Tool Calling |

### Codex (OpenAI)

| Model | Input | Output | Features |
| :---- | :------ | :----- | :------- |
| GPT-5.2 Codex | 344K | 65K | Image Input, Tool Calling |
| GPT-5.3 Codex | 344K | 65K | Image Input, Tool Calling |
| GPT-5.3 Codex (Low) | 344K | 65K | Low Reasoning |
| GPT-5.3 Codex (Medium) | 344K | 65K | Medium Reasoning |
| GPT-5.3 Codex (High) | 344K | 65K | High Reasoning |

---

## Keybindings

| Action | Windows/Linux | macOS |
| :----- | :------------ | :---- |
| Trigger inline suggestion | `Alt+/` | `Alt+/` |
| Toggle NES manual mode | `Shift+Alt+/` | `Shift+Alt+/` |
| Attach selection to Copilot | `Ctrl+Shift+A` | `Cmd+Shift+A` |
| Insert handle reference | `Ctrl+Shift+H` | `Cmd+Shift+H` |
| Insert handle (full path) | `Ctrl+Alt+Shift+H` | `Cmd+Alt+Shift+H` |
| Quick switch account | `Ctrl+Shift+Q` | `Cmd+Shift+Q` |

---

## Commands Reference

### Provider Configuration

| Command | Description |
| :------ | :---------- |
| `Copilot ++: Configure ZhipuAI` | Set ZhipuAI API key |
| `Copilot ++: ZhipuAI Configuration Wizard` | Full ZhipuAI setup with MCP mode |
| `Copilot ++: Configure MiniMax` | Set MiniMax API key |
| `Copilot ++: MiniMax Configuration Wizard` | Full MiniMax setup |
| `Copilot ++: Configure MoonshotAI` | Set MoonshotAI API key |
| `Copilot ++: MoonshotAI Configuration Wizard` | Full MoonshotAI setup |
| `Copilot ++: Configure DeepSeek` | Set DeepSeek API key |
| `Copilot ++: Configure Chutes` | Set Chutes API key |
| `Copilot ++: Configure Zenmux` | Set Zenmux API key |
| `Copilot ++: Configure OpenCode` | Set OpenCode API key |
| `Copilot ++: Configure Blackbox` | Set Blackbox API key |
| `Copilot ++: Configure Hugging Face` | Set Hugging Face API key |
| `Copilot ++: Configure Kilo AI` | Set Kilo AI API key |
| `Copilot ++: Lightning AI Configuration Wizard` | Full Lightning AI setup |
| `Copilot ++: Configure DeepInfra` | Set DeepInfra API key |
| `Copilot ++: Configure NVIDIA NIM` | Set NVIDIA NIM API key |
| `Copilot ++: Configure Mistral AI` | Set Mistral AI API key |
| `Copilot ++: Configure Ollama Cloud` | Set Ollama Cloud API key |
| `Copilot ++: Compatible Provider Settings` | Configure custom models |

### OAuth Authentication

| Command | Description |
| :------ | :---------- |
| `Copilot ++: Antigravity Login` | Login to Google Cloud Code |
| `Copilot ++: Antigravity Logout` | Logout from Antigravity |
| `Copilot ++: Codex Login` | Login to OpenAI Codex |
| `Copilot ++: Codex Logout` | Logout from Codex |

### Account Management

| Command | Description |
| :------ | :---------- |
| `Copilot ++: Add Account` | Add a new account |
| `Copilot ++: Switch Account` | Switch to another account |
| `Copilot ++: Quick Switch Account` | Quick switch with `Ctrl+Shift+Q` |
| `Copilot ++: Remove Account` | Remove an account |
| `Copilot ++: View All Accounts` | List all configured accounts |

### Utilities

| Command | Description |
| :------ | :---------- |
| `Copilot ++: Toggle NES Manual Trigger Mode` | Toggle NES manual mode |
| `Copilot ++: Attach Selection to Copilot Chat` | Attach selected code to chat |
| `Copilot ++: Insert Handle Reference` | Insert `#file:filename:L1-L100` |
| `Copilot ++: Insert Handle Reference with Full Path` | Insert `#handle:path/to/file:L1-L100` |
| `Copilot ++: Open Copilot ++ Settings` | Open settings page |

---

## Custom Models (Compatible Provider)

Add your own OpenAI or Anthropic compatible models:

1. Run `Copilot ++: Compatible Provider Settings`
2. Click "Add Model"
3. Configure your model:

```json
{
    "id": "my-custom-model",
    "name": "My Custom Model",
    "baseUrl": "https://api.example.com/v1",
    "apiKey": "your-api-key",
    "model": "model-name",
    "maxInputTokens": 128000,
    "maxOutputTokens": 8192,
    "sdkMode": "openai",
    "capabilities": {
        "toolCalling": true,
        "imageInput": false
    }
}
```

---

## Requirements

| Requirement | Version |
| :---------- | :------ |
| VS Code | `>= 1.104.0` |
| Node.js | `>= 20.0.0` |
| npm | `>= 9.0.0` |
| GitHub Copilot Chat | Required (extension dependency) |

---

## Development

### Build & Test

```bash
# Install dependencies
npm install

# Build in development mode
npm run compile:dev

# Build for production
npm run compile

# Watch mode
npm run watch

# Run linting
npm run lint

# Format code
npm run format

# Package extension
npm run package
```

### Project Structure

```
copilot-helper/
├── src/
│   ├── extension.ts          # Entry point
│   ├── accounts/             # Multi-account management
│   ├── copilot/              # Core Copilot integration
│   ├── providers/            # AI provider implementations
│   │   ├── providerRegistry.ts  # Provider registry
│   │   ├── zhipu/            # ZhipuAI provider
│   │   ├── minimax/          # MiniMax provider
│   │   ├── moonshot/         # MoonshotAI provider
│   │   ├── antigravity/      # Google Cloud Code
│   │   ├── codex/            # OpenAI Codex
│   │   └── ...               # Other providers
│   ├── tools/                # Web search tools
│   ├── types/                # TypeScript definitions
│   ├── ui/                   # Settings pages
│   └── utils/                # Shared utilities
├── dist/                     # Compiled output
├── package.json              # Extension manifest
└── tsconfig.json             # TypeScript config
```

---

## Credits

<div align="center">

Special thanks to these amazing projects:

| [<img src="https://github.com/Pimzino.png" width="80" style="border-radius: 50%"/><br/>**LLMux**](https://github.com/Pimzino/LLMux) | [<img src="https://github.com/VicBilibily.png" width="80" style="border-radius: 50%"/><br/>**GCMP**](https://github.com/VicBilibily/GCMP) | [<img src="https://github.com/wusimpl.png" width="80" style="border-radius: 50%"/><br/>**AntigravityQuotaWatcher**](https://github.com/wusimpl/AntigravityQuotaWatcher) |
| :---------------------------------------------------------------------------------------------------------------------------------: | :---------------------------------------------------------------------------------------------------------------------------------------: | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------: |

</div>

---

## 🤝 Support & Contact

<div align="center">

### Get in Touch

Have questions or suggestions? Reach out on Telegram:

[![Telegram](https://img.shields.io/badge/Telegram-@OEvortex-2CA5E0?style=for-the-badge&logo=telegram&logoColor=white)](https://t.me/OEvortex)

</div>

---

## License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

---

<div align="center">

### Made with ❤️ for the developer community

**[⬆ Back to Top](#copilot-)**

</div>