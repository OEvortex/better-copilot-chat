/*---------------------------------------------------------------------------------------------
 *  User Agent Utility
 *  Provides rotating User-Agent strings for API requests to avoid detection
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";

const EXTENSION_ID = "OEvortex.better-copilot-chat";

// Pool of realistic User-Agent strings that rotate
const USER_AGENT_POOL = [
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
	"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0",
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0",
];

let currentUserAgentIndex = 0;

/**
 * Get a rotating User-Agent string for API requests
 * Cycles through a pool of realistic browser User-Agents
 * @returns A User-Agent string from the pool
 */
export function getUserAgent(): string {
	const ua = USER_AGENT_POOL[currentUserAgentIndex];
	currentUserAgentIndex = (currentUserAgentIndex + 1) % USER_AGENT_POOL.length;
	return ua;
}

/**
 * Get a random User-Agent string from the pool
 * @returns A random User-Agent string
 */
export function getRandomUserAgent(): string {
	const randomIndex = Math.floor(Math.random() * USER_AGENT_POOL.length);
	return USER_AGENT_POOL[randomIndex];
}

/**
 * Get the extension version
 * @returns The extension version or "unknown"
 */
export function getExtensionVersion(): string {
	const ext = vscode.extensions.getExtension(EXTENSION_ID);
	return ext?.packageJSON?.version ?? "unknown";
}

/**
 * Get the VS Code version
 * @returns The VS Code version
 */
export function getVSCodeVersion(): string {
	return vscode.version;
}
