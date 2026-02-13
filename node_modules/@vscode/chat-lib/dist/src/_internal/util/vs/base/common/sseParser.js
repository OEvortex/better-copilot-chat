"use strict";
//!!! DO NOT modify, this file was COPIED from 'microsoft/vscode'
Object.defineProperty(exports, "__esModule", { value: true });
exports.SSEParser = void 0;
/**
 * Parser for Server-Sent Events (SSE) streams.
 */
class SSEParser {
    /**
     * Creates a new SSE parser.
     * @param onEvent The callback to invoke when an event is dispatched.
     */
    constructor(onEvent) {
        this.dataBuffer = '';
        this.eventTypeBuffer = '';
        this.buffer = [];
        this.endedOnCR = false;
        this.onEventHandler = onEvent;
        this.decoder = new TextDecoder('utf-8');
    }
    /**
     * Gets the last event ID received by this parser.
     */
    getLastEventId() {
        return this.lastEventIdBuffer;
    }
    /**
     * Gets the reconnection time in milliseconds, if one was specified by the server.
     */
    getReconnectionTime() {
        return this.reconnectionTime;
    }
    /**
     * Feeds a chunk of the SSE stream to the parser.
     * @param chunk The chunk to parse as a Uint8Array of UTF-8 encoded data.
     */
    feed(chunk) {
        if (chunk.length === 0) {
            return;
        }
        let offset = 0;
        // If the data stream was bifurcated between a CR and LF, avoid processing the CR as an extra newline
        if (this.endedOnCR && chunk[0] === 10 /* Chr.LF */) {
            offset++;
        }
        this.endedOnCR = false;
        // Process complete lines from the buffer
        while (offset < chunk.length) {
            const indexCR = chunk.indexOf(13 /* Chr.CR */, offset);
            const indexLF = chunk.indexOf(10 /* Chr.LF */, offset);
            const index = indexCR === -1 ? indexLF : (indexLF === -1 ? indexCR : Math.min(indexCR, indexLF));
            if (index === -1) {
                break;
            }
            let str = '';
            for (const buf of this.buffer) {
                str += this.decoder.decode(buf, { stream: true });
            }
            str += this.decoder.decode(chunk.subarray(offset, index));
            this.processLine(str);
            this.buffer.length = 0;
            offset = index + (chunk[index] === 13 /* Chr.CR */ && chunk[index + 1] === 10 /* Chr.LF */ ? 2 : 1);
        }
        if (offset < chunk.length) {
            this.buffer.push(chunk.subarray(offset));
        }
        else {
            this.endedOnCR = chunk[chunk.length - 1] === 13 /* Chr.CR */;
        }
    }
    /**
     * Processes a single line from the SSE stream.
     */
    processLine(line) {
        if (!line.length) {
            this.dispatchEvent();
            return;
        }
        if (line.startsWith(':')) {
            return;
        }
        // Parse the field name and value
        let field;
        let value;
        const colonIndex = line.indexOf(':');
        if (colonIndex === -1) {
            // Line with no colon - the entire line is the field name, value is empty
            field = line;
            value = '';
        }
        else {
            // Line with a colon - split into field name and value
            field = line.substring(0, colonIndex);
            value = line.substring(colonIndex + 1);
            // If value starts with a space, remove it
            if (value.startsWith(' ')) {
                value = value.substring(1);
            }
        }
        this.processField(field, value);
    }
    /**
     * Processes a field with the given name and value.
     */
    processField(field, value) {
        switch (field) {
            case 'event':
                this.eventTypeBuffer = value;
                break;
            case 'data':
                // Append the value to the data buffer, followed by a newline
                this.dataBuffer += value;
                this.dataBuffer += '\n';
                break;
            case 'id':
                // If the field value doesn't contain NULL, set the last event ID buffer
                if (!value.includes('\0')) {
                    this.currentEventId = this.lastEventIdBuffer = value;
                }
                else {
                    this.currentEventId = undefined;
                }
                break;
            case 'retry':
                // If the field value consists only of ASCII digits, set the reconnection time
                if (/^\d+$/.test(value)) {
                    this.reconnectionTime = parseInt(value, 10);
                }
                break;
            // Ignore any other fields
        }
    }
    /**
     * Dispatches the event based on the current buffer states.
     */
    dispatchEvent() {
        // If the data buffer is empty, reset the buffers and return
        if (this.dataBuffer === '') {
            this.dataBuffer = '';
            this.eventTypeBuffer = '';
            return;
        }
        // If the data buffer's last character is a newline, remove it
        if (this.dataBuffer.endsWith('\n')) {
            this.dataBuffer = this.dataBuffer.substring(0, this.dataBuffer.length - 1);
        }
        // Create and dispatch the event
        const event = {
            type: this.eventTypeBuffer || 'message',
            data: this.dataBuffer,
        };
        // Add optional fields if they exist
        if (this.currentEventId !== undefined) {
            event.id = this.currentEventId;
        }
        if (this.reconnectionTime !== undefined) {
            event.retry = this.reconnectionTime;
        }
        // Dispatch the event
        this.onEventHandler(event);
        // Reset the data and event type buffers
        this.reset();
    }
    /**
     * Resets the parser state.
     */
    reset() {
        this.dataBuffer = '';
        this.eventTypeBuffer = '';
        this.currentEventId = undefined;
        // Note: lastEventIdBuffer is not reset as it's used for reconnection
    }
}
exports.SSEParser = SSEParser;
//# sourceMappingURL=sseParser.js.map