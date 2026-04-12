/**
 * @license
 * Copyright 2026 OEvortex
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useCallback, useContext, useMemo, useState } from 'react';
import { Box, Text } from 'ink';
import {
    AuthType,
    ModelSlashCommandEvent,
    logModelSlashCommand,
    type ContentGeneratorConfig,
    type InputModalities,
} from '@aether/aether-core';
import { useKeypress } from '../hooks/useKeypress.js';
import { theme } from '../semantic-colors.js';
import { DescriptiveRadioButtonSelect } from './shared/DescriptiveRadioButtonSelect.js';
import { ConfigContext } from '../contexts/ConfigContext.js';
import { UIStateContext, type UIState } from '../contexts/UIStateContext.js';
import { useSettings } from '../contexts/SettingsContext.js';
import { getPersistScopeForModelSelection } from '../../config/modelProvidersScope.js';
import { t } from '../../i18n/index.js';

function formatModalities(modalities?: InputModalities): string {
    if (!modalities) return t('text-only');
    const parts: string[] = [];
    if (modalities.image) parts.push(t('image'));
    if (modalities.pdf) parts.push(t('pdf'));
    if (modalities.audio) parts.push(t('audio'));
    if (modalities.video) parts.push(t('video'));
    if (parts.length === 0) return t('text-only');
    return `${t('text')} · ${parts.join(' · ')}`;
}

interface ModelDialogProps {
    onClose: () => void;
    isFastModelMode?: boolean;
}

function maskApiKey(apiKey: string | undefined): string {
    if (!apiKey) return `(${t('not set')})`;
    const trimmed = apiKey.trim();
    if (trimmed.length === 0) return `(${t('not set')})`;
    if (trimmed.length <= 6) return '***';
    const head = trimmed.slice(0, 3);
    const tail = trimmed.slice(-4);
    return `${head}…${tail}`;
}

function persistModelSelection(
    settings: ReturnType<typeof useSettings>,
    modelId: string,
): void {
    const scope = getPersistScopeForModelSelection(settings);
    settings.setValue(scope, 'model.name', modelId);
}

function persistAuthTypeSelection(
    settings: ReturnType<typeof useSettings>,
    authType: AuthType,
): void {
    const scope = getPersistScopeForModelSelection(settings);
    settings.setValue(scope, 'security.auth.selectedType', authType);
}

interface HandleModelSwitchSuccessParams {
    settings: ReturnType<typeof useSettings>;
    uiState: UIState | null;
    after: ContentGeneratorConfig | undefined;
    effectiveAuthType: AuthType | undefined;
    effectiveModelId: string;
    isRuntime: boolean;
    sdkMode?: string;
}

function handleModelSwitchSuccess({
    settings,
    uiState,
    after,
    effectiveAuthType,
    effectiveModelId,
    isRuntime,
    sdkMode,
}: HandleModelSwitchSuccessParams): void {
    persistModelSelection(settings, effectiveModelId);
    if (effectiveAuthType) {
        persistAuthTypeSelection(settings, effectiveAuthType);
    }

    const baseUrl = after?.baseUrl ?? t('(default)');
    const maskedKey = maskApiKey(after?.apiKey);
    uiState?.historyManager.addItem(
        {
            type: 'info',
            text:
                `sdkMode: ${sdkMode ?? effectiveAuthType ?? `(${t('none')})`}` +
                `\n` +
                `Using ${isRuntime ? 'runtime ' : ''}model: ${effectiveModelId}` +
                `\n` +
                `Base URL: ${baseUrl}` +
                `\n` +
                `API key: ${maskedKey}`,
        },
        Date.now(),
    );
}

function formatContextWindow(size?: number): string {
    if (!size) return `(${t('unknown')})`;
    return `${size.toLocaleString('en-US')} tokens`;
}

function fuzzyMatch(query: string, text: string): boolean {
    if (!query) return true;
    const lowerQuery = query.toLowerCase();
    const lowerText = text.toLowerCase();

    let queryIndex = 0;
    let textIndex = 0;

    while (queryIndex < lowerQuery.length && textIndex < lowerText.length) {
        if (lowerQuery[queryIndex] === lowerText[textIndex]) {
            queryIndex++;
        }
        textIndex++;
    }

    return queryIndex === lowerQuery.length;
}

function DetailRow({
    label,
    value,
}: {
    label: string;
    value: React.ReactNode;
}): React.JSX.Element {
    return (
        <Box>
            <Box minWidth={16} flexShrink={0}>
                <Text color={theme.text.secondary}>{label}:</Text>
            </Box>
            <Box flexGrow={1} flexDirection="row" flexWrap="wrap">
                <Text>{value}</Text>
            </Box>
        </Box>
    );
}

export function ModelDialog({
    onClose,
    isFastModelMode,
}: ModelDialogProps): React.JSX.Element {
    const config = useContext(ConfigContext);
    const uiState = useContext(UIStateContext);
    const settings = useSettings();

    // Local error state for displaying errors within the dialog
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [highlightedValue, setHighlightedValue] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState<string>('');

    const authType = config?.getContentGeneratorConfig()?.authType ?? config?.getAuthType();
    const selectedProvider = settings.merged.security?.auth?.selectedProvider;

    const availableModelEntries = useMemo(() => {
        if (!config || !authType) {
            return [];
        }

        // Defensive: ensure all models have provider property
        const models = config.getAvailableModelsForAuthType(authType).map((model) => {
            if (!model.provider && selectedProvider) {
                return { ...model, provider: selectedProvider };
            }
            return model;
        });

        if (!selectedProvider) {
            return models;
        }

        return models.filter(
            (model) => model.provider === selectedProvider || model.isRuntimeModel,
        );
    }, [authType, config, selectedProvider]);

    const MODEL_OPTIONS = useMemo(
        () =>
            availableModelEntries
                .filter((model) => {
                    if (!searchQuery) return true;
                    const searchText = `${model.label} ${model.description || ''}`;
                    return fuzzyMatch(searchQuery, searchText);
                })
                .map((model) => {
                    const value = model.runtimeSnapshotId ?? model.id;
                    const title = (
                        <Text>
                            <Text
                                bold
                                color={
                                    model.isRuntimeModel ? theme.status.warning : theme.text.accent
                                }
                            >
                                {model.label}
                            </Text>
                            {model.isRuntimeModel && (
                                <Text color={theme.status.warning}> (Runtime)</Text>
                            )}
                        </Text>
                    );

                    const description = model.isRuntimeModel
                        ? model.description
                            ? `${model.description} (Runtime)`
                            : 'Runtime model'
                        : model.description || '';

                    return {
                        value,
                        title,
                        description,
                        key: value,
                    };
                }),
        [availableModelEntries],
    );

    // In fast model mode, default to the currently configured fast model
    const fastModelSetting = settings?.merged?.fastModel as string | undefined;
    const preferredModelId =
        isFastModelMode && fastModelSetting
            ? fastModelSetting
            : config?.getModel() || '';
    // Check if current model is a runtime model
    // Runtime snapshot ID is already in $runtime|${authType}|${modelId} format
    const activeRuntimeSnapshot = isFastModelMode
        ? undefined // fast model is never a runtime model
        : config?.getActiveRuntimeModelSnapshot?.();
    const preferredKey = activeRuntimeSnapshot
        ? activeRuntimeSnapshot.id
        : preferredModelId;

    useKeypress(
        (key) => {
            if (key.name === 'escape') {
                onClose();
            } else if (key.name === 'backspace') {
                setSearchQuery((prev) => prev.slice(0, -1));
            } else if (key.sequence && key.sequence.length === 1) {
                // Handle regular character input
                setSearchQuery((prev) => prev + key.sequence);
            }
        },
        { isActive: true },
    );

    const initialIndex = useMemo(() => {
        const index = MODEL_OPTIONS.findIndex(
            (option) => option.value === preferredKey,
        );
        return index === -1 ? 0 : index;
    }, [MODEL_OPTIONS, preferredKey]);

    const handleHighlight = useCallback((value: string) => {
        setHighlightedValue(value);
    }, []);

    const highlightedEntry = useMemo(() => {
        const key = highlightedValue ?? preferredKey;
        return availableModelEntries.find((model) => {
            const value = model.runtimeSnapshotId ?? model.id;
            return value === key;
        });
    }, [highlightedValue, preferredKey, availableModelEntries]);

    const handleSelect = useCallback(
        async (selected: string) => {
            setErrorMessage(null);

            // Fast model mode: just save the model ID and close
            if (isFastModelMode) {
                const modelId = selected;
                const scope = getPersistScopeForModelSelection(settings);
                settings.setValue(scope, 'fastModel', modelId);
                uiState?.historyManager.addItem(
                    {
                        type: 'success',
                        text: `${t('Fast Model')}: ${modelId}`,
                    },
                    Date.now(),
                );
                onClose();
                return;
            }

            let after: ContentGeneratorConfig | undefined;
            let effectiveAuthType: AuthType | undefined;
            let effectiveModelId = selected;
            let isRuntime = false;
            let sdkMode: string | undefined;

            if (!config) {
                onClose();
                return;
            }

            try {
                isRuntime = selected.startsWith('$runtime|');
                const selectedAuthType = authType ?? AuthType.USE_OPENAI;
                const modelId = selected;

                await config.switchModel(
                    selectedAuthType,
                    modelId,
                    undefined,
                );

                if (!isRuntime) {
                    const event = new ModelSlashCommandEvent(modelId);
                    logModelSlashCommand(config, event);
                }

                after = config.getContentGeneratorConfig?.() as
                    | ContentGeneratorConfig
                    | undefined;
                effectiveAuthType = after?.authType ?? selectedAuthType ?? authType;
                effectiveModelId = after?.model ?? modelId;

                // Get sdkMode from resolved model config
                const resolvedModel = config.getModelsConfig().getResolvedModel(
                    effectiveAuthType ?? selectedAuthType,
                    effectiveModelId,
                );
                sdkMode = resolvedModel?.sdkMode;
            } catch (e) {
                const baseErrorMessage = e instanceof Error ? e.message : String(e);
                const errorPrefix = isRuntime
                    ? 'Failed to switch to runtime model.'
                    : `Failed to switch model to '${effectiveModelId ?? selected}'.`;
                setErrorMessage(`${errorPrefix}\n\n${baseErrorMessage}`);
                return;
            }

            handleModelSwitchSuccess({
                settings,
                uiState,
                after,
                effectiveAuthType,
                effectiveModelId,
                isRuntime,
                sdkMode: sdkMode,
            });
            onClose();
        },
        [
            authType,
            config,
            onClose,
            settings,
            uiState,
            setErrorMessage,
            isFastModelMode,
        ],
    );

    const hasModels = MODEL_OPTIONS.length > 0;

    return (
        <Box
            borderStyle="round"
            borderColor={theme.border.default}
            flexDirection="column"
            padding={1}
            width="100%"
        >
            <Text bold>{t('Select Model')}</Text>

            <Box marginTop={1}>
                <Text color={theme.text.secondary}>Search: </Text>
                <Text color={theme.text.accent}>{searchQuery || t('Type to filter models...')}</Text>
                <Text color={theme.text.secondary}>_</Text>
            </Box>

            {!hasModels ? (
                <Box marginTop={1} flexDirection="column">
                    <Text color={theme.status.warning}>
                        {t(
                            'No models available for the current provider ({{authType}}).',
                            {
                                authType: authType ? String(authType) : t('(none)'),
                            },
                        )}
                    </Text>
                    <Box marginTop={1}>
                        <Text color={theme.text.secondary}>
                            {t(
                                'Please configure models in settings.modelProviders or use environment variables.',
                            )}
                        </Text>
                    </Box>
                </Box>
            ) : (
                <Box marginTop={1}>
                    <DescriptiveRadioButtonSelect
                        items={MODEL_OPTIONS}
                        onSelect={handleSelect}
                        onHighlight={handleHighlight}
                        initialIndex={initialIndex}
                        showNumbers={true}
                    />
                </Box>
            )}

            {highlightedEntry && (
                <Box marginTop={1} flexDirection="column">
                    <Box
                        borderStyle="single"
                        borderTop
                        borderBottom={false}
                        borderLeft={false}
                        borderRight={false}
                        borderColor={theme.border.default}
                    />
                    <DetailRow
                        label={t('Modality')}
                        value={formatModalities(highlightedEntry.modalities)}
                    />
                    <DetailRow
                        label={t('Context Window')}
                        value={formatContextWindow(highlightedEntry.contextWindowSize)}
                    />
                    <DetailRow
                        label="Base URL"
                        value={highlightedEntry.baseUrl ?? t('(default)')}
                    />
                    <DetailRow
                        label="API Key"
                        value={highlightedEntry.provider && (settings.merged.providers as Record<string, any>)?.[highlightedEntry.provider]?.apiKey ? t('configured') : t('(not set)')}
                    />
                </Box>
            )}

            {errorMessage && (
                <Box marginTop={1} flexDirection="column" paddingX={1}>
                    <Text color={theme.status.error} wrap="wrap">
                        ✕ {errorMessage}
                    </Text>
                </Box>
            )}

            <Box marginTop={1} flexDirection="column">
                <Text color={theme.text.secondary}>
                    {t('Enter to select, ↑↓ to navigate, Esc to close, Type to search')}
                </Text>
            </Box>
        </Box>
    );
}
