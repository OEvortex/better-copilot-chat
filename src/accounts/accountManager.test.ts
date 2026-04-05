import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock vscode
vi.mock('vscode', () => {
    const listeners = new Map<string, Function[]>();
    return {
        EventEmitter: class {
            event = (listener: Function) => {
                const key = 'change';
                if (!listeners.has(key)) {
                    listeners.set(key, []);
                }
                listeners.get(key)!.push(listener);
                return { dispose: () => {} };
            };
            fire(data: unknown) {
                for (const fn of listeners.get('change') || []) {
                    fn(data);
                }
            }
            dispose() {}
        },
        ExtensionContext: {},
        _listeners: listeners
    };
});

// Mock Logger
vi.mock('../utils/logger', () => ({
    Logger: {
        trace: vi.fn(),
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
    }
}));

// Mock AccountQuotaCache
vi.mock('./accountQuotaCache', () => ({
    AccountQuotaCache: {
        getInstance: vi.fn().mockReturnValue({
            isInCooldown: vi.fn().mockReturnValue(false),
            getRemainingCooldown: vi.fn().mockReturnValue(0),
            getAccountWithShortestCooldown: vi.fn().mockReturnValue(undefined),
            removeAccount: vi.fn().mockResolvedValue(undefined)
        })
    }
}));

import { AccountManager } from './accountManager';
import type { OAuthCredentials } from './types';

/**
 * Create a mock VS Code extension context
 */
function createMockContext() {
    const store = new Map<string, unknown>();
    const secrets = new Map<string, string>();

    return {
        globalState: {
            get: vi.fn((key: string) => store.get(key)),
            update: vi.fn((key: string, value: unknown) => {
                store.set(key, value);
                return Promise.resolve();
            })
        },
        secrets: {
            store: vi.fn((key: string, value: string) => {
                secrets.set(key, value);
                return Promise.resolve();
            }),
            get: vi.fn((key: string) => Promise.resolve(secrets.get(key))),
            delete: vi.fn((key: string) => {
                secrets.delete(key);
                return Promise.resolve();
            })
        }
    } as unknown as import('vscode').ExtensionContext;
}

describe('AccountManager', () => {
    let context: ReturnType<typeof createMockContext>;
    let manager: AccountManager;

    beforeEach(() => {
        vi.clearAllMocks();
        context = createMockContext();

        // Reset singleton
        (AccountManager as unknown as { instance: undefined }).instance =
            undefined;
        manager = AccountManager.initialize(context);
    });

    describe('initialize and getInstance', () => {
        it('creates a singleton instance', () => {
            const again = AccountManager.initialize(context);
            expect(again).toBe(manager);
        });

        it('getInstance throws if not initialized', () => {
            (AccountManager as unknown as { instance: undefined }).instance =
                undefined;
            expect(() => AccountManager.getInstance()).toThrow(
                'AccountManager not initialized'
            );
        });

        it('getInstance returns the initialized instance', () => {
            expect(AccountManager.getInstance()).toBe(manager);
        });
    });

    describe('addApiKeyAccount', () => {
        it('adds an API key account successfully', async () => {
            const result = await manager.addApiKeyAccount(
                'openai',
                'My OpenAI Key',
                'sk-test-12345'
            );

            expect(result.success).toBe(true);
            expect(result.account).toBeDefined();
            expect(result.account!.displayName).toBe('My OpenAI Key');
            expect(result.account!.provider).toBe('openai');
            expect(result.account!.authType).toBe('apiKey');
            expect(result.account!.status).toBe('active');
        });

        it('sets first account as default', async () => {
            const result = await manager.addApiKeyAccount(
                'openai',
                'First Key',
                'sk-first'
            );

            expect(result.account!.isDefault).toBe(true);
        });

        it('does not set second account as default', async () => {
            await manager.addApiKeyAccount('openai', 'First', 'sk-1');
            const result = await manager.addApiKeyAccount(
                'openai',
                'Second',
                'sk-2'
            );

            expect(result.account!.isDefault).toBe(false);
        });

        it('stores credentials in secret storage', async () => {
            await manager.addApiKeyAccount('openai', 'Test', 'sk-secret');

            expect(context.secrets.store).toHaveBeenCalled();
            const call = vi.mocked(context.secrets.store).mock.calls[0];
            expect(call[0]).toMatch(/^chp\.account\..+\.credentials$/);
            expect(call[1]).toContain('sk-secret');
        });

        it('saves account to global state', async () => {
            await manager.addApiKeyAccount('openai', 'Test', 'sk-test');

            expect(context.globalState.update).toHaveBeenCalled();
        });

        it('supports custom endpoint and headers', async () => {
            const result = await manager.addApiKeyAccount(
                'compatible',
                'Custom',
                'sk-custom',
                {
                    endpoint: 'https://custom.api.com/v1',
                    customHeaders: { 'X-Custom': 'value' }
                }
            );

            expect(result.success).toBe(true);
        });

        it('generates unique account IDs', async () => {
            const r1 = await manager.addApiKeyAccount('openai', 'A', 'sk-a');
            const r2 = await manager.addApiKeyAccount('openai', 'B', 'sk-b');

            expect(r1.account!.id).not.toBe(r2.account!.id);
        });
    });

    describe('addOAuthAccount', () => {
        it('adds an OAuth account successfully', async () => {
            const oauthCreds: OAuthCredentials = {
                accessToken: 'access-123',
                refreshToken: 'refresh-456',
                expiresAt: new Date(Date.now() + 3600000).toISOString()
            };

            const result = await manager.addOAuthAccount(
                'codex',
                'Codex Account',
                'user@example.com',
                oauthCreds
            );

            expect(result.success).toBe(true);
            expect(result.account!.authType).toBe('oauth');
            expect(result.account!.email).toBe('user@example.com');
        });

        it('sets first OAuth account as default', async () => {
            const oauthCreds: OAuthCredentials = {
                accessToken: 'acc',
                refreshToken: 'ref',
                expiresAt: new Date(Date.now() + 3600000).toISOString()
            };

            const result = await manager.addOAuthAccount(
                'codex',
                'Codex',
                'user@test.com',
                oauthCreds
            );

            expect(result.account!.isDefault).toBe(true);
        });
    });

    describe('removeAccount', () => {
        it('removes an existing account', async () => {
            const { account } = await manager.addApiKeyAccount(
                'openai',
                'Test',
                'sk-1'
            );
            const removed = await manager.removeAccount(account!.id);

            expect(removed).toBe(true);
            expect(manager.getAccount(account!.id)).toBeUndefined();
        });

        it('returns false for non-existent account', async () => {
            const removed = await manager.removeAccount('non-existent-id');
            expect(removed).toBe(false);
        });

        it('deletes credentials from secret storage', async () => {
            const { account } = await manager.addApiKeyAccount(
                'openai',
                'Test',
                'sk-1'
            );
            await manager.removeAccount(account!.id);

            expect(context.secrets.delete).toHaveBeenCalled();
        });

        it('switches active account when removing the active one', async () => {
            const a1 = await manager.addApiKeyAccount(
                'openai',
                'First',
                'sk-1'
            );
            const a2 = await manager.addApiKeyAccount(
                'openai',
                'Second',
                'sk-2'
            );

            // a1 is active (first account)
            expect(manager.getActiveAccount('openai')?.id).toBe(a1.account!.id);

            await manager.removeAccount(a1.account!.id);

            // Should switch to a2
            expect(manager.getActiveAccount('openai')?.id).toBe(a2.account!.id);
        });

        it('removes active provider entry when last account is removed', async () => {
            const { account } = await manager.addApiKeyAccount(
                'openai',
                'Only',
                'sk-1'
            );
            await manager.removeAccount(account!.id);

            expect(manager.getActiveAccount('openai')).toBeUndefined();
        });
    });

    describe('switchAccount', () => {
        it('switches active account for a provider', async () => {
            const a1 = await manager.addApiKeyAccount(
                'openai',
                'First',
                'sk-1'
            );
            const a2 = await manager.addApiKeyAccount(
                'openai',
                'Second',
                'sk-2'
            );

            const switched = await manager.switchAccount(
                'openai',
                a2.account!.id
            );

            expect(switched).toBe(true);
            expect(manager.getActiveAccount('openai')?.id).toBe(a2.account!.id);
        });

        it('returns false for non-existent account', async () => {
            const switched = await manager.switchAccount('openai', 'fake-id');
            expect(switched).toBe(false);
        });

        it('returns false when provider mismatches', async () => {
            const a1 = await manager.addApiKeyAccount(
                'openai',
                'OpenAI',
                'sk-1'
            );
            const switched = await manager.switchAccount(
                'zhipu',
                a1.account!.id
            );
            expect(switched).toBe(false);
        });

        it('clears isDefault on old active account', async () => {
            const a1 = await manager.addApiKeyAccount(
                'openai',
                'First',
                'sk-1'
            );
            const a2 = await manager.addApiKeyAccount(
                'openai',
                'Second',
                'sk-2'
            );

            await manager.switchAccount('openai', a2.account!.id);

            const old = manager.getAccount(a1.account!.id);
            expect(old!.isDefault).toBe(false);
        });
    });

    describe('getActiveAccount', () => {
        it('returns undefined when no accounts exist', () => {
            expect(manager.getActiveAccount('openai')).toBeUndefined();
        });

        it('returns the active account for a provider', async () => {
            const { account } = await manager.addApiKeyAccount(
                'openai',
                'Test',
                'sk-1'
            );
            expect(manager.getActiveAccount('openai')?.id).toBe(account!.id);
        });
    });

    describe('getAccountsByProvider', () => {
        it('returns empty array when no accounts', () => {
            expect(manager.getAccountsByProvider('openai')).toEqual([]);
        });

        it('returns only accounts for the specified provider', async () => {
            await manager.addApiKeyAccount('openai', 'OAI-1', 'sk-1');
            await manager.addApiKeyAccount('openai', 'OAI-2', 'sk-2');
            await manager.addApiKeyAccount('zhipu', 'Zhipu', 'key-1');

            const openaiAccounts = manager.getAccountsByProvider('openai');
            expect(openaiAccounts).toHaveLength(2);
            expect(openaiAccounts.every((a) => a.provider === 'openai')).toBe(
                true
            );
        });
    });

    describe('getAllAccounts', () => {
        it('returns all accounts across providers', async () => {
            await manager.addApiKeyAccount('openai', 'OAI', 'sk-1');
            await manager.addApiKeyAccount('zhipu', 'Zhipu', 'key-1');

            expect(manager.getAllAccounts()).toHaveLength(2);
        });
    });

    describe('getAccount', () => {
        it('returns account by ID', async () => {
            const { account } = await manager.addApiKeyAccount(
                'openai',
                'Test',
                'sk-1'
            );
            expect(manager.getAccount(account!.id)?.displayName).toBe('Test');
        });

        it('returns undefined for unknown ID', () => {
            expect(manager.getAccount('unknown')).toBeUndefined();
        });
    });

    describe('updateAccount', () => {
        it('updates account fields', async () => {
            const { account } = await manager.addApiKeyAccount(
                'openai',
                'Old Name',
                'sk-1'
            );
            const updated = await manager.updateAccount(account!.id, {
                displayName: 'New Name'
            });

            expect(updated).toBe(true);
            expect(manager.getAccount(account!.id)!.displayName).toBe(
                'New Name'
            );
        });

        it('returns false for non-existent account', async () => {
            const updated = await manager.updateAccount('fake', {
                displayName: 'X'
            });
            expect(updated).toBe(false);
        });
    });

    describe('updateCredentials', () => {
        it('updates API key credentials', async () => {
            const { account } = await manager.addApiKeyAccount(
                'openai',
                'Test',
                'sk-old'
            );
            const updated = await manager.updateCredentials(account!.id, {
                apiKey: 'sk-new'
            });

            expect(updated).toBe(true);
            expect(context.secrets.store).toHaveBeenCalledTimes(2); // once for add, once for update
        });

        it('returns false for non-existent account', async () => {
            const updated = await manager.updateCredentials('fake', {
                apiKey: 'x'
            });
            expect(updated).toBe(false);
        });
    });

    describe('getCredentials', () => {
        it('retrieves stored credentials', async () => {
            const { account } = await manager.addApiKeyAccount(
                'openai',
                'Test',
                'sk-123'
            );
            const creds = await manager.getCredentials(account!.id);

            expect(creds).toBeDefined();
            expect((creds as { apiKey: string }).apiKey).toBe('sk-123');
        });

        it('returns undefined for unknown account', async () => {
            const creds = await manager.getCredentials('unknown');
            expect(creds).toBeUndefined();
        });
    });

    describe('getActiveApiKey', () => {
        it('returns API key of active account', async () => {
            await manager.addApiKeyAccount('openai', 'Test', 'sk-active');
            const key = await manager.getActiveApiKey('openai');
            expect(key).toBe('sk-active');
        });

        it('returns undefined when no active account', async () => {
            const key = await manager.getActiveApiKey('openai');
            expect(key).toBeUndefined();
        });
    });

    describe('model account assignments', () => {
        it('assigns and retrieves model to account mapping', async () => {
            const { account } = await manager.addApiKeyAccount(
                'openai',
                'Test',
                'sk-1'
            );
            await manager.setAccountForModel('openai', 'gpt-4o', account!.id);

            expect(manager.getAccountIdForModel('openai', 'gpt-4o')).toBe(
                account!.id
            );
        });

        it('removes model assignment when accountId not provided', async () => {
            const { account } = await manager.addApiKeyAccount(
                'openai',
                'Test',
                'sk-1'
            );
            await manager.setAccountForModel('openai', 'gpt-4o', account!.id);
            await manager.setAccountForModel('openai', 'gpt-4o');

            expect(
                manager.getAccountIdForModel('openai', 'gpt-4o')
            ).toBeUndefined();
        });

        it('returns all model assignments for a provider', async () => {
            const a1 = await manager.addApiKeyAccount('openai', 'A', 'sk-1');
            await manager.setAccountForModel(
                'openai',
                'gpt-4o',
                a1.account!.id
            );
            await manager.setAccountForModel(
                'openai',
                'gpt-3.5',
                a1.account!.id
            );

            const assignments = manager.getModelAccountAssignments('openai');
            expect(Object.keys(assignments)).toHaveLength(2);
        });
    });

    describe('load balance', () => {
        it('Codex provider has load balancing enabled by default', () => {
            expect(manager.getLoadBalanceEnabled('codex')).toBe(true);
        });

        it('other providers have load balancing disabled by default', () => {
            expect(manager.getLoadBalanceEnabled('openai')).toBe(false);
        });

        it('can toggle load balance for a provider', async () => {
            await manager.setLoadBalanceEnabled('openai', true);
            expect(manager.getLoadBalanceEnabled('openai')).toBe(true);

            await manager.setLoadBalanceEnabled('openai', false);
            expect(manager.getLoadBalanceEnabled('openai')).toBe(false);
        });
    });

    describe('account expiration', () => {
        it('detects expired accounts', async () => {
            const oauthCreds: OAuthCredentials = {
                accessToken: 'acc',
                refreshToken: 'ref',
                expiresAt: new Date(Date.now() - 1000).toISOString() // already expired
            };

            const { account } = await manager.addOAuthAccount(
                'codex',
                'Expired',
                'user@test.com',
                oauthCreds
            );

            expect(manager.isAccountExpired(account!.id)).toBe(true);
        });

        it('returns false for accounts without expiration', async () => {
            const { account } = await manager.addApiKeyAccount(
                'openai',
                'Test',
                'sk-1'
            );
            expect(manager.isAccountExpired(account!.id)).toBe(false);
        });

        it('returns false for non-existent account', () => {
            expect(manager.isAccountExpired('fake')).toBe(false);
        });

        it('marks account as expired', async () => {
            const { account } = await manager.addApiKeyAccount(
                'openai',
                'Test',
                'sk-1'
            );
            await manager.markAccountExpired(account!.id);

            expect(manager.getAccount(account!.id)!.status).toBe('expired');
        });
    });

    describe('account error state', () => {
        it('marks account with error', async () => {
            const { account } = await manager.addApiKeyAccount(
                'openai',
                'Test',
                'sk-1'
            );
            await manager.markAccountError(account!.id, 'API key invalid');

            const updated = manager.getAccount(account!.id);
            expect(updated!.status).toBe('error');
            expect(updated!.metadata?.lastError).toBe('API key invalid');
        });
    });

    describe('getAvailableAccountsForProvider', () => {
        it('returns active, non-expired accounts', async () => {
            await manager.addApiKeyAccount('openai', 'Active', 'sk-1');
            const a2 = await manager.addApiKeyAccount(
                'openai',
                'Will Expire',
                'sk-2'
            );
            await manager.markAccountExpired(a2.account!.id);

            const available = manager.getAvailableAccountsForProvider('openai');
            expect(available).toHaveLength(1);
            expect(available[0].displayName).toBe('Active');
        });
    });

    describe('getNextAvailableAccount', () => {
        it('returns first available when no current account', async () => {
            const a1 = await manager.addApiKeyAccount(
                'openai',
                'First',
                'sk-1'
            );
            await manager.addApiKeyAccount('openai', 'Second', 'sk-2');

            const next = manager.getNextAvailableAccount('openai');
            expect(next?.id).toBe(a1.account!.id);
        });

        it('returns next account after current', async () => {
            const a1 = await manager.addApiKeyAccount(
                'openai',
                'First',
                'sk-1'
            );
            const a2 = await manager.addApiKeyAccount(
                'openai',
                'Second',
                'sk-2'
            );

            const next = manager.getNextAvailableAccount(
                'openai',
                a1.account!.id
            );
            expect(next?.id).toBe(a2.account!.id);
        });

        it('wraps around to first when at end of list', async () => {
            const a1 = await manager.addApiKeyAccount(
                'openai',
                'First',
                'sk-1'
            );
            const a2 = await manager.addApiKeyAccount(
                'openai',
                'Second',
                'sk-2'
            );

            const next = manager.getNextAvailableAccount(
                'openai',
                a2.account!.id
            );
            expect(next?.id).toBe(a1.account!.id);
        });

        it('returns undefined when no accounts available', () => {
            const next = manager.getNextAvailableAccount('openai');
            expect(next).toBeUndefined();
        });
    });

    describe('provider configuration', () => {
        it('supportsMultiAccount returns true by default', () => {
            expect(
                AccountManager.supportsMultiAccount('unknown-provider')
            ).toBe(true);
        });

        it('returns correct config for known providers', () => {
            const config = AccountManager.getProviderConfig('codex');
            expect(config.supportsOAuth).toBe(true);
            expect(config.supportsApiKey).toBe(true);
        });

        it('can register custom provider config', () => {
            AccountManager.registerProviderConfig('custom-llm', {
                supportsMultiAccount: false,
                supportsOAuth: false,
                supportsApiKey: true
            });

            const config = AccountManager.getProviderConfig('custom-llm');
            expect(config.supportsMultiAccount).toBe(false);
        });
    });

    describe('onAccountChange event', () => {
        it('fires event when account is added', async () => {
            const handler = vi.fn();
            manager.onAccountChange(handler);

            await manager.addApiKeyAccount('openai', 'Test', 'sk-1');

            expect(handler).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'added', provider: 'openai' })
            );
        });

        it('fires event when account is removed', async () => {
            const { account } = await manager.addApiKeyAccount(
                'openai',
                'Test',
                'sk-1'
            );
            const handler = vi.fn();
            manager.onAccountChange(handler);

            await manager.removeAccount(account!.id);

            expect(handler).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'removed' })
            );
        });

        it('fires event when account is switched', async () => {
            const a1 = await manager.addApiKeyAccount('openai', 'A', 'sk-1');
            const a2 = await manager.addApiKeyAccount('openai', 'B', 'sk-2');
            const handler = vi.fn();
            manager.onAccountChange(handler);

            await manager.switchAccount('openai', a2.account!.id);

            expect(handler).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'switched' })
            );
        });
    });

    describe('dispose', () => {
        it('cleans up event emitter', () => {
            expect(() => manager.dispose()).not.toThrow();
        });
    });
});
