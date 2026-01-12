Tasks (implement in order chosen by subagent):

1. Add a command `chp.geminicli.invoke` that accepts a prompt string and programmatically invokes the Gemini CLI participant: focus chat, insert `@gemini <prompt>` into input, and submit/send the request in a reliable way.

2. Add a programmatic API function (exported from the provider) that other extensions can import and call to invoke geminicli directly (wrap the command from #1).

3. Implement subagent delegation handling in Gemini: support a tool with name `delegate_to_agent` or detect delegate requests from Gemini that specify an agent_name and route the delegation using the chat API (so an agent or model can ask Gemini to call another agent), and ensure Gemini itself can be invoked as a subagent via the RunSubagent flow.

4. Add automated tests for:
   - @gemini user invocation (parsing + end-to-end within extension test harness)
   - Programmatic command invocation using `chp.geminicli.invoke` and the exported API
   - Delegation via `delegate_to_agent` tool (simulate a tool call delegating to geminicli)

5. Add docs: update README or add a docs/usage.md showing how to invoke geminicli by @name, via the command, and via subagent delegation.

6. Update CHANGELOG and bump version to 0.1.5 with the new entries.
