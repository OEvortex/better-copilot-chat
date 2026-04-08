import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface TmpTreeObject {
    [name: string]: TmpTreeNode;
}

export type TmpTreeNode = string | string[] | TmpTreeObject | null;

function ensureDir(dirPath: string): void {
    if (!existsSync(dirPath)) {
        mkdirSync(dirPath, { recursive: true });
    }
}

function writeTree(baseDir: string, tree: TmpTreeObject): void {
    for (const [name, value] of Object.entries(tree)) {
        const targetPath = join(baseDir, name);
        if (Array.isArray(value)) {
            ensureDir(targetPath);
            for (const fileName of value) {
                writeFileSync(join(targetPath, fileName), '', 'utf8');
            }
            continue;
        }
        if (value && typeof value === 'object') {
            ensureDir(targetPath);
            writeTree(targetPath, value as TmpTreeObject);
            continue;
        }
        if (typeof value === 'string') {
            ensureDir(baseDir);
            writeFileSync(targetPath, value, 'utf8');
            continue;
        }
        ensureDir(targetPath);
    }
}

export async function createTmpDir(
    treeOrOptions: TmpTreeObject | { prefix?: string; parent?: string } = {},
): Promise<string> {
    if ('prefix' in treeOrOptions || 'parent' in treeOrOptions) {
        const options = treeOrOptions as { prefix?: string; parent?: string };
        const parent = options.parent ?? tmpdir();
        return mkdtempSync(join(parent, options.prefix ?? 'aether-'));
    }

    const tmpDir = mkdtempSync(join(tmpdir(), 'aether-'));
    writeTree(tmpDir, treeOrOptions as TmpTreeObject);
    return tmpDir;
}

export async function cleanupTmpDir(dirPath: string): Promise<void> {
    rmSync(dirPath, { recursive: true, force: true });
}
