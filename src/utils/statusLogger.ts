/*---------------------------------------------------------------------------------------------
 *  High-Frequency Status Logger Manager
 *  Dedicated to primaryInstanceManager and other high-frequency status refresh modules,
 *  separated from the main log channel.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";

/**
 * High-Frequency Status Logger Manager class
 * Used to record logs for high-frequency operations such as main instance election, heartbeat, and status synchronization.
 */
export class StatusLogger {
	private static outputChannel: vscode.LogOutputChannel;

	/**
	 * Initialize high-frequency status logger manager
	 */
	static initialize(channelName = "CHP-Status"): void {
		// Use LogOutputChannel (VS Code 1.74+), supports native log levels and formatting
		StatusLogger.outputChannel = vscode.window.createOutputChannel(
			channelName,
			{ log: true },
		);
	}

	/**
	 * Trace level log (VS Code LogLevel.Trace = 1)
	 */
	static trace(message: string, ...args: unknown[]): void {
		if (StatusLogger.outputChannel) {
			StatusLogger.outputChannel.trace(message, ...args);
		}
	}

	/**
	 * Debug level log (VS Code LogLevel.Debug = 2)
	 */
	static debug(message: string, ...args: unknown[]): void {
		if (StatusLogger.outputChannel) {
			StatusLogger.outputChannel.debug(message, ...args);
		}
	}

	/**
	 * Info level log (VS Code LogLevel.Info = 3)
	 */
	static info(message: string, ...args: unknown[]): void {
		if (StatusLogger.outputChannel) {
			StatusLogger.outputChannel.info(message, ...args);
		}
	}

	/**
	 * Warning level log (VS Code LogLevel.Warning = 4)
	 */
	static warn(message: string, ...args: unknown[]): void {
		if (StatusLogger.outputChannel) {
			StatusLogger.outputChannel.warn(message, ...args);
		}
	}

	/**
	 * Error level log (VS Code LogLevel.Error = 5)
	 */
	static error(message: string | Error, ...args: unknown[]): void {
		if (StatusLogger.outputChannel) {
			StatusLogger.outputChannel.error(message, ...args);
		}
	}

	/**
	 * Dispose logger manager
	 */
	static dispose(): void {
		if (StatusLogger.outputChannel) {
			StatusLogger.outputChannel.dispose();
		}
	}
}
