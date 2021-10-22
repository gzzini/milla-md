/// <reference types="node" />
import type { Logger } from 'pino';
import { Readable, Transform } from 'stream';
import { URL } from 'url';
import { Options } from 'got';
import { WAMessageContent, WAMediaUpload, MediaType } from '../Types';
export declare const hkdfInfoKey: (type: MediaType) => string;
/** generates all the keys required to encrypt/decrypt & sign a media message */
export declare function getMediaKeys(buffer: any, mediaType: MediaType): {
    iv: Buffer;
    cipherKey: Buffer;
    macKey: Buffer;
};
export declare const compressImage: (bufferOrFilePath: Buffer | string) => Promise<Buffer>;
export declare const generateProfilePicture: (bufferOrFilePath: Buffer | string) => Promise<{
    img: Buffer;
}>;
/** gets the SHA256 of the given media message */
export declare const mediaMessageSHA256B64: (message: WAMessageContent) => string;
export declare function getAudioDuration(buffer: Buffer | string): Promise<number>;
export declare const toReadable: (buffer: Buffer) => Readable;
export declare const getStream: (item: WAMediaUpload) => Promise<{
    stream: Readable;
    type: string;
}>;
/** generates a thumbnail for a given media, if required */
export declare function generateThumbnail(file: string, mediaType: 'video' | 'image', options: {
    logger?: Logger;
}): Promise<string>;
export declare const getGotStream: (url: string | URL, options?: Options & {
    isStream?: true;
}) => Promise<import("got/dist/source/core").default>;
export declare const encryptedStream: (media: WAMediaUpload, mediaType: MediaType, saveOriginalFileIfRequired?: boolean) => Promise<{
    mediaKey: Buffer;
    encBodyPath: string;
    bodyPath: string;
    mac: Buffer;
    fileEncSha256: Buffer;
    fileSha256: Buffer;
    fileLength: number;
    didSaveToTmpPath: boolean;
}>;
export declare const downloadContentFromMessage: ({ mediaKey, directPath, url }: {
    mediaKey?: Uint8Array;
    directPath?: string;
    url?: string;
}, type: MediaType) => Promise<Transform>;
/**
 * Decode a media message (video, image, document, audio) & return decrypted buffer
 * @param message the media message you want to decode
 */
export declare function decryptMediaMessageBuffer(message: WAMessageContent): Promise<Readable>;
export declare function extensionForMediaMessage(message: WAMessageContent): string;
