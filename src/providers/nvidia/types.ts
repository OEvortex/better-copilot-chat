export interface NvidiaModelMetadata {
	context_length?: number;
	max_tokens?: number;
	input_modalities?: string[];
	modalities?: string[];
}

export interface NvidiaModelItem {
	id: string;
	object?: string;
	created?: number;
	owned_by?: string;
	type?: string;
	context_length?: number;
	max_tokens?: number;
	input_modalities?: string[];
	metadata?: NvidiaModelMetadata | null;
}

export interface NvidiaModelsResponse {
	object?: string;
	data?: NvidiaModelItem[];
	models?: NvidiaModelItem[];
}
