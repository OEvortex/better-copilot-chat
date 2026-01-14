/**
 * CLI related type definitions
 */

/**
 * CLI execution options
 */
export interface CliOptions {
  /** Prompt content */
  prompt: string;
  /** Abort signal for cancellation */
  abortSignal?: AbortSignal;
  /** Session ID to resume (for session continuation) */
  resumeSessionId?: string;
}

/**
 * Streaming content type
 */
export type StreamContentType = 'text' | 'tool_use' | 'tool_result';

/**
 * Streaming content
 */
export interface StreamContent {
  /** Content type */
  type: StreamContentType;
  /** Content text */
  content: string;
  /** Tool name (for tool_use type) */
  toolName?: string;
}

/**
 * Streaming callback function type
 * @param content - Streamed content
 */
export type StreamCallback = (content: StreamContent) => void;

/**
 * CLI execution result
 */
export interface CliResult {
  /** Success status */
  success: boolean;
  /** Full response content */
  content: string;
  /** Error message (on failure) */
  error?: string;
  /** CLI session ID (for session reuse) */
  sessionId?: string;
}

/**
 * Gemini stream-json message type
 */
export interface GeminiStreamMessage {
  type: 'init' | 'message' | 'result' | 'tool_use' | 'tool_result';
  timestamp?: string;
  session_id?: string;
  model?: string;
  role?: 'user' | 'assistant';
  content?: string;
  delta?: boolean;
  status?: 'success' | 'error';
  /** Tool name for tool_use type */
  tool_name?: string;
  /** Tool ID for tool_use/tool_result type */
  tool_id?: string;
  /** Parameters for tool_use type */
  parameters?: Record<string, unknown>;
  /** Result for tool_result type */
  output?: string;
  stats?: {
    total_tokens?: number;
    input_tokens?: number;
    output_tokens?: number;
    duration_ms?: number;
  };
}

/**
 * Claude stream-json message type
 */
export interface ClaudeStreamMessage {
  type: 'system' | 'assistant' | 'result';
  subtype?: 'init' | 'success' | 'error';
  session_id?: string;
  message?: {
    model?: string;
    role?: string;
    content?: Array<{
      type: 'text' | 'tool_use' | 'tool_result';
      text?: string;
      name?: string;
      content?: string;
    }>;
    stop_reason?: string;
  };
  result?: string;
  is_error?: boolean;
  duration_ms?: number;
  total_cost_usd?: number;
}

/**
 * CLI installation status
 */
export type InstallStatus = 'installed' | 'not_installed' | 'unknown';

/**
 * CLI installation info
 */
export interface InstallInfo {
  /** Installation status */
  status: InstallStatus;
  /** CLI version */
  version?: string;
  /** CLI executable path */
  path?: string;
  /** Error message */
  error?: string;
}

/**
 * CLI health status info
 */
export interface CliHealthStatus {
  /** CLI name */
  cli: string;
  /** Installation info */
  install: InstallInfo;
  /** Check timestamp */
  checkedAt: Date;
}

/**
 * Health guidance
 */
export interface HealthGuidance {
  /** Guidance title */
  title: string;
  /** Resolution steps */
  steps: string[];
  /** Related links */
  links?: Array<{ label: string; url: string }>;
}

/**
 * Doctor verification result
 */
export interface DoctorResult {
  /** Status info */
  status: CliHealthStatus;
  /** Installation guidance */
  installGuidance: HealthGuidance;
}

/**
 * CLI Runner interface
 */
export interface CliRunner {
  /** CLI name */
  readonly name: string;
  
  /**
   * Run CLI (streaming)
   * @param options - Execution options
   * @param onContent - Content streaming callback
   * @returns Execution result
   */
  run(options: CliOptions, onContent: StreamCallback): Promise<CliResult>;

  /**
   * CLI health check (doctor)
   * @returns Doctor verification result (status + guidance)
   */
  doctor(): Promise<DoctorResult>;
}
