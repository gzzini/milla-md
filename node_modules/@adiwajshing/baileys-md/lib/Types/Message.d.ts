/// <reference types="node" />
import type { ReadStream } from "fs";
import type { Logger } from "pino";
import type { URL } from "url";
import type { GroupMetadata } from "./GroupMetadata";
import { proto } from '../../WAProto';
export { proto as WAProto };
export declare type WAMessage = proto.IWebMessageInfo;
export declare type WAMessageContent = proto.IMessage;
export declare type WAContactMessage = proto.IContactMessage;
export declare type WAContactsArrayMessage = proto.IContactsArrayMessage;
export declare type WAMessageKey = proto.IMessageKey;
export declare type WATextMessage = proto.IExtendedTextMessage;
export declare type WAContextInfo = proto.IContextInfo;
export declare type WALocationMessage = proto.ILocationMessage;
export declare type WAGenericMediaMessage = proto.IVideoMessage | proto.IImageMessage | proto.IAudioMessage | proto.IDocumentMessage | proto.IStickerMessage;
export import WAMessageStubType = proto.WebMessageInfo.WebMessageInfoStubType;
export import WAMessageStatus = proto.WebMessageInfo.WebMessageInfoStatus;
export declare type WAMediaUpload = Buffer | {
    url: URL | string;
};
/** Set of message types that are supported by the library */
export declare type MessageType = keyof proto.Message;
export declare type MediaConnInfo = {
    auth: string;
    ttl: number;
    hosts: {
        hostname: string;
    }[];
    fetchDate: Date;
};
export interface WAUrlInfo {
    'canonical-url': string;
    'matched-text': string;
    title: string;
    description: string;
    jpegThumbnail?: Buffer;
}
declare type Mentionable = {
    /** list of jids that are mentioned in the accompanying text */
    mentions?: string[];
};
declare type ViewOnce = {
    viewOnce?: boolean;
};
declare type Buttonable = {
    /** add buttons to the message  */
    buttons?: proto.IButton[];
};
declare type WithDimensions = {
    width?: number;
    height?: number;
};
export declare type MediaType = 'image' | 'video' | 'sticker' | 'audio' | 'document' | 'history';
export declare type AnyMediaMessageContent = (({
    image: WAMediaUpload;
    caption?: string;
    jpegThumbnail?: string;
} & Mentionable & Buttonable & WithDimensions) | ({
    video: WAMediaUpload;
    caption?: string;
    gifPlayback?: boolean;
    jpegThumbnail?: string;
} & Mentionable & Buttonable & WithDimensions) | {
    audio: WAMediaUpload;
    /** if set to true, will send as a `voice note` */
    pttAudio?: boolean;
    /** optionally tell the duration of the audio */
    seconds?: number;
} | ({
    sticker: WAMediaUpload;
} & WithDimensions) | ({
    document: WAMediaUpload;
    mimetype: string;
    fileName?: string;
} & Buttonable)) & {
    mimetype?: string;
};
export declare type AnyRegularMessageContent = (({
    text: string;
} & Mentionable & Buttonable) | AnyMediaMessageContent | {
    contacts: {
        displayName?: string;
        contacts: proto.IContactMessage[];
    };
} | {
    location: WALocationMessage;
}) & ViewOnce;
export declare type AnyMessageContent = AnyRegularMessageContent | {
    forward: WAMessage;
    force?: boolean;
} | {
    delete: WAMessageKey;
} | {
    disappearingMessagesInChat: boolean | number;
};
export declare type MessageRelayOptions = {
    messageId?: string;
    additionalAttributes?: {
        [_: string]: string;
    };
    cachedGroupMetadata?: (jid: string) => Promise<GroupMetadata | undefined>;
};
export declare type MiscMessageGenerationOptions = {
    /** Force message id */
    messageId?: string;
    /** optional, if you want to manually set the timestamp of the message */
    timestamp?: Date;
    /** the message you want to quote */
    quoted?: WAMessage;
    /** disappearing messages settings */
    ephemeralExpiration?: number | string;
};
export declare type MessageGenerationOptionsFromContent = MiscMessageGenerationOptions & {
    userJid: string;
};
export declare type WAMediaUploadFunction = (readStream: ReadStream, opts: {
    fileEncSha256B64: string;
    mediaType: MediaType;
}) => Promise<{
    mediaUrl: string;
}>;
export declare type MediaGenerationOptions = {
    logger?: Logger;
    upload: WAMediaUploadFunction;
    /** cache media so it does not have to be uploaded again */
    mediaCache?: (url: string) => Promise<WAGenericMediaMessage> | WAGenericMediaMessage;
};
export declare type MessageContentGenerationOptions = MediaGenerationOptions & {
    getUrlInfo?: (text: string) => Promise<WAUrlInfo>;
};
export declare type MessageGenerationOptions = MessageContentGenerationOptions & MessageGenerationOptionsFromContent;
export declare type MessageUpdateType = 'append' | 'notify' | 'prepend';
export declare type MessageInfoEventMap = {
    [jid: string]: Date;
};
export interface MessageInfo {
    reads: MessageInfoEventMap;
    deliveries: MessageInfoEventMap;
}
export declare type WAMessageUpdate = {
    update: Partial<WAMessage>;
    key: proto.IMessageKey;
};
export declare type WAMessageCursor = {
    before: WAMessageKey | undefined;
} | {
    after: WAMessageKey | undefined;
};
export declare type MessageInfoUpdate = {
    key: proto.IMessageKey;
    update: Partial<MessageInfo>;
};
