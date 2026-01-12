# Gemini CLI Usage Guide

The Gemini CLI integration in Copilot ++ allows you to interact with Google's Gemini models using the Agent Communication Protocol (ACP). This guide covers the three main ways to invoke Gemini CLI.

## 1. Chat Participant (@gemini)

The most common way to use Gemini CLI is directly in the VS Code Chat panel.

1. Open the Chat panel (`Ctrl+Shift+I` or `Cmd+Shift+I`).
2. Type `@gemini` followed by your prompt.
3. Gemini CLI will respond with streaming text, thinking blocks, and can even use tools (like reading files or running shell commands) if supported by your installed version of `gemini`.

Example:
```
@gemini explain how the authentication logic works in this project
```

## 2. Programmatic API

You can invoke Gemini CLI from other extensions or from within the Copilot ++ codebase using the exported API.

### Direct Invocation (No UI)

Use `invokeDirect` when you want to get a text response without involving the VS Code Chat UI.

```typescript
import { invokeDirect } from 'src/providers/geminicli/api';

const response = await invokeDirect('Write a python script to sort a list');
console.log(response);
```

### Command Invocation (UI-based)

Use `invokeViaCommand` to programmatically trigger the `@gemini` chat participant. This will focus the chat panel and submit the prompt as if the user typed it.

```typescript
import { invokeViaCommand } from 'src/providers/geminicli/api';

await invokeViaCommand('Refactor the current file to use async/await');
```

## 3. Subagent Delegation

Gemini CLI supports the `delegate_to_agent` tool, which allows other AI models (like GPT-5 or Claude) to delegate complex tasks to Gemini.

### How it works:
1. A model (e.g., Codex/GPT-5) decides it needs Gemini's help.
2. It calls the `delegate_to_agent` tool with `agent_name: "gemini"` and a `prompt`.
3. Copilot ++ intercepts this call and routes it to the Gemini CLI chat participant.
4. Gemini's response is then provided back to the original model or displayed in the chat.

### Manual Delegation via Command:
You can also manually trigger a delegation-like flow using the `chp.geminicli.invoke` command from the Command Palette:
1. Press `Ctrl+Shift+P` or `Cmd+Shift+P`.
2. Search for `Copilot ++: Invoke Gemini CLI Chat`.
3. Enter your prompt.

---

## Troubleshooting

- **Gemini CLI not found**: Ensure you have installed the Gemini CLI globally:
  ```bash
  npm install -g @google/gemini-cli
  ```
- **Authentication**: You must be logged in to Gemini CLI. Run:
  ```bash
  gemini auth login
  ```
- **ACP Support**: This integration requires a version of Gemini CLI that supports the Agent Communication Protocol (usually invoked with `--experimental-acp`).
