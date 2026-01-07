/*---------------------------------------------------------------------------------------------
 *  Logger Manager
 *  Outputs logs to VS Code's output window
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * Logger Manager class - directly uses VS Code's LogLevel and LogOutputChannel
 */
export class Logger {
    private static outputChannel: vscode.LogOutputChannel;

    /**
     * Initialize logger manager
     */
    static initialize(channelName = 'Copilot ++'): void {
        // Use LogOutputChannel (VS Code 1.74+), supports native log levels and formatting
        this.outputChannel = vscode.window.createOutputChannel(channelName, { log: true });
    }

    /**
     * Check and prompt VS Code log level settings
     */
    static checkAndPromptLogLevel(): void {
        if (!this.outputChannel) {
            return;
        }

        const channelLevel = this.outputChannel.logLevel;
        const envLevel = vscode.env.logLevel;

        Logger.info('📊 VS Code log level status:');
        Logger.info(`  - Output channel level: ${vscode.LogLevel[channelLevel]} (${channelLevel})`);
        Logger.info(`  - Editor environment level: ${vscode.LogLevel[envLevel]} (${envLevel})`);

        // If log level is higher than Debug, prompt user
        if (channelLevel > vscode.LogLevel.Debug) {
            Logger.warn(`⚠️ Current VS Code log level is ${vscode.LogLevel[channelLevel]}, detailed debug information may not be displayed`);
            Logger.info('💡 To view detailed debug logs, please execute command: "Developer: Set Log Level" → select "Debug"');

            // Show notification
            vscode.window
                .showInformationMessage(
                    `Copilot ++: Current VS Code log level is ${vscode.LogLevel[channelLevel]}`,
                    'Set Log Level',
                    'Ignore'
                )
                .then(selection => {
                    if (selection === 'Set Log Level') {
                        vscode.commands.executeCommand('workbench.action.setLogLevel');
                    }
                });
        } else {
            Logger.info(`✅ VS Code log level is set to ${vscode.LogLevel[channelLevel]}, detailed debug information can be viewed`);
        }
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
