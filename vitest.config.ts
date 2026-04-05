import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        exclude: [
            'src/openclaude/**',
            'src/aether/**',
            'dist/**',
            'node_modules/**'
        ]
    }
});
