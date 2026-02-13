import { RequestType } from "./types";
export declare function createRequestHMAC(hmacSecret: string | undefined): Promise<string | undefined>;
export declare function isCAPIRequest(requestType: RequestType): boolean;
