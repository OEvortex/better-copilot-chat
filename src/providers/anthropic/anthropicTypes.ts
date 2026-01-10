/*---------------------------------------------------------------------------------------------
 *  Anthropic Types
 *  Type definitions for Anthropic provider
 *--------------------------------------------------------------------------------------------*/

// Custom data part MIME types
export const CustomDataPartMimeTypes = {
	CacheControl: "cache_control",
} as const;

export interface AnthropicMessageConverterOptions {
	includeThinking?: boolean;
}
