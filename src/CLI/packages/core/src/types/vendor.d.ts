declare module '@lydell/node-pty' {
    export interface IPty {
        kill(signal?: number | string): void;
        write(data: string): void;
        resize(cols: number, rows: number): void;
        onData(listener: (data: string) => void): void;
        onExit(listener: (event: { exitCode: number; signal: number }) => void): void;
    }
}

declare module 'uuid' {
    export function v4(): string;
}

declare module 'mock-fs' {
    interface MockFsInstance {
        restore(): void;
    }

    function mockFs(...args: unknown[]): MockFsInstance;
    namespace mockFs {
        function file(options?: {
            content?: string | Buffer;
            mode?: number;
            customFields?: Record<string, unknown>;
        }): unknown;

        function directory(options?: Record<string, unknown>): unknown;

        function restore(): void;
    }

    export default mockFs;
}
