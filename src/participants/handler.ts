/**
 * Chat Participant handler creation function
 */

import * as vscode from 'vscode';
import { StreamContent } from '../cli/types';
import { ParticipantConfig } from './types';

/**
 * Session ID marker pattern: [](cca:sessionId)
 * Saved as empty link format, invisible to user
 */
const SESSION_MARKER_PATTERN = /\[\]\(cca:([^)]+)\)/;

/**
 * Chat History based session manager
 * Utility for searching and saving session ID in context.history
 */
class ChatSessionManager {
  /**
   * Search for existing session ID in history
   * @param history - Chat history
   * @returns Session ID or undefined
   */
  static findSessionId(history: ReadonlyArray<vscode.ChatRequestTurn | vscode.ChatResponseTurn>): string | undefined {
    for (const turn of history) {
      if (turn instanceof vscode.ChatResponseTurn) {
        for (const part of turn.response) {
          if (part instanceof vscode.ChatResponseMarkdownPart) {
            const match = part.value.value.match(SESSION_MARKER_PATTERN);
            if (match) {
              return match[1];
            }
          }
        }
      }
    }
    return undefined;
  }

  /**
   * Save session ID as marker in stream
   * @param stream - Chat response stream
   * @param sessionId - Session ID to save
   */
  static saveSessionId(stream: vscode.ChatResponseStream, sessionId: string): void {
    stream.markdown(`[](cca:${sessionId})`);
  }
}

/**
 * Output streaming content to VS Code Chat
 * @param stream - VS Code Chat Response Stream
 * @param content - Streaming content
 */
function handleStreamContent(
  stream: vscode.ChatResponseStream,
  content: StreamContent
): void {
  switch (content.type) {
      case 'tool_use':
        // Show tool name with better formatting
        const toolDisplayName = content.toolName 
          ? content.toolName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
          : 'Tool';
        stream.progress(`Using: ${toolDisplayName}`);
        break;
      case 'tool_result':
        // Only show tool results if there's actual content
        if (content.content && content.content.trim()) {
          const resultToolName = content.toolName 
            ? content.toolName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
            : 'Tool';
          stream.progress(`${resultToolName} completed`);
        }
        break;
      default:
        stream.markdown(content.content);
    }
}

/**
 * Create Chat Participant handler
 * @param config - Participant configuration
 * @returns Chat Request Handler
 */
export function createParticipantHandler(
  config: ParticipantConfig
): vscode.ChatRequestHandler {
  return async (
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<void> => {
    const { cliRunner, name } = config;

    // Handle /session command
    if (request.command === 'session') {
      const sessionId = ChatSessionManager.findSessionId(context.history);
      if (sessionId) {
        stream.markdown(`**Current Session**\n\n`);
        stream.markdown(`- **CLI**: ${name}\n`);
        stream.markdown(`- **Session ID**: \`${sessionId}\`\n\n`);
        stream.markdown(`> This session can be resumed using the CLI directly with:\n> \`\`\`\n> ${cliRunner.name} --resume ${sessionId}\n> \`\`\``);
      } else {
        stream.markdown(`**No Active Session**\n\n`);
        stream.markdown(`Start a conversation with **@${cliRunner.name}** to create a new session.`);
      }
      return;
    }

    // Empty prompt case
    if (!request.prompt.trim()) {
      stream.markdown(`Please enter a question for **${name}**.`);
      return;
    }

    try {
      // Search for existing session ID
      const existingSessionId = ChatSessionManager.findSessionId(context.history);

      // Create AbortController (linked to cancellation token)
      const abortController = new AbortController();
      const cancelDisposable = token.onCancellationRequested(() => abortController.abort());

      // Run CLI (streaming)
      const result = await cliRunner.run(
        {
          prompt: request.prompt,
          abortSignal: abortController.signal,
          resumeSessionId: existingSessionId,
        },
        (content) => handleStreamContent(stream, content)
      );

      // If new session ID exists and no existing session, insert marker for next conversation
      if (result.sessionId && !existingSessionId) {
        ChatSessionManager.saveSessionId(stream, result.sessionId);
      }

      // Cleanup event listener
      cancelDisposable.dispose();

      if (!result.success && result.error) {
        stream.markdown(`\n\n---\n**Error:** ${result.error}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      stream.markdown(`\n\n---\n**Error:** ${errorMessage}`);
    }
  };
}
