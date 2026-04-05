/*-------------------------------------------------------------------------------------------------
 *  Settings Migrator
 *  Handles migration of settings from old prefix (chp.*) to new prefix (aether.*)
 *------------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Logger } from './logger';

/**
 * Migration version key in global state
 */
const MIGRATION_VERSION_KEY = 'aether.settingsMigrationVersion';

/**
 * Current migration version - increment when adding new migrations
 */
const CURRENT_MIGRATION_VERSION = 1;

/**
 * Old configuration section prefix
 */
const OLD_CONFIG_SECTION = 'chp';

/**
 * New configuration section prefix
 */
const NEW_CONFIG_SECTION = 'aether';

/**
 * Settings that need migration from chp.* to aether.*
 */
const SETTINGS_TO_MIGRATE = [
    // Global settings
    'temperature',
    'topP',
    'maxTokens',
    'rememberLastModel',
    'hideThinkingInUI',
    // Zhipu settings
    'zhipu.search.enableMCP',
    'zhipu.endpoint',
    'zhipu.plan',
    'zhipu.thinking',
    'zhipu.clearThinking',
    // MiniMax settings
    'minimax.endpoint',
    // Moonshot settings
    'moonshot.plan',
    // NES/FIM completion settings
    'nesCompletion.enabled',
    'nesCompletion.debounceMs',
    'nesCompletion.timeoutMs',
    'nesCompletion.manualOnly',
    'nesCompletion.modelConfig.provider',
    'nesCompletion.modelConfig.baseUrl',
    'nesCompletion.modelConfig.model',
    'nesCompletion.modelConfig.maxTokens',
    'nesCompletion.modelConfig.extraBody',
    'fimCompletion.enabled',
    'fimCompletion.debounceMs',
    'fimCompletion.timeoutMs',
    'fimCompletion.modelConfig.provider',
    'fimCompletion.modelConfig.baseUrl',
    'fimCompletion.modelConfig.model',
    'fimCompletion.modelConfig.maxTokens',
    'fimCompletion.modelConfig.extraBody',
    // Provider overrides
    'providerOverrides'
];

/**
 * Known providers for secret migration
 */
const KNOWN_PROVIDERS = [
    'zhipu',
    'minimax',
    'moonshot',
    'deepseek',
    'kimi',
    'chutes',
    'zenmux',
    'opencode',
    'blackbox',
    'huggingface',
    'kilo',
    'lightningai',
    'deepinfra',
    'nvidia',
    'mistral',
    'modelscope',
    'ollama',
    'aihubmix',
    'nanogpt',
    'vercelai',
    'cline',
    'pollinations',
    'opencodego',
    'ava-supernova',
    'knox',
    'seraphyn',
    'apertis',
    'puter',
    'hicapai',
    'llmgateway',
    'codex',
    'qwencli',
    'compatible'
];

/**
 * Settings Migrator class
 * Handles one-time migration of settings from old prefix to new prefix
 */
export class SettingsMigrator {
    /**
     * Run migration if needed
     * @param context Extension context for accessing global state and secrets
     * @returns true if migration was performed, false if already migrated
     */
    static async migrateIfNeeded(
        context: vscode.ExtensionContext
    ): Promise<boolean> {
        const migrationVersion = context.globalState.get<number>(
            MIGRATION_VERSION_KEY,
            0
        );

        if (migrationVersion >= CURRENT_MIGRATION_VERSION) {
            Logger.debug(
                'Settings already migrated (version ' + migrationVersion + ')'
            );
            return false;
        }

        Logger.info(
            'Starting settings migration from ' +
                OLD_CONFIG_SECTION +
                ' to ' +
                NEW_CONFIG_SECTION +
                '...'
        );

        let migrated = false;

        try {
            // Migrate VS Code settings
            const settingsMigrated = await SettingsMigrator.migrateSettings();
            if (settingsMigrated) {
                migrated = true;
            }

            // Migrate secrets (API keys)
            const secretsMigrated =
                await SettingsMigrator.migrateSecrets(context);
            if (secretsMigrated) {
                migrated = true;
            }

            // Migrate global state
            const stateMigrated =
                await SettingsMigrator.migrateGlobalState(context);
            if (stateMigrated) {
                migrated = true;
            }

            // Mark migration as complete
            await context.globalState.update(
                MIGRATION_VERSION_KEY,
                CURRENT_MIGRATION_VERSION
            );

            if (migrated) {
                Logger.info('Settings migration completed successfully');
                void vscode.window.showInformationMessage(
                    'Aether: Settings have been migrated from the previous version. Your API keys and configuration have been preserved.'
                );
            }

            return migrated;
        } catch (error) {
            Logger.error('Settings migration failed:', error);
            void vscode.window.showErrorMessage(
                'Aether: Settings migration failed. Some settings may need to be reconfigured.'
            );
            throw error;
        }
    }

    /**
     * Migrate VS Code settings from chp.* to aether.*
     */
    private static async migrateSettings(): Promise<boolean> {
        const oldConfig = vscode.workspace.getConfiguration(OLD_CONFIG_SECTION);
        const newConfig = vscode.workspace.getConfiguration(NEW_CONFIG_SECTION);

        let migrated = false;

        for (const setting of SETTINGS_TO_MIGRATE) {
            try {
                // Check if old setting exists
                const oldValue = oldConfig.inspect(setting);

                if (
                    oldValue &&
                    (oldValue.globalValue !== undefined ||
                        oldValue.workspaceValue !== undefined)
                ) {
                    // Get the value from old config
                    const value =
                        oldValue.globalValue ?? oldValue.workspaceValue;
                    const target =
                        oldValue.globalValue !== undefined
                            ? vscode.ConfigurationTarget.Global
                            : vscode.ConfigurationTarget.Workspace;

                    // Set in new config
                    await newConfig.update(setting, value, target);

                    // Clear old setting
                    await oldConfig.update(setting, undefined, target);

                    Logger.debug(
                        'Migrated setting: ' +
                            OLD_CONFIG_SECTION +
                            '.' +
                            setting +
                            ' -> ' +
                            NEW_CONFIG_SECTION +
                            '.' +
                            setting
                    );
                    migrated = true;
                }
            } catch (error) {
                Logger.error(
                    'Failed to migrate setting ' + setting + ':',
                    error
                );
            }
        }

        // Handle provider-specific baseUrl settings (chp.{provider}.baseUrl)
        const allSettings = vscode.workspace.getConfiguration();
        const oldSettingsKeys = Object.keys(allSettings).filter((key) =>
            key.startsWith(OLD_CONFIG_SECTION + '.')
        );

        for (const key of oldSettingsKeys) {
            // Check for provider-specific settings not in the standard list
            const match = key.match(
                new RegExp(
                    '^' +
                        OLD_CONFIG_SECTION +
                        '.([^.]+)\\.(baseUrl|sdkMode|plan|endpoint)'
                )
            );
            if (match) {
                try {
                    const provider = match[1];
                    const oldSettingKey = key.replace(
                        OLD_CONFIG_SECTION + '.',
                        ''
                    );
                    const oldValue = oldConfig.inspect(oldSettingKey);

                    if (
                        oldValue &&
                        (oldValue.globalValue !== undefined ||
                            oldValue.workspaceValue !== undefined)
                    ) {
                        const value =
                            oldValue.globalValue ?? oldValue.workspaceValue;
                        const target =
                            oldValue.globalValue !== undefined
                                ? vscode.ConfigurationTarget.Global
                                : vscode.ConfigurationTarget.Workspace;

                        await newConfig.update(oldSettingKey, value, target);
                        await oldConfig.update(
                            oldSettingKey,
                            undefined,
                            target
                        );

                        Logger.debug('Migrated provider setting: ' + key);
                        migrated = true;
                    }
                } catch (error) {
                    Logger.error(
                        'Failed to migrate provider setting ' + key + ':',
                        error
                    );
                }
            }
        }

        return migrated;
    }

    /**
     * Migrate secrets (API keys) from old keys to new keys
     */
    private static async migrateSecrets(
        context: vscode.ExtensionContext
    ): Promise<boolean> {
        let migrated = false;

        for (const provider of KNOWN_PROVIDERS) {
            // API key patterns
            const oldKeyPatterns = [
                OLD_CONFIG_SECTION + '.' + provider + '.apiKey',
                OLD_CONFIG_SECTION + '.' + provider + '.codingPlanApiKey',
                OLD_CONFIG_SECTION + '.' + provider + '.credentials'
            ];

            for (const oldKey of oldKeyPatterns) {
                try {
                    const value = await context.secrets.get(oldKey);
                    if (value) {
                        const newKey = oldKey.replace(
                            OLD_CONFIG_SECTION + '.',
                            NEW_CONFIG_SECTION + '.'
                        );
                        await context.secrets.store(newKey, value);
                        await context.secrets.delete(oldKey);

                        Logger.debug(
                            'Migrated secret: ' + oldKey + ' -> ' + newKey
                        );
                        migrated = true;
                    }
                } catch (error) {
                    Logger.error(
                        'Failed to migrate secret ' + oldKey + ':',
                        error
                    );
                }
            }
        }

        return migrated;
    }

    /**
     * Migrate global state keys from old prefix to new prefix
     */
    private static async migrateGlobalState(
        context: vscode.ExtensionContext
    ): Promise<boolean> {
        let migrated = false;

        // Get all keys from global state
        const keys = context.globalState.keys();

        for (const key of keys) {
            // Skip the migration version key
            if (key === MIGRATION_VERSION_KEY) {
                continue;
            }

            // Check if this is a chp.* key
            if (key.startsWith(OLD_CONFIG_SECTION + '.')) {
                try {
                    const value = context.globalState.get(key);
                    if (value !== undefined) {
                        const newKey = key.replace(
                            OLD_CONFIG_SECTION + '.',
                            NEW_CONFIG_SECTION + '.'
                        );
                        await context.globalState.update(newKey, value);
                        await context.globalState.update(key, undefined);

                        Logger.debug(
                            'Migrated global state: ' + key + ' -> ' + newKey
                        );
                        migrated = true;
                    }
                } catch (error) {
                    Logger.error(
                        'Failed to migrate global state ' + key + ':',
                        error
                    );
                }
            }
        }

        return migrated;
    }

    /**
     * Force re-run of migration (for testing or recovery)
     */
    static async forceMigration(
        context: vscode.ExtensionContext
    ): Promise<boolean> {
        await context.globalState.update(MIGRATION_VERSION_KEY, 0);
        return SettingsMigrator.migrateIfNeeded(context);
    }
}
