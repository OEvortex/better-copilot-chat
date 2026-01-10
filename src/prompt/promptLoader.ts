/*---------------------------------------------------------------------------------------------
 *  Prompt Loader
 *  Loads prompt instructions from files in the prompt folder.
 *  Uses raw imports to bundle prompts directly into the extension.
 *--------------------------------------------------------------------------------------------*/

// @ts-expect-error - raw imports are handled by esbuild plugin
import codexDefaultInstructions from "./codex_default_instructions.txt?raw";
// @ts-expect-error - raw imports are handled by esbuild plugin
import codexVscodeToolsInstructions from "./codex_vscode_tools_instructions.txt?raw";
// Import prompts as raw strings (bundled at build time)
// @ts-expect-error - raw imports are handled by esbuild plugin
import gpt52Prompt from "./gpt_5_2_prompt.txt?raw";
// @ts-expect-error - raw imports are handled by esbuild plugin
import codexInstructions from "./gpt_5_codex_instructions.txt?raw";

/**
 * Load GPT 5.2 instructions
 */
export function loadGpt52Instructions(): string {
	return gpt52Prompt;
}

/**
 * Load Codex (GPT-5) instructions
 */
export function loadCodexInstructions(): string {
	return codexInstructions;
}

/**
 * Load Codex default instructions
 */
export function loadCodexDefaultInstructions(): string {
	return codexDefaultInstructions;
}

/**
 * Load Codex VS Code tools instructions
 * This prompt guides Codex to use VS Code native tools instead of Codex CLI tools
 */
export function loadCodexVscodeToolsInstructions(): string {
	return codexVscodeToolsInstructions;
}

/**
 * Clear the prompt cache (no-op since prompts are bundled)
 */
export function clearPromptCache(): void {
	// No-op - prompts are bundled at build time
}

/**
 * Reload all prompts (no-op since prompts are bundled)
 */
export function reloadPrompts(): void {
	// No-op - prompts are bundled at build time
}
