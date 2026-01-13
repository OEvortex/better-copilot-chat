export interface ZenmuxPricing {
	value: number;
	unit: string;
	currency: string;
	conditions?: {
		prompt_tokens?: {
			unit: string;
			gte?: number;
			lt?: number;
			gt?: number;
			lte?: number;
		};
		completion_tokens?: {
			unit: string;
			gte?: number;
			lt?: number;
		};
	};
}

export interface ZenmuxModelItem {
	id: string;
	object: string;
	display_name?: string;
	created: number;
	owned_by: string;
	input_modalities?: string[];
	output_modalities?: string[];
	capabilities?: {
		reasoning?: boolean;
	};
	context_length?: number;
	pricings?: {
		completion?: ZenmuxPricing[];
		input_cache_read?: ZenmuxPricing[];
		prompt?: ZenmuxPricing[];
		web_search?: ZenmuxPricing[];
		[key: string]: ZenmuxPricing[] | undefined;
	};
}

export interface ZenmuxModelsResponse {
	object: string;
	data: ZenmuxModelItem[];
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
