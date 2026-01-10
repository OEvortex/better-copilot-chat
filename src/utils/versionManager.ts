/*---------------------------------------------------------------------------------------------
 *  Version Management Tool
 *  Provides a unified method for obtaining the version number
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";

/**
 * Version Manager
 */
export class VersionManager {
	private static _version: string | null = null;

	/**
	 * Get extension version number
	 */
	static getVersion(): string {
		if (VersionManager._version === null) {
			const extension = vscode.extensions.getExtension(
				"vicanent.copilot-helper-pro",
			);
			VersionManager._version = extension?.packageJSON?.version || "0.4.0";
		}
		return VersionManager._version!;
	}

	/**
	 * Get user agent string
	 */
	static getUserAgent(component: string): string {
		return `CHP-${component}/${VersionManager.getVersion()}`;
	}

	/**
	 * Get client information
	 */
	static getClientInfo(): { name: string; version: string } {
		return {
			name: "Copilot ++",
			version: VersionManager.getVersion(),
		};
	}

	/**
	 * Reset cache (mainly for testing)
	 */
	static resetCache(): void {
		VersionManager._version = null;
	}
}
