/**
 * Chat Participant registration module
 */

import * as vscode from 'vscode';
import { ParticipantConfig } from './types';
import { createParticipantHandler } from './handler';
import { createGeminiParticipant } from './feature/gemini';
import { createClaudeParticipant } from './feature/claude';

/** Participant factory function type */
type ParticipantFactory = () => ParticipantConfig;

/** List of participant factory functions to register */
const participantFactories: ParticipantFactory[] = [
  createGeminiParticipant,
  createClaudeParticipant,
];

/**
 * Register a single Chat Participant
 */
function registerParticipant(
  context: vscode.ExtensionContext,
  config: ParticipantConfig
): vscode.Disposable {
  const handler = createParticipantHandler(config);
  const participant = vscode.chat.createChatParticipant(config.id, handler);
  
  // Set icon
  participant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'assets', `${config.cliRunner.name}.svg`);

  return participant;
}

/**
 * Register all Chat Participants
 * @param context - VS Code Extension Context
 */
export function registerAllParticipants(context: vscode.ExtensionContext): void {
  // Create and register participant configurations
  for (const factory of participantFactories) {
    const config = factory();
    const disposable = registerParticipant(context, config);
    context.subscriptions.push(disposable);
    console.log(`[Copilot ++] Registered chat participant: @${config.cliRunner.name}`);
  }
}
