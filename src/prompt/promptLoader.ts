/*---------------------------------------------------------------------------------------------
 *  Prompt Loader
 *  Loads prompt instructions from files in the prompt folder.
 *  Uses raw imports to bundle prompts directly into the extension.
 *--------------------------------------------------------------------------------------------*/

import gpt52Prompt from "./gpt_5_2_prompt.txt?raw";

/**
 * Load GPT 5.2 instructions
 */
export function loadGpt52Instructions(): string {
	return gpt52Prompt;
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
