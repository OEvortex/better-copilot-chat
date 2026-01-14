/**
 * Claude CLI Participant
 */

import * as vscode from 'vscode';
import { SpawnCliRunner, ParseResult } from '../../cli/spawnCliRunner';
import { ClaudeStreamMessage, StreamContent, InstallInfo, HealthGuidance } from '../../cli/types';
import { executeCommand } from '../../cli/utils/commandExecutor';
import { ParticipantConfig } from '../types';

export class ClaudeCliRunner extends SpawnCliRunner {
  readonly name = 'claude';

  protected buildCliOptions(resumeSessionId?: string): { command: string; args: string[] } {
    const config = vscode.workspace.getConfiguration('chp');
    const command = 'claude';
    const args = ['--output-format', 'stream-json', '--verbose'];

    const allowedTools = ['WebSearch'];
    args.push('--allowed-tools', allowedTools.join(','));

    // Add multiple workspace directories
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      for (const folder of workspaceFolders) {
        args.push('--add-dir', folder.uri.fsPath);
      }
    }

    const model = config.get<string>('claude.model');
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
    // claude uses -p <prompt> format
    return ['-p', prompt];
  }

  protected parseLineWithSession(line: string): ParseResult {
    try {
      const message = JSON.parse(line) as ClaudeStreamMessage;
      let content: StreamContent | null = null;

      if (message.type === 'assistant' && message.message?.content) {
        for (const item of message.message.content) {
          // Handle tool_use type
          if (item.type === 'tool_use') {
            content = {
              type: 'tool_use',
              content: item.name || 'tool',
              toolName: item.name,
            };
            break;
          }

          // Handle tool_result type
          if (item.type === 'tool_result') {
            content = {
              type: 'tool_result',
              content: item.content || '',
              toolName: item.name,
            };
            break;
          }

          // Handle text type
          if (item.type === 'text' && item.text) {
            content = {
              type: 'text',
              content: item.text,
            };
            break;
          }
        }
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
      const pathOutput = await executeCommand(whichCmd, ['claude'], 10000);
      const cliPath = pathOutput
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.length > 0)[0];

      // Check version (safe spawn execution)
      const versionOutput = await executeCommand('claude', ['--version'], 10000);
      const version = versionOutput.trim();

      return {
        status: 'installed',
        version,
        path: cliPath,
      };
    } catch (error: unknown) {
      let errorMessage = 'Claude CLI not found in PATH';

      if (error && typeof error === 'object') {
        const err = error as { code?: string; signal?: string; message?: string; killed?: boolean };

        // Detect various error types
        if (err.code === 'ETIMEDOUT' || (err.killed && err.signal === 'SIGTERM')) {
          errorMessage = 'Timed out while checking Claude CLI installation';
        } else if (err.code === 'ENOENT') {
          errorMessage = 'Claude CLI executable not found. Ensure it is installed and on your PATH.';
        } else if (err.code === 'EACCES') {
          errorMessage = 'Permission denied while executing Claude CLI. Check executable permissions.';
        } else if (err.message && err.message.trim() !== '') {
          errorMessage = `Failed to verify Claude CLI installation: ${err.message}`;
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
        'Visit the official installation page',
        'Follow the installation instructions for your platform',
        'After installation, run `@claude /doctor` again to verify',
      ],
      links: [
        {
          label: 'Claude CLI Installation Guide',
          url: 'https://docs.anthropic.com/en/docs/claude-code/overview',
        },
      ],
    };
  }
}

/**
 * Claude CLI Runner singleton instance
 */
const claudeCli = new ClaudeCliRunner();

/**
 * Create Claude Participant configuration
 * @returns Participant configuration
 */
export function createClaudeParticipant(): ParticipantConfig {
  return {
    id: 'chp.claude',
    name: 'Claude',
    description: 'Anthropic Claude AI Assistant via CLI',
    cliRunner: claudeCli,
  };
}
