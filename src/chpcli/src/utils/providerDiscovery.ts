import type { OllamaModelDescriptor } from './providerRecommendation.ts'

export const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434'
export const DEFAULT_ATOMIC_CHAT_BASE_URL = 'http://127.0.0.1:1337'

function withTimeoutSignal(timeoutMs: number): {
  signal: AbortSignal
  clear: () => void
} {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeout),
  }
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

export function getOllamaApiBaseUrl(baseUrl?: string): string {
  const parsed = new URL(
    baseUrl || process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL,
  )
  const pathname = trimTrailingSlash(parsed.pathname)
  parsed.pathname = pathname.endsWith('/v1')
    ? pathname.slice(0, -3) || '/'
    : pathname || '/'
  parsed.search = ''
  parsed.hash = ''
  return trimTrailingSlash(parsed.toString())
}

export function getOllamaChatBaseUrl(baseUrl?: string): string {
  return `${getOllamaApiBaseUrl(baseUrl)}/v1`
}

export function getAtomicChatApiBaseUrl(baseUrl?: string): string {
  const parsed = new URL(
    baseUrl || process.env.ATOMIC_CHAT_BASE_URL || DEFAULT_ATOMIC_CHAT_BASE_URL,
  )
  const pathname = trimTrailingSlash(parsed.pathname)
  parsed.pathname = pathname.endsWith('/v1')
    ? pathname.slice(0, -3) || '/'
    : pathname || '/'
  parsed.search = ''
  parsed.hash = ''
  return trimTrailingSlash(parsed.toString())
}

export function getAtomicChatChatBaseUrl(baseUrl?: string): string {
  return `${getAtomicChatApiBaseUrl(baseUrl)}/v1`
}

export async function hasLocalOllama(baseUrl?: string): Promise<boolean> {
  const { signal, clear } = withTimeoutSignal(1200)
  try {
    const response = await fetch(`${getOllamaApiBaseUrl(baseUrl)}/api/tags`, {
      method: 'GET',
      signal,
    })
    return response.ok
  } catch {
    return false
  } finally {
    clear()
  }
}

export async function listOllamaModels(
  baseUrl?: string,
): Promise<OllamaModelDescriptor[]> {
  const { signal, clear } = withTimeoutSignal(5000)
  try {
    const response = await fetch(`${getOllamaApiBaseUrl(baseUrl)}/api/tags`, {
      method: 'GET',
      signal,
    })
    if (!response.ok) {
      return []
    }

    const data = (await response.json()) as {
      models?: Array<{
        name?: string
        size?: number
        details?: {
          family?: string
          families?: string[]
          parameter_size?: string
          quantization_level?: string
        }
      }>
    }

    return (data.models ?? [])
      .filter(model => Boolean(model.name))
      .map(model => ({
        name: model.name!,
        sizeBytes: typeof model.size === 'number' ? model.size : null,
        family: model.details?.family ?? null,
        families: model.details?.families ?? [],
        parameterSize: model.details?.parameter_size ?? null,
        quantizationLevel: model.details?.quantization_level ?? null,
      }))
  } catch {
    return []
  } finally {
    clear()
  }
}

export async function hasLocalAtomicChat(baseUrl?: string): Promise<boolean> {
  const { signal, clear } = withTimeoutSignal(1200)
  try {
    const response = await fetch(`${getAtomicChatChatBaseUrl(baseUrl)}/models`, {
      method: 'GET',
      signal,
    })
    return response.ok
  } catch {
    return false
  } finally {
    clear()
  }
}

export async function listAtomicChatModels(
  baseUrl?: string,
): Promise<string[]> {
  const { signal, clear } = withTimeoutSignal(5000)
  try {
    const response = await fetch(`${getAtomicChatChatBaseUrl(baseUrl)}/models`, {
      method: 'GET',
      signal,
    })
    if (!response.ok) {
      return []
    }

    const data = (await response.json()) as {
      data?: Array<{ id?: string }>
    }

    return (data.data ?? [])
      .filter(model => Boolean(model.id))
      .map(model => model.id!)
  } catch {
    return []
  } finally {
    clear()
  }
}

export async function benchmarkOllamaModel(
  modelName: string,
  baseUrl?: string,
): Promise<number | null> {
  const start = Date.now()
  const { signal, clear } = withTimeoutSignal(20000)
  try {
    const response = await fetch(`${getOllamaApiBaseUrl(baseUrl)}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal,
      body: JSON.stringify({
        model: modelName,
        stream: false,
        messages: [{ role: 'user', content: 'Reply with OK.' }],
        options: {
          temperature: 0,
          num_predict: 8,
        },
      }),
    })
    if (!response.ok) {
      return null
    }
    await response.json()
    return Date.now() - start
  } catch {
    return null
  } finally {
    clear()
  }
}
