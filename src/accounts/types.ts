/*---------------------------------------------------------------------------------------------
 *  Multi-Account Types
 *  Type definitions for the multi-account management system
 *--------------------------------------------------------------------------------------------*/

/**
 * Trạng thái của tài khoản
 */
export type AccountStatus = 'active' | 'inactive' | 'expired' | 'error';

/**
 * Loại xác thực
 */
export type AuthType = 'apiKey' | 'oauth' | 'token';

/**
 * Thông tin tài khoản cơ bản
 */
export interface Account {
    /** ID duy nhất của tài khoản */
    id: string;
    /** Tên hiển thị của tài khoản */
    displayName: string;
    /** Provider liên kết (zhipu, moonshot, minimax, compatible, antigravity, codex, etc.) */
    provider: string;
    /** Loại xác thực */
    authType: AuthType;
    /** Email (nếu có, cho OAuth) */
    email?: string;
    /** Trạng thái tài khoản */
    status: AccountStatus;
    /** Thời gian tạo */
    createdAt: string;
    /** Thời gian cập nhật cuối */
    updatedAt: string;
    /** Thời gian hết hạn (cho OAuth token) */
    expiresAt?: string;
    /** Metadata bổ sung */
    metadata?: Record<string, unknown>;
    /** Đánh dấu là tài khoản mặc định cho provider */
    isDefault?: boolean;
}

/**
 * Thông tin xác thực OAuth
 */
export interface OAuthCredentials {
    accessToken: string;
    refreshToken: string;
    expiresAt: string;
    tokenType?: string;
    scope?: string[];
}

/**
 * Thông tin xác thực API Key
 */
export interface ApiKeyCredentials {
    apiKey: string;
    /** Endpoint tùy chỉnh (nếu có) */
    endpoint?: string;
    /** Headers tùy chỉnh */
    customHeaders?: Record<string, string>;
}

/**
 * Union type cho credentials
 */
export type AccountCredentials = OAuthCredentials | ApiKeyCredentials;

/**
 * Tài khoản đầy đủ với credentials
 */
export interface AccountWithCredentials extends Account {
    credentials: AccountCredentials;
}

/**
 * Kết quả đăng nhập
 */
export interface LoginResult {
    success: boolean;
    account?: Account;
    error?: string;
}

/**
 * Sự kiện thay đổi tài khoản
 */
export interface AccountChangeEvent {
    type: 'added' | 'removed' | 'updated' | 'switched';
    account: Account;
    provider: string;
}

/**
 * Cấu hình provider cho multi-account
 */
export interface ProviderAccountConfig {
    /** Provider có hỗ trợ multi-account không */
    supportsMultiAccount: boolean;
    /** Provider có hỗ trợ OAuth không */
    supportsOAuth: boolean;
    /** Provider có hỗ trợ API Key không */
    supportsApiKey: boolean;
    /** Số lượng tài khoản tối đa */
    maxAccounts?: number;
}

/**
 * Cấu hình định tuyến tài khoản theo model cho provider
 */
export interface ProviderRoutingConfig {
    /** Mapping modelId -> accountId */
    modelAssignments: Record<string, string>;
    /** Bật/tắt load balance cho provider */
    loadBalanceEnabled?: boolean;
}

/**
 * Cấu hình định tuyến theo provider
 */
export type AccountRoutingConfig = Record<string, ProviderRoutingConfig>;

/**
 * Danh sách tài khoản theo provider
 */
export type AccountsByProvider = Record<string, Account[]>;

/**
 * Tài khoản đang active theo provider
 */
export type ActiveAccounts = Record<string, string>;

/**
 * Storage schema cho accounts
 */
export interface AccountStorageData {
    version: number;
    accounts: Account[];
    activeAccounts: ActiveAccounts;
    routingConfig?: AccountRoutingConfig;
}

/**
 * Quick pick item cho account
 */
export interface AccountQuickPickItem {
    label: string;
    description?: string;
    detail?: string;
    account: Account;
}
