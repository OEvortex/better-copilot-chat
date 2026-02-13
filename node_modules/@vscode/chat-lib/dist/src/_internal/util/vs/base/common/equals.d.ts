export type EqualityComparer<T> = (a: T, b: T) => boolean;
/**
 * Compares two items for equality using strict equality.
*/
export declare const strictEquals: EqualityComparer<any>;
/**
 * Checks if the items of two arrays are equal.
 * By default, strict equality is used to compare elements, but a custom equality comparer can be provided.
 */
export declare function itemsEquals<T>(itemEquals?: EqualityComparer<T>): EqualityComparer<readonly T[]>;
/**
 * Two items are considered equal, if their stringified representations are equal.
*/
export declare function jsonStringifyEquals<T>(): EqualityComparer<T>;
/**
 * Uses `item.equals(other)` to determine equality.
 */
export declare function itemEquals<T extends {
    equals(other: T): boolean;
}>(): EqualityComparer<T>;
/**
 * Checks if two items are both null or undefined, or are equal according to the provided equality comparer.
*/
export declare function equalsIfDefined<T>(v1: T | undefined | null, v2: T | undefined | null, equals: EqualityComparer<T>): boolean;
/**
 * Returns an equality comparer that checks if two items are both null or undefined, or are equal according to the provided equality comparer.
*/
export declare function equalsIfDefined<T>(equals: EqualityComparer<T>): EqualityComparer<T | undefined | null>;
/**
 * Drills into arrays (items ordered) and objects (keys unordered) and uses strict equality on everything else.
*/
export declare function structuralEquals<T>(a: T, b: T): boolean;
/**
 * `getStructuralKey(a) === getStructuralKey(b) <=> structuralEquals(a, b)`
 * (assuming that a and b are not cyclic structures and nothing extends globalThis Array).
*/
export declare function getStructuralKey(t: unknown): string;
//# sourceMappingURL=equals.d.ts.map