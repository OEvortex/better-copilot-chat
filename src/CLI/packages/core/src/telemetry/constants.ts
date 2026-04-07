/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export const SERVICE_NAME = 'aether-cli';

export const EVENT_USER_PROMPT = 'aether-cli.user_prompt';
export const EVENT_USER_RETRY = 'aether-cli.user_retry';
export const EVENT_TOOL_CALL = 'aether-cli.tool_call';
export const EVENT_API_REQUEST = 'aether-cli.api_request';
export const EVENT_API_ERROR = 'aether-cli.api_error';
export const EVENT_API_CANCEL = 'aether-cli.api_cancel';
export const EVENT_API_RESPONSE = 'aether-cli.api_response';
export const EVENT_CLI_CONFIG = 'aether-cli.config';
export const EVENT_EXTENSION_DISABLE = 'aether-cli.extension_disable';
export const EVENT_EXTENSION_ENABLE = 'aether-cli.extension_enable';
export const EVENT_EXTENSION_INSTALL = 'aether-cli.extension_install';
export const EVENT_EXTENSION_UNINSTALL = 'aether-cli.extension_uninstall';
export const EVENT_EXTENSION_UPDATE = 'aether-cli.extension_update';
export const EVENT_FLASH_FALLBACK = 'aether-cli.flash_fallback';
export const EVENT_RIPGREP_FALLBACK = 'aether-cli.ripgrep_fallback';
export const EVENT_NEXT_SPEAKER_CHECK = 'aether-cli.next_speaker_check';
export const EVENT_SLASH_COMMAND = 'aether-cli.slash_command';
export const EVENT_IDE_CONNECTION = 'aether-cli.ide_connection';
export const EVENT_CHAT_COMPRESSION = 'aether-cli.chat_compression';
export const EVENT_INVALID_CHUNK = 'aether-cli.chat.invalid_chunk';
export const EVENT_CONTENT_RETRY = 'aether-cli.chat.content_retry';
export const EVENT_CONTENT_RETRY_FAILURE =
  'aether-cli.chat.content_retry_failure';
export const EVENT_CONVERSATION_FINISHED = 'aether-cli.conversation_finished';
export const EVENT_MALFORMED_JSON_RESPONSE =
  'aether-cli.malformed_json_response';
export const EVENT_FILE_OPERATION = 'aether-cli.file_operation';
export const EVENT_MODEL_SLASH_COMMAND = 'aether-cli.slash_command.model';
export const EVENT_SUBAGENT_EXECUTION = 'aether-cli.subagent_execution';
export const EVENT_SKILL_LAUNCH = 'aether-cli.skill_launch';
export const EVENT_AUTH = 'aether-cli.auth';
export const EVENT_USER_FEEDBACK = 'aether-cli.user_feedback';

// Prompt Suggestion Events
export const EVENT_PROMPT_SUGGESTION = 'aether-cli.prompt_suggestion';
export const EVENT_SPECULATION = 'aether-cli.speculation';

// Arena Events
export const EVENT_ARENA_SESSION_STARTED = 'aether-cli.arena_session_started';
export const EVENT_ARENA_AGENT_COMPLETED = 'aether-cli.arena_agent_completed';
export const EVENT_ARENA_SESSION_ENDED = 'aether-cli.arena_session_ended';

// Performance Events
export const EVENT_STARTUP_PERFORMANCE = 'aether-cli.startup.performance';
export const EVENT_MEMORY_USAGE = 'aether-cli.memory.usage';
export const EVENT_PERFORMANCE_BASELINE = 'aether-cli.performance.baseline';
export const EVENT_PERFORMANCE_REGRESSION = 'aether-cli.performance.regression';
