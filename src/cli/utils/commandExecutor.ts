/**
 * Command Executor utility
 * 
 * Uses spawn to execute commands safely.
 */

import { spawn } from 'child_process';

/**
 * Execute command safely using spawn
 * @param command - Command to execute
 * @param args - Command argument array
 * @param timeoutMs - Timeout in milliseconds
 * @returns stdout output
 */
export function executeCommand(command: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    // Use shell: true on Windows to properly resolve commands like 'gemini', 'claude'
    // that are installed via npm and exist as .cmd wrappers
    const childProcess = spawn(command, args, {
      shell: process.platform === 'win32',
      env: process.env,
    });
    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      childProcess.kill('SIGTERM');
      reject(new Error('Command execution timed out'));
    }, timeoutMs);

    childProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    childProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    childProcess.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });

    childProcess.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr || `Command exited with code ${code}`));
      }
    });
  });
}
