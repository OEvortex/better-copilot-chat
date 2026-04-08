import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { PairingRequest } from './types.js';

function pairingDir(): string {
    const dir = join(homedir(), '.aether', 'channels', 'pairing');
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    return dir;
}

function pairingFile(name: string): string {
    return join(pairingDir(), `${name}.json`);
}

export class PairingStore {
    public constructor(private readonly name: string) {}

    public listPending(): PairingRequest[] {
        const file = pairingFile(this.name);
        if (!existsSync(file)) {
            return [];
        }
        try {
            return JSON.parse(readFileSync(file, 'utf8')) as PairingRequest[];
        } catch {
            return [];
        }
    }

    public approve(_code: string): PairingRequest | undefined {
        return undefined;
    }

    public savePending(requests: PairingRequest[]): void {
        writeFileSync(pairingFile(this.name), JSON.stringify(requests, null, 2), 'utf8');
    }
}
