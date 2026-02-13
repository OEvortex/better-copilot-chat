/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as fs from 'fs';
import * as path from 'path';
import { LICENSE, LICENSE_AGREEMENT } from '../src/licenseAgreement.js';

// Path configurations
// TODO: Temporary logic while we are in transition - remove once repo naming is standardized
const vscodeCopilotChatPath = process.env.BUILD_SOURCESDIRECTORY || 
    (fs.existsSync('../vscode-copilot-chat') ? '../vscode-copilot-chat' : '../vscode-copilot');
const vscodeCapiPath = process.env.VSCODE_CAPI_PATH || '../vscode-capi';
const fileToReplace = 'src/platform/endpoint/common/licenseAgreement.ts';
const licensePath = path.join(vscodeCapiPath, 'LICENSE');
const copilotChatExtensionLicensePath = path.join(vscodeCapiPath, 'COPILOT_CHAT_EXTENSION_LICENSE.md'); // extension is licensed under GitHub Proprietary License instead of MIT.
const targetPath = path.resolve(vscodeCopilotChatPath, fileToReplace);
const targetCopilotChatExtensionLicensePath = path.resolve(vscodeCopilotChatPath, 'LICENSE.txt');

function error(message: string): never {
    console.error(message);
    process.exit(1);
}

// Read LICENSE file from vscode-capi repo
if (!fs.existsSync(licensePath)) {
    error(`LICENSE file not found at ${licensePath}`);
}

const licenseContent = fs.readFileSync(licensePath, 'utf8').trim();
if (licenseContent !== LICENSE) {
    error(`LICENSE content in source does not match expected content in ${licensePath}`);
}

// Read COPILOT_CHAT_LICENSE.md file from vscode-capi repo
if (!fs.existsSync(copilotChatExtensionLicensePath)) {
    error(`COPILOT_CHAT_LICENSE.md file not found at ${copilotChatExtensionLicensePath}`);
}

const copilotChatLicenseContent = fs.readFileSync(copilotChatExtensionLicensePath, 'utf8').trim();

// Create new file content
const newContent = `/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const LICENSE_AGREEMENT = \`${LICENSE_AGREEMENT}\`;
`;

// Check if the target file exists. We are overwriting it, so it should
if (!fs.existsSync(targetPath)) {
    error(`Target file does not exist: ${targetPath}`);
}

fs.writeFileSync(targetPath, newContent, 'utf8');
console.log(`Successfully updated ${targetPath}`);

// Replace the LICENSE file in vscode-copilot-chat repo
if (!fs.existsSync(targetCopilotChatExtensionLicensePath)) {
    error(`Target LICENSE file does not exist: ${targetCopilotChatExtensionLicensePath}`);
}

fs.writeFileSync(targetCopilotChatExtensionLicensePath, copilotChatLicenseContent, 'utf8');
console.log(`Successfully replaced LICENSE file at ${targetCopilotChatExtensionLicensePath}`);
