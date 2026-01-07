/* eslint-disable no-undef, @typescript-eslint/no-require-imports */
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const isWatch = process.argv.includes('--watch');
const isDev = process.argv.includes('--dev');

// Resource copying logic from postinstall.ts
const treeSitterGrammars = [
    'tree-sitter-c-sharp',
    'tree-sitter-cpp',
    'tree-sitter-go',
    'tree-sitter-javascript', // Also includes jsx support
    'tree-sitter-python',
    'tree-sitter-ruby',
    'tree-sitter-typescript',
    'tree-sitter-tsx',
    'tree-sitter-java',
    'tree-sitter-rust',
    'tree-sitter-php'
];

const REPO_ROOT = path.join(__dirname, '.');

async function fileExists(filePath) {
    try {
        await fs.promises.access(filePath, fs.constants.F_OK);
        return true;
    } catch {
        return false;
    }
}

async function platformDir() {
    try {
        // Find tokenizer files in @vscode/chat-lib
        const chatlibModulePath = require.resolve('@vscode/chat-lib');
        // chat-lib root is the parent of dist/src
        const chatlibRoot = path.join(path.dirname(chatlibModulePath), '../..');

        // Try platform-specific path first
        const platformPath = path.join(chatlibRoot, 'dist/src/_internal/platform');
        if (await fileExists(platformPath)) {
            return path.relative(REPO_ROOT, platformPath);
        }

        // Try direct dist directory of chat-lib
        const distPath = path.join(chatlibRoot, 'dist');
        if (await fileExists(distPath)) {
            return path.relative(REPO_ROOT, distPath);
        }

        console.log('Chat-lib directory not found, skipping tokenizer files');
        return null;
    } catch {
        console.log('Could not resolve @vscode/chat-lib, skipping tokenizer files');
        return null;
    }
}

function treeSitterWasmDir() {
    try {
        const modulePath = path.dirname(require.resolve('@vscode/tree-sitter-wasm'));
        return path.relative(REPO_ROOT, modulePath);
    } catch {
        console.warn('Could not resolve @vscode/tree-sitter-wasm, skipping tree-sitter files');
        return null;
    }
}

async function copyStaticAssets(srcpaths, dst) {
    await Promise.all(srcpaths.map(async srcpath => {
        const src = path.join(REPO_ROOT, srcpath);
        const dest = path.join(REPO_ROOT, dst, path.basename(srcpath));
        try {
            await fs.promises.mkdir(path.dirname(dest), { recursive: true });
            await fs.promises.copyFile(src, dest);
            console.log(`Copied: ${srcpath} -> ${dest}`);
        } catch {
            console.warn(`Failed to copy ${srcpath}`);
        }
    }));
}

async function copyBuildAssets() {
    console.log('Copying build assets...');
    const platform = await platformDir();
    const wasm = treeSitterWasmDir();

    const filesToCopy = [];

    // Handle tokenizer files
    if (platform) {
        const vendoredTiktokenFiles = [
            `${platform}/tokenizer/node/cl100k_base.tiktoken`,
            `${platform}/tokenizer/node/o200k_base.tiktoken`
        ].filter(file => fs.existsSync(path.join(REPO_ROOT, file)));

        filesToCopy.push(...vendoredTiktokenFiles);
    }

    // Handle tree-sitter files
    if (wasm) {
        const treeSitterFiles = [
            ...treeSitterGrammars.map(grammar => `${wasm}/${grammar}.wasm`),
            `${wasm}/tree-sitter.wasm`
        ].filter(file => fs.existsSync(path.join(REPO_ROOT, file)));

        filesToCopy.push(...treeSitterFiles);
    }

    if (filesToCopy.length === 0) {
        console.log('No build assets found to copy');
        return;
    }

    await copyStaticAssets(filesToCopy, 'dist');
}

// Custom plugin to handle ?raw imports (embedded resources, no minify)
const rawPlugin = {
    name: 'raw-import',
    setup(build) {
        build.onResolve({ filter: /\?raw$/ }, (args) => {
            return {
                path: args.path.replace(/\?raw$/, ''),
                namespace: 'raw-file',
                pluginData: {
                    resolveDir: args.resolveDir
                }
            };
        });
        build.onLoad({ filter: /.*/, namespace: 'raw-file' }, async (args) => {
            const filePath = path.join(args.pluginData.resolveDir, args.path);
            const contents = await fs.promises.readFile(filePath, 'utf8');
            return {
                contents: `export default ${JSON.stringify(contents)};`,
                loader: 'js'
            };
        });
    }
};

// ========================================================================
// Common Build Options
// ========================================================================
const commonOptions = {
    bundle: true,
    external: ['vscode'],
    format: 'cjs',
    platform: 'node',
    sourcemap: isDev,
    minify: !isDev,
    // Use mainFields to prioritize ESM module format
    // This solves relative path issues with jsonc-parser UMD module
    mainFields: ['module', 'main'],
    // Ensure correct module resolution
    resolveExtensions: ['.ts', '.js', '.mjs', '.json'],
    // Add custom plugins
    plugins: [rawPlugin],
    // Log level
    logLevel: 'info'
};

// ========================================================================
// Main Extension Build Options
// - Does not include heavy dependencies related to @vscode/chat-lib
// - Uses lightweight InlineCompletionShim for lazy loading
// ========================================================================
/** @type {import('esbuild').BuildOptions} */
const extensionBuildOptions = {
    ...commonOptions,
    entryPoints: ['./src/extension.ts'],
    outfile: 'dist/extension.js',
    // Exclude copilot.bundle module and @vscode/chat-lib to avoid duplicate bundling
    external: [...commonOptions.external, './copilot.bundle', '@vscode/chat-lib']
};

// ========================================================================
// Copilot Module Build Options
// - Includes @vscode/chat-lib and related heavy dependencies
// - Lazy loaded on first completion trigger
// ========================================================================
/** @type {import('esbuild').BuildOptions} */
const copilotBuildOptions = {
    ...commonOptions,
    entryPoints: ['./src/copilot/copilot.bundle.ts'],
    outfile: 'dist/copilot.bundle.js',
    // Only exclude vscode itself, keep @vscode/chat-lib and its dependencies to ensure they are bundled
    external: ['vscode']
};

async function build() {
    try {
        if (isWatch) {
            // Watch mode: listen to both entry points simultaneously
            console.log('Starting watch mode for extension and copilot bundles...');

            const [extensionCtx, copilotCtx] = await Promise.all([
                esbuild.context(extensionBuildOptions),
                esbuild.context(copilotBuildOptions)
            ]);

            await Promise.all([extensionCtx.watch(), copilotCtx.watch()]);
            console.log('Watching for changes in both extension.js and copilot.bundle.js...');
        } else {
            // Clean dist directory before build
            console.log('Cleaning dist directory...');
            if (fs.existsSync('dist')) {
                await fs.promises.rm('dist', { recursive: true, force: true });
                console.log('Dist directory cleaned.');
            } else {
                console.log('No dist directory to clean.');
            }

            // Build both entry points in parallel
            console.log('Building extension.js and copilot.bundle.js...');
            const startTime = Date.now();

            await Promise.all([
                esbuild.build(extensionBuildOptions),
                esbuild.build(copilotBuildOptions)
            ]);

            const buildTime = Date.now() - startTime;
            console.log(`Build completed successfully in ${buildTime}ms.`);

            // Copy resource files after build
            await copyBuildAssets();
            console.log('Asset copying completed.');
        }
    } catch (error) {
        console.error('Build failed:', error);
        process.exit(1);
    }
}

build();
