export interface DeepInfraModel {
    id: string;
    created?: number;
    object?: string;
    owned_by?: string;
    root?: string;
    parent?: string | null;
    metadata?: {
        description?: string | null;
        context_length?: number | null;
        max_tokens?: number | null;
        pricing?: Record<string, number> | null;
        tags?: string[] | null;
    } | null;
}

export type DeepInfraModelsResponse = DeepInfraModel[];
