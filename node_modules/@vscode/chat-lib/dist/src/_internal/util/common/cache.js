"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.DisposablesLRUCache = exports.LRUCache = void 0;
class Node {
    constructor(key, value) {
        this.prev = null;
        this.next = null;
        this.key = key;
        this.value = value;
    }
}
class LRUCache {
    constructor(size = 10) {
        if (size < 1) {
            throw new Error('Cache size must be at least 1');
        }
        this._capacity = size;
        this._cache = new Map();
        this._head = new Node('', null);
        this._tail = new Node('', null);
        this._head.next = this._tail;
        this._tail.prev = this._head;
    }
    _addNode(node) {
        node.prev = this._head;
        node.next = this._head.next;
        this._head.next.prev = node;
        this._head.next = node;
    }
    _removeNode(node) {
        const prev = node.prev;
        const next = node.next;
        prev.next = next;
        next.prev = prev;
    }
    _moveToHead(node) {
        this._removeNode(node);
        this._addNode(node);
    }
    _popTail() {
        const res = this._tail.prev;
        this._removeNode(res);
        return res;
    }
    clear() {
        this._cache.clear();
        this._head.next = this._tail;
        this._tail.prev = this._head;
    }
    /**
     * Deletes the cache entry for the given key, if it exists.
     * @param key The key of the cache entry to delete.
     * @returns The value of the deleted cache entry, or undefined if the key was not found.
     */
    deleteKey(key) {
        const node = this._cache.get(key);
        if (!node) {
            return undefined;
        }
        this._removeNode(node);
        this._cache.delete(key);
        return node.value;
    }
    get(key) {
        const node = this._cache.get(key);
        if (!node) {
            return undefined;
        }
        this._moveToHead(node);
        return node.value;
    }
    /**
     * Return a copy of all the keys stored in the LRU cache, in LRU order.
     *
     * The returned array is safe to modify, as this call allocates a copy of a
     * private array used to represent those keys.
     */
    keys() {
        const keys = [];
        let current = this._head.next;
        while (current !== this._tail) {
            keys.push(current.key);
            current = current.next;
        }
        return keys;
    }
    getValues() {
        const values = [];
        let current = this._head.next;
        while (current !== this._tail) {
            values.push(current.value);
            current = current.next;
        }
        return values;
    }
    /** @returns the evicted [key, value]  */
    put(key, value) {
        let node = this._cache.get(key);
        if (node) {
            node.value = value;
            this._moveToHead(node);
        }
        else {
            node = new Node(key, value);
            this._cache.set(key, node);
            this._addNode(node);
            if (this._cache.size > this._capacity) {
                const tail = this._popTail();
                this._cache.delete(tail.key);
                return [tail.key, tail.value];
            }
        }
    }
    entries() {
        const entries = [];
        let current = this._head.next;
        while (current !== this._tail) {
            entries.push([current.key, current.value]);
            current = current.next;
        }
        return entries;
    }
}
exports.LRUCache = LRUCache;
class DisposablesLRUCache {
    constructor(size) {
        this.actual = new LRUCache(size);
    }
    dispose() {
        this.clear();
    }
    clear() {
        const values = this.actual.getValues();
        for (const value of values) {
            value.dispose();
        }
        this.actual.clear();
    }
    deleteKey(key) {
        const value = this.actual.deleteKey(key);
        if (value) {
            value.dispose();
        }
    }
    get(key) {
        return this.actual.get(key);
    }
    keys() {
        return this.actual.keys();
    }
    getValues() {
        return this.actual.getValues();
    }
    put(key, value) {
        const evicted = this.actual.put(key, value);
        if (evicted) {
            evicted[1].dispose();
        }
    }
}
exports.DisposablesLRUCache = DisposablesLRUCache;
//# sourceMappingURL=cache.js.map