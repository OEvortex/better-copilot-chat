/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { DeviceAuthorizationData } from '@aether/aether-core';
import { useAetherAuth } from './useAetherAuth.js';
import {
  AuthType,
  aetherOAuth2Events,
  aetherOAuth2Event,
} from '@aether/aether-core';

// Mock the aetherOAuth2Events
vi.mock('@aether/aether-core', async () => {
  const actual = await vi.importActual('@aether/aether-core');
  const mockEmitter = {
    on: vi.fn().mockReturnThis(),
    off: vi.fn().mockReturnThis(),
    emit: vi.fn().mockReturnThis(),
  };
  return {
    ...actual,
    aetherOAuth2Events: mockEmitter,
    aetherOAuth2Event: {
      AuthUri: 'authUri',
      AuthProgress: 'authProgress',
    },
  };
});

const mockaetherOAuth2Events = vi.mocked(aetherOAuth2Events);

describe('useAetherAuth', () => {
  const mockDeviceAuth: DeviceAuthorizationData = {
    verification_uri: 'https://oauth.aether.dev/device',
    verification_uri_complete: 'https://oauth.aether.dev/device?user_code=ABC123',
    user_code: 'ABC123',
    expires_in: 1800,
    device_code: 'device_code_123',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with default state when not Aether auth', () => {
    const { result } = renderHook(() =>
      useAetherAuth(AuthType.USE_GEMINI, false),
    );

    expect(result.current.aetherAuthState).toEqual({
      deviceAuth: null,
      authStatus: 'idle',
      authMessage: null,
    });
    expect(result.current.cancelAetherAuth).toBeInstanceOf(Function);
  });

  it('should initialize with default state when Aether auth but not authenticating', () => {
    const { result } = renderHook(() =>
      useAetherAuth(AuthType.AETHER_OAUTH, false),
    );

    expect(result.current.aetherAuthState).toEqual({
      deviceAuth: null,
      authStatus: 'idle',
      authMessage: null,
    });
    expect(result.current.cancelAetherAuth).toBeInstanceOf(Function);
  });

  it('should set up event listeners when Aether auth and authenticating', () => {
    renderHook(() => useAetherAuth(AuthType.AETHER_OAUTH, true));

    expect(mockaetherOAuth2Events.on).toHaveBeenCalledWith(
      aetherOAuth2Event.AuthUri,
      expect.any(Function),
    );
    expect(mockaetherOAuth2Events.on).toHaveBeenCalledWith(
      aetherOAuth2Event.AuthProgress,
      expect.any(Function),
    );
  });

  it('should handle device auth event', () => {
    let handleDeviceAuth: (deviceAuth: DeviceAuthorizationData) => void;

    mockaetherOAuth2Events.on.mockImplementation((event, handler) => {
      if (event === aetherOAuth2Event.AuthUri) {
        handleDeviceAuth = handler;
      }
      return mockaetherOAuth2Events;
    });

    const { result } = renderHook(() => useAetherAuth(AuthType.AETHER_OAUTH, true));

    act(() => {
      handleDeviceAuth!(mockDeviceAuth);
    });

    expect(result.current.aetherAuthState.deviceAuth).toEqual(mockDeviceAuth);
    expect(result.current.aetherAuthState.authStatus).toBe('polling');
  });

  it('should handle auth progress event - success', () => {
    let handleAuthProgress: (
      status: 'success' | 'error' | 'polling' | 'timeout' | 'rate_limit',
      message?: string,
    ) => void;

    mockaetherOAuth2Events.on.mockImplementation((event, handler) => {
      if (event === aetherOAuth2Event.AuthProgress) {
        handleAuthProgress = handler;
      }
      return mockaetherOAuth2Events;
    });

    const { result } = renderHook(() => useAetherAuth(AuthType.AETHER_OAUTH, true));

    act(() => {
      handleAuthProgress!('success', 'Authentication successful!');
    });

    expect(result.current.aetherAuthState.authStatus).toBe('success');
    expect(result.current.aetherAuthState.authMessage).toBe(
      'Authentication successful!',
    );
  });

  it('should handle auth progress event - error', () => {
    let handleAuthProgress: (
      status: 'success' | 'error' | 'polling' | 'timeout' | 'rate_limit',
      message?: string,
    ) => void;

    mockaetherOAuth2Events.on.mockImplementation((event, handler) => {
      if (event === aetherOAuth2Event.AuthProgress) {
        handleAuthProgress = handler;
      }
      return mockaetherOAuth2Events;
    });

    const { result } = renderHook(() => useAetherAuth(AuthType.AETHER_OAUTH, true));

    act(() => {
      handleAuthProgress!('error', 'Authentication failed');
    });

    expect(result.current.aetherAuthState.authStatus).toBe('error');
    expect(result.current.aetherAuthState.authMessage).toBe(
      'Authentication failed',
    );
  });

  it('should handle auth progress event - polling', () => {
    let handleAuthProgress: (
      status: 'success' | 'error' | 'polling' | 'timeout' | 'rate_limit',
      message?: string,
    ) => void;

    mockaetherOAuth2Events.on.mockImplementation((event, handler) => {
      if (event === aetherOAuth2Event.AuthProgress) {
        handleAuthProgress = handler;
      }
      return mockaetherOAuth2Events;
    });

    const { result } = renderHook(() => useAetherAuth(AuthType.AETHER_OAUTH, true));

    act(() => {
      handleAuthProgress!('polling', 'Waiting for user authorization...');
    });

    expect(result.current.aetherAuthState.authStatus).toBe('polling');
    expect(result.current.aetherAuthState.authMessage).toBe(
      'Waiting for user authorization...',
    );
  });

  it('should handle auth progress event - rate_limit', () => {
    let handleAuthProgress: (
      status: 'success' | 'error' | 'polling' | 'timeout' | 'rate_limit',
      message?: string,
    ) => void;

    mockaetherOAuth2Events.on.mockImplementation((event, handler) => {
      if (event === aetherOAuth2Event.AuthProgress) {
        handleAuthProgress = handler;
      }
      return mockaetherOAuth2Events;
    });

    const { result } = renderHook(() => useAetherAuth(AuthType.AETHER_OAUTH, true));

    act(() => {
      handleAuthProgress!(
        'rate_limit',
        'Too many requests. The server is rate limiting our requests. Please select a different authentication method or try again later.',
      );
    });

    expect(result.current.aetherAuthState.authStatus).toBe('rate_limit');
    expect(result.current.aetherAuthState.authMessage).toBe(
      'Too many requests. The server is rate limiting our requests. Please select a different authentication method or try again later.',
    );
  });

  it('should handle auth progress event without message', () => {
    let handleAuthProgress: (
      status: 'success' | 'error' | 'polling' | 'timeout' | 'rate_limit',
      message?: string,
    ) => void;

    mockaetherOAuth2Events.on.mockImplementation((event, handler) => {
      if (event === aetherOAuth2Event.AuthProgress) {
        handleAuthProgress = handler;
      }
      return mockaetherOAuth2Events;
    });

    const { result } = renderHook(() => useAetherAuth(AuthType.AETHER_OAUTH, true));

    act(() => {
      handleAuthProgress!('success');
    });

    expect(result.current.aetherAuthState.authStatus).toBe('success');
    expect(result.current.aetherAuthState.authMessage).toBe(null);
  });

  it('should clean up event listeners when auth type changes', () => {
    const { rerender } = renderHook(
      ({ pendingAuthType, isAuthenticating }) =>
        useAetherAuth(pendingAuthType, isAuthenticating),
      {
        initialProps: {
          pendingAuthType: AuthType.AETHER_OAUTH,
          isAuthenticating: true,
        },
      },
    );

    // Change to non-Aether auth
    rerender({ pendingAuthType: AuthType.USE_GEMINI, isAuthenticating: true });

    expect(mockaetherOAuth2Events.off).toHaveBeenCalledWith(
      aetherOAuth2Event.AuthUri,
      expect.any(Function),
    );
    expect(mockaetherOAuth2Events.off).toHaveBeenCalledWith(
      aetherOAuth2Event.AuthProgress,
      expect.any(Function),
    );
  });

  it('should clean up event listeners when authentication stops', () => {
    const { rerender } = renderHook(
      ({ isAuthenticating }) =>
        useAetherAuth(AuthType.AETHER_OAUTH, isAuthenticating),
      { initialProps: { isAuthenticating: true } },
    );

    // Stop authentication
    rerender({ isAuthenticating: false });

    expect(mockaetherOAuth2Events.off).toHaveBeenCalledWith(
      aetherOAuth2Event.AuthUri,
      expect.any(Function),
    );
    expect(mockaetherOAuth2Events.off).toHaveBeenCalledWith(
      aetherOAuth2Event.AuthProgress,
      expect.any(Function),
    );
  });

  it('should clean up event listeners on unmount', () => {
    const { unmount } = renderHook(() =>
      useAetherAuth(AuthType.AETHER_OAUTH, true),
    );

    unmount();

    expect(mockaetherOAuth2Events.off).toHaveBeenCalledWith(
      aetherOAuth2Event.AuthUri,
      expect.any(Function),
    );
    expect(mockaetherOAuth2Events.off).toHaveBeenCalledWith(
      aetherOAuth2Event.AuthProgress,
      expect.any(Function),
    );
  });

  it('should reset state when switching from Aether auth to another auth type', () => {
    let handleDeviceAuth: (deviceAuth: DeviceAuthorizationData) => void;

    mockaetherOAuth2Events.on.mockImplementation((event, handler) => {
      if (event === aetherOAuth2Event.AuthUri) {
        handleDeviceAuth = handler;
      }
      return mockaetherOAuth2Events;
    });

    const { result, rerender } = renderHook(
      ({ pendingAuthType, isAuthenticating }) =>
        useAetherAuth(pendingAuthType, isAuthenticating),
      {
        initialProps: {
          pendingAuthType: AuthType.AETHER_OAUTH,
          isAuthenticating: true,
        },
      },
    );

    // Simulate device auth
    act(() => {
      handleDeviceAuth!(mockDeviceAuth);
    });

    expect(result.current.aetherAuthState.deviceAuth).toEqual(mockDeviceAuth);
    expect(result.current.aetherAuthState.authStatus).toBe('polling');

    // Switch to different auth type
    rerender({ pendingAuthType: AuthType.USE_GEMINI, isAuthenticating: true });

    expect(result.current.aetherAuthState.deviceAuth).toBe(null);
    expect(result.current.aetherAuthState.authStatus).toBe('idle');
    expect(result.current.aetherAuthState.authMessage).toBe(null);
  });

  it('should reset state when authentication stops', () => {
    let handleDeviceAuth: (deviceAuth: DeviceAuthorizationData) => void;

    mockaetherOAuth2Events.on.mockImplementation((event, handler) => {
      if (event === aetherOAuth2Event.AuthUri) {
        handleDeviceAuth = handler;
      }
      return mockaetherOAuth2Events;
    });

    const { result, rerender } = renderHook(
      ({ isAuthenticating }) =>
        useAetherAuth(AuthType.AETHER_OAUTH, isAuthenticating),
      { initialProps: { isAuthenticating: true } },
    );

    // Simulate device auth
    act(() => {
      handleDeviceAuth!(mockDeviceAuth);
    });

    expect(result.current.aetherAuthState.deviceAuth).toEqual(mockDeviceAuth);
    expect(result.current.aetherAuthState.authStatus).toBe('polling');

    // Stop authentication
    rerender({ isAuthenticating: false });

    expect(result.current.aetherAuthState.deviceAuth).toBe(null);
    expect(result.current.aetherAuthState.authStatus).toBe('idle');
    expect(result.current.aetherAuthState.authMessage).toBe(null);
  });

  it('should handle cancelAetherAuth function', () => {
    let handleDeviceAuth: (deviceAuth: DeviceAuthorizationData) => void;

    mockaetherOAuth2Events.on.mockImplementation((event, handler) => {
      if (event === aetherOAuth2Event.AuthUri) {
        handleDeviceAuth = handler;
      }
      return mockaetherOAuth2Events;
    });

    const { result } = renderHook(() => useAetherAuth(AuthType.AETHER_OAUTH, true));

    // Set up some state
    act(() => {
      handleDeviceAuth!(mockDeviceAuth);
    });

    expect(result.current.aetherAuthState.deviceAuth).toEqual(mockDeviceAuth);

    // Cancel auth
    act(() => {
      result.current.cancelAetherAuth();
    });

    expect(result.current.aetherAuthState.deviceAuth).toBe(null);
    expect(result.current.aetherAuthState.authStatus).toBe('idle');
    expect(result.current.aetherAuthState.authMessage).toBe(null);
  });

  it('should handle different auth types correctly', () => {
    // Test with Aether OAuth - should set up event listeners when authenticating
    const { result: aetherResult } = renderHook(() =>
      useAetherAuth(AuthType.AETHER_OAUTH, true),
    );
    expect(aetherResult.current.aetherAuthState.authStatus).toBe('idle');
    expect(mockaetherOAuth2Events.on).toHaveBeenCalled();

    // Test with other auth types - should not set up event listeners
    const { result: geminiResult } = renderHook(() =>
      useAetherAuth(AuthType.USE_GEMINI, true),
    );
    expect(geminiResult.current.aetherAuthState.authStatus).toBe('idle');

    const { result: oauthResult } = renderHook(() =>
      useAetherAuth(AuthType.USE_OPENAI, true),
    );
    expect(oauthResult.current.aetherAuthState.authStatus).toBe('idle');
  });

  it('should initialize with idle status when starting authentication with Aether auth', () => {
    const { result } = renderHook(() => useAetherAuth(AuthType.AETHER_OAUTH, true));

    expect(result.current.aetherAuthState.authStatus).toBe('idle');
    expect(mockaetherOAuth2Events.on).toHaveBeenCalled();
  });
});
