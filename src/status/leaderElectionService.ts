import * as vscode from 'vscode';
import { StatusLogger } from '../utils/statusLogger.js';
import { UserActivityService } from './userActivityService.js';
import * as crypto from 'crypto';

interface LeaderInfo {
    instanceId: string;
    lastHeartbeat: number;
    electedAt: number;
}

/**
 * Master instance election service (pure static class)
 * Ensure that only one master instance is responsible for executing periodic tasks
 */
export class LeaderElectionService {
    private static readonly LEADER_KEY = 'chp.leader.info';
    private static readonly HEARTBEAT_INTERVAL = 5000;
    private static readonly LEADER_TIMEOUT = 15000;
    private static readonly TASK_INTERVAL = 60 * 1000;

    private static instanceId: string;
    private static context: vscode.ExtensionContext | undefined;
    private static heartbeatTimer: NodeJS.Timeout | undefined;
    private static taskTimer: NodeJS.Timeout | undefined;
    private static _isLeader = false;
    private static initialized = false;

    private static periodicTasks: Array<() => Promise<void>> = [];

    private constructor() {
        throw new Error('LeaderElectionService is a static class and cannot be instantiated');
    }

    public static initialize(context: vscode.ExtensionContext): void {
        if (this.initialized) {
            return;
        }

        this.registerPeriodicTask(async () => {
            StatusLogger.trace('[LeaderElectionService] Master instance periodic task: record survival log');
        });

        this.instanceId = crypto.randomUUID();
        this.context = context;
        StatusLogger.info(`[LeaderElectionService] Initialize master instance election service, instance ID: ${this.instanceId}`);

        UserActivityService.initialize(context, this.instanceId);

        const startDelay = Math.random() * 1000;
        setTimeout(() => {
            this.start();
        }, startDelay);

        this.initialized = true;
    }

    private static start(): void {
        if (!this.context) {
            StatusLogger.warn('[LeaderElectionService] Election service not initialized, cannot start');
            return;
        }

        this.checkLeader();
        this.heartbeatTimer = setInterval(() => this.checkLeader(), this.HEARTBEAT_INTERVAL);

        this.taskTimer = setInterval(() => {
            if (this._isLeader) {
                this.executePeriodicTasks();
            }
        }, this.TASK_INTERVAL);
    }

    public static stop(): void {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = undefined;
        }
        if (this.taskTimer) {
            clearInterval(this.taskTimer);
            this.taskTimer = undefined;
        }

        UserActivityService.stop();
        this.resignLeader();
        this.initialized = false;
    }

    public static registerPeriodicTask(task: () => Promise<void>): void {
        this.periodicTasks.push(task);
    }

    public static isLeader(): boolean {
        return this._isLeader;
    }

    public static getInstanceId(): string {
        return this.instanceId;
    }

    public static getLeaderId(): string | undefined {
        if (!this.context) {
            return undefined;
        }
        const leaderInfo = this.context.globalState.get<LeaderInfo>(this.LEADER_KEY);
        return leaderInfo?.instanceId;
    }

    private static async checkLeader(): Promise<void> {
        if (!this.context) {
            return;
        }

        const now = Date.now();
        const leaderInfo = this.context.globalState.get<LeaderInfo>(this.LEADER_KEY);
        StatusLogger.trace(
            `[LeaderElectionService] Heartbeat check: leaderInfo=${leaderInfo ? `instanceId=${leaderInfo.instanceId}, lastHeartbeat=${leaderInfo.lastHeartbeat}` : 'null'}`
        );

        if (!leaderInfo) {
            StatusLogger.trace('[LeaderElectionService] No Leader found, attempting election...');
            await this.becomeLeader();
            return;
        }

        if (leaderInfo.instanceId === this.instanceId) {
            StatusLogger.trace('[LeaderElectionService] Confirming self as Leader, updating heartbeat');
            await this.updateHeartbeat();
            if (!this._isLeader) {
                this._isLeader = true;
                StatusLogger.info('[LeaderElectionService] Current instance has become master instance');
            }
        } else {
            StatusLogger.trace(`[LeaderElectionService] Detected other Leader: ${leaderInfo.instanceId}`);
            if (this._isLeader) {
                this._isLeader = false;
                StatusLogger.warn(
                    `[LeaderElectionService] Detected master instance overwritten by another instance ${leaderInfo.instanceId}, current instance resigning`
                );
            }

            const heartbeatAge = now - leaderInfo.lastHeartbeat;
            StatusLogger.trace(
                `[LeaderElectionService] Leader heartbeat age: ${heartbeatAge}ms (timeout threshold: ${this.LEADER_TIMEOUT}ms)`
            );
            if (heartbeatAge > this.LEADER_TIMEOUT) {
                StatusLogger.info(`[LeaderElectionService] Master instance ${leaderInfo.instanceId} heartbeat timeout, attempting takeover...`);
                await this.becomeLeader();
            }
        }
    }

    private static async becomeLeader(): Promise<void> {
        if (!this.context) {
            return;
        }

        StatusLogger.trace('[LeaderElectionService] Starting election process...');
        const existingLeader = this.context.globalState.get<LeaderInfo>(this.LEADER_KEY);

        if (existingLeader) {
            const now = Date.now();
            const heartbeatAge = now - existingLeader.lastHeartbeat;
            if (heartbeatAge <= this.LEADER_TIMEOUT) {
                StatusLogger.trace(
                    `[LeaderElectionService] Active master instance ${existingLeader.instanceId} already exists (heartbeat age: ${heartbeatAge}ms), abandoning election`
                );
                return;
            }
        }

        const now = Date.now();
        const info: LeaderInfo = {
            instanceId: this.instanceId,
            lastHeartbeat: now,
            electedAt: now
        };

        StatusLogger.trace(`[LeaderElectionService] Writing election info: instanceId=${this.instanceId}, electedAt=${now}`);
        await this.context.globalState.update(this.LEADER_KEY, info);

        await new Promise(resolve => setTimeout(resolve, 100));

        const currentInfo = this.context.globalState.get<LeaderInfo>(this.LEADER_KEY);

        if (!currentInfo) {
            StatusLogger.warn('[LeaderElectionService] Election failed: unable to read Leader information');
            return;
        }

        StatusLogger.trace(
            `[LeaderElectionService] Election result: current Leader=${currentInfo.instanceId}, electedAt=${currentInfo.electedAt}`
        );

        const isWinner =
            currentInfo.instanceId === this.instanceId ||
            (currentInfo.electedAt === info.electedAt && currentInfo.instanceId < this.instanceId);

        if (isWinner && currentInfo.instanceId === this.instanceId) {
            if (!this._isLeader) {
                this._isLeader = true;
                StatusLogger.info('[LeaderElectionService] Election successful, current instance becomes master instance');
            }
        } else {
            StatusLogger.debug(
                `[LeaderElectionService] Election failed, instance ${currentInfo.instanceId} becomes master instance (electedAt: ${currentInfo.electedAt})`
            );
            if (this._isLeader) {
                this._isLeader = false;
                StatusLogger.info(`[LeaderElectionService] Election failed, instance ${currentInfo.instanceId} becomes master instance`);
            }
        }
    }

    private static async updateHeartbeat(): Promise<void> {
        if (!this._isLeader || !this.context) {
            return;
        }

        const currentInfo = this.context.globalState.get<LeaderInfo>(this.LEADER_KEY);
        const newHeartbeat = Date.now();

        const info: LeaderInfo = {
            instanceId: this.instanceId,
            lastHeartbeat: newHeartbeat,
            electedAt: currentInfo?.electedAt || newHeartbeat
        };
        StatusLogger.trace(`[LeaderElectionService] Update heartbeat: lastHeartbeat=${newHeartbeat}`);
        await this.context.globalState.update(this.LEADER_KEY, info);
    }

    private static async resignLeader(): Promise<void> {
        if (this._isLeader && this.context) {
            const currentInfo = this.context.globalState.get<LeaderInfo>(this.LEADER_KEY);
            if (currentInfo && currentInfo.instanceId === this.instanceId) {
                await this.context.globalState.update(this.LEADER_KEY, undefined);
                StatusLogger.info('[LeaderElectionService] Instance release: master instance identity cleared');
            }
            this._isLeader = false;
            StatusLogger.debug('[LeaderElectionService] Instance release: exited master instance identity');
        }
    }

    private static async executePeriodicTasks(): Promise<void> {
        if (!UserActivityService.isUserActive()) {
            const inactiveMinutes = Math.floor(UserActivityService.getInactiveTime() / 60000);
            StatusLogger.debug(`[LeaderElectionService] User inactive for ${inactiveMinutes} minutes, pausing periodic task execution`);
            return;
        }

        StatusLogger.trace(`[LeaderElectionService] Starting execution of ${this.periodicTasks.length} periodic tasks...`);
        for (const task of this.periodicTasks) {
            try {
                await task();
            } catch (error) {
                StatusLogger.error('[LeaderElectionService] Error executing periodic task:', error);
            }
        }
        StatusLogger.trace('[LeaderElectionService] Periodic task execution completed');
    }
}
