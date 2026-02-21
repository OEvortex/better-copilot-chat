# ChatJimmy FIM Provider - User Guide

## Overview

The **ChatJimmy FIM Provider** is a Fill-In-the-Middle code completion provider that uses the free ChatJimmy API. It enables fast, free inline code completions in VS Code directly from the ChatJimmy service.

## Quick Start

### 1. Enable FIM Completion

Open VS Code settings (`Ctrl+,` or `Cmd+,`) and add the following configuration:

```json
{
    "chp.fimCompletion.enabled": true,
    "chp.fimCompletion.debounceMs": 500,
    "chp.fimCompletion.timeoutMs": 5000,
    "chp.fimCompletion.modelConfig": {
        "provider": "chatjimmy",
        "baseUrl": "https://chatjimmy.ai/api",
        "model": "llama3.1-8B",
        "maxTokens": 200
    }
}
```

### 2. Start Typing

Begin typing code in any file. After 500ms of inactivity (debounce), if the cursor is at the end of a line, you'll see a completion suggestion appear.

### 3. Accept Completions

- **Accept**: Press `Tab` to insert the suggestion
- **Dismiss**: Press `Escape` or just keep typing
- **Cycle**: Press `Alt+]` to see next suggestion

## Configuration

### Essential Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `chp.fimCompletion.enabled` | `false` | Enable/disable FIM completions |
| `chp.fimCompletion.debounceMs` | `500` | Delay before requesting completion (ms) |
| `chp.fimCompletion.timeoutMs` | `5000` | API request timeout (ms) |
| `chp.fimCompletion.modelConfig.provider` | - | Must be `"chatjimmy"` |
| `chp.fimCompletion.modelConfig.baseUrl` | - | Must be `"https://chatjimmy.ai/api"` |
| `chp.fimCompletion.modelConfig.model` | - | Model ID (see below) |
| `chp.fimCompletion.modelConfig.maxTokens` | `200` | Max completion length in tokens |

### Available Models

#### **Llama 3.1 8B** (Recommended)
```json
"model": "llama3.1-8B"
```
- **Best for**: High-quality completions, larger code snippets
- **Speed**: Medium
- **Context**: Up to 8K tokens
- **Quality**: Excellent

#### **Llama 2 7B** (Alternative)
```json
"model": "llama2-7B"
```
- **Best for**: Fast completions, quick suggestions
- **Speed**: Fast
- **Context**: Up to 4K tokens
- **Quality**: Good

### Advanced Configuration

```json
{
    "chp.fimCompletion.modelConfig": {
        "provider": "chatjimmy",
        "baseUrl": "https://chatjimmy.ai/api",
        "model": "llama3.1-8B",
        "maxTokens": 200,
        "extraBody": {
            "temperature": 0.7,
            "top_p": 0.9,
            "top_k": 40
        }
    }
}
```

## How It Works

### Completion Flow

```
1. You start typing in editor
       ↓
2. Editor waits for debounceMs (500ms) of inactivity
       ↓
3. System extracts context:
   - PREFIX: Code before cursor
   - SUFFIX: Code after cursor
       ↓
4. Request sent to ChatJimmy API in FIM format:
   <|fim_prefix|>PREFIX<|fim_suffix|>SUFFIX<|fim_middle|>
       ↓
5. API processes and streams response
       ↓
6. You see completion in editor
       ↓
7. Accept with Tab or dismiss with Escape
```

### Request Format

The Fetcher automatically converts the FIM request to ChatJimmy's format:

```json
{
    "messages": [
        {
            "role": "user",
            "content": "<|fim_prefix|>...code before...<|fim_suffix|>...code after...<|fim_middle|>"
        }
    ],
    "chatOptions": {
        "selectedModel": "llama3.1-8B",
        "systemPrompt": "You are a code completion AI. Complete the code between the prefix and suffix markers. Return ONLY the code to fill in the middle, without any explanation.",
        "topK": 8
    },
    "attachment": null
}
```

### Response Handling

ChatJimmy streams responses with optional statistics:

```
The completion text<|stats|>{"done":true,"total_tokens":22}<|stats|>
```

The provider:
1. Extracts the text content
2. Removes stats metadata
3. Returns clean completion to VS Code

## Troubleshooting

### No Completions Appearing

**Check 1: Is FIM enabled?**
```json
"chp.fimCompletion.enabled": true
```

**Check 2: Valid model name?**
- Use `"llama3.1-8B"` or `"llama2-7B"`

**Check 3: Network connection**
- Verify ChatJimmy.ai is accessible
- Check firewall/proxy settings

**Check 4: Cursor position**
- FIM only triggers when cursor is at **end of line**
- Position cursor after code to get completions

**Check 5: Review logs**
- Open VS Code Output panel
- Select "CompletionLogger" from dropdown
- Look for error messages

### Slow Completions

**Timeout too short:**
```json
"chp.fimCompletion.timeoutMs": 10000
```

**Model too slow:**
```json
"model": "llama2-7B"
```

**Token limit too high:**
```json
"maxTokens": 100
```

### Poor Quality Completions

1. **Increase context:**
   - Write more surrounding code
   - Use clear variable/function names

2. **Adjust debounce:**
   ```json
   "debounceMs": 1000
   ```

3. **Try Llama 3.1:**
   ```json
   "model": "llama3.1-8B"
   ```

### API Errors (502, Timeout, etc.)

- ChatJimmy service might be overloaded
- Increase timeout and retry:
  ```json
  "chp.fimCompletion.timeoutMs": 15000
  ```
- Check https://chatjimmy.ai status
- Try again later

## Performance Optimization

### For Fastest Completions
```json
{
    "chp.fimCompletion.debounceMs": 200,
    "chp.fimCompletion.timeoutMs": 3000,
    "chp.fimCompletion.modelConfig": {
        "model": "llama2-7B",
        "maxTokens": 100
    }
}
```

### For Best Quality
```json
{
    "chp.fimCompletion.debounceMs": 500,
    "chp.fimCompletion.timeoutMs": 10000,
    "chp.fimCompletion.modelConfig": {
        "model": "llama3.1-8B",
        "maxTokens": 200
    }
}
```

### For Balanced Performance
```json
{
    "chp.fimCompletion.debounceMs": 500,
    "chp.fimCompletion.timeoutMs": 5000,
    "chp.fimCompletion.modelConfig": {
        "model": "llama3.1-8B",
        "maxTokens": 200
    }
}
```

## Supported Languages

The ChatJimmy models work best with:
- Python
- JavaScript / TypeScript
- Java
- C++
- Go
- Rust
- C#
- And many more!

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Accept Suggestion | `Tab` |
| Dismiss Suggestion | `Escape` |
| Next Suggestion | `Alt+]` |
| Previous Suggestion | `Alt+[` |
| Trigger Manual | `Ctrl+Shift+\` (configurable) |

## FAQ

### Q: Is ChatJimmy free?
**A:** Yes! ChatJimmy is a completely free service. No API key or authentication required.

### Q: Will my code be sent to external servers?
**A:** Yes. Your code prefix and suffix are sent to ChatJimmy.ai to generate completions. Be aware of this if working with sensitive code.

### Q: Can I use this provider for production code?
**A:** Yes, but review all suggestions carefully. AI models can make mistakes.

### Q: How many requests can I make?
**A:** ChatJimmy rate limits aren't officially documented. Be respectful and reasonable with usage.

### Q: What's the context window?
**A:** Depends on the model:
- **Llama 3.1 8B**: ~8K tokens
- **Llama 2 7B**: ~4K tokens

### Q: Can I contribute improvements?
**A:** Yes! The ChatJimmy provider is part of the Copilot++ extension. Contributions welcome!

### Q: How do I report bugs?
**A:** Report issues on the [GitHub repository](https://github.com/OEvortex/better-copilot-chat/issues)

## Architecture Details

The ChatJimmy FIM provider integrates with VS Code's inline completion system:

```
┌─────────────────────┐
│   VS Code Editor    │
└──────────┬──────────┘
           │
    ┌──────▼──────┐
    │    Shim     │ (Lazy loader)
    └──────┬──────┘
           │
┌──────────▼────────────┐
│  Completion Provider  │
└──────┬────────────────┘
       │
   ┌───▼────┐
   │ FIM    │
   │Logic   │
   └───┬────┘
       │
    ┌──▼────┐
    │Fetcher│ (Converts to ChatJimmy format)
    └───┬───┘
        │
┌───────▼──────────────────┐
│ ChatJimmy API            │
│ https://chatjimmy.ai/    │
└────────────────────────────
```

## Related Settings

Other settings that affect FIM:

```json
{
    "chp.temperature": 0.1,      // Global temperature
    "chp.topP": 1.0,              // Global top-p
    "chp.rememberLastModel": true // Remember last selected model
}
```

## Limitations

- **No authentication**: Uses public ChatJimmy API
- **Rate limiting**: Unknown limits, be reasonable
- **Context window**: Limited by model size
- **No tool calling**: FIM for code completion only
- **No image support**: Text-based completions only

## Future Improvements

- [ ] Support for additional ChatJimmy models
- [ ] Custom token limit validation
- [ ] Response caching for duplicate contexts
- [ ] Performance metrics tracking
- [ ] Integration with other code completion providers

## Support

For help with ChatJimmy FIM provider:

1. Check logs: Output > CompletionLogger
2. Review configuration: Verify all settings
3. Test network: Ensure ChatJimmy.ai is accessible
4. Report issues: GitHub issues
5. Ask community: Discussion forums

---

**Happy coding!** 🚀
