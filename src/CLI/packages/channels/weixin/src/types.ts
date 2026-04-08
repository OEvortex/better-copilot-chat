export enum TypingStatus {
    TYPING = 'typing',
    CANCEL = 'cancel',
}

export interface CdnRef {
    encryptQueryParam: string;
    aesKey: string;
}

export interface FileCdnRef extends CdnRef {
    fileName: string;
}
