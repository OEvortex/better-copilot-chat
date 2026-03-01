/**
 * Ollama Cloud API model format
 * From https://ollama.com/v1/models
 */
export interface OllamaModelItem {
	id: string;
	object: string;
	created: number;
	owned_by: string;
}

export interface OllamaModelsResponse {
	object: string;
	data: OllamaModelItem[];
}
