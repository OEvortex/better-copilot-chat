// Unified Configuration System for Aether CLI
// Inspired by ReVibe's multi-provider and model approach

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

// =============================================================================
// Types
// =============================================================================

/** Backend provider types */
export type Backend =
  | 'mistral'
  | 'openai'
  | 'groq'
  | 'huggingface'
  | 'ollama'
  | 'llamacpp'
  | 'cerebras'
  | 'generic'
  | 'qwen'
  | 'openrouter'
  | 'geminicli'
  | 'opencode'
  | 'kilocode'
  | 'antigravity'
  | 'chutes'

/** Tool calling format */
export type ToolFormat = 'native' | 'xml'

/** Provider configuration */
export interface ProviderConfig {
  name: string
  backend: Backend
  api_base: string
  api_key_env_var: string
  api_style: 'openai' | 'anthropic' | 'opencode' | 'antigravity'
}

/** Model configuration */
export interface ModelConfig {
  name: string
  provider: string
  alias: string
  temperature: number
  input_price: number
  output_price: number
  context: number
  max_output: number
  supported_formats: ToolFormat[]
  supports_thinking: boolean
  capabilities?: {
    toolCalling?: boolean
    imageInput?: boolean
  }
}

// =============================================================================
// Default Providers
// =============================================================================

export const DEFAULT_PROVIDERS: ProviderConfig[] = [
  // Mistral
  {
    name: 'mistral',
    backend: 'mistral',
    api_base: 'https://api.mistral.ai/v1',
    api_key_env_var: 'MISTRAL_API_KEY',
    api_style: 'openai',
  },
  // OpenAI
  {
    name: 'openai',
    backend: 'openai',
    api_base: 'https://api.openai.com/v1',
    api_key_env_var: 'OPENAI_API_KEY',
    api_style: 'openai',
  },
  // HuggingFace
  {
    name: 'huggingface',
    backend: 'huggingface',
    api_base: 'https://router.huggingface.co/v1',
    api_key_env_var: 'HUGGINGFACE_API_KEY',
    api_style: 'openai',
  },
  // Groq
  {
    name: 'groq',
    backend: 'groq',
    api_base: 'https://api.groq.com/openai/v1',
    api_key_env_var: 'GROQ_API_KEY',
    api_style: 'openai',
  },
  // Ollama (local)
  {
    name: 'ollama',
    backend: 'ollama',
    api_base: 'http://127.0.0.1:11434/v1',
    api_key_env_var: '',
    api_style: 'openai',
  },
  // LlamaCpp (local)
  {
    name: 'llamacpp',
    backend: 'llamacpp',
    api_base: 'http://127.0.0.1:8080/v1',
    api_key_env_var: '',
    api_style: 'openai',
  },
  // Cerebras
  {
    name: 'cerebras',
    backend: 'cerebras',
    api_base: 'https://api.cerebras.ai/v1',
    api_key_env_var: 'CEREBRAS_API_KEY',
    api_style: 'openai',
  },
  // Qwen Code
  {
    name: 'qwencode',
    backend: 'qwen',
    api_base: '',
    api_key_env_var: '',
    api_style: 'openai',
  },
  // OpenRouter
  {
    name: 'openrouter',
    backend: 'openrouter',
    api_base: 'https://openrouter.ai/api/v1',
    api_key_env_var: 'OPENROUTER_API_KEY',
    api_style: 'openai',
  },
  // Gemini CLI
  {
    name: 'geminicli',
    backend: 'geminicli',
    api_base: '',
    api_key_env_var: '',
    api_style: 'openai',
  },
  // OpenCode
  {
    name: 'opencode',
    backend: 'opencode',
    api_base: 'https://opencode.ai/zen/v1',
    api_key_env_var: 'OPENCODE_API_KEY',
    api_style: 'opencode',
  },
  // KiloCode
  {
    name: 'kilocode',
    backend: 'kilocode',
    api_base: 'https://api.kilo.ai/api/openrouter',
    api_key_env_var: 'KILOCODE_API_KEY',
    api_style: 'openai',
  },
  // Antigravity
  {
    name: 'antigravity',
    backend: 'antigravity',
    api_base: '',
    api_key_env_var: '',
    api_style: 'antigravity',
  },
  // Chutes
  {
    name: 'chutes',
    backend: 'chutes',
    api_base: 'https://llm.chutes.ai/v1',
    api_key_env_var: 'CHUTES_API_KEY',
    api_style: 'openai',
  },
]

// =============================================================================
// Default Models
// =============================================================================

export const DEFAULT_MODELS: ModelConfig[] = [
  // Mistral models
  {
    name: 'mistral-vibe-cli-latest',
    provider: 'mistral',
    alias: 'devstral-2',
    temperature: 0.2,
    input_price: 0.4,
    output_price: 2.0,
    context: 200000,
    max_output: 32000,
    supported_formats: ['native', 'xml'],
    supports_thinking: false,
    capabilities: { toolCalling: true },
  },
  {
    name: 'devstral-small-latest',
    provider: 'mistral',
    alias: 'devstral-small',
    temperature: 0.2,
    input_price: 0.1,
    output_price: 0.3,
    context: 200000,
    max_output: 32000,
    supported_formats: ['native', 'xml'],
    supports_thinking: false,
    capabilities: { toolCalling: true },
  },
  // OpenAI models
  {
    name: 'gpt-5.2',
    provider: 'openai',
    alias: 'gpt-5.2',
    temperature: 0.2,
    input_price: 1.75,
    output_price: 14.0,
    context: 400000,
    max_output: 128000,
    supported_formats: ['native', 'xml'],
    supports_thinking: false,
    capabilities: { toolCalling: true, imageInput: true },
  },
  {
    name: 'gpt-4.1',
    provider: 'openai',
    alias: 'gpt-4.1',
    temperature: 0.2,
    input_price: 2.0,
    output_price: 8.0,
    context: 1000000,
    max_output: 32768,
    supported_formats: ['native', 'xml'],
    supports_thinking: false,
    capabilities: { toolCalling: true, imageInput: true },
  },
  // Groq models
  {
    name: 'moonshotai/kimi-k2-instruct-0905',
    provider: 'groq',
    alias: 'kimi-k2',
    temperature: 0.2,
    input_price: 1,
    output_price: 3,
    context: 262144,
    max_output: 16384,
    supported_formats: ['native', 'xml'],
    supports_thinking: false,
    capabilities: { toolCalling: true },
  },
  {
    name: 'llama-3.3-70b-versatile',
    provider: 'groq',
    alias: 'llama-3.3-70b-groq',
    temperature: 0.2,
    input_price: 0.59,
    output_price: 0.79,
    context: 131072,
    max_output: 32768,
    supported_formats: ['native', 'xml'],
    supports_thinking: false,
    capabilities: { toolCalling: true },
  },
  // HuggingFace models
  {
    name: 'MiniMaxAI/MiniMax-M2.1',
    provider: 'huggingface',
    alias: 'minimax-m2.1',
    temperature: 0.2,
    input_price: 0.3,
    output_price: 1.2,
    context: 204800,
    max_output: 32000,
    supported_formats: ['native', 'xml'],
    supports_thinking: false,
    capabilities: { toolCalling: true },
  },
  {
    name: 'XiaomiMiMo/MiMo-V2-Flash',
    provider: 'huggingface',
    alias: 'mimo-v2-flash',
    temperature: 0.2,
    input_price: 0.098,
    output_price: 0.293,
    context: 262144,
    max_output: 16384,
    supported_formats: ['native', 'xml'],
    supports_thinking: false,
    capabilities: { toolCalling: true },
  },
  // Cerebras models
  {
    name: 'llama-3.3-70b',
    provider: 'cerebras',
    alias: 'llama-3.3-70b-cerebras',
    temperature: 0.2,
    input_price: 0.85,
    output_price: 1.20,
    context: 128000,
    max_output: 65536,
    supported_formats: ['native', 'xml'],
    supports_thinking: false,
    capabilities: { toolCalling: true },
  },
  // Qwen Code models
  {
    name: 'qwen3-coder-plus',
    provider: 'qwencode',
    alias: 'qwen-coder-plus',
    temperature: 0.2,
    input_price: 0.0,
    output_price: 0.0,
    context: 1000000,
    max_output: 65536,
    supported_formats: ['native', 'xml'],
    supports_thinking: false,
    capabilities: { toolCalling: true },
  },
  {
    name: 'qwen3-coder-flash',
    provider: 'qwencode',
    alias: 'qwen-coder-flash',
    temperature: 0.2,
    input_price: 0.0,
    output_price: 0.0,
    context: 1000000,
    max_output: 65536,
    supported_formats: ['native', 'xml'],
    supports_thinking: false,
    capabilities: { toolCalling: true },
  },
  // OpenRouter models
  {
    name: 'mistralai/devstral-2512',
    provider: 'openrouter',
    alias: 'devstral-2512',
    temperature: 0.2,
    input_price: 0.05,
    output_price: 0.22,
    context: 262000,
    max_output: 32768,
    supported_formats: ['native', 'xml'],
    supports_thinking: false,
    capabilities: { toolCalling: true },
  },
  {
    name: 'xiaomi/mimo-v2-flash:free',
    provider: 'openrouter',
    alias: 'mimo-v2-flash-free',
    temperature: 0.2,
    input_price: 0.0,
    output_price: 0.0,
    context: 262000,
    max_output: 16384,
    supported_formats: ['native', 'xml'],
    supports_thinking: false,
    capabilities: { toolCalling: true },
  },
  // OpenCode models
  {
    name: 'claude-opus-4-5',
    provider: 'opencode',
    alias: 'claude-opus-4-5',
    temperature: 0.2,
    input_price: 5.0,
    output_price: 15.0,
    context: 200000,
    max_output: 64000,
    supported_formats: ['native', 'xml'],
    supports_thinking: false,
    capabilities: { toolCalling: true, imageInput: true },
  },
  {
    name: 'claude-sonnet-4',
    provider: 'opencode',
    alias: 'claude-sonnet-4',
    temperature: 0.2,
    input_price: 3.0,
    output_price: 15.0,
    context: 200000,
    max_output: 64000,
    supported_formats: ['native', 'xml'],
    supports_thinking: false,
    capabilities: { toolCalling: true, imageInput: true },
  },
  {
    name: 'claude-3-5-haiku',
    provider: 'opencode',
    alias: 'claude-3-5-haiku',
    temperature: 0.2,
    input_price: 0.25,
    output_price: 1.25,
    context: 200000,
    max_output: 8192,
    supported_formats: ['native', 'xml'],
    supports_thinking: false,
    capabilities: { toolCalling: true, imageInput: true },
  },
  {
    name: 'gpt-5.2',
    provider: 'opencode',
    alias: 'gpt-5.2',
    temperature: 0.2,
    input_price: 2.5,
    output_price: 10.0,
    context: 128000,
    max_output: 64000,
    supported_formats: ['native', 'xml'],
    supports_thinking: false,
    capabilities: { toolCalling: true, imageInput: true },
  },
  // KiloCode models
  {
    name: 'x-ai/grok-code-fast-1',
    provider: 'kilocode',
    alias: 'grok-code-fast-1',
    temperature: 0.2,
    input_price: 0.0,
    output_price: 0.0,
    context: 256000,
    max_output: 16384,
    supported_formats: ['native', 'xml'],
    supports_thinking: false,
    capabilities: { toolCalling: true },
  },
  // Antigravity models (XML only)
  {
    name: 'claude-sonnet-4-5',
    provider: 'antigravity',
    alias: 'antigravity-claude-sonnet-4-5',
    temperature: 0.2,
    input_price: 0.0,
    output_price: 0.0,
    context: 200000,
    max_output: 8192,
    supported_formats: ['xml'],
    supports_thinking: false,
  },
  {
    name: 'claude-opus-4-5-thinking',
    provider: 'antigravity',
    alias: 'antigravity-claude-opus-4-5-thinking',
    temperature: 0.2,
    input_price: 0.0,
    output_price: 0.0,
    context: 200000,
    max_output: 64000,
    supported_formats: ['xml'],
    supports_thinking: true,
  },
  // Chutes models
  {
    name: 'Qwen/Qwen3-235B-A22B-Instruct-2507-TEE',
    provider: 'chutes',
    alias: 'qwen3-235b',
    temperature: 0.2,
    input_price: 0.08,
    output_price: 0.55,
    context: 262144,
    max_output: 65536,
    supported_formats: ['native', 'xml'],
    supports_thinking: false,
    capabilities: { toolCalling: true },
  },
  {
    name: 'deepseek-ai/DeepSeek-R1-0528-TEE',
    provider: 'chutes',
    alias: 'deepseek-r1',
    temperature: 0.2,
    input_price: 0.4,
    output_price: 1.75,
    context: 163840,
    max_output: 65536,
    supported_formats: ['native', 'xml'],
    supports_thinking: true,
    capabilities: { toolCalling: true },
  },
]

// =============================================================================
// Configuration State
// =============================================================================

interface AetherConfigState {
  active_model: string
  active_provider: string | null
  models: ModelConfig[]
  providers: ProviderConfig[]
  tool_format: ToolFormat
}

let currentConfig: AetherConfigState = {
  active_model: 'devstral-2',
  active_provider: 'opencode',
  models: [...DEFAULT_MODELS],
  providers: [...DEFAULT_PROVIDERS],
  tool_format: 'native',
}

// =============================================================================
// Config Loading from TOML (for future use)
// =============================================================================

/**
 * Load configuration from TOML file
 * Priority: project .aether/config.toml > ~/.aether/config.toml
 */
export function loadConfigFromToml(): void {
  const projectConfigPath = join(process.cwd(), '.aether', 'config.toml')
  const globalConfigPath = join(homedir(), '.aether', 'config.toml')

  let configPath: string | null = null
  if (existsSync(projectConfigPath)) {
    configPath = projectConfigPath
  } else if (existsSync(globalConfigPath)) {
    configPath = globalConfigPath
  }

  if (!configPath) {
    return // Use defaults
  }

  try {
    const content = readFileSync(configPath, 'utf-8')
    // Note: Full TOML parsing would require a TOML library
    // For now, we just detect the file exists
    console.log(`[Aether Config] Loaded from ${configPath}`)
  } catch (error) {
    console.error('[Aether Config] Error loading config:', error)
  }
}

// =============================================================================
// Active Model/Provider Management
// =============================================================================

/**
 * Get the current active model configuration
 */
export function getActiveModel(): ModelConfig {
  const model = currentConfig.models.find(
    (m) => m.alias === currentConfig.active_model || m.name === currentConfig.active_model
  )
  if (model) {
    return model
  }
  // Fallback to first model
  return currentConfig.models[0] || DEFAULT_MODELS[0]
}

/**
 * Get the current active provider configuration
 */
export function getActiveProvider(): ProviderConfig | null {
  const activeModel = getActiveModel()
  if (activeModel) {
    return currentConfig.providers.find((p) => p.name === activeModel.provider) || null
  }
  return currentConfig.active_provider
    ? currentConfig.providers.find((p) => p.name === currentConfig.active_provider) || null
    : null
}

/**
 * Set the active model by alias or name
 */
export function setActiveModel(modelIdentifier: string): boolean {
  const model = currentConfig.models.find(
    (m) => m.alias === modelIdentifier || m.name === modelIdentifier
  )
  if (model) {
    currentConfig.active_model = model.alias
    console.log(`[Aether] Switched to model: ${model.alias} (${model.provider})`)
    return true
  }
  return false
}

/**
 * Set the active provider
 */
export function setActiveProvider(providerName: string): boolean {
  const provider = currentConfig.providers.find((p) => p.name === providerName)
  if (provider) {
    currentConfig.active_provider = provider.name
    console.log(`[Aether] Switched to provider: ${provider.name}`)
    return true
  }
  return false
}

/**
 * Get all available models, optionally filtered by provider
 */
export function getModels(provider?: string): ModelConfig[] {
  if (provider) {
    return currentConfig.models.filter((m) => m.provider === provider)
  }
  return [...currentConfig.models]
}

/**
 * Get all available providers
 */
export function getProviders(): ProviderConfig[] {
  return [...currentConfig.providers]
}

/**
 * Find a model by alias (supports provider/model syntax like "opencode/gpt-5.2")
 */
export function findModelByAlias(alias: string): ModelConfig | null {
  // Handle provider/model syntax
  if (alias.includes('/')) {
    const [provider, modelAlias] = alias.split('/')
    return currentConfig.models.find(
      (m) => m.provider === provider && (m.alias === modelAlias || m.name.includes(modelAlias))
    ) || null
  }
  // Simple alias lookup
  return (
    currentConfig.models.find(
      (m) => m.alias === alias || m.name === alias
    ) || null
  )
}

/**
 * Get model by name or alias
 */
export function getModel(modelIdentifier: string): ModelConfig | null {
  return (
    currentConfig.models.find(
      (m) => m.alias === modelIdentifier || m.name === modelIdentifier
    ) || null
  )
}

/**
 * Get provider by name
 */
export function getProvider(providerName: string): ProviderConfig | null {
  return currentConfig.providers.find((p) => p.name === providerName) || null
}

/**
 * Add a custom model to the configuration
 */
export function addCustomModel(model: ModelConfig): void {
  currentConfig.models.push(model)
  console.log(`[Aether] Added custom model: ${model.alias} (${model.provider})`)
}

/**
 * Add a custom provider to the configuration
 */
export function addCustomProvider(provider: ProviderConfig): void {
  currentConfig.providers.push(provider)
  console.log(`[Aether] Added custom provider: ${provider.name}`)
}

/**
 * Get the current tool format (auto-switches to XML for antigravity)
 */
export function getEffectiveToolFormat(): ToolFormat {
  const activeModel = getActiveModel()
  if (activeModel.provider === 'antigravity') {
    return 'xml'
  }
  return currentConfig.tool_format
}

/**
 * Set tool format
 */
export function setToolFormat(format: ToolFormat): void {
  currentConfig.tool_format = format
}

/**
 * Get current active model alias
 */
export function getActiveModelAlias(): string {
  return currentConfig.active_model
}

/**
 * Get current active provider name
 */
export function getActiveProviderName(): string | null {
  const provider = getActiveProvider()
  return provider?.name || currentConfig.active_provider
}

/**
 * Export current configuration state (for debugging/saving)
 */
export function getConfigState(): AetherConfigState {
  return { ...currentConfig }
}

/**
 * Import configuration state
 */
export function setConfigState(state: Partial<AetherConfigState>): void {
  if (state.active_model) currentConfig.active_model = state.active_model
  if (state.active_provider !== undefined) currentConfig.active_provider = state.active_provider
  if (state.models) currentConfig.models = state.models
  if (state.providers) currentConfig.providers = state.providers
  if (state.tool_format) currentConfig.tool_format = state.tool_format
}