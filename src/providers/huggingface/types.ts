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

export interface HFProvider {
	provider: string;
	status: string;
	supports_tools?: boolean;
	supports_structured_output?: boolean;
	context_length?: number;
}

export interface HFArchitecture {
	input_modalities?: string[];
	output_modalities?: string[];
}

export interface HFModelItem {
	id: string;
	object: string;
	created: number;
	owned_by: string;
	providers: HFProvider[];
	architecture?: HFArchitecture;
}

export interface HFExtraModelInfo {
	id: string;
	pipeline_tag?: string;
}

export interface HFModelsResponse {
	object: string;
	data: HFModelItem[];
}

export interface ToolCallBuffer {
	id?: string;
	name?: string;
	args: string;
}

export type OpenAIChatRole = "system" | "user" | "assistant" | "tool";
