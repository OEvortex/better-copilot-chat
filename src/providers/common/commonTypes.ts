/*---------------------------------------------------------------------------------------------
 *  Common Provider Types
 *  Shared type definitions used across multiple providers
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from "vscode";
import type { ModelConfig } from "../../types/sharedTypes";

/**
 * Options for processing streaming responses
 * Used by both OpenAI and Gemini stream processors
 */
export interface ProcessStreamOptions {
	response: Response;
	modelConfig: ModelConfig;
	progress: vscode.Progress<vscode.LanguageModelResponsePart2>;
	token: vscode.CancellationToken;
}
