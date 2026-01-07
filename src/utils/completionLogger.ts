/*---------------------------------------------------------------------------------------------
 *  High-Frequency Status Logger Manager
 *  Dedicated to InlineCompletionProvider and other high-frequency status refresh modules,
 *  separated from the main log channel.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * High-Frequency Status Logger Manager class
 * Used to record logs for FIM / NES high-frequency operations.
 */
export class CompletionLogger {
    private static outputChannel: vscode.LogOutputChannel;

    /**
     * Initialize high-frequency status logger manager
     */
    static initialize(channelName = 'CHP-Completion'): void {
        // Use LogOutputChannel (VS Code 1.74+), supports native log levels and formatting
        this.outputChannel = vscode.window.createOutputChannel(channelName, { log: true });
    }

    /**
     * Trace level log (VS Code LogLevel.Trace = 1)
     */
    static trace(message: string, ...args: unknown[]): void {
        if (this.outputChannel) {
            this.outputChannel.trace(message, ...args);
        }
    }

    /**
     * Debug level log (VS Code LogLevel.Debug = 2)
     */
    static debug(message: string, ...args: unknown[]): void {
        if (this.outputChannel) {
            this.outputChannel.debug(message, ...args);
        }
    }

    /**
     * Info level log (VS Code LogLevel.Info = 3)
     */
    static info(message: string, ...args: unknown[]): void {
        if (this.outputChannel) {
            this.outputChannel.info(message, ...args);
        }
    }

    /**
     * Warning level log (VS Code LogLevel.Warning = 4)
     */
    static warn(message: string, ...args: unknown[]): void {
        if (this.outputChannel) {
            this.outputChannel.warn(message, ...args);
        }
    }

    /**
     * Error level log (VS Code LogLevel.Error = 5)
     */
    static error(message: string | Error, ...args: unknown[]): void {
        if (this.outputChannel) {
            this.outputChannel.error(message, ...args);
        }
    }

    /**
     * Dispose logger manager
     */
    static dispose(): void {
        if (this.outputChannel) {
            this.outputChannel.dispose();
        }
    }
}
