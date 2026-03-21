export class SeraphynSseParser {
    private buffer = '';
    private currentDataLines: string[] = [];

    feed(chunk: string): string[] {
        this.buffer += chunk;
        const events: string[] = [];

        while (true) {
            const newlineIndex = this.buffer.indexOf('\n');
            if (newlineIndex === -1) {
                break;
            }

            let line = this.buffer.slice(0, newlineIndex);
            this.buffer = this.buffer.slice(newlineIndex + 1);

            if (line.endsWith('\r')) {
                line = line.slice(0, -1);
            }

            if (line.startsWith(':')) {
                continue;
            }

            if (line.startsWith('data:')) {
                const payload = line.slice(5).replace(/^\s/, '');
                this.currentDataLines.push(payload);
                continue;
            }

            if (line.trim().length === 0) {
                if (this.currentDataLines.length > 0) {
                    events.push(this.currentDataLines.join('\n'));
                    this.currentDataLines = [];
                }
            }
        }

        return events;
    }

    flush(): string[] {
        const events: string[] = [];

        if (this.buffer.length > 0) {
            let line = this.buffer;
            this.buffer = '';

            if (line.endsWith('\r')) {
                line = line.slice(0, -1);
            }

            if (line.startsWith('data:')) {
                const payload = line.slice(5).replace(/^\s/, '');
                this.currentDataLines.push(payload);
            }
        }

        if (this.currentDataLines.length > 0) {
            events.push(this.currentDataLines.join('\n'));
            this.currentDataLines = [];
        }

        return events;
    }
}
