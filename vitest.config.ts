import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        exclude: ['src/openclaude/**', 'src/chpcli/**', 'dist/**', 'node_modules/**']
    }
});
