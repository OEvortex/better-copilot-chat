/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useEffect } from 'react';
import {
  AuthType,
  aetherOAuth2Events,
  aetherOAuth2Event,
  type DeviceAuthorizationData,
} from '@aether/aether-core';

export interface aetherAuthState {
  deviceAuth: DeviceAuthorizationData | null;
  authStatus:
    | 'idle'
    | 'polling'
    | 'success'
    | 'error'
    | 'timeout'
    | 'rate_limit';
  authMessage: string | null;
}

export const useAetherAuth = (
  pendingAuthType: AuthType | undefined,
  isAuthenticating: boolean,
) => {
  const [aetherAuthState, setAetherAuthState] = useState<aetherAuthState>({
    deviceAuth: null,
    authStatus: 'idle',
    authMessage: null,
  });

  const isAetherAuth = pendingAuthType === AuthType.AETHER_OAUTH;

  // Set up event listeners when authentication starts
  useEffect(() => {
    if (!isAetherAuth || !isAuthenticating) {
      // Reset state when not authenticating or not Aether auth
      setAetherAuthState({
        deviceAuth: null,
        authStatus: 'idle',
        authMessage: null,
      });
      return;
    }

    setAetherAuthState((prev) => ({
      ...prev,
      authStatus: 'idle',
    }));

    // Set up event listeners
    const handleDeviceAuth = (deviceAuth: DeviceAuthorizationData) => {
      setAetherAuthState((prev) => ({
        ...prev,
        deviceAuth: {
          verification_uri: deviceAuth.verification_uri,
          verification_uri_complete: deviceAuth.verification_uri_complete,
          user_code: deviceAuth.user_code,
          expires_in: deviceAuth.expires_in,
          device_code: deviceAuth.device_code,
        },
        authStatus: 'polling',
      }));
    };

    const handleAuthProgress = (
      status: 'success' | 'error' | 'polling' | 'timeout' | 'rate_limit',
      message?: string,
    ) => {
      setAetherAuthState((prev) => ({
        ...prev,
        authStatus: status,
        authMessage: message || null,
      }));
    };

    // Add event listeners
    aetherOAuth2Events.on(aetherOAuth2Event.AuthUri, handleDeviceAuth);
    aetherOAuth2Events.on(aetherOAuth2Event.AuthProgress, handleAuthProgress);

    // Cleanup event listeners when component unmounts or auth finishes
    return () => {
      aetherOAuth2Events.off(aetherOAuth2Event.AuthUri, handleDeviceAuth);
      aetherOAuth2Events.off(aetherOAuth2Event.AuthProgress, handleAuthProgress);
    };
  }, [isAetherAuth, isAuthenticating]);

  const cancelAetherAuth = useCallback(() => {
    // Emit cancel event to stop polling
    aetherOAuth2Events.emit(aetherOAuth2Event.AuthCancel);

    setAetherAuthState({
      deviceAuth: null,
      authStatus: 'idle',
      authMessage: null,
    });
  }, []);

  return {
    aetherAuthState,
    cancelAetherAuth,
  };
};
