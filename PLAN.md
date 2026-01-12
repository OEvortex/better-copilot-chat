Goal: Make the Gemini CLI chat participant (geminicli) usable in all supported delegation/invocation flows in this extension and in VS Code Chat:

- User-facing invocation: allow users to delegate to geminicli with @gemini at the start of a chat message and receive responses as normal.
- Programmatic invocation: provide a stable API/command so other extensions/code can invoke geminicli programmatically (send a prompt and get a response) without requiring manual UI interaction.
- Subagent delegation: support programmatic delegation so other agents/models can delegate to geminicli using the RunSubagent tool or equivalent tool-calling mechanism (implement a delegate_to_agent tool integration if needed).

Non-functional requirements:
- Add tests (unit/integration) covering the three invocation flows.
- Ensure linter/build pass (`npm run lint`, `npm run compile:dev`).
- Update PROGRESS.md as each task completes and commit changes with concise conventional commits.

Deliverables:
- Code changes implementing features above.
- Tests validating behavior.
- Documentation/README snippet describing how to invoke geminicli in each method.
- Changelog entry for 0.1.6 (or next version).
