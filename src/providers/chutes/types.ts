export interface ChutesModelItem {
	id: string;
	root: string;
	object: string;
	created: number;
	owned_by: string;
	price?: {
		input: { tao: number; usd: number };
		output: { tao: number; usd: number };
	};
	pricing?: {
		prompt: number;
		completion: number;
	};
	chute_id?: string;
	quantization?: string;
	max_model_len?: number;
	context_length?: number;
	input_modalities?: string[];
	max_output_length?: number;
	output_modalities?: string[];
	supported_features?: string[];
	confidential_compute?: boolean;
	supported_sampling_parameters?: string[];
	permission?: Array<{
		id: string;
		group: string | null;
		object: string;
		created: number;
		allow_view: boolean;
		is_blocking: boolean;
		organization: string;
		allow_logprobs: boolean;
		allow_sampling: boolean;
		allow_fine_tuning: boolean;
		allow_create_engine: boolean;
		allow_search_indices: boolean;
	}>;
}

export interface ChutesModelsResponse {
	object: string;
	data: ChutesModelItem[];
}

// Re-export OpenAI types for compatibility
export interface OpenAIToolCall {
	id: string;
	type: "function";
	function: { name: string; arguments: string };
}

export interface OpenAIFunctionToolDef {
	type: "function";
	function: { name: string; description?: string; parameters?: object };
}

export interface OpenAIChatMessage {
	role: OpenAIChatRole;
	content?: string;
	name?: string;
	tool_calls?: OpenAIToolCall[];
	tool_call_id?: string;
}

export type OpenAIChatRole = "system" | "user" | "assistant" | "tool";
