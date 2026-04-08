/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState } from 'react';
import { Box, Text } from 'ink';
import { AuthType } from '@aether/aether-core';
import { DescriptiveRadioButtonSelect } from '../components/shared/DescriptiveRadioButtonSelect.js';
import { TextInput } from '../components/shared/TextInput.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { theme } from '../semantic-colors.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { useUIActions } from '../contexts/UIActionsContext.js';
import { useConfig } from '../contexts/ConfigContext.js';
import { t } from '../../i18n/index.js';
import { KnownProviders } from '../../../../../../utils/knownProvidersData.js';

type ViewLevel = 'provider-select' | 'api-key-input';

type ProviderChoice = {
  key: string;
  title: string;
  label: string;
  description: string;
  value: string;
};

const PROVIDER_ITEMS: ProviderChoice[] = [
  {
    key: 'aether-oauth',
    title: t('Aether OAuth'),
    label: t('Aether OAuth'),
    description: t('Sign in with your Aether account'),
    value: 'aether-oauth',
  },
  ...Object.entries(KnownProviders).map(([providerId, provider]) => ({
    key: providerId,
    title: provider.displayName,
    label: provider.displayName,
    description:
      provider.description ||
      (provider.supportsApiKey === false
        ? t('No API key required')
        : provider.fetchModels
          ? t('API key and live models')
          : t('API key required')),
    value: providerId,
  })),
];

function getProviderAuthType(providerId: string): AuthType {
  const provider = KnownProviders[providerId];
  if (provider?.sdkMode === 'anthropic') {
    return AuthType.USE_ANTHROPIC;
  }
  return AuthType.USE_OPENAI;
}

function getProviderBaseUrl(providerId: string): string | undefined {
  const provider = KnownProviders[providerId];
  return (
    provider?.baseUrl ||
    provider?.openai?.baseUrl ||
    provider?.anthropic?.baseUrl ||
    provider?.responses?.baseUrl
  );
}

export function AuthDialog(): React.JSX.Element {
  const { authError } = useUIState();
  const { handleAuthSelect, onAuthError } = useUIActions();
  const config = useConfig();

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [viewLevel, setViewLevel] = useState<ViewLevel>('provider-select');
  const [providerIndex, setProviderIndex] = useState<number>(0);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(
    null,
  );
  const [apiKey, setApiKey] = useState('');
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);

  const handleProviderSelect = async (value: string) => {
    setErrorMessage(null);
    onAuthError(null);

    if (value === 'aether-oauth') {
      await handleAuthSelect(AuthType.AETHER_OAUTH);
      return;
    }

    const provider = KnownProviders[value];
    if (!provider) {
      setErrorMessage(t('Unknown provider selected.'));
      return;
    }

    const authType = getProviderAuthType(value);
    const baseUrl = getProviderBaseUrl(value);

    if (provider.supportsApiKey === false) {
      await handleAuthSelect(authType, {
        apiKey: '',
        baseUrl,
        model: provider.models?.[0]?.id,
      });
      return;
    }

    setSelectedProviderId(value);
    setApiKey('');
    setApiKeyError(null);
    setViewLevel('api-key-input');
  };

  const handleApiKeySubmit = async () => {
    const trimmedKey = apiKey.trim();
    if (!trimmedKey) {
      setApiKeyError(t('API key cannot be empty.'));
      return;
    }

    if (!selectedProviderId) {
      setErrorMessage(t('Select a provider first.'));
      return;
    }

    const provider = KnownProviders[selectedProviderId];
    await handleAuthSelect(getProviderAuthType(selectedProviderId), {
      apiKey: trimmedKey,
      baseUrl: getProviderBaseUrl(selectedProviderId),
      model: provider?.models?.[0]?.id,
    });
  };

  const handleGoBack = () => {
    setErrorMessage(null);
    onAuthError(null);

    if (viewLevel === 'api-key-input') {
      setViewLevel('provider-select');
      setSelectedProviderId(null);
      setApiKeyError(null);
      return;
    }

    if (config.getAuthType() === undefined) {
      setErrorMessage(t('You must select an auth method before exiting.'));
      return;
    }

    void handleAuthSelect(undefined);
  };

  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        handleGoBack();
      }
    },
    { isActive: true },
  );

  const renderProviderSelectView = () => (
    <>
      <Box marginTop={1}>
        <DescriptiveRadioButtonSelect
          items={PROVIDER_ITEMS}
          initialIndex={providerIndex}
          onSelect={handleProviderSelect}
          onHighlight={(value) => {
            const index = PROVIDER_ITEMS.findIndex((item) => item.value === value);
            setProviderIndex(index);
          }}
          itemGap={1}
        />
      </Box>
      <Box marginTop={1}>
        <Text color={theme?.text?.secondary}>
          {t('Enter to select, ↑↓ to navigate, Esc to go back')}
        </Text>
      </Box>
    </>
  );

  const renderApiKeyInputView = () => (
    <Box marginTop={1} flexDirection="column">
      <Box marginTop={1}>
        <Text color={theme.text.secondary}>
          {t('Enter the API key for the selected provider')}
        </Text>
      </Box>
      <Box marginTop={1}>
        <TextInput
          value={apiKey}
          onChange={(value) => {
            setApiKey(value);
            if (apiKeyError) {
              setApiKeyError(null);
            }
          }}
          onSubmit={handleApiKeySubmit}
          placeholder="sk-..."
        />
      </Box>
      {apiKeyError && (
        <Box marginTop={1}>
          <Text color={theme.status.error}>{apiKeyError}</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <Text color={theme.text.secondary}>
          {t('Enter to submit, Esc to go back')}
        </Text>
      </Box>
    </Box>
  );

  const getViewTitle = () =>
    viewLevel === 'provider-select'
      ? t('Choose Provider')
      : t('Enter API Key');

  return (
    <Box
      borderStyle="single"
      borderColor={theme?.border?.default}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      <Text bold>{getViewTitle()}</Text>

      {viewLevel === 'provider-select' && renderProviderSelectView()}
      {viewLevel === 'api-key-input' && renderApiKeyInputView()}

      {(authError || errorMessage) && (
        <Box marginTop={1}>
          <Text color={theme.status.error}>{authError || errorMessage}</Text>
        </Box>
      )}
    </Box>
  );
}
