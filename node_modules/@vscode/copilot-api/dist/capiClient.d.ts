import type { CopilotToken, FetchOptions, IDomainChangeResponse, IExtensionInformation, IFetcherService, RequestMetadata } from "./types";
export declare class CAPIClient {
    private readonly _extensionInfo;
    private readonly _integrationId?;
    private readonly _domainService;
    private readonly _fetcherService;
    private readonly _hmacSecret;
    private _copilotSku;
    private _licenseCheckSucceeded;
    constructor(_extensionInfo: IExtensionInformation, _license: string | undefined, fetcherService?: IFetcherService, hmacSecret?: string, _integrationId?: string);
    updateDomains(copilotToken: CopilotToken | undefined, enterpriseUrlConfig: string | undefined): IDomainChangeResponse;
    makeRequest<T>(request: FetchOptions, requestMetadata: RequestMetadata): Promise<T>;
    private _prepareContentExclusionUrl;
    private _mixinHeaders;
    get copilotTelemetryURL(): string;
    get dotcomAPIURL(): string;
    get capiPingURL(): string;
    get proxyBaseURL(): string;
    get originTrackerURL(): string;
    get snippyMatchPath(): string;
    get snippyFilesForMatchPath(): string;
}
