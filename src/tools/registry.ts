/*---------------------------------------------------------------------------------------------
 *  Tool Registry
 *  Manages registration and lifecycle of all tools
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Logger } from '../utils';
import { ZhipuSearchTool } from './zhipuSearch';
import { MiniMaxSearchTool } from './minimaxSearch';

// Global tool instance management
let zhipuSearchTool: ZhipuSearchTool | undefined;
let minimaxSearchTool: MiniMaxSearchTool | undefined;

/**
 * Register all tools
 */
export function registerAllTools(context: vscode.ExtensionContext): void {
    try {
        // Register ZhipuAI web search tool
        zhipuSearchTool = new ZhipuSearchTool();
        const zhipuToolDisposable = vscode.lm.registerTool('chp_zhipuWebSearch', {
            invoke: zhipuSearchTool.invoke.bind(zhipuSearchTool)
        });
        context.subscriptions.push(zhipuToolDisposable);

        // Register MiniMax web search tool
        minimaxSearchTool = new MiniMaxSearchTool();
        const minimaxToolDisposable = vscode.lm.registerTool('chp_minimaxWebSearch', {
            invoke: minimaxSearchTool.invoke.bind(minimaxSearchTool)
        });
        context.subscriptions.push(minimaxToolDisposable);

        // Add cleanup logic to context
        context.subscriptions.push({
            dispose: async () => {
                await cleanupAllTools();
            }
        });

        Logger.info('Zhipu AI web search tool registered: chp_zhipuWebSearch');
        Logger.info('MiniMax web search tool registered: chp_minimaxWebSearch');
    } catch (error) {
        Logger.error('Tool registration failed', error instanceof Error ? error : undefined);
        throw error;
    }
}

/**
 * Clean up all tool resources
 */
export async function cleanupAllTools(): Promise<void> {
    try {
        if (zhipuSearchTool) {
            await zhipuSearchTool.cleanup();
            zhipuSearchTool = undefined;
            Logger.info('ZhipuAI web search tool resources cleaned up');
        }

        if (minimaxSearchTool) {
            await minimaxSearchTool.cleanup();
            minimaxSearchTool = undefined;
            Logger.info('MiniMax web search tool resources cleaned up');
        }
    } catch (error) {
        Logger.error('Tool cleanup failed', error instanceof Error ? error : undefined);
    }
}
