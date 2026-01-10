/*---------------------------------------------------------------------------------------------
 *  This file contains classes implemented for creating parameters required for FIM / NES,
 *  but are empty implementations with no actual use.
 *  These classes are only used to satisfy the interface requirements of the VS Code chat-lib library,
 *  enabling the extension to initialize properly.
 *
 *  Included empty implementations:
 *  - AuthenticationService: Authentication service implementation, no actual validation logic
 *  - TelemetrySender: Telemetry sender implementation, does not send any data
 *  - EndpointProvider: Official example parameters, currently no specific use, keep for now
 *
 *  Reference: Test examples in getInlineCompletions.spec.ts and nesProvider.spec.ts
 *--------------------------------------------------------------------------------------------*/

import type {
	IAuthenticationService,
	IEndpointProvider,
	ITelemetrySender,
} from "@vscode/chat-lib";
import { CopilotToken } from "@vscode/chat-lib/dist/src/_internal/platform/authentication/common/copilotToken";
import type { ICopilotTokenManager } from "@vscode/chat-lib/dist/src/_internal/platform/authentication/common/copilotTokenManager";
import type {
	ChatEndpointFamily,
	EmbeddingsEndpointFamily,
	ICompletionModelInformation,
} from "@vscode/chat-lib/dist/src/_internal/platform/endpoint/common/endpointProvider";
import type {
	IChatEndpoint,
	IEmbeddingsEndpoint,
} from "@vscode/chat-lib/dist/src/_internal/platform/networking/common/networking";
import {
	Emitter,
	type Event,
} from "@vscode/chat-lib/dist/src/_internal/util/vs/base/common/event";
import { Disposable } from "@vscode/chat-lib/dist/src/_internal/util/vs/base/common/lifecycle";
import type {
	AuthenticationGetSessionOptions,
	AuthenticationSession,
	ChatRequest,
	LanguageModelChat,
} from "vscode";

/**
 * Simple authentication service implementation, no actual validation logic
 *
 * This is an empty implementation, only used to satisfy NES's interface requirements.
 * Not used in actual project, only passed to chat-lib to comply with official interface requirements.
 * All methods return default values or null, no actual authentication operations performed.
 */
export class AuthenticationService
	extends Disposable
	implements IAuthenticationService, ICopilotTokenManager
{
	readonly _serviceBrand: undefined;
	readonly isMinimalMode = true; // Indicates non-official mode, do not request GHToken
	readonly anyGitHubSession = undefined;
	readonly permissiveGitHubSession = undefined;
	readonly copilotToken = new CopilotToken({
		token: `chp-token-${Math.ceil(Math.random() * 100)}`,
		refresh_in: 0,
		expires_at: 0,
		username: "chpuser",
		isVscodeTeamMember: false,
		copilot_plan: "individual",
	});
	speculativeDecodingEndpointToken: string | undefined;

	private readonly _onDidCopilotTokenRefresh = this._register(
		new Emitter<void>(),
	);
	readonly onDidCopilotTokenRefresh: Event<void> =
		this._onDidCopilotTokenRefresh.event;

	private readonly _onDidAuthenticationChange = this._register(
		new Emitter<void>(),
	);
	readonly onDidAuthenticationChange: Event<void> =
		this._onDidAuthenticationChange.event;

	private readonly _onDidAccessTokenChange = this._register(
		new Emitter<void>(),
	);
	readonly onDidAccessTokenChange: Event<void> =
		this._onDidAccessTokenChange.event;

	private readonly _onDidAdoAuthenticationChange = this._register(
		new Emitter<void>(),
	);
	readonly onDidAdoAuthenticationChange: Event<void> =
		this._onDidAdoAuthenticationChange.event;

	async getAnyGitHubSession(
		_options?: AuthenticationGetSessionOptions,
	): Promise<AuthenticationSession | undefined> {
		return undefined;
	}

	async getPermissiveGitHubSession(
		_options: AuthenticationGetSessionOptions,
	): Promise<AuthenticationSession | undefined> {
		return undefined;
	}

	async getCopilotToken(_force?: boolean): Promise<CopilotToken> {
		return this.copilotToken;
	}

	resetCopilotToken(_httpError?: number): void {
		this._onDidCopilotTokenRefresh.fire();
	}

	async getAdoAccessTokenBase64(
		_options?: AuthenticationGetSessionOptions,
	): Promise<string | undefined> {
		return undefined;
	}
}

/**
 * Telemetry sender implementation
 *
 * This is an empty implementation, only used to satisfy NES's interface requirements.
 * All telemetry events are ignored, no data sent to external services.
 * This ensures user privacy and data security while satisfying VS Code extension interface requirements.
 */
export class TelemetrySender implements ITelemetrySender {
	sendTelemetryEvent(
		_eventName: string,
		_properties?: Record<string, string | undefined>,
		_measurements?: Record<string, number | undefined>,
	): void {
		return;
	}
}

/**
 * Endpoint provider implementation
 */
export class EndpointProvider implements IEndpointProvider {
	readonly _serviceBrand: undefined;

	async getAllCompletionModels(
		_forceRefresh?: boolean,
	): Promise<ICompletionModelInformation[]> {
		return [];
	}

	async getAllChatEndpoints(): Promise<IChatEndpoint[]> {
		return [];
	}

	async getChatEndpoint(
		_requestOrFamily: LanguageModelChat | ChatRequest | ChatEndpointFamily,
	): Promise<IChatEndpoint> {
		throw new Error("Method not implemented.");
	}

	async getEmbeddingsEndpoint(
		_family?: EmbeddingsEndpointFamily,
	): Promise<IEmbeddingsEndpoint> {
		throw new Error("Method not implemented.");
	}
}
