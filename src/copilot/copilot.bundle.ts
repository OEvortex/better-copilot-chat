/*---------------------------------------------------------------------------------------------
 *  Copilot Bundle - Lazy loading entry point
 *
 *  This file serves as an independent bundle entry point, containing heavy dependencies like @vscode/chat-lib.
 *  Dynamically loaded by InlineCompletionShim on first inline completion trigger.
 *
 *  Build output: dist/copilot.bundle.js
 *--------------------------------------------------------------------------------------------*/

// Export complete InlineCompletionProvider
export { InlineCompletionProvider } from "./completionProvider";
