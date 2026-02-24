export interface KiloModelItem {
	id: string;
	name: string;
	created: number;
	description: string;
	architecture: {
		input_modalities: string[];
		output_modalities: string[];
		tokenizer: string;
	};
	top_provider: {
		is_moderated: boolean;
		context_length: number;
		max_completion_tokens: number;
	};
	pricing: {
		prompt: string;
		completion: string;
		request: string;
		image: string;
		web_search: string;
		internal_reasoning: string;
	};
	context_length: number;
	supported_parameters: string[];
	preferredIndex: number;
}

export interface KiloModelsResponse {
	data: KiloModelItem[];
}
