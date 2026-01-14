/**
 * Gemini CLI Participant
 */

import * as vscode from 'vscode';
import { SpawnCliRunner, ParseResult } from '../../cli/spawnCliRunner';
import { GeminiStreamMessage, StreamContent, InstallInfo, HealthGuidance } from '../../cli/types';
import { executeCommand } from '../../cli/utils/commandExecutor';
import { ParticipantConfig } from '../types';

export class GeminiCliRunner extends SpawnCliRunner {
  readonly name = 'gemini';

  protected buildCliOptions(resumeSessionId?: string): { command: string; args: string[] } {
    const config = vscode.workspace.getConfiguration('chp');
    const command = 'gemini';
    const args = ['--output-format', 'stream-json'];

    const allowedTools = ['glob', 'google_web_search', 'read_file', 'list_directory', 'search_file_content'];
    args.push('--allowed-tools', allowedTools.join(','));

    // Multi-workspace directory support
    /* #NOT_WORKING: https://github.com/google-gemini/gemini-cli/issues/13669
     * Currently this option doesn't work properly in non-interactive mode
     * Activate below code once the issue is resolved
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      for (const folder of workspaceFolders) {
        args.push('--include-directories', folder.uri.fsPath);
      }
    }
    */

    const model = config.get<string>('gemini.model');
    if (model) {
      args.push('--model', model);
    }

    // Add session resume option
    if (resumeSessionId) {
      args.push('--resume', resumeSessionId);
    }

    return {
      command,
      args,
    };
  }

  protected buildPromptArgument(prompt: string): string[] {
    // gemini passes prompt as the first argument directly
    return [prompt];
  }

  protected parseLineWithSession(line: string): ParseResult {
    try {
      const message = JSON.parse(line) as GeminiStreamMessage;
      let content: StreamContent | null = null;

      // Handle tool_use type
      if (message.type === 'tool_use') {
        content = {
          type: 'tool_use',
          content: message.tool_name || 'tool',
          toolName: message.tool_name,
        };
      }

      // Handle tool_result type
      else if (message.type === 'tool_result') {
        content = {
          type: 'tool_result',
          content: message.output || '',
          toolName: message.tool_name,
        };
      }

      // Extract only assistant message content
      else if (message.type === 'message' && message.role === 'assistant' && message.content) {
        content = {
          type: 'text',
          content: message.content,
        };
      }

      return {
        content,
        sessionId: message.session_id,
      };
    } catch {
      // Ignore JSON parse failures
      return { content: null };
    }
  }

  protected async checkInstallation(): Promise<InstallInfo> {
    try {
      // Check path with which/where command (safe spawn execution)
      const whichCmd = process.platform === 'win32' ? 'where' : 'which';
      const pathOutput = await executeCommand(whichCmd, ['gemini'], 10000);
      const cliPath = pathOutput
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.length > 0)[0];

      // Check version (safe spawn execution)
      const versionOutput = await executeCommand('gemini', ['--version'], 10000);
      const version = versionOutput.trim();

      return {
        status: 'installed',
        version,
        path: cliPath,
      };
    } catch (error: unknown) {
      let errorMessage = 'Gemini CLI not found in PATH';

      if (error && typeof error === 'object') {
        const err = error as { code?: string; signal?: string; message?: string; killed?: boolean };

        // Detect various error types
        if (err.code === 'ETIMEDOUT' || (err.killed && err.signal === 'SIGTERM')) {
          errorMessage = 'Timed out while checking Gemini CLI installation';
        } else if (err.code === 'ENOENT') {
          errorMessage = 'Gemini CLI executable not found. Ensure it is installed and on your PATH.';
        } else if (err.code === 'EACCES') {
          errorMessage = 'Permission denied while executing Gemini CLI. Check executable permissions.';
        } else if (err.message && err.message.trim() !== '') {
          errorMessage = `Failed to verify Gemini CLI installation: ${err.message}`;
        }
      }

      return {
        status: 'not_installed',
        error: errorMessage,
      };
    }
  }

  protected getInstallGuidance(): HealthGuidance {
    return {
      title: 'How to Install',
      steps: [
        'Visit the official GitHub repository',
        'Follow the installation instructions for your platform',
        'After installation, run `@gemini /doctor` again to verify',
      ],
      links: [
        {
          label: 'Gemini CLI Installation Guide',
          url: 'https://github.com/google-gemini/gemini-cli',
        },
      ],
    };
  }
}

/**
 * Gemini CLI Runner singleton instance
 */
const geminiCli = new GeminiCliRunner();

/**
 * Create Gemini Participant configuration
 * @returns Participant configuration
 */
export function createGeminiParticipant(): ParticipantConfig {
  return {
    id: 'chp.gemini',
    name: 'Gemini',
    description: 'Google Gemini AI Assistant via CLI',
    cliRunner: geminiCli,
  };
}
