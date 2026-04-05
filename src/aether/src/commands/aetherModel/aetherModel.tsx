// Enhanced Model/Provider Command using Aether Config System
// This provides hot-swappable model switching like ReVibe

import * as React from 'react'
import type { CommandResultDisplay } from '../../commands.js'
import { COMMON_HELP_ARGS, COMMON_INFO_ARGS } from '../../constants/xml.js'
import { logEvent } from '../../services/analytics/index.js'
import {
  getActiveModel,
  getActiveModelAlias,
  getActiveProviderName,
  getModels,
  getProviders,
  setActiveModel,
  setActiveProvider,
  getEffectiveToolFormat,
  type ModelConfig,
  type ProviderConfig,
} from '../../utils/aetherConfig.js'

interface ModelProviderPickerProps {
  onDone: (message: string, display?: CommandResultDisplay) => void
  args?: string
}

// Simple list component for model/provider selection
function ModelList({ models, onSelect }: { models: ModelConfig[]; onSelect: (m: ModelConfig) => void }) {
  const activeAlias = getActiveModelAlias()
  return (
    <div>
      <div style={{ padding: '8px', borderBottom: '1px solid #444' }}>
        <strong>Available Models ({models.length})</strong>
      </div>
      {models.map((model) => (
        <div
          key={model.alias}
          style={{
            padding: '8px 12px',
            cursor: 'pointer',
            backgroundColor: model.alias === activeAlias ? '#2d5a2d' : 'transparent',
            borderBottom: '1px solid #333',
          }}
          onClick={() => onSelect(model)}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 'bold' }}>{model.alias}</span>
            <span style={{ color: '#888' }}>{model.provider}</span>
          </div>
          <div style={{ fontSize: '12px', color: '#666' }}>
            Context: {model.context.toLocaleString()} | Max output: {model.max_output.toLocaleString()}
            {model.input_price > 0 && ` | $${model.input_price}/M in`}
            {model.output_price > 0 && ` $${model.output_price}/M out`}
          </div>
        </div>
      ))}
    </div>
  )
}

function ProviderList({ providers, onSelect }: { providers: ProviderConfig[]; onSelect: (p: ProviderConfig) => void }) {
  const activeProvider = getActiveProviderName()
  return (
    <div>
      <div style={{ padding: '8px', borderBottom: '1px solid #444' }}>
        <strong>Available Providers ({providers.length})</strong>
      </div>
      {providers.map((provider) => (
        <div
          key={provider.name}
          style={{
            padding: '8px 12px',
            cursor: 'pointer',
            backgroundColor: provider.name === activeProvider ? '#2d5a2d' : 'transparent',
            borderBottom: '1px solid #333',
          }}
          onClick={() => onSelect(provider)}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 'bold' }}>{provider.name}</span>
            <span style={{ color: '#888' }}>{provider.backend}</span>
          </div>
          <div style={{ fontSize: '12px', color: '#666' }}>
            {provider.api_base || '(auto)'}
            {provider.api_key_env_var && ` | Key: ${provider.api_key_env_var}`}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function ModelProviderPicker({ onDone, args }: ModelProviderPickerProps) {
  const [mode, setMode] = React.useState<'model' | 'provider'>('model')
  const activeModel = getActiveModel()
  const activeProviderName = getActiveProviderName()
  const toolFormat = getEffectiveToolFormat()

  // Parse args to determine initial mode
  React.useEffect(() => {
    if (args) {
      const arg = args.trim().toLowerCase()
      if (arg === 'provider' || arg === 'p') {
        setMode('provider')
      } else if (arg === 'model' || arg === 'm') {
        setMode('model')
      } else {
        // Try to set model directly from arg
        if (setActiveModel(arg)) {
          const model = getActiveModel()
          onDone(`Switched to model: ${model.alias} (${model.provider})`)
        }
      }
    }
  }, [args])

  const handleModelSelect = (model: ModelConfig) => {
    const previousModel = getActiveModelAlias()
    setActiveModel(model.alias)
    logEvent('aether_model_switch', {
      from_model: previousModel,
      to_model: model.alias,
      provider: model.provider,
    })
    onDone(
      `Switched to ${model.alias} (${model.provider}) • Context: ${(model.context / 1000).toFixed(0)}K • Tool format: ${toolFormat}`
    )
  }

  const handleProviderSelect = (provider: ProviderConfig) => {
    const previousProvider = getActiveProviderName()
    setActiveProvider(provider.name)
    logEvent('aether_provider_switch', {
      from_provider: previousProvider,
      to_provider: provider.name,
    })
    onDone(`Switched to provider: ${provider.name} (${provider.backend})`)
  }

  return (
    <div style={{ padding: '16px', backgroundColor: '#1a1a1a', color: '#fff', minHeight: '400px' }}>
      {/* Header with current status */}
      <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#252525', borderRadius: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span>
            <strong>Active Model:</strong> {activeModel.alias}
          </span>
          <span style={{ color: '#888' }}>{activeModel.provider}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>
            <strong>Active Provider:</strong> {activeProviderName || 'auto'}
          </span>
          <span style={{ color: '#888' }}>Format: {toolFormat}</span>
        </div>
      </div>

      {/* Tab buttons */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button
          onClick={() => setMode('model')}
          style={{
            padding: '8px 16px',
            backgroundColor: mode === 'model' ? '#4a7c59' : '#333',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Models
        </button>
        <button
          onClick={() => setMode('provider')}
          style={{
            padding: '8px 16px',
            backgroundColor: mode === 'provider' ? '#4a7c59' : '#333',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Providers
        </button>
      </div>

      {/* Content */}
      {mode === 'model' ? (
        <ModelList models={getModels()} onSelect={handleModelSelect} />
      ) : (
        <ProviderList providers={getProviders()} onSelect={handleProviderSelect} />
      )}

      {/* Help text */}
      <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#252525', borderRadius: '8px', fontSize: '12px', color: '#888' }}>
        <strong>Quick commands:</strong>
        <br />
        /model [alias] - Switch to model by alias (e.g., /model gpt-5.2)
        <br />
        /model opencode/gpt-5.2 - Switch to specific provider's model
        <br />
        /provider [name] - Switch provider (e.g., /provider openrouter)
      </div>
    </div>
  )
}

export const call = ModelProviderPicker
export const description = 'Select AI model and provider for Aether (hot-swappable)'
export const argumentHint = '[model-alias]'