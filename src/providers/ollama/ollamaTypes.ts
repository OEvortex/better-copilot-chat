export interface OpenAIModelItem {
	id: string;
	object?: string;
	created?: number;
	owned_by?: string;
	context_length?: number;
	max_output_length?: number;
	input_modalities?: string[];
}

export interface OpenAIModelsResponse {
	object?: string;
	data: OpenAIModelItem[];
}

export interface OllamaTagModel {
	name: string;
	model: string;
	modified_at?: string;
	size?: number;
	digest?: string;
	details?: {
		parent_model?: string;
		format?: string;
		family?: string;
		families?: string[];
		parameter_size?: string;
		quantization_level?: string;
	};
}

export interface OllamaTagsResponse {
	models: OllamaTagModel[];
}
