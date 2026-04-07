/*---------------------------------------------------------------------------------------------
 *  OpenAI SDK adapter — uses the official OpenAI SDK natively.
 *  Exposes the same .messages.create({...}).withResponse() API as Anthropic.
 *  Supports: OpenAI, Azure, Ollama, LM Studio, OpenRouter, Together,
 *  Groq, Fireworks, DeepSeek, Mistral, Gemini, GitHub Models, Codex.
 *--------------------------------------------------------------------------------------------*/

import OpenAI from 'openai'
import type { BetaRawMessageStreamEvent, BetaMessage, Stream } from '@anthropic-ai/sdk'

import { isEnvTruthy } from '../../utils/envUtils.js'
import { resolveCodexApiCredentials, resolveProviderRequest } from './providerConfig.js'
import {
  codexStreamToAnthropic,
  collectCodexCompletedResponse,
  convertCodexResponseToAnthropicMessage,
  performCodexRequest,
} from './codexShim.js'
import { sanitizeSchemaForOpenAICompat } from './openaiSchemaSanitizer.js'
import { redactSecretValueForDisplay } from '../../utils/providerProfile.js'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const GITHUB_MODELS_BASE = 'https://models.github.ai/inference'
const GITHUB_API_VERSION = '2022-11-28'

// ---------------------------------------------------------------------------
// Client caching
// ---------------------------------------------------------------------------

interface CachedClient { client: OpenAI; lastUsed: number }

class ClientCache {
  private cache = new Map<string, CachedClient>()
  private readonly TTL = 5 * 60 * 1000
  get(key: string): OpenAI | undefined {
    const e = this.cache.get(key)
    if (!e) return undefined
    if (Date.now() - e.lastUsed > this.TTL) { this.cache.delete(key); return undefined }
    e.lastUsed = Date.now()
    return e.client
  }
  set(key: string, c: OpenAI) { this.cache.set(key, { client: c, lastUsed: Date.now() }) }
}

const globalClientCache = new ClientCache()

// ---------------------------------------------------------------------------
// Message conversion (Anthropic-format → OpenAI-format)
// ---------------------------------------------------------------------------

function systemToString(system: unknown): string {
  if (!system) return ''
  if (typeof system === 'string') return system
  if (Array.isArray(system)) return system.filter((b: any) => b.type === 'text').map((b: any) => b.text ?? '').join('\n\n')
  return String(system)
}

function contentArrayToString(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return JSON.stringify(content ?? '')
  return content.map((b: any) => {
    if (b?.type === 'text') return b.text ?? ''
    if (b?.type === 'image') return b.source?.type === 'url' && b.source.url ? `[Image](${b.source.url})` : '[image]'
    if (typeof b?.text === 'string') return b.text
    return ''
  }).join('\n')
}

function convertToolResultContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return JSON.stringify(content ?? '')
  return content.map((b: any) => {
    if (b?.type === 'text') return b.text ?? ''
    if (b?.type === 'image') return b.source?.type === 'url' && b.source.url ? `[Image](${b.source.url})` : '[image]'
    if (typeof b?.text === 'string') return b.text
    return ''
  }).join('\n')
}

function anthropicContentToOpenAI(content: unknown): string | Array<{ type: string; text?: string; image_url?: { url: string } }> {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return String(content ?? '')
  const parts: Array<{ type: string; text?: string; image_url?: { url: string } }> = []
  for (const b of content) {
    switch (b?.type) {
      case 'text': parts.push({ type: 'text', text: b.text ?? '' }); break
      case 'image': {
        const s = b.source
        if (s?.type === 'base64') parts.push({ type: 'image_url', image_url: { url: `data:${s.media_type};base64,${s.data}` } })
        else if (s?.type === 'url') parts.push({ type: 'image_url', image_url: { url: s.url } })
        break
      }
      case 'thinking':
        if (b.thinking) parts.push({ type: 'text', text: `<thinking>${b.thinking}</thinking>` })
        break
    }
  }
  if (parts.length === 0) return ''
  if (parts.length === 1 && parts[0].type === 'text') return parts[0].text ?? ''
  return parts
}

interface OaiMsg {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | Array<{ type: string; text?: string; image_url?: { url: string } }>
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string }; extra_content?: Record<string, unknown> }>
  tool_call_id?: string
  name?: string
}

interface Oai_tool {
  type: 'function'
  function: { name: string; description: string; parameters: Record<string, unknown>; strict?: boolean }
}

function convertMessages(messages: Array<{ role: string; message?: { role?: string; content?: unknown }; content?: unknown }>, system: unknown): Oai_msg[] {
  const r: Oai_msg[] = []
  const sys = systemToString(system)
  if (sys) r.push({ role: 'system', content: sys })

  for (const msg of messages) {
    const inner = msg.message ?? msg
    const role = (inner as any).role ?? msg.role
    const content = (inner as any).content

    if (role === 'user') {
      if (Array.isArray(content)) {
        for (const tr of content.filter((b: any) => b.type === 'tool_result')) {
          r.push({ role: 'tool', tool_call_id: tr.tool_use_id ?? 'unknown', content: tr.is_error ? `Error: ${contentArrayToString(tr.content)}` : contentArrayToString(tr.content) })
        }
        const other = content.filter((b: any) => b.type !== 'tool_result')
        if (other.length) r.push({ role: 'user', content: anthropicContentToOpenAI(other) })
      } else {
        r.push({ role: 'user', content: anthropicContentToOpenAI(content) })
      }
    } else if (role === 'assistant') {
      if (Array.isArray(content)) {
        const tus = content.filter((b: any) => b.type === 'tool_use')
        const txt = content.filter((b: any) => b.type !== 'tool_use' && b.type !== 'thinking')
        const asm: Oai_msg = {
          role: 'assistant',
          content: txt.length === 0 ? '' : txt.filter((p: any) => p.type === 'text').map((p: any) => p.text ?? '').join(''),
        }
        if (tus.length) {
          asm.tool_calls = tus.map((t: any) => ({
            id: t.id ?? `call_${crypto.randomUUID().replace(/-/g, '')}`,
            type: 'function' as const,
            function: { name: t.name ?? 'unknown', arguments: typeof t.input === 'string' ? t.input : JSON.stringify(t.input ?? {}) },
            ...(t.extra_content ? { extra_content: t.extra_content } : {}),
          }))
        }
        r.push(asm)
      } else {
        r.push({ role: 'assistant', content: anthropicContentToOpenAI(content) })
      }
    }
  }

  // Coalescing pass: merge consecutive messages of the same role.
  // OpenAI/vLLM/Ollama require strict user↔assistant alternation.
  // Multiple consecutive tool messages are allowed (assistant → tool* → user).
  // Consecutive user or assistant messages must be merged to avoid Jinja
  // template errors like "roles must alternate" (Devstral, Mistral models).
  const coalesced: Oai_msg[] = []
  for (const msg of r) {
    const prev = coalesced[coalesced.length - 1]

    if (prev && prev.role === msg.role && msg.role !== 'tool' && msg.role !== 'system') {
      const prevContent = prev.content
      const curContent = msg.content

      if (typeof prevContent === 'string' && typeof curContent === 'string') {
        prev.content = prevContent + (prevContent && curContent ? '\n' : '') + curContent
      } else {
        const toArray = (
          c: string | Array<{ type: string; text?: string; image_url?: { url: string } }> | undefined,
        ): Array<{ type: string; text?: string; image_url?: { url: string } }> => {
          if (!c) return []
          if (typeof c === 'string') return c ? [{ type: 'text', text: c }] : []
          return c
        }
        prev.content = [...toArray(prevContent), ...toArray(curContent)]
      }

      if (msg.tool_calls?.length) {
        prev.tool_calls = [...(prev.tool_calls ?? []), ...msg.tool_calls]
      }
    } else {
      coalesced.push(msg)
    }
  }

  return coalesced
}

// ---------------------------------------------------------------------------
// Tool conversion
// ---------------------------------------------------------------------------

function normalizeSchema(schema: Record<string, unknown>, strict = true): Record<string, unknown> {
  const r = sanitizeSchemaForOpenAICompat(schema)
  if (r.type === 'object' && r.properties) {
    const existing = Array.isArray(r.required) ? (r.required as string[]) : []
    const props: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(r.properties as Record<string, unknown>)) props[k] = normalizeSchema(v as Record<string, unknown>, strict)
    r.properties = props
    r.required = strict ? Array.from(new Set([...existing, ...Object.keys(props)])) : existing.filter(k => k in props)
    if (strict) r.additionalProperties = false
  }
  if ('items' in r) r.items = Array.isArray(r.items) ? r.items.map(i => normalizeSchema(i as Record<string, unknown>, strict)) : normalizeSchema(r.items as Record<string, unknown>, strict)
  for (const k of ['anyOf', 'oneOf', 'allOf'] as const) { if (k in r && Array.isArray(r[k])) r[k] = r[k].map(i => normalizeSchema(i as Record<string, unknown>, strict)) }
  return r
}

function convertTools(tools: Array<{ name: string; description?: string; input_schema?: Record<string, unknown> }>): Oai_tool[] {
  const isGemini = isEnvTruthy(process.env.CLAUDE_CODE_USE_GEMINI)
  return tools.filter(t => t.name !== 'ToolSearchTool').map(t => {
    const s = { ...(t.input_schema ?? { type: 'object', properties: {} }) }
    return { type: 'function' as const, function: { name: t.name, description: t.description ?? '', parameters: normalizeSchema(s, !isGemini) } }
  })
}

// ---------------------------------------------------------------------------
// Auth + env
// ---------------------------------------------------------------------------

function hydrateKeys() {
  if (isEnvTruthy(process.env.CLAUDE_CODE_USE_GEMINI)) {
    process.env.OPENAI_BASE_URL ??= process.env.GEMINI_BASE_URL ?? 'https://generativelanguage.googleapis.com/v1beta/openai'
    if ((process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY) && !process.env.OPENAI_API_KEY) process.env.OPENAI_API_KEY = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY
    if (process.env.GEMINI_MODEL && !process.env.OPENAI_MODEL) process.env.OPENAI_MODEL = process.env.GEMINI_MODEL
  } else if (isEnvTruthy(process.env.CLAUDE_CODE_USE_GITHUB)) {
    process.env.OPENAI_BASE_URL ??= GITHUB_MODELS_BASE
    process.env.OPENAI_API_KEY ??= process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? ''
  }
}

// ---------------------------------------------------------------------------
// Codex helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Stream → Anthropic-event generator
// ---------------------------------------------------------------------------

function makeMsgId() { return `msg_${crypto.randomUUID().replace(/-/g, '')}` }

function mapFinish(fr: string | null | undefined) {
  switch (fr) { case 'tool_calls': return 'tool_use'; case 'length': return 'max_tokens'; case 'content_filter': case 'safety': return 'end_turn'; default: return 'end_turn' }
}

function parseUsage(chunk: any) {
  const u = chunk.usage
  if (!u) return undefined
  return { input_tokens: u.prompt_tokens ?? 0, output_tokens: u.completion_tokens ?? 0, cache_creation_input_tokens: 0, cache_read_input_tokens: u.prompt_tokens_details?.cached_tokens ?? 0 }
}

async function* openAIStreamToAnthropicEvents(
  stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>,
  model: string,
): AsyncGenerator<BetaRawMessageStreamEvent> {
  const msgId = makeMsgId()
  let cbi = 0 // content block index
  let rbi: number | null = null // reasoning block index
  const tools = new Map<number, { id: string; name: string; idx: number; buf: string }>()
  let textEmitted = false
  let stopReason: string | null = null
  let usageEmitted = false
  let finDone = false
  let textBuf = ''
  let hasText = false

  yield { type: 'message_start', message: { id: msgId, type: 'message', role: 'assistant', content: [], model, stop_reason: null, stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } }

  for await (const chunk of stream) {
    const cu = parseUsage(chunk)
    for (const choice of chunk.choices ?? []) {
      const d = choice.delta

      // Reasoning
      const rd = (d as any).reasoning_content ?? (d as any).reasoning
      if (rd) {
        if (rbi === null) { rbi = cbi; yield { type: 'content_block_start', index: cbi++, content_block: { type: 'thinking', thinking: '' } } }
        yield { type: 'content_block_delta', index: rbi, delta: { type: 'thinking_delta', thinking: rd } }
      }

      // Text
      if (d.content != null && d.content !== '') { textBuf += d.content; hasText = true }

      // Tool calls
      if (d.tool_calls) {
        for (const tc of d.tool_calls) {
          if (tc.id && tc.function?.name) {
            // Flush text
            if (textEmitted) yield { type: 'content_block_stop', index: cbi }
            else if (hasText) { yield { type: 'content_block_start', index: cbi, content_block: { type: 'text', text: '' } }; yield { type: 'content_block_delta', index: cbi, delta: { type: 'text_delta', text: textBuf } }; textEmitted = true; textBuf = '' }
            cbi = textEmitted ? cbi + 1 : cbi

            const ti = cbi
            tools.set(tc.index, { id: tc.id, name: tc.function.name, idx: ti, buf: tc.function.arguments ?? '' })
            yield { type: 'content_block_start', index: ti, content_block: { type: 'tool_use', id: tc.id, name: tc.function.name, input: {} } }
            cbi++
            if (tc.function.arguments) yield { type: 'content_block_delta', index: ti, delta: { type: 'input_json_delta', partial_json: tc.function.arguments } }
          } else if (tc.function?.arguments) {
            const a = tools.get(tc.index)
            if (a) { a.buf += tc.function.arguments; yield { type: 'content_block_delta', index: a.idx, delta: { type: 'input_json_delta', partial_json: tc.function.arguments } } }
          }
        }
      }

      // Finish
      if (choice.finish_reason && !finDone) {
        finDone = true

        // Close reasoning
        if (rbi !== null) yield { type: 'content_block_stop', index: rbi }

        // Flush text
        if (!textEmitted && hasText && textBuf) {
          if (!textEmitted) { yield { type: 'content_block_start', index: cbi, content_block: { type: 'text', text: '' } }; textEmitted = true }
          yield { type: 'content_block_delta', index: cbi, delta: { type: 'text_delta', text: textBuf } }
          hasText = false; textBuf = ''
        } else if (textEmitted && hasText && textBuf) {
          yield { type: 'content_block_delta', index: cbi, delta: { type: 'text_delta', text: textBuf } }; hasText = false; textBuf = ''
        }
        if (textEmitted) yield { type: 'content_block_stop', index: cbi++ }

        // Close tools with JSON repair
        for (const [, t] of tools) {
          let fix = ''
          try { JSON.parse(t.buf) } catch {
            const s = t.buf.trimEnd()
            for (const c of ['}', '"}', ']}', '"]}', '}}', '"}}', ']}}', '"]}}', '"]}]}', '}]}' ]) { try { JSON.parse(s + c); fix = c; break } catch {} }
          }
          if (fix) yield { type: 'content_block_delta', index: t.idx, delta: { type: 'input_json_delta', partial_json: fix } }
          yield { type: 'content_block_stop', index: t.idx }
        }

        stopReason = mapFinish(choice.finish_reason)
        if (choice.finish_reason === 'content_filter' || choice.finish_reason === 'safety') {
          yield { type: 'content_block_start', index: cbi, content_block: { type: 'text', text: '' } }
          yield { type: 'content_block_delta', index: cbi, delta: { type: 'text_delta', text: '\n\n[Content blocked by provider safety filter]' } }
          yield { type: 'content_block_stop', index: cbi++ }
        }
        yield { type: 'message_delta', delta: { stop_reason: stopReason, stop_sequence: null }, ...(cu ? { usage: cu } : {}) }
        if (cu) usageEmitted = true
      }
    }

    // Usage-only chunk
    if (!usageEmitted && cu && (!chunk.choices?.length) && stopReason) {
      yield { type: 'message_delta', delta: { stop_reason: stopReason, stop_sequence: null }, usage: cu }; usageEmitted = true
    }
  }

  if (!usageEmitted && stopReason) yield { type: 'message_delta', delta: { stop_reason: stopReason, stop_sequence: null } }
  yield { type: 'message_stop' }
}

// ---------------------------------------------------------------------------
// Non-streaming response conversion
// ---------------------------------------------------------------------------

function toNonStreaming(data: any, model: string): BetaMessage {
  const ch = data.choices?.[0]
  const content: Array<any> = []
  if (ch?.message?.reasoning) content.push({ type: 'thinking', thinking: ch.message.reasoning })
  if (typeof ch?.message?.content === 'string' && ch.message.content) content.push({ type: 'text', text: ch.message.content })
  if (ch?.message?.tool_calls) {
    for (const tc of ch.message.tool_calls) {
      let inp: unknown; try { inp = JSON.parse(tc.function.arguments) } catch { inp = { raw: tc.function.arguments } }
      content.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input: inp })
    }
  }
  if (ch?.finish_reason === 'content_filter' || ch?.finish_reason === 'safety') content.push({ type: 'text', text: '\n\n[Content blocked by provider safety filter]' })
  return {
    id: data.id ?? makeMsgId(), type: 'message', role: 'assistant', content,
    model: data.model ?? model, stop_reason: mapFinish(ch?.finish_reason), stop_sequence: null,
    usage: { input_tokens: data.usage?.prompt_tokens ?? 0, output_tokens: data.usage?.completion_tokens ?? 0, cache_creation_input_tokens: 0, cache_read_input_tokens: data.usage?.prompt_tokens_details?.cached_tokens ?? 0 },
  }
}

// ---------------------------------------------------------------------------
// OpenAIStream class — matches Anthropic Stream interface
// ---------------------------------------------------------------------------

class OpenAIStream {
  controller = new AbortController()
  #iter: AsyncGenerator<BetaRawMessageStreamEvent>
  #response: Response
  #msgId: string
  #cachedData?: BetaMessage
  constructor(
    iter: AsyncGenerator<BetaRawMessageStreamEvent>,
    response: Response,
    cachedData?: BetaMessage,
  ) {
    this.#iter = iter
    this.#response = response
    this.#cachedData = cachedData
    this.#msgId = makeMsgId()
  }
  async *[Symbol.asyncIterator]() {
    for await (const e of this.#iter) yield e
  }
  get response() {
    return this.#response
  }
  request_id = this.#msgId

  // Add withResponse method to match Anthropic SDK API
  async withResponse(): Promise<{
    data: BetaMessage | OpenAIStream
    response: Response
    request_id: string
  }> {
    // If we already have the cached data (non-streaming case), return it directly
    if (this.#cachedData) {
      return {
        data: this.#cachedData,
        response: this.#response,
        request_id: this.#msgId,
      }
    }
    // For streaming, return self as the data with the response
    return {
      data: this,
      response: this.#response,
      request_id: this.#msgId,
    }
  }
}

// ---------------------------------------------------------------------------
// Messages API — matches Anthropic beta.messages shape
// ---------------------------------------------------------------------------

class OpenAIMessages {
  private providerOverride?: { model: string; baseURL: string; apiKey: string }
  private defaultHeaders: Record<string, string>
  private maxRetries: number
  private timeout: number

  constructor(opts: { defaultHeaders?: Record<string, string>; maxRetries?: number; timeout?: number; providerOverride?: { model: string; baseURL: string; apiKey: string } }) {
    this.defaultHeaders = opts.defaultHeaders ?? {}
    this.maxRetries = opts.maxRetries ?? 0
    this.timeout = opts.timeout ?? 600_000
    this.providerOverride = opts.providerOverride
  }

  async create(params: any, options?: { signal?: AbortSignal; headers?: Record<string, string>; timeout?: number }) {
    const model = this.providerOverride?.model ?? params.model
    const request = resolveProviderRequest({ model, baseUrl: this.providerOverride?.baseURL })

    // ── Codex Responses API ──
    if (request.transport === 'codex_responses') {
      const creds = resolveCodexApiCredentials()
      if (!creds.apiKey) throw new Error(`Codex auth required for ${request.resolvedModel}. Set CODEX_API_KEY.`)
      if (!creds.accountId) throw new Error('Codex auth missing chatgpt_account_id.')

      if (params.stream) {
        const { events, response } = await performCodexRequest({
          request,
          credentials: creds,
          params,
          defaultHeaders: this.defaultHeaders,
          signal: options?.signal,
        })
        return new OpenAIStream(codexStreamToAnthropic(events, request.resolvedModel) as AsyncGenerator<BetaRawMessageStreamEvent>, response)
      }
      const { events, response } = await performCodexRequest({
        request,
        credentials: creds,
        params: {
          ...params,
          stream: true,
        },
        defaultHeaders: this.defaultHeaders,
        signal: options?.signal,
      })
      const data = await collectCodexCompletedResponse(events)
      const msg = convertCodexResponseToAnthropicMessage(data, request.resolvedModel) as BetaMessage
      const result = Promise.resolve(msg)
      ;(result as any).withResponse = async () => ({ data: msg, response, request_id: makeMsgId() })
      return msg
    }

    // ── Chat Completions ──
    const apiKey = this.providerOverride?.apiKey ?? process.env.OPENAI_API_KEY ?? ''
    const baseURL = request.baseUrl

    let isAzure = false
    try { const { hostname } = new URL(baseURL); isAzure = hostname.endsWith('.azure.com') && (hostname.includes('cognitiveservices') || hostname.includes('openai') || hostname.includes('services.ai')) } catch {}

    const headers: Record<string, string> = {
      ...(isAzure && apiKey ? { 'api-key': apiKey } : { Authorization: `Bearer ${apiKey}` }),
      ...(isEnvTruthy(process.env.CLAUDE_CODE_USE_GITHUB) ? { Accept: 'application/vnd.github.v3+json', 'X-GitHub-Api-Version': GITHUB_API_VERSION } : {}),
    }

    const cacheKey = `openai:${baseURL}:${apiKey}`
    let client = globalClientCache.get(cacheKey)
    if (!client) {
      client = new OpenAI({ apiKey: isAzure ? 'azure' : (apiKey || 'sk-dummy'), baseURL, defaultHeaders: headers, maxRetries: 0, dangerouslyAllowBrowser: true })
      globalClientCache.set(cacheKey, client)
    }

    const oaiMessages = convertMessages(
      params.messages as Array<{ role: string; message?: { role?: string; content?: unknown }; content?: unknown }>,
      params.system,
    )
    const oaiTools = params.tools?.length ? convertTools(params.tools as Array<{ name: string; description?: string; input_schema?: Record<string, unknown> }>) : undefined

    const isLocal = !baseURL || ['localhost', '127.0.0.1', '0.0.0.0'].some(h => baseURL.includes(h))

    // Azure deployment
    let azureDeployment: string | undefined
    if (isAzure) {
      azureDeployment = request.resolvedModel ?? process.env.OPENAI_MODEL ?? 'gpt-4o'
    }

    // Non-streaming
    if (!params.stream) {
      const body: Parameters<typeof client.chat.completions.create>[0] & { stream?: boolean; stream_options?: { include_usage: boolean } } = {
        model: azureDeployment ?? request.resolvedModel,
        messages: oaiMessages,
        stream: false,
        ...(typeof params.max_tokens === 'number' && { max_completion_tokens: params.max_tokens }),
        ...(typeof params.temperature === 'number' && { temperature: params.temperature }),
        ...(typeof params.top_p === 'number' && { top_p: params.top_p }),
        ...(oaiTools?.length && { tools: oaiTools, tool_choice: params.tool_choice as any }),
        ...(typeof params.tool_choice === 'string' && oaiTools?.length && { tool_choice: params.tool_choice }),
      }
      const oaiResult = await client.chat.completions.create(body as any, { signal: options?.signal, timeout: options?.timeout ?? this.timeout })
      const msg = toNonStreaming(oaiResult, request.resolvedModel)
      // Add withResponse method to match Anthropic SDK API
      const result = msg as BetaMessage & {
        withResponse: () => Promise<{
          data: BetaMessage
          response: Response
          request_id: string
        }>
      }
      result.withResponse = async () => ({
        data: msg,
        response: new Response(JSON.stringify(oaiResult), { status: 200, headers: { 'Content-Type': 'application/json' } }),
        request_id: makeMsgId(),
      })
      return result
    }

    // Streaming
    const body: Parameters<typeof client.chat.completions.create>[0] = {
      model: azureDeployment ?? request.resolvedModel,
      messages: oaiMessages,
      stream: true,
      stream_options: isLocal ? undefined : { include_usage: true },
      ...(typeof params.max_tokens === 'number' && { max_completion_tokens: params.max_tokens }),
      ...(typeof params.temperature === 'number' && { temperature: params.temperature }),
      ...(typeof params.top_p === 'number' && { top_p: params.top_p }),
      ...(oaiTools?.length && { tools: oaiTools, tool_choice: params.tool_choice as any }),
    }

    const stream = await client.chat.completions.create(body as any, { signal: options?.signal, timeout: options?.timeout ?? this.timeout })
    // Get raw response for .withResponse()
    const generator = openAIStreamToAnthropicEvents(stream as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>, request.resolvedModel)
    // Need the Response object — we'll need to get it from the SDK internal
    return new OpenAIStream(generator, new Response())
  }
}

// ---------------------------------------------------------------------------
// Beta namespace
// ---------------------------------------------------------------------------

class OpenAIBeta {
  messages: OpenAIMessages
  constructor(opts: { defaultHeaders?: Record<string, string>; maxRetries?: number; timeout?: number; providerOverride?: { model: string; baseURL: string; apiKey: string } }) {
    this.messages = new OpenAIMessages(opts)
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createOpenAIProvider(opts: {
  defaultHeaders?: Record<string, string>
  maxRetries?: number
  timeout?: number
  providerOverride?: { model: string; baseURL: string; apiKey: string }
}) {
  hydrateKeys()
  const beta = new OpenAIBeta(opts)
  return {
    beta,
    messages: beta.messages,
  }
}
