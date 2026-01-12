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

export interface KiloModelItem {
	id: string;
	name: string;
	created?: number;
	description?: string;
	context_length?: number;
	architecture?: {
		modality?: string;
		input_modalities?: string[];
		output_modalities?: string[];
		tokenizer?: string;
		instruct_type?: string | null;
	};
	top_provider?: {
		is_moderated?: boolean;
		context_length?: number;
		max_completion_tokens?: number | null;
	};
	pricing?: {
		prompt?: string;
		completion?: string;
		request?: string;
		image?: string;
		web_search?: string;
		internal_reasoning?: string;
	};
	supported_parameters?: string[];
}

export interface KiloModelsResponse {
	data: KiloModelItem[];
}
