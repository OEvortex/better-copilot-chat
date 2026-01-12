# Gemini CLI programmatic API

This module exposes two helper functions for programmatic invocation of the Gemini CLI integration:

- invokeViaCommand(prompt?: string, executor?): Promise<void>
  - Wraps the `chp.geminicli.invoke` command and is intended for other extensions or internal code that prefer using the VS Code command stack. You can provide an `executor` function for testing or to bypass `vscode.commands.executeCommand`.

- invokeDirect(prompt: string, opts?: InvokeDirectOptions): Promise<string>
  - Directly invokes the Gemini CLI via the ACP client (no UI). Useful when you need to send a prompt and get the text response programmatically. Accepts an optional `acpClientFactory` for injection/testing and supports an `onChunk` callback to receive streaming chunks.

Example (direct):

```js
const { invokeDirect } = require('chp').providers.geminicli; // or import from 'src/providers/geminicli'
const resp = await invokeDirect('Say hello');
console.log(resp);
```

Example (via command):

```js
const { invokeViaCommand } = require('chp').providers.geminicli;
await invokeViaCommand('Explain the observer pattern');
```

The APIs are exported from `src/providers/geminicli/index.ts` and are stable for other extensions to consume.
