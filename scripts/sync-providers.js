const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const ROOT = path.join(__dirname, "..");
const KNOWN_PROVIDERS_FILE = path.join(
    ROOT,
    "src",
    "utils",
    "knownProviders.ts",
);
const PROVIDER_KEYS_FILE = path.join(ROOT, "src", "types", "providerKeys.ts");
const ACCOUNT_MANAGER_FILE = path.join(
    ROOT,
    "src",
    "accounts",
    "accountManager.ts",
);
const ACCOUNT_UI_FILE = path.join(ROOT, "src", "accounts", "accountUI.ts");
const ACCOUNT_SYNC_ADAPTER_FILE = path.join(
    ROOT,
    "src",
    "accounts",
    "accountSyncAdapter.ts",
);
const PACKAGE_JSON_FILE = path.join(ROOT, "package.json");
const PROVIDER_CONFIG_DIR = path.join(ROOT, "src", "providers", "config");
const PROVIDER_CONFIG_INDEX_FILE = path.join(PROVIDER_CONFIG_DIR, "index.ts");

const OAUTH_PROVIDERS = new Set(["codex", "qwencli"]);
const OAUTH_ONLY_PROVIDERS = new Set(["qwencli"]);
const NO_SET_API_KEY_COMMAND_PROVIDERS = new Set([
    "chatjimmy",
    "codex",
    "compatible",
    "qwencli",
]);
const EXTRA_PROVIDER_IDS = ["kimi", "minimax-coding", "openai"];

const EXTRA_PROVIDER_METADATA = {
    kimi: { displayName: "Kimi", supportsApiKey: true },
    "minimax-coding": { displayName: "MiniMax Coding", supportsApiKey: true },
    openai: { displayName: "OpenAI", supportsApiKey: true },
};

const ACCOUNT_UI_LABEL_OVERRIDES = {
    blackbox: "Blackbox",
    codex: "Codex (OpenAI)",
    compatible: "Compatible (Custom)",
    lightningai: "Lightning AI",
    mistral: "Mistral",
    moonshot: "Moonshot",
    zhipu: "ZhipuAI",
};

const ACCOUNT_DISPLAY_NAME_OVERRIDES = {
    blackbox: "Blackbox",
    codex: "Codex (OpenAI)",
    compatible: "Compatible",
    lightningai: "Lightning AI",
    mistral: "Mistral",
    moonshot: "Moonshot",
    zhipu: "ZhipuAI",
};

const ENUM_NAME_OVERRIDES = {
    aihubmix: "AIHubMix",
    chatjimmy: "ChatJimmy",
    deepinfra: "DeepInfra",
    deepseek: "DeepSeek",
    huggingface: "Huggingface",
    lightningai: "LightningAI",
    minimax: "MiniMax",
    "minimax-coding": "MiniMaxCoding",
    modelscope: "ModelScope",
    nvidia: "Nvidia",
    opencode: "OpenCode",
    openai: "OpenAI",
    qwencli: "QwenCli",
    zenmux: "Zenmux",
};

function readUtf8(filePath) {
    return fs.readFileSync(filePath, "utf8");
}

function writeUtf8(filePath, content) {
    fs.writeFileSync(filePath, content, "utf8");
}

function replaceOrThrow(source, pattern, replacement, errorMessage) {
    if (!pattern.test(source)) {
        throw new Error(errorMessage);
    }

    return source.replace(pattern, replacement);
}

function formatTsString(value) {
    return JSON.stringify(value);
}

function formatTsObjectKey(key) {
    return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)
        ? key
        : formatTsString(key);
}

function formatTsIdentifier(key) {
    // Convert provider IDs like "ava-supernova" into a valid TS identifier (e.g. "avaSupernova").
    // This is used for import symbols which cannot be string literals.
    const sanitized = key
        .split(/[^A-Za-z0-9_$]+/)
        .filter(Boolean)
        .map((segment, index) => {
            if (index === 0) {
                // lower camel case for first segment
                return segment.replace(/^[A-Z]/, (m) => m.toLowerCase());
            }
            return segment.charAt(0).toUpperCase() + segment.slice(1);
        })
        .join("");

    // Ensure it doesn't start with a digit
    if (/^[0-9]/.test(sanitized)) {
        return `_${sanitized}`;
    }

    return sanitized || "provider";
}

function objectPropertyName(name) {
    if (
        ts.isIdentifier(name) ||
        ts.isStringLiteral(name) ||
        ts.isNumericLiteral(name)
    ) {
        return name.text;
    }
    return undefined;
}

function getObjectProperty(node, propertyName) {
    for (const property of node.properties) {
        if (!ts.isPropertyAssignment(property)) {
            continue;
        }
        const key = objectPropertyName(property.name);
        if (key === propertyName) {
            return property.initializer;
        }
    }
    return undefined;
}

function getStringProperty(node, propertyName) {
    const initializer = getObjectProperty(node, propertyName);
    if (!initializer) {
        return undefined;
    }
    if (
        ts.isStringLiteral(initializer) ||
        ts.isNoSubstitutionTemplateLiteral(initializer)
    ) {
        return initializer.text;
    }
    return undefined;
}

function getBooleanProperty(node, propertyName) {
    const initializer = getObjectProperty(node, propertyName);
    if (!initializer) {
        return undefined;
    }
    if (initializer.kind === ts.SyntaxKind.TrueKeyword) {
        return true;
    }
    if (initializer.kind === ts.SyntaxKind.FalseKeyword) {
        return false;
    }
    return undefined;
}

function toEnumName(providerId) {
    const override = ENUM_NAME_OVERRIDES[providerId];
    if (override) {
        return override;
    }

    return providerId
        .split(/[^a-zA-Z0-9]+/)
        .filter(Boolean)
        .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join("");
}

function parseKnownProviders() {
    const sourceText = readUtf8(KNOWN_PROVIDERS_FILE);
    const sourceFile = ts.createSourceFile(
        KNOWN_PROVIDERS_FILE,
        sourceText,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
    );

    let providersNode;
    for (const node of sourceFile.statements) {
        if (!ts.isVariableStatement(node)) {
            continue;
        }
        for (const declaration of node.declarationList.declarations) {
            if (
                !ts.isIdentifier(declaration.name) ||
                declaration.name.text !== "knownProviderOverrides"
            ) {
                continue;
            }
            if (
                declaration.initializer &&
                ts.isObjectLiteralExpression(declaration.initializer)
            ) {
                providersNode = declaration.initializer;
                break;
            }
        }
        if (providersNode) {
            break;
        }
    }

    if (!providersNode) {
        throw new Error(
            "Could not find knownProviderOverrides in src/utils/knownProviders.ts",
        );
    }

    const providers = [];
    for (const property of providersNode.properties) {
        if (
            !ts.isPropertyAssignment(property) ||
            !ts.isObjectLiteralExpression(property.initializer)
        ) {
            continue;
        }
        const providerId = objectPropertyName(property.name);
        if (!providerId) {
            continue;
        }
        const providerConfig = property.initializer;
        const displayName =
            getStringProperty(providerConfig, "displayName") || providerId;
        const description = getStringProperty(providerConfig, "description");
        const supportsApiKey = getBooleanProperty(providerConfig, "supportsApiKey");
        const defaultSdkMode = getStringProperty(providerConfig, "sdkMode");
        const openaiNode = getObjectProperty(providerConfig, "openai");
        const anthropicNode = getObjectProperty(providerConfig, "anthropic");
        const responsesNode = getObjectProperty(providerConfig, "responses");
        const hasOpenAI = Boolean(
            openaiNode && ts.isObjectLiteralExpression(openaiNode),
        );
        const hasAnthropic = Boolean(
            anthropicNode && ts.isObjectLiteralExpression(anthropicNode),
        );
        const hasResponses = Boolean(
            responsesNode && ts.isObjectLiteralExpression(responsesNode),
        );

        providers.push({
            id: providerId,
            displayName,
            description,
            supportsApiKey,
            defaultSdkMode,
            hasOpenAI,
            hasAnthropic,
            hasResponses,
        });
    }

    providers.sort((left, right) => left.id.localeCompare(right.id));
    return providers;
}

function buildProviderKeyItems(knownProviders) {
    const items = knownProviders.map((provider) => ({
        id: provider.id,
        enumName: toEnumName(provider.id),
    }));

    for (const extraId of EXTRA_PROVIDER_IDS) {
        items.push({
            id: extraId,
            enumName: toEnumName(extraId),
        });
    }

    items.sort((left, right) => left.enumName.localeCompare(right.enumName));
    return items;
}

function syncProviderKeysFile(providerKeyItems) {
    const enumEntries = providerKeyItems
        .map((item) => `\t${item.enumName} = '${item.id}',`)
        .join("\n");

    const content = `export enum ProviderKey {\n${enumEntries}\n}\n\n/**\n * Provider category for unified settings organization\n */\nexport enum ProviderCategory {\n\tOpenAI = 'openai',\n\tAnthropic = 'anthropic',\n\tOAuth = 'oauth',\n}\n\n/**\n * Provider feature flags used by unified settings UI\n */\nexport interface ProviderFeatureFlags {\n\tsupportsApiKey: boolean;\n\tsupportsOAuth: boolean;\n\tsupportsMultiAccount: boolean;\n\tsupportsConfigWizard: boolean;\n}\n\n/**\n * Provider metadata for unified settings and configuration wizard\n */\nexport interface ProviderMetadata {\n\tid: string;\n\tkey?: ProviderKey;\n\tdisplayName: string;\n\tcategory: ProviderCategory;\n\tsdkMode?: 'openai' | 'anthropic' | 'oai-response' | 'mixed';\n\tdescription?: string;\n\ticon?: string;\n\tsettingsPrefix?: string;\n\tbaseUrl?: string;\n\tfeatures: ProviderFeatureFlags;\n\torder: number;\n}\n`;

    writeUtf8(PROVIDER_KEYS_FILE, content);
}

function buildAccountProviderItems(knownProviders) {
    const items = knownProviders.map((provider) => {
        const isOAuthProvider = OAUTH_PROVIDERS.has(provider.id);
        const supportsApiKey =
            provider.id === "codex"
                ? true
                : OAUTH_ONLY_PROVIDERS.has(provider.id)
                    ? false
                    : provider.supportsApiKey !== false;

        return {
            enumName: toEnumName(provider.id),
            supportsApiKey,
            supportsOAuth: isOAuthProvider,
            supportsMultiAccount: true,
        };
    });

    for (const extraId of EXTRA_PROVIDER_IDS) {
        items.push({
            enumName: toEnumName(extraId),
            supportsApiKey: true,
            supportsOAuth: false,
            supportsMultiAccount: true,
        });
    }

    items.sort((left, right) => left.enumName.localeCompare(right.enumName));
    return items;
}

function buildManagedProviderMetadata(knownProviders) {
    const items = knownProviders.map((provider) => ({
        id: provider.id,
        enumName: toEnumName(provider.id),
        displayName: provider.displayName,
        supportsApiKey: provider.supportsApiKey !== false,
        authType: OAUTH_PROVIDERS.has(provider.id) ? "oauth" : "apiKey",
    }));

    for (const extraId of EXTRA_PROVIDER_IDS) {
        const extraProvider = EXTRA_PROVIDER_METADATA[extraId];
        items.push({
            id: extraId,
            enumName: toEnumName(extraId),
            displayName: extraProvider?.displayName || extraId,
            supportsApiKey: extraProvider?.supportsApiKey !== false,
            authType: "apiKey",
        });
    }

    return items;
}

function getAccountUiLabel(providerId, displayName) {
    return ACCOUNT_UI_LABEL_OVERRIDES[providerId] || displayName;
}

function getAccountDisplayName(providerId, displayName) {
    return ACCOUNT_DISPLAY_NAME_OVERRIDES[providerId] || displayName;
}

function buildAccountUiItems(knownProviders) {
    return buildManagedProviderMetadata(knownProviders)
        .filter(
            (provider) =>
                provider.authType === "oauth" || provider.supportsApiKey === true,
        )
        .map((provider) => ({
            ...provider,
            menuLabel: getAccountUiLabel(provider.id, provider.displayName),
            displayLabel: getAccountDisplayName(provider.id, provider.displayName),
        }))
        .sort((left, right) => {
            const leftGroup =
                left.id === "compatible" ? 2 : left.authType === "oauth" ? 0 : 1;
            const rightGroup =
                right.id === "compatible" ? 2 : right.authType === "oauth" ? 0 : 1;
            if (leftGroup !== rightGroup) {
                return leftGroup - rightGroup;
            }

            return left.menuLabel.localeCompare(right.menuLabel);
        });
}

function buildAccountSyncProviderItems(knownProviders) {
    return buildManagedProviderMetadata(knownProviders)
        .filter(
            (provider) =>
                provider.authType !== "oauth" && provider.supportsApiKey === true,
        )
        .sort((left, right) => left.enumName.localeCompare(right.enumName));
}

function syncAccountManagerFile(accountProviderItems) {
    const source = readUtf8(ACCOUNT_MANAGER_FILE);
    const generatedEntries = accountProviderItems
        .map(
            (provider) =>
                `\t\t[\n\t\t\tProviderKey.${provider.enumName},\n\t\t\t{\n\t\t\t\tsupportsMultiAccount: ${provider.supportsMultiAccount},\n\t\t\t\tsupportsOAuth: ${provider.supportsOAuth},\n\t\t\t\tsupportsApiKey: ${provider.supportsApiKey},\n\t\t\t},\n\t\t],`,
        )
        .join("\n");

    const replacement = `private static providerConfigs = new Map<string, ProviderAccountConfig>([\n${generatedEntries}\n\t]);`;

    const pattern =
        /private static providerConfigs = new Map<string, ProviderAccountConfig>\(\[[\s\S]*?\t\]\);/;
    if (!pattern.test(source)) {
        throw new Error(
            "Could not find providerConfigs map block in src/accounts/accountManager.ts",
        );
    }

    const next = source.replace(pattern, replacement);
    writeUtf8(ACCOUNT_MANAGER_FILE, next);
}

function syncAccountUiFile(accountUiItems) {
    const source = readUtf8(ACCOUNT_UI_FILE);
    const providerEntries = accountUiItems
        .map(
            (provider) =>
                `\t\t\t{\n\t\t\t\tlabel: ${formatTsString(provider.menuLabel)},\n\t\t\t\tvalue: ProviderKey.${provider.enumName},\n\t\t\t\tauthType: ${formatTsString(provider.authType)} as const,\n\t\t\t},`,
        )
        .join("\n");
    const namesEntries = accountUiItems
        .map(
            (provider) =>
                `\t\t\t${formatTsObjectKey(provider.id)}: ${formatTsString(provider.displayLabel)},`,
        )
        .join("\n");

    let next = replaceOrThrow(
        source,
        /\t\tconst providers = \[[\s\S]*?\n\t\t\];/,
        `\t\tconst providers = [\n${providerEntries}\n\t\t];`,
        "Could not find providers array block in src/accounts/accountUI.ts",
    );

    next = replaceOrThrow(
        next,
        /\t\tconst names: Record<string, string> = \{[\s\S]*?\n\t\t\};/,
        `\t\tconst names: Record<string, string> = {\n${namesEntries}\n\t\t};`,
        "Could not find provider names map block in src/accounts/accountUI.ts",
    );

    writeUtf8(ACCOUNT_UI_FILE, next);
}

function syncAccountSyncAdapterFile(syncProviderItems) {
    const source = readUtf8(ACCOUNT_SYNC_ADAPTER_FILE);
    const providerEntries = syncProviderItems
        .map((provider) => `\t\t\tProviderKey.${provider.enumName},`)
        .join("\n");
    const replacement = `\t\tconst providers = [\n${providerEntries}\n\t\t];`;
    const next = replaceOrThrow(
        source,
        /\t\tconst providers = \[[\s\S]*?\n\t\t\];/,
        replacement,
        "Could not find providers array block in src/accounts/accountSyncAdapter.ts",
    );

    writeUtf8(ACCOUNT_SYNC_ADAPTER_FILE, next);
}

function createSetApiKeyCommand(provider) {
    return {
        command: `chp.${provider.id}.setApiKey`,
        title: `Configure ${provider.displayName}`,
        category: "Copilot ++",
    };
}

function createSdkModeProperty(provider) {
    const supportedModes = [];
    if (provider.hasOpenAI) {
        supportedModes.push("openai");
    }
    if (provider.hasAnthropic) {
        supportedModes.push("anthropic");
    }
    if (provider.hasResponses) {
        supportedModes.push("oai-response");
    }

    return {
        type: "string",
        enum: supportedModes,
        default:
            provider.defaultSdkMode ||
            (provider.hasResponses
                ? "oai-response"
                : provider.hasAnthropic
                    ? "anthropic"
                    : "openai"),
        description: `Select SDK compatibility mode for ${provider.displayName}.`,
        scope: "application",
    };
}

function ensureApiKeyProperty(providerProperties, provider) {
    if (providerProperties.apiKey) {
        return;
    }
    providerProperties.apiKey = {
        type: "string",
        description: `${provider.displayName} API key.`,
        secret: true,
    };
}

function createLanguageModelProviderEntry(provider) {
    const properties = {};

    if (provider.supportsApiKey !== false || OAUTH_PROVIDERS.has(provider.id)) {
        ensureApiKeyProperty(properties, provider);
    }

    return {
        vendor: `chp.${provider.id}`,
        displayName: `⦿ ${provider.displayName}${provider.description ? ` (${provider.description})` : ""}`,
        configuration: {
            properties,
        },
    };
}

function syncPackageJson(knownProviders) {
    const packageJson = JSON.parse(readUtf8(PACKAGE_JSON_FILE));
    const providerIds = knownProviders
        .map((provider) => provider.id)
        .filter((providerId) => providerId !== "compatible")
        .sort((left, right) => left.localeCompare(right));
    const providerById = new Map(
        knownProviders.map((provider) => [provider.id, provider]),
    );

    const providerActivationEvents = providerIds.map(
        (providerId) => `onLanguageModelProvider:chp.${providerId}`,
    );
    const staticActivationEvents = (packageJson.activationEvents || []).filter(
        (event) => !event.startsWith("onLanguageModelProvider:chp."),
    );
    packageJson.activationEvents = [
        ...staticActivationEvents,
        ...providerActivationEvents,
    ];

    const commands = Array.isArray(packageJson.contributes?.commands)
        ? packageJson.contributes.commands
        : [];
    const managedProviderIdSet = new Set(providerIds);
    const setApiKeyProviders = providerIds.filter(
        (providerId) => !NO_SET_API_KEY_COMMAND_PROVIDERS.has(providerId),
    );
    const setApiKeyProviderSet = new Set(setApiKeyProviders);

    const retainedCommands = commands.filter((command) => {
        const match = /^chp\.([^.]+)\.setApiKey$/.exec(command.command || "");
        if (!match) {
            return true;
        }
        const providerId = match[1];
        if (!managedProviderIdSet.has(providerId)) {
            return true;
        }
        return setApiKeyProviderSet.has(providerId);
    });

    const existingCommandSet = new Set(
        retainedCommands.map((command) => command.command),
    );
    for (const providerId of setApiKeyProviders) {
        const commandId = `chp.${providerId}.setApiKey`;
        if (existingCommandSet.has(commandId)) {
            continue;
        }
        const provider = providerById.get(providerId);
        if (!provider) {
            continue;
        }
        retainedCommands.push(createSetApiKeyCommand(provider));
    }
    packageJson.contributes.commands = retainedCommands;

    const existingProperties =
        packageJson.contributes?.configuration?.properties || {};
    const preservedPropertyEntries = Object.entries(existingProperties).filter(
        ([propertyKey]) =>
            !/^chp\.[^.]+\.baseUrl$/.test(propertyKey) &&
            !/^chp\.[^.]+\.sdkMode$/.test(propertyKey),
    );

    const syncedProperties = Object.fromEntries(preservedPropertyEntries);

    for (const providerId of providerIds) {
        const provider = providerById.get(providerId);
        if (!provider) {
            continue;
        }

        const supportedModeCount = [
            provider.hasOpenAI,
            provider.hasAnthropic,
            provider.hasResponses,
        ].filter(Boolean).length;
        if (supportedModeCount < 2) {
            continue;
        }
        syncedProperties[`chp.${providerId}.sdkMode`] =
            createSdkModeProperty(provider);
    }

    packageJson.contributes.configuration.properties = syncedProperties;

    const existingLanguageModelProviders = Array.isArray(
        packageJson.contributes?.languageModelChatProviders,
    )
        ? packageJson.contributes.languageModelChatProviders
        : [];
    const existingByVendor = new Map(
        existingLanguageModelProviders
            .filter((entry) => typeof entry?.vendor === "string")
            .map((entry) => [entry.vendor, entry]),
    );

    const syncedLanguageModelProviders = providerIds
        .map((providerId) => {
            const provider = providerById.get(providerId);
            if (!provider) {
                return null;
            }
            const vendor = `chp.${providerId}`;
            const existing = existingByVendor.get(vendor);
            if (!existing) {
                return createLanguageModelProviderEntry(provider);
            }

            const next = {
                ...existing,
                vendor,
                configuration: {
                    ...(existing.configuration || {}),
                    properties: {
                        ...Object.fromEntries(
                            Object.entries(
                                (existing.configuration?.properties) || {},
                            ).filter(([propertyKey]) => propertyKey !== "baseUrl"),
                        ),
                    },
                },
            };

            if (
                provider.supportsApiKey !== false ||
                OAUTH_PROVIDERS.has(provider.id)
            ) {
                ensureApiKeyProperty(next.configuration.properties, provider);
            }

            return next;
        })
        .filter(Boolean);

    packageJson.contributes.languageModelChatProviders =
        syncedLanguageModelProviders;

    if (!packageJson.scripts) {
        packageJson.scripts = {};
    }
    packageJson.scripts["sync-providers"] = "node scripts/sync-providers.js";

    writeUtf8(PACKAGE_JSON_FILE, `${JSON.stringify(packageJson, null, 4)}\n`);
}

function getProviderConfigFiles() {
    const files = fs.readdirSync(PROVIDER_CONFIG_DIR);
    return files
        .filter((file) => file.endsWith(".json") && file !== "index.json")
        .map((file) => file.replace(".json", ""))
        .sort();
}

function syncProviderConfigIndex() {
    const configFiles = getProviderConfigFiles();

    // Read the current index.ts to preserve comments and structure
    let source = readUtf8(PROVIDER_CONFIG_INDEX_FILE);

    // Generate import statements
    const imports = configFiles
        .map((name) => {
            const identifier = formatTsIdentifier(name);
            return `import ${identifier} from "./${name}.json";`;
        })
        .join("\n");

    // Generate providers object entries
    const providerEntries = configFiles
        .map((name) => {
            const identifier = formatTsIdentifier(name);
            const key = formatTsObjectKey(name);
            return `\t${key}: ${identifier},`;
        })
        .join("\n");

    // Replace imports section (from "import type" to the last import before "// Export")
    const importRegex = /import type \{ ProviderConfig \} from "[^"]+";\n[\s\S]*?\n\nconst providers = \{/;
    const importReplacement = `import type { ProviderConfig } from "../../types/sharedTypes";
${imports}

const providers = {`;
    source = source.replace(importRegex, importReplacement);

    // Replace providers object entries
    const providersRegex = /const providers = \{[\s\S]*?\n\};/;
    const providersReplacement = `const providers = {
${providerEntries}
};`;
    source = source.replace(providersRegex, providersReplacement);

    writeUtf8(PROVIDER_CONFIG_INDEX_FILE, source);
}

function run() {
    const knownProviders = parseKnownProviders();
    const providerKeyItems = buildProviderKeyItems(knownProviders);
    const accountProviderItems = buildAccountProviderItems(knownProviders);
    const accountUiItems = buildAccountUiItems(knownProviders);
    const accountSyncProviderItems = buildAccountSyncProviderItems(knownProviders);

    syncProviderKeysFile(providerKeyItems);
    syncAccountManagerFile(accountProviderItems);
    syncAccountUiFile(accountUiItems);
    syncAccountSyncAdapterFile(accountSyncProviderItems);
    syncProviderConfigIndex();
    syncPackageJson(knownProviders);

    console.log(
        `Synced ${knownProviders.length} providers from knownProviders.ts`,
    );
    console.log("Updated: src/types/providerKeys.ts");
    console.log("Updated: src/accounts/accountManager.ts");
    console.log("Updated: src/accounts/accountUI.ts");
    console.log("Updated: src/accounts/accountSyncAdapter.ts");
    console.log("Updated: src/providers/config/index.ts");
    console.log("Updated: package.json");
}

run();
