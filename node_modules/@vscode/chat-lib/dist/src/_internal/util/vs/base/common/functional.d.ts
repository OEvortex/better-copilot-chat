/**
 * Given a function, returns a function that is only calling that function once.
 */
export declare function createSingleCallFunction<T extends Function>(this: unknown, fn: T, fnDidRunCallback?: () => void): T;
//# sourceMappingURL=functional.d.ts.map