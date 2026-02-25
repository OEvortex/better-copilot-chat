import type { ProviderCategory } from "./providerKeys";

export type ProviderConfigFieldType =
	| "text"
	| "password"
	| "url"
	| "number"
	| "boolean"
	| "select";

export interface ProviderConfigFieldOption {
	label: string;
	value: string;
}

export interface ProviderConfigField {
	id: string;
	label: string;
	description?: string;
	type: ProviderConfigFieldType;
	required?: boolean;
	placeholder?: string;
	defaultValue?: string | number | boolean;
	options?: ProviderConfigFieldOption[];
}

export interface ProviderWizardStep {
	id: string;
	title: string;
	description?: string;
	fields: ProviderConfigField[];
}

export interface ProviderRuntimeConfig {
	apiKey?: string;
	baseUrl?: string;
	endpoint?: string;
	plan?: string;
	thinking?: "enabled" | "disabled" | "auto";
	options?: Record<string, unknown>;
}

export interface ProviderFormSchema {
	providerId: string;
	category: ProviderCategory;
	fields: ProviderConfigField[];
	wizardSteps: ProviderWizardStep[];
}

export interface ProviderSettingsProfile {
	id: string;
	name: string;
	createdAt: string;
	updatedAt: string;
	providers: Record<string, ProviderRuntimeConfig>;
}
