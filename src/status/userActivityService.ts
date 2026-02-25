import * as vscode from 'vscode';
import { StatusLogger } from '../utils/statusLogger';

interface UserActivityInfo {
    lastActiveTime: number;
    instanceId: string;
    recentActivityCount: number;
    lastActivityType?: ActivityType;
}

type ActivityType = 'windowFocus' | 'editorChange' | 'textEdit' | 'textSelection' | 'terminalChange';

const ACTIVITY_THROTTLE_CONFIG: Record<ActivityType, number> = {
    windowFocus: 5000,
    editorChange: 3000,
    textEdit: 5000,
    textSelection: 2000,
    terminalChange: 3000
};

export class UserActivityService {
    private static readonly USER_ACTIVITY_KEY = 'chp.user.activity';
    private static readonly ACTIVITY_TIMEOUT = 30 * 60 * 1000;
    private static readonly ACTIVITY_COUNT_WINDOW = 5 * 60 * 1000;
    private static readonly CACHE_VALIDITY = 5000;

    private static instanceId: string;
    private static context: vscode.ExtensionContext | undefined;
    private static activityDisposables: vscode.Disposable[] = [];
    private static lastRecordedActivityByType = new Map<ActivityType, number>();
    private static cachedActivityInfo: UserActivityInfo | null = null;
    private static lastCacheUpdate = 0;
    private static initialized = false;

    private constructor() {
        throw new Error('UserActivityService is a static class and cannot be instantiated');
    }

    public static initialize(context: vscode.ExtensionContext, instanceId: string): void {
        if (this.initialized) {
            return;
        }

        this.context = context;
        this.instanceId = instanceId;

        this.registerActivityListeners();

        this.initialized = true;
        StatusLogger.debug('[UserActivityService] User activity detection service initialized');
    }

    public static stop(): void {
        this.activityDisposables.forEach(d => d.dispose());
        this.activityDisposables = [];

        this.cachedActivityInfo = null;
        this.lastCacheUpdate = 0;
        this.lastRecordedActivityByType.clear();

        this.initialized = false;
        StatusLogger.debug('[UserActivityService] User activity detection service stopped');
    }

    private static registerActivityListeners(): void {
        if (!this.context) {
            return;
        }

        this.activityDisposables.push(
            vscode.window.onDidChangeWindowState(state => {
                if (state.focused) {
                    this.recordUserActivity('windowFocus');
                }
            })
        );

        this.activityDisposables.push(
            vscode.window.onDidChangeActiveTextEditor(editor => {
                if (vscode.window.state.focused && editor) {
                    const scheme = editor.document.uri.scheme;
                    if (scheme === 'file' || scheme === 'untitled') {
                        this.recordUserActivity('editorChange');
                    }
                }
            })
        );

        this.activityDisposables.push(
            vscode.workspace.onDidChangeTextDocument(event => {
                if (event.contentChanges.length === 0) {
                    return;
                }
                if (!vscode.window.state.focused) {
                    return;
                }
                const scheme = event.document.uri.scheme;
                if (scheme !== 'file' && scheme !== 'untitled') {
                    return;
                }
                const totalChanges = event.contentChanges.reduce((sum, c) => sum + c.text.length + c.rangeLength, 0);
                if (totalChanges > 1000) {
                    return;
                }
                this.recordUserActivity('textEdit');
            })
        );

        this.activityDisposables.push(
            vscode.window.onDidChangeTextEditorSelection(event => {
                if (!vscode.window.state.focused) {
                    return;
                }
                const scheme = event.textEditor.document.uri.scheme;
                if (scheme !== 'file' && scheme !== 'untitled') {
                    return;
                }
                if (
                    event.kind === vscode.TextEditorSelectionChangeKind.Keyboard ||
                    event.kind === vscode.TextEditorSelectionChangeKind.Mouse
                ) {
                    this.recordUserActivity('textSelection');
                }
            })
        );

        this.activityDisposables.push(
            vscode.window.onDidChangeActiveTerminal(terminal => {
                if (vscode.window.state.focused && terminal) {
                    this.recordUserActivity('terminalChange');
                }
            })
        );

        if (vscode.window.state.focused) {
            this.recordUserActivity('windowFocus');
        }

        StatusLogger.debug('[UserActivityService] User activity listeners registered');
    }

    private static shouldThrottle(activityType: ActivityType): boolean {
        const now = Date.now();
        const lastRecorded = this.lastRecordedActivityByType.get(activityType) || 0;
        const throttleInterval = ACTIVITY_THROTTLE_CONFIG[activityType];
        return now - lastRecorded < throttleInterval;
    }

    private static async recordUserActivity(activityType: ActivityType): Promise<void> {
        if (!this.context) {
            return;
        }

        if (this.shouldThrottle(activityType)) {
            return;
        }

        const now = Date.now();
        this.lastRecordedActivityByType.set(activityType, now);

        const currentInfo = this.getCachedActivityInfo();
        let recentActivityCount = 1;

        if (
            currentInfo &&
            typeof currentInfo.recentActivityCount === 'number' &&
            !isNaN(currentInfo.recentActivityCount)
        ) {
            if (now - currentInfo.lastActiveTime < this.ACTIVITY_COUNT_WINDOW) {
                recentActivityCount = Math.min(currentInfo.recentActivityCount + 1, 100);
            }
        }

        const activityInfo: UserActivityInfo = {
            lastActiveTime: now,
            instanceId: this.instanceId,
            recentActivityCount: recentActivityCount,
            lastActivityType: activityType
        };

        this.cachedActivityInfo = activityInfo;
        this.lastCacheUpdate = now;

        await this.context.globalState.update(this.USER_ACTIVITY_KEY, activityInfo);
        StatusLogger.trace(
            `[UserActivityService] Record user activity status: type=${activityType}, count=${recentActivityCount}, time=${now}`
        );
    }

    private static getCachedActivityInfo(): UserActivityInfo | null {
        const now = Date.now();

        if (this.cachedActivityInfo && now - this.lastCacheUpdate < this.CACHE_VALIDITY) {
            return this.cachedActivityInfo;
        }

        if (!this.context) {
            return null;
        }

        const activityInfo = this.context.globalState.get<UserActivityInfo>(this.USER_ACTIVITY_KEY);
        if (activityInfo) {
            const isValidCount =
                typeof activityInfo.recentActivityCount === 'number' &&
                activityInfo.recentActivityCount >= 0 &&
                !isNaN(activityInfo.recentActivityCount);

            const validatedInfo: UserActivityInfo = {
                lastActiveTime: activityInfo.lastActiveTime ?? Date.now(),
                instanceId: activityInfo.instanceId ?? '',
                recentActivityCount: isValidCount ? activityInfo.recentActivityCount : 0,
                lastActivityType: activityInfo.lastActivityType
            };
            this.cachedActivityInfo = validatedInfo;
            this.lastCacheUpdate = now;
            return validatedInfo;
        }
        return null;
    }

    public static isUserActive(): boolean {
        const activityInfo = this.getCachedActivityInfo();
        if (!activityInfo) {
            return false;
        }

        const now = Date.now();
        const inactiveTime = now - activityInfo.lastActiveTime;
        const isActive = inactiveTime <= this.ACTIVITY_TIMEOUT;

        StatusLogger.trace(
            `[UserActivityService] Check user activity status: lastActive=${activityInfo.lastActiveTime}, ` +
                `inactiveTime=${inactiveTime}ms, activityCount=${activityInfo.recentActivityCount}, isActive=${isActive}`
        );

        return isActive;
    }

    public static getLastActiveTime(): number | undefined {
        const activityInfo = this.getCachedActivityInfo();
        return activityInfo?.lastActiveTime;
    }

    public static getInactiveTime(): number {
        const lastActiveTime = this.getLastActiveTime();
        if (lastActiveTime === undefined) {
            return Infinity;
        }
        return Date.now() - lastActiveTime;
    }
}
