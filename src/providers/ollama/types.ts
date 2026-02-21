export interface OllamaModelMetadata {
	description?: string;
	context_length?: number;
	max_tokens?: number;
	pricing?: {
		input_tokens: number;
		output_tokens: number;
		cache_read_tokens?: number;
	};
	tags?: string[];
}

export interface OllamaModelItem {
	id: string;
	object: string;
	created: number;
	owned_by: string;
	root: string;
	parent: string | null;
	metadata: OllamaModelMetadata | null;
}

export interface OllamaModelsResponse {
	object: string;
	data: OllamaModelItem[];
}
