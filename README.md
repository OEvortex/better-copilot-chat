<div align="center">

# Copilot ++

<img src="logo_ai.png" alt="Copilot ++" width="150" height="150">

### **Supercharge your GitHub Copilot with multiple AI providers**

[![Version](https://img.shields.io/visual-studio-marketplace/v/OEvortex.better-copilot-chat?style=for-the-badge&logo=visual-studio-code&logoColor=white&label=Version&color=007ACC)](https://marketplace.visualstudio.com/items?itemName=OEvortex.better-copilot-chat)
[![Downloads](https://img.shields.io/visual-studio-marketplace/d/OEvortex.better-copilot-chat?style=for-the-badge&logo=visual-studio-code&logoColor=white&label=Downloads&color=28A745)](https://marketplace.visualstudio.com/items?itemName=OEvortex.better-copilot-chat)
[![Rating](https://img.shields.io/visual-studio-marketplace/r/OEvortex.better-copilot-chat?style=for-the-badge&logo=visual-studio-code&logoColor=white&label=Rating&color=FFC107)](https://marketplace.visualstudio.com/items?itemName=OEvortex.better-copilot-chat)

[![License](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.104.0+-007ACC.svg?style=for-the-badge&logo=visual-studio-code&logoColor=white)](https://code.visualstudio.com/)
[![Node.js](https://img.shields.io/badge/Node.js-20.0+-339933.svg?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/) 

<br/>

[Install](#installation) · [Quick Start](#quick-start) · [Features](#key-features)

</div>

---

## Overview

A powerful VS Code extension that provides model support for **GitHub Copilot Chat**, seamlessly integrating multiple AI providers including **ZhipuAI**, **MiniMax**, **MoonshotAI**, **DeepSeek**, **Antigravity (Google Cloud Code)**, **Codex (OpenAI)**, **Chutes**, **OpenCode**, and custom **OpenAI/Anthropic** compatible models.

---

## Supported Providers

<div align="center">

|      Provider      |     Description      | Highlights                         |
| :----------------: | :------------------: | :--------------------------------- |
| 🌐 **Antigravity** |  Google Cloud Code   | `Gemini Models` `Quota Tracking`   |
|    💻 **Codex**    |        OpenAI        | `GPT-5` `Apply Patch` `Shell Exec` |
|    **ZhipuAI**     |   GLM Coding Plan    | `Web Search` `MCP SDK`             |
|    **MiniMax**     |     Coding Plan      | `Web Search` `Global Endpoints`    |
|   **MoonshotAI**   |   Kimi For Coding    | `High-quality Responses`           |
|    **DeepSeek**    |     DeepSeek AI      | `Fast Inference`                   |
|     **Chutes**     |      Chutes AI       | `Global Request Limit`             |
|    **OpenCode**    |     OpenCode AI      | `Claude 4.5` `GPT-5`               |
|   **Compatible**   | OpenAI/Anthropic API | `Custom Models Support`            |

</div>

---

## Key Features

### Multi-Account Management

> **Manage multiple accounts per provider with ease**

- Add **unlimited accounts** for each AI provider
- Quick switch between accounts with `Ctrl+Shift+Q` / `Cmd+Shift+Q`
- Visual account status in the status bar
- Secure credential storage using VS Code Secret Storage

---

### Load Balancing & Auto-Switching

> **Automatic load distribution across accounts**

- Auto-switch when hitting rate limits or quota exhaustion
- Intelligent retry with exponential backoff strategy
- Real-time quota monitoring and usage statistics
- Seamless failover without interrupting your workflow

---

### Antigravity (Google Cloud Code)

> **Access Gemini models via Google Cloud Code**

- Streaming responses with real-time output
- Rate limit monitoring with automatic fallback
- Quota tracking with detailed usage statistics
- Multi-account support with intelligent auto-switching
- Signature-based request validation for security

---

### Codex (OpenAI)

> **Full access to OpenAI Codex capabilities**

- **Full Access Sandbox Mode**: Unrestricted filesystem and network access
- **Apply Patch Tool**: Efficient batch file editing with unified diff format
- **Shell Command Execution**: Run terminal commands directly
- **Todo List Management**: Track tasks and plan your work session
- **Thinking Blocks**: View model reasoning in real-time

---

### Advanced Completion

> **Smart code completion features**

- **FIM (Fill In the Middle)**: Intelligent code completion based on context
- **NES (Next Edit Suggestions)**: Predictive editing suggestions
- **Web Search Integration**: Real-time information via ZhipuAI and MiniMax
- **Token Usage Tracking**: Monitor your API usage in real-time

---

## Installation

<details>
<summary><b>From VS Code Marketplace (Recommended)</b></summary>

1. Open **VS Code**
2. Go to Extensions (`Ctrl+Shift+X` / `Cmd+Shift+X`)
3. Search for **"Copilot ++"**
4. Click **Install**

Or visit the Marketplace page directly: [Copilot ++ on Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=OEvortex.better-copilot-chat)

</details>

<details>
<summary><b>From .vsix File</b></summary>

```bash
# Download from releases page, then in VS Code:
# Cmd+Shift+P > "Extensions: Install from VSIX..."
```

</details>

<details>
<summary><b>Build from Source</b></summary>

```bash
git clone https://github.com/OEvortex/better-copilot-chat.git
cd better-copilot-chat
npm install
npm run compile
npm run package
```

</details>

---

## Quick Start

### Step 1: Configure Your Provider

| Provider       | Command                                                 |
| :------------- | :------------------------------------------------------ |
| Antigravity    | `Cmd+Shift+P` → `Antigravity Login`                     |
| Codex          | `Cmd+Shift+P` → `Codex Login`                           |
| ZhipuAI        | `Cmd+Shift+P` → `ZhipuAI Configuration Wizard`          |
| MiniMax        | `Cmd+Shift+P` → `Start MiniMax Configuration Wizard`    |
| MoonshotAI     | `Cmd+Shift+P` → `Start MoonshotAI Configuration Wizard` |
| DeepSeek       | `Cmd+Shift+P` → `Set DeepSeek API Key`                  |
| Custom         | `Cmd+Shift+P` → `Compatible Provider Settings`          |

### Step 2: Add Multiple Accounts _(Optional)_

```
Cmd+Shift+P → "Copilot ++: Manage Accounts"
```

### Step 3: Enable Load Balancing

```
Cmd+Shift+P → "Copilot ++: Open Account Manager"
→ Toggle "Load Balance" for your provider
```

---

## Detailed Guide: Adding Accounts

### How to Add Multiple Accounts

Follow these simple steps to add and manage multiple accounts for any provider:

#### **Step 1: Open Account Manager**

Press `Cmd+Shift+P` (macOS) or `Ctrl+Shift+P` (Windows/Linux) and type:

```
Copilot ++: Open Account Manager
```

<div align="center">
<img src="1.png" alt="Open Account Manager" width="800"/>
</div>

#### **Step 2: Select Your Provider**

Click on the provider you want to add an account for (e.g., ZhipuAI, MiniMax, MoonshotAI, etc.)

<div align="center">
<img src="2.png" alt="Select Provider" width="800"/>
</div>

#### **Step 3: Add New Account**

Click the **"Add Account"** button and enter your account credentials:

- **Account Name**: A friendly name to identify this account
- **API Key**: Your provider's API key
- **Additional Settings**: Provider-specific configurations (if any)

<div align="center">
<img src="3.png" alt="Add Account Details" width="800"/>
</div>

#### **Step 4: Enable Load Balancing (Optional)**

Toggle the **"Load Balance"** switch to enable automatic account switching when rate limits are hit.

<div align="center">
<img src="4.png" alt="Enable Load Balancing" width="800"/>
</div>

### Account Management Features

- **Edit Account**: Click the edit icon to modify account details
- **Delete Account**: Remove accounts you no longer need
- **Switch Account**: Use `Ctrl+Shift+Q` / `Cmd+Shift+Q` for quick switching
- **Load Balance**: Automatically distribute requests across accounts
- **Quota Tracking**: Monitor usage and remaining quota in real-time

---

## Requirements

| Requirement            | Version      |
| :--------------------- | :----------- |
| VS Code                | `>= 1.104.0` |
| Node.js                | `>= 20.0.0`  |
| npm                    | `>= 9.0.0`   |
| GitHub Copilot Chat    | Required     |

---

## Credits

<div align="center">

Special thanks to these amazing projects:

| [<img src="https://github.com/Pimzino.png" width="80" style="border-radius: 50%"/><br/>**LLMux**](https://github.com/Pimzino/LLMux) | [<img src="https://github.com/VicBilibily.png" width="80" style="border-radius: 50%"/><br/>**GCMP**](https://github.com/VicBilibily/GCMP) | [<img src="https://github.com/wusimpl.png" width="80" style="border-radius: 50%"/><br/>**AntigravityQuotaWatcher**](https://github.com/wusimpl/AntigravityQuotaWatcher) |
| :---------------------------------------------------------------------------------------------------------------------------------: | :---------------------------------------------------------------------------------------------------------------------------------------: | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------: |

</div>

---

## � Support & Contact

<div align="center">

### Get in Touch

Have questions or suggestions? Reach out on Telegram:

[![Telegram](https://img.shields.io/badge/Telegram-@bie9999-2CA5E0?style=for-the-badge&logo=telegram&logoColor=white)](https://t.me/bie9999)

</div>

---

## �📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

---

<div align="center">

### Made with love for the developer community

**[Back to Top](#copilot-helper-pro)**

</div>
