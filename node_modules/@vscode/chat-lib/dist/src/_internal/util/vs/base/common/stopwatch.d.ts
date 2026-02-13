export declare class StopWatch {
    private _startTime;
    private _stopTime;
    private readonly _now;
    static create(highResolution?: boolean): StopWatch;
    constructor(highResolution?: boolean);
    stop(): void;
    reset(): void;
    elapsed(): number;
}
//# sourceMappingURL=stopwatch.d.ts.map