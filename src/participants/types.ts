/**
 * Chat Participant related type definitions
 */

import * as vscode from 'vscode';
import type { CliRunner } from '../cli';

/**
 * Chat Participant configuration
 */
export interface ParticipantConfig {
  /** Participant ID (must match definition in package.json) */
  id: string;
  /** Display name */
  name: string;
  /** Description */
  description: string;
  /** CLI Runner */
  cliRunner: CliRunner;
}

/**
 * Chat Participant handler context
 */
export interface ParticipantContext {
  /** VS Code Extension Context */
  extensionContext: vscode.ExtensionContext;
  /** Configuration */
  config: ParticipantConfig;
}
