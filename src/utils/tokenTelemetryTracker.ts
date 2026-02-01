import * as vscode from 'vscode';

export type TokenTelemetryStatus = 'success' | 'error' | 'cancelled';

export interface TokenResponseMetrics {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    maxInputTokens?: number;
    maxOutputTokens?: number;
    modelName?: string;
    providerId?: string;
    estimatedPromptTokens?: boolean;
}

export interface TokenTelemetryEvent {
    eventId: string;
    timestamp: number;
    status: TokenTelemetryStatus;
    modelId?: string;
    providerId?: string;
    responseMetrics?: TokenResponseMetrics;
    errorMessage?: string;
    durationMs?: number;
}

export interface TokenAggregateStats {
    totalTokens: number;
    totalPromptTokens: number;
    totalCompletionTokens: number;
    successfulEvents: number;
    cancelledEvents: number;
    errorEvents: number;
    averageEventDuration: number;
}

export interface TokenUsageSummary {
    modelName: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    maxInputTokens?: number;
    maxOutputTokens?: number;
    percentage: number;
    providerId?: string;
    estimatedPromptTokens?: boolean;
}

export class TokenTelemetryTracker {
    private static instance: TokenTelemetryTracker | undefined;
    private readonly emitter = new vscode.EventEmitter<TokenTelemetryEvent>();
    private readonly events: TokenTelemetryEvent[] = [];
    private readonly maxEvents = 200;
    private lastSuccessEvent: TokenTelemetryEvent | undefined;

    static getInstance(): TokenTelemetryTracker {
        if (!TokenTelemetryTracker.instance) {
            TokenTelemetryTracker.instance = new TokenTelemetryTracker();
        }
        return TokenTelemetryTracker.instance;
    }

    onEvent(listener: (event: TokenTelemetryEvent) => void): vscode.Disposable {
        return this.emitter.event(listener);
    }

    recordSuccess(params: {
        modelId?: string;
        modelName?: string;
        providerId?: string;
        promptTokens: number;
        completionTokens: number;
        totalTokens?: number;
        maxInputTokens?: number;
        maxOutputTokens?: number;
        estimatedPromptTokens?: boolean;
        durationMs?: number;
    }): void {
        const totalTokens =
            params.totalTokens ?? params.promptTokens + params.completionTokens;
        const event: TokenTelemetryEvent = {
            eventId: this.createEventId(),
            timestamp: Date.now(),
            status: 'success',
            modelId: params.modelId,
            providerId: params.providerId,
            durationMs: params.durationMs,
            responseMetrics: {
                promptTokens: params.promptTokens,
                completionTokens: params.completionTokens,
                totalTokens,
                maxInputTokens: params.maxInputTokens,
                maxOutputTokens: params.maxOutputTokens,
                modelName: params.modelName,
                providerId: params.providerId,
                estimatedPromptTokens: params.estimatedPromptTokens
            }
        };
        this.pushEvent(event);
        this.lastSuccessEvent = event;
    }

    recordError(params: {
        modelId?: string;
        providerId?: string;
        errorMessage?: string;
        durationMs?: number;
    }): void {
        const event: TokenTelemetryEvent = {
            eventId: this.createEventId(),
            timestamp: Date.now(),
            status: 'error',
            modelId: params.modelId,
            providerId: params.providerId,
            errorMessage: params.errorMessage,
            durationMs: params.durationMs
        };
        this.pushEvent(event);
    }

    recordCancelled(params: {
        modelId?: string;
        providerId?: string;
        durationMs?: number;
    }): void {
        const event: TokenTelemetryEvent = {
            eventId: this.createEventId(),
            timestamp: Date.now(),
            status: 'cancelled',
            modelId: params.modelId,
            providerId: params.providerId,
            durationMs: params.durationMs
        };
        this.pushEvent(event);
    }

    getLastUsageSummary(): TokenUsageSummary | null {
        if (!this.lastSuccessEvent?.responseMetrics) {
            return null;
        }
        const metrics = this.lastSuccessEvent.responseMetrics;
        const maxInputTokens = metrics.maxInputTokens || 0;
        const percentage =
            maxInputTokens > 0
                ? (metrics.promptTokens / maxInputTokens) * 100
                : 0;
        return {
            modelName: metrics.modelName || this.lastSuccessEvent.modelId || 'Model',
            promptTokens: metrics.promptTokens,
            completionTokens: metrics.completionTokens,
            totalTokens: metrics.totalTokens,
            maxInputTokens: metrics.maxInputTokens,
            maxOutputTokens: metrics.maxOutputTokens,
            percentage,
            providerId: metrics.providerId,
            estimatedPromptTokens: metrics.estimatedPromptTokens
        };
    }

    computeAggregateStats(): TokenAggregateStats {
        let totalTokens = 0;
        let totalPromptTokens = 0;
        let totalCompletionTokens = 0;
        let successfulEvents = 0;
        let cancelledEvents = 0;
        let errorEvents = 0;
        let totalDuration = 0;
        let durationCount = 0;

        for (const event of this.events) {
            if (event.status === 'success' && event.responseMetrics) {
                successfulEvents++;
                totalTokens += event.responseMetrics.totalTokens;
                totalPromptTokens += event.responseMetrics.promptTokens;
                totalCompletionTokens += event.responseMetrics.completionTokens;
            } else if (event.status === 'cancelled') {
                cancelledEvents++;
            } else if (event.status === 'error') {
                errorEvents++;
            }
            if (typeof event.durationMs === 'number') {
                totalDuration += event.durationMs;
                durationCount++;
            }
        }

        return {
            totalTokens,
            totalPromptTokens,
            totalCompletionTokens,
            successfulEvents,
            cancelledEvents,
            errorEvents,
            averageEventDuration: durationCount > 0 ? totalDuration / durationCount : 0
        };
    }

    private pushEvent(event: TokenTelemetryEvent): void {
        this.events.push(event);
        if (this.events.length > this.maxEvents) {
            this.events.shift();
        }
        this.emitter.fire(event);
    }

    private createEventId(): string {
        const random = Math.random().toString(36).slice(2, 10);
        return `tok_${Date.now()}_${random}`;
    }
}
