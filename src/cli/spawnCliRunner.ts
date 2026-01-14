/**
 * Spawn-based CLI Runner
 *
 * Uses child_process.spawn to run CLI cross-platform.
 * shell: true option supports Windows .cmd wrappers and Unix shell scripts.
 */

import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import {
  CliOptions,
  CliResult,
  StreamCallback,
  StreamContent,
  CliRunner,
  DoctorResult,
  InstallInfo,
  HealthGuidance,
  CliHealthStatus,
} from './types';

/**
 * Streaming parse result (includes session ID)
 */
export interface ParseResult {
  /** Streaming content */
  content: StreamContent | null;
  /** Extracted session ID (if present) */
  sessionId?: string;
}

/**
 * Process execution context
 * Context object managing streaming state and callbacks
 */
interface ProcessContext {
  /** Full accumulated content */
  fullContent: { value: string };
  /** Line buffer */
  buffer: { value: string };
  /** Extracted session ID */
  extractedSessionId: { value?: string };
  /** Streaming callback */
  onContent: StreamCallback;
  /** Abort signal */
  abortSignal?: AbortSignal;
  /** Abort handler */
  abortHandler: () => void;
  /** Promise resolve function */
  resolve: (result: CliResult) => void;
}

/**
 * Spawn-based CLI Runner abstract class
 */
export abstract class SpawnCliRunner implements CliRunner {
  abstract readonly name: string;

  /**
   * Build CLI options
   * @param resumeSessionId - Session ID to resume (optional)
   * @returns CLI command and additional arguments
   */
  protected abstract buildCliOptions(resumeSessionId?: string): { command: string; args: string[] };

  /**
   * Build prompt argument
   * @param prompt - Prompt content
   * @returns Prompt as CLI argument format
   */
  protected abstract buildPromptArgument(prompt: string): string[];

  /**
   * Parse streaming line (includes session ID extraction)
   * @param line - JSON line
   * @returns Parse result (content and session ID)
   */
  protected abstract parseLineWithSession(line: string): ParseResult;

  /**
   * Check CLI installation status
   * @returns Installation info
   */
  protected abstract checkInstallation(): Promise<InstallInfo>;

  /**
   * Get installation guidance
   * @returns Installation guidance
   */
  protected abstract getInstallGuidance(): HealthGuidance;

  /**
   * Remove ANSI escape codes
   */
  private cleanAnsi(text: string): string {
    return text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
  }

  /**
   * Process data chunk (common for stdout/stderr)
   */
  private processChunk(chunk: Buffer, context: ProcessContext): void {
    context.buffer.value += chunk.toString();
    const lines = context.buffer.value.split('\n');
    // Keep last incomplete line in buffer
    context.buffer.value = lines.pop() || '';

    for (const line of lines) {
      const cleanLine = this.cleanAnsi(line).trim();
      if (!cleanLine) {
        continue;
      }

      const parseResult = this.parseLineWithSession(cleanLine);

      // Extract session ID
      if (parseResult.sessionId && !context.extractedSessionId.value) {
        context.extractedSessionId.value = parseResult.sessionId;
      }

      if (parseResult.content) {
        if (parseResult.content.type === 'text') {
          context.fullContent.value += parseResult.content.content;
        }
        context.onContent(parseResult.content);
      }
    }
  }

  /**
   * Process remaining buffer
   */
  private processRemainingBuffer(context: ProcessContext): void {
    if (!context.buffer.value.trim()) {
      return;
    }

    const cleanLine = this.cleanAnsi(context.buffer.value).trim();
    const parseResult = this.parseLineWithSession(cleanLine);

    // Extract session ID
    if (parseResult.sessionId && !context.extractedSessionId.value) {
      context.extractedSessionId.value = parseResult.sessionId;
    }

    if (parseResult.content) {
      if (parseResult.content.type === 'text') {
        context.fullContent.value += parseResult.content.content;
      }
      context.onContent(parseResult.content);
    }
  }

  /**
   * Cleanup abort event listener
   */
  private cleanupAbortListener(context: ProcessContext): void {
    if (context.abortSignal) {
      context.abortSignal.removeEventListener('abort', context.abortHandler);
    }
  }

  /**
   * Process close handler
   */
  private handleProcessClose(exitCode: number | null, context: ProcessContext): void {
    this.cleanupAbortListener(context);
    this.processRemainingBuffer(context);

    if (exitCode === 0) {
      context.resolve({
        success: true,
        content: context.fullContent.value,
        sessionId: context.extractedSessionId.value,
      });
    } else {
      context.resolve({
        success: false,
        content: context.fullContent.value,
        error: `Process exited with code ${exitCode}`,
        sessionId: context.extractedSessionId.value,
      });
    }
  }

  /**
   * Process error handler
   */
  private handleProcessError(err: Error, context: ProcessContext): void {
    this.cleanupAbortListener(context);

    context.resolve({
      success: false,
      content: context.fullContent.value,
      error: err.message,
      sessionId: context.extractedSessionId.value,
    });
  }

  /**
   * Register process event handlers
   */
  private registerProcessHandlers(childProcess: ChildProcess, context: ProcessContext): void {
    // Handle abort signal
    if (context.abortSignal) {
      context.abortSignal.addEventListener('abort', context.abortHandler);
    }

    // Handle stdout streaming
    childProcess.stdout?.on('data', (chunk: Buffer) => {
      this.processChunk(chunk, context);
    });

    // Handle stderr too (some CLIs output to stderr)
    childProcess.stderr?.on('data', (chunk: Buffer) => {
      this.processChunk(chunk, context);
    });

    // Handle close event
    childProcess.on('close', (exitCode) => {
      this.handleProcessClose(exitCode, context);
    });

    // Handle error event
    childProcess.on('error', (err) => {
      this.handleProcessError(err, context);
    });
  }

  /**
   * Escape shell argument (platform-specific handling)
   * When shell: true, handle newlines and special characters so they're not interpreted as separate commands
   * @param arg - Argument to escape
   * @returns Platform-appropriately escaped argument
   */
  private escapeShellArg(arg: string): string {
    if (process.platform === 'win32') {
      // Windows: Wrap with double quotes and escape internal double quotes, backslashes, special chars
      // Replace newlines with spaces (cmd.exe treats newlines as command separators even inside quotes)
      const escaped = arg
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/[\r\n]+/g, ' ');
      return `"${escaped}"`;
    } else {
      // Unix: Wrap with single quotes, content passed as-is
      // Only need to escape single quotes themselves
      return `'${arg.replace(/'/g, "'\\''")}'`;
    }
  }

  /**
   * Run CLI (streaming)
   */
  async run(options: CliOptions, onContent: StreamCallback): Promise<CliResult> {
    const { prompt, abortSignal, resumeSessionId } = options;
    const { command, args } = this.buildCliOptions(resumeSessionId);
    const promptArgs = this.buildPromptArgument(prompt);

    // Apply shell escape to prompt args (handle newlines and special chars)
    const escapedPromptArgs = promptArgs.map((arg) => this.escapeShellArg(arg));

    // Combine all args: escapedPromptArgs + args
    const allArgs = [...escapedPromptArgs, ...args];

    return new Promise((resolve) => {
      const childProcess: ChildProcess = spawn(command, allArgs, {
        cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd(),
        env: process.env,
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      // Create process context
      const context: ProcessContext = {
        fullContent: { value: '' },
        buffer: { value: '' },
        extractedSessionId: {},
        onContent,
        abortSignal,
        abortHandler: () => childProcess.kill('SIGTERM'),
        resolve,
      };

      // Register event handlers
      this.registerProcessHandlers(childProcess, context);
    });
  }

  /**
   * Run CLI health check
   * @returns Doctor verification result
   */
  async doctor(): Promise<DoctorResult> {
    const install = await this.checkInstallation();

    const status: CliHealthStatus = {
      cli: this.name,
      install,
      checkedAt: new Date(),
    };

    return {
      status,
      installGuidance: this.getInstallGuidance(),
    };
  }
}
