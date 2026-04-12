import { AuthType } from '@aether/aether-core';
import { describe, expect, it } from 'vitest';
import {
    buildProviderModelProvidersConfig,
    buildStoredProviderConfig,
    getStoredProviderApiKey,
    shouldPromptForProviderApiKey
} from './providerSelection.js';

describe('providerSelection', () => {
    it('builds a stored provider config that preserves the provider catalog shape', () => {
        const provider = buildStoredProviderConfig(
            'apertis',
            'test-api-key',
            'https://override.example/v1'
        );

        expect(provider).toEqual({
            displayName: 'Apertis AI',
            family: 'Apertis AI',
            supportsApiKey: true,
            apiKeyTemplate: 'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
            openai: {
                baseUrl: 'https://api.apertis.ai/v1'
            },
            anthropic: {
                baseUrl: 'https://api.apertis.ai'
            },
            responses: {
                baseUrl: 'https://api.apertis.ai/v1'
            },
            openModelEndpoint: false,
            sdkMode: 'openai',
            fetchModels: true,
            modelsEndpoint: '/models',
            modelParser: {
                arrayPath: 'data',
                descriptionField: 'id',
                cooldownMinutes: 10
            },
            baseUrl: 'https://override.example/v1',
            apiKey: 'test-api-key'
        });
    });

    it('keeps runtime model-provider generation keyed by auth type', () => {
        const modelProviders = buildProviderModelProvidersConfig('apertis');

        expect(modelProviders?.[AuthType.USE_OPENAI]?.[0]).toMatchObject({
            id: 'apertis',
            name: 'Apertis AI',
            provider: 'apertis',
            sdkMode: 'openai',
            baseUrl: 'https://api.apertis.ai/v1',
            fetchModels: true,
            modelsEndpoint: '/models'
        });
    });

    it('uses the static mistral model list when fetchModels is false', () => {
        const modelProviders = buildProviderModelProvidersConfig('mistral');

        expect(modelProviders?.[AuthType.USE_OPENAI]).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: 'devstral-small-latest',
                    name: 'Devstral Small 2',
                    provider: 'mistral',
                    baseUrl: 'https://api.mistral.ai/v1',
                    fetchModels: false
                })
            ])
        );
    });

    it('returns undefined for a missing or blank stored provider apiKey', () => {
        expect(
            getStoredProviderApiKey('apertis', {
                merged: {
                    providers: {
                        apertis: {
                            displayName: 'Apertis AI',
                            family: 'Apertis AI',
                            apiKey: '   '
                        }
                    }
                }
            })
        ).toBeUndefined();

        expect(
            getStoredProviderApiKey('apertis', {
                merged: {
                    providers: {
                        apertis: {
                            displayName: 'Apertis AI',
                            family: 'Apertis AI',
                            apiKey: 'saved-api-key'
                        }
                    }
                }
            })
        ).toBe('saved-api-key');
    });

    it('prompts for api key when provider supports keys but none is stored', () => {
        expect(
            shouldPromptForProviderApiKey('apertis', {
                merged: {
                    providers: {}
                }
            })
        ).toBe(true);

        expect(
            shouldPromptForProviderApiKey('chatjimmy', {
                merged: {
                    providers: {}
                }
            })
        ).toBe(false);
    });

    it('prompts for api key for NVIDIA NIM when none is stored', () => {
        expect(
            shouldPromptForProviderApiKey('nvidia', {
                merged: {
                    providers: {}
                }
            })
        ).toBe(true);
    });
});