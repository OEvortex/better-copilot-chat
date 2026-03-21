export interface SeraphynContentPartText {
    type: 'text';
    text: string;
}

export interface SeraphynContentPartImageUrl {
    type: 'image_url';
    image_url: {
        url: string;
    };
}

export type SeraphynContentPart =
    | SeraphynContentPartText
    | SeraphynContentPartImageUrl;

export interface SeraphynToolDefinition {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    };
}

export interface SeraphynModelResponseItem {
    id: string;
    object?: string;
    created?: number;
    owned_by?: string;
    [key: string]: unknown;
}

export interface SeraphynModelsResponse {
    data?: SeraphynModelResponseItem[];
    [key: string]: unknown;
}
