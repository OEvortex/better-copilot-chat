export interface DeepInfraModelMetadata {
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

export interface DeepInfraModelItem {
	id: string;
	object: string;
	created: number;
	owned_by: string;
	root: string;
	parent: string | null;
	metadata: DeepInfraModelMetadata | null;
}

export interface DeepInfraModelsResponse {
	object: string;
	data: DeepInfraModelItem[];
}
