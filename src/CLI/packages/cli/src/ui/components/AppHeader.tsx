/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box } from 'ink';
import { AuthType } from '@aether/aether-core';
import { Header, AuthDisplayType } from './Header.js';
import { Tips } from './Tips.js';
import { useSettings } from '../contexts/SettingsContext.js';
import { useConfig } from '../contexts/ConfigContext.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { isCodingPlanConfig } from '../../constants/codingPlan.js';
import { KnownProviders } from '../../../../../../utils/knownProvidersData.js';

interface AppHeaderProps {
  version: string;
}

/**
 * Determine the auth display type based on auth type and configuration.
 */
function getAuthDisplayType(
  authType?: AuthType,
  baseUrl?: string,
  apiKeyEnvKey?: string,
): AuthDisplayType {
  if (!authType) {
    return AuthDisplayType.UNKNOWN;
  }

  // Check if it's a Coding Plan config
  if (isCodingPlanConfig(baseUrl, apiKeyEnvKey)) {
    return AuthDisplayType.CODING_PLAN;
  }

  switch (authType) {
    case AuthType.AETHER_OAUTH:
      return AuthDisplayType.AETHER_OAUTH;
    default:
      return AuthDisplayType.API_KEY;
  }
}

export const AppHeader = ({ version }: AppHeaderProps) => {
  const settings = useSettings();
  const config = useConfig();
  const uiState = useUIState();

  const contentGeneratorConfig = config.getContentGeneratorConfig();
  const authType = contentGeneratorConfig?.authType;
  const model = uiState.currentModel;
  const targetDir = config.getTargetDir();
  const showBanner = !config.getScreenReader();
  const showTips = !(settings.merged.ui?.hideTips || config.getScreenReader());


    // Get selected provider from settings and map to display name
    const selectedProviderId = settings.merged?.security?.auth?.selectedProvider;
    const selectedProviderDisplayName = selectedProviderId && KnownProviders[selectedProviderId]?.displayName
        ? KnownProviders[selectedProviderId].displayName
        : selectedProviderId;

  const authDisplayType = getAuthDisplayType(
    authType,
    contentGeneratorConfig?.baseUrl,
    contentGeneratorConfig?.apiKeyEnvKey,
  );

  return (
    <Box flexDirection="column">
      {showBanner && (
        <Header
          version={version}
          authDisplayType={authDisplayType}
          model={model}
          workingDirectory={targetDir}
                  provider={selectedProviderDisplayName}
        />
      )}
      {showTips && <Tips />}
    </Box>
  );
};
