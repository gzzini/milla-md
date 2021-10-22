"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractMessageContent = exports.generateWAMessage = exports.generateWAMessageFromContent = exports.generateWAMessageContent = exports.generateForwardMessageContent = exports.prepareDisappearingMessageSettingContent = exports.prepareWAMessageMedia = void 0;
const boom_1 = require("@hapi/boom");
const fs_1 = require("fs");
const WAProto_1 = require("../../WAProto");
const Defaults_1 = require("../Defaults");
const Types_1 = require("../Types");
const generics_1 = require("./generics");
const messages_media_1 = require("./messages-media");
const MIMETYPE_MAP = {
    image: 'image/jpeg',
    video: 'video/mp4',
    document: 'application/pdf',
    audio: 'audio/ogg; codecs=opus',
    sticker: 'image/webp',
    history: 'application/x-protobuf'
};
const MessageTypeProto = {
    'image': Types_1.WAProto.ImageMessage,
    'video': Types_1.WAProto.VideoMessage,
    'audio': Types_1.WAProto.AudioMessage,
    'sticker': Types_1.WAProto.StickerMessage,
    'document': Types_1.WAProto.DocumentMessage,
};
const ButtonType = WAProto_1.proto.ButtonsMessage.ButtonsMessageHeaderType;
const prepareWAMessageMedia = async (message, options) => {
    var _a, _b;
    let mediaType;
    for (const key of Defaults_1.MEDIA_KEYS) {
        if (key in message) {
            mediaType = key;
        }
    }
    const uploadData = {
        ...message,
        [mediaType]: undefined,
        media: message[mediaType]
    };
    // check for cache hit
    if (typeof uploadData.media === 'object' && 'url' in uploadData.media) {
        const result = !!options.mediaCache && await options.mediaCache((_a = uploadData.media.url) === null || _a === void 0 ? void 0 : _a.toString());
        if (result) {
            return Types_1.WAProto.Message.fromObject({
                [`${mediaType}Message`]: result
            });
        }
    }
    if (mediaType === 'document' && !uploadData.fileName) {
        uploadData.fileName = 'file';
    }
    if (!uploadData.mimetype) {
        uploadData.mimetype = MIMETYPE_MAP[mediaType];
    }
    const requiresDurationComputation = mediaType === 'audio' && typeof uploadData.seconds === 'undefined';
    const requiresThumbnailComputation = (mediaType === 'image' || mediaType === 'video') &&
        (typeof uploadData['jpegThumbnail'] === 'undefined');
    const requiresOriginalForSomeProcessing = requiresDurationComputation || requiresThumbnailComputation;
    const { mediaKey, encBodyPath, bodyPath, fileEncSha256, fileSha256, fileLength, didSaveToTmpPath } = await messages_media_1.encryptedStream(uploadData.media, mediaType, requiresOriginalForSomeProcessing);
    // url safe Base64 encode the SHA256 hash of the body
    const fileEncSha256B64 = encodeURIComponent(fileEncSha256.toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/\=+$/, ''));
    try {
        if (requiresThumbnailComputation) {
            uploadData.jpegThumbnail = await messages_media_1.generateThumbnail(bodyPath, mediaType, options);
        }
        if (requiresDurationComputation) {
            uploadData.seconds = await messages_media_1.getAudioDuration(bodyPath);
        }
    }
    catch (error) {
        (_b = options.logger) === null || _b === void 0 ? void 0 : _b.info({ trace: error.stack }, 'failed to obtain extra info');
    }
    const { mediaUrl } = await options.upload(fs_1.createReadStream(encBodyPath), { fileEncSha256B64, mediaType });
    // remove tmp files
    await Promise.all([
        fs_1.promises.unlink(encBodyPath),
        didSaveToTmpPath && bodyPath && fs_1.promises.unlink(bodyPath)
    ]
        .filter(Boolean));
    delete uploadData.media;
    const content = {
        [`${mediaType}Message`]: MessageTypeProto[mediaType].fromObject({
            url: mediaUrl,
            mediaKey,
            fileEncSha256,
            fileSha256,
            fileLength,
            ...uploadData
        })
    };
    return Types_1.WAProto.Message.fromObject(content);
};
exports.prepareWAMessageMedia = prepareWAMessageMedia;
const prepareDisappearingMessageSettingContent = (ephemeralExpiration) => {
    ephemeralExpiration = ephemeralExpiration || 0;
    const content = {
        ephemeralMessage: {
            message: {
                protocolMessage: {
                    type: Types_1.WAProto.ProtocolMessage.ProtocolMessageType.EPHEMERAL_SETTING,
                    ephemeralExpiration
                }
            }
        }
    };
    return Types_1.WAProto.Message.fromObject(content);
};
exports.prepareDisappearingMessageSettingContent = prepareDisappearingMessageSettingContent;
/**
 * Generate forwarded message content like WA does
 * @param message the message to forward
 * @param options.forceForward will show the message as forwarded even if it is from you
 */
const generateForwardMessageContent = (message, forceForward) => {
    var _a;
    let content = message.message;
    if (!content)
        throw new boom_1.Boom('no content in message', { statusCode: 400 });
    content = JSON.parse(JSON.stringify(content)); // hacky copy
    let key = Object.keys(content)[0];
    let score = ((_a = content[key].contextInfo) === null || _a === void 0 ? void 0 : _a.forwardingScore) || 0;
    score += message.key.fromMe && !forceForward ? 0 : 1;
    if (key === 'conversation') {
        content.extendedTextMessage = { text: content[key] };
        delete content.conversation;
        key = 'extendedTextMessage';
    }
    if (score > 0)
        content[key].contextInfo = { forwardingScore: score, isForwarded: true };
    else
        content[key].contextInfo = {};
    return content;
};
exports.generateForwardMessageContent = generateForwardMessageContent;
const generateWAMessageContent = async (message, options) => {
    var _a, _b;
    let m = {};
    if ('text' in message) {
        const extContent = { ...message };
        if (!!options.getUrlInfo && message.text.match(Defaults_1.URL_REGEX)) {
            try {
                const data = await options.getUrlInfo(message.text);
                extContent.canonicalUrl = data['canonical-url'];
                extContent.matchedText = data['matched-text'];
                extContent.jpegThumbnail = data.jpegThumbnail;
                extContent.description = data.description;
                extContent.title = data.title;
                extContent.previewType = 0;
            }
            catch (error) { // ignore if fails
                (_a = options.logger) === null || _a === void 0 ? void 0 : _a.warn({ trace: error.stack }, 'url generation failed');
            }
        }
        m.extendedTextMessage = extContent;
    }
    else if ('contacts' in message) {
        const contactLen = message.contacts.contacts.length;
        if (!contactLen) {
            throw new boom_1.Boom('require atleast 1 contact', { statusCode: 400 });
        }
        if (contactLen === 1) {
            m.contactMessage = Types_1.WAProto.ContactMessage.fromObject(message.contacts.contacts[0]);
        }
    }
    else if ('location' in message) {
        m.locationMessage = Types_1.WAProto.LocationMessage.fromObject(message.location);
    }
    else if ('delete' in message) {
        m.protocolMessage = {
            key: message.delete,
            type: Types_1.WAProto.ProtocolMessage.ProtocolMessageType.REVOKE
        };
    }
    else if ('forward' in message) {
        m = exports.generateForwardMessageContent(message.forward, message.force);
    }
    else if ('disappearingMessagesInChat' in message) {
        const exp = typeof message.disappearingMessagesInChat === 'boolean' ?
            (message.disappearingMessagesInChat ? Defaults_1.WA_DEFAULT_EPHEMERAL : 0) :
            message.disappearingMessagesInChat;
        m = exports.prepareDisappearingMessageSettingContent(exp);
    }
    else {
        m = await exports.prepareWAMessageMedia(message, options);
    }
    if ('buttons' in message && !!message.buttons) {
        const buttonsMessage = {
            buttons: message.buttons.map(b => ({ ...b, type: WAProto_1.proto.Button.ButtonType.RESPONSE }))
        };
        if ('text' in message) {
            buttonsMessage.contentText = message.text;
            buttonsMessage.headerType = ButtonType.EMPTY;
        }
        else {
            if ('caption' in message) {
                buttonsMessage.contentText = message.caption;
            }
            const type = Object.keys(m)[0].replace('Message', '').toUpperCase();
            buttonsMessage.headerType = ButtonType[type];
            Object.assign(buttonsMessage, m);
        }
        m = { buttonsMessage };
    }
    if ('viewOnce' in message && !!message.viewOnce) {
        m = { viewOnceMessage: { message: m } };
    }
    if ('mentions' in message && ((_b = message.mentions) === null || _b === void 0 ? void 0 : _b.length)) {
        const [messageType] = Object.keys(m);
        m[messageType].contextInfo = m[messageType] || {};
        m[messageType].contextInfo.mentionedJid = message.mentions;
    }
    return Types_1.WAProto.Message.fromObject(m);
};
exports.generateWAMessageContent = generateWAMessageContent;
const generateWAMessageFromContent = (jid, message, options) => {
    if (!options.timestamp)
        options.timestamp = new Date(); // set timestamp to now
    const key = Object.keys(message)[0];
    const timestamp = generics_1.unixTimestampSeconds(options.timestamp);
    const { quoted, userJid } = options;
    if (quoted) {
        const participant = quoted.key.fromMe ? userJid : (quoted.participant || quoted.key.participant || quoted.key.remoteJid);
        message[key].contextInfo = message[key].contextInfo || {};
        message[key].contextInfo.participant = participant;
        message[key].contextInfo.stanzaId = quoted.key.id;
        message[key].contextInfo.quotedMessage = quoted.message;
        // if a participant is quoted, then it must be a group
        // hence, remoteJid of group must also be entered
        if (quoted.key.participant) {
            message[key].contextInfo.remoteJid = quoted.key.remoteJid;
        }
    }
    if (
    // if we want to send a disappearing message
    !!(options === null || options === void 0 ? void 0 : options.ephemeralExpiration) &&
        // and it's not a protocol message -- delete, toggle disappear message
        key !== 'protocolMessage' &&
        // already not converted to disappearing message
        key !== 'ephemeralMessage') {
        message[key].contextInfo = {
            ...(message[key].contextInfo || {}),
            expiration: options.ephemeralExpiration || Defaults_1.WA_DEFAULT_EPHEMERAL,
            //ephemeralSettingTimestamp: options.ephemeralOptions.eph_setting_ts?.toString()
        };
        message = {
            ephemeralMessage: {
                message
            }
        };
    }
    message = Types_1.WAProto.Message.fromObject(message);
    const messageJSON = {
        key: {
            remoteJid: jid,
            fromMe: true,
            id: (options === null || options === void 0 ? void 0 : options.messageId) || generics_1.generateMessageID(),
        },
        message: message,
        messageTimestamp: timestamp,
        messageStubParameters: [],
        participant: jid.includes('@g.us') ? userJid : undefined,
        status: Types_1.WAMessageStatus.PENDING
    };
    return Types_1.WAProto.WebMessageInfo.fromObject(messageJSON);
};
exports.generateWAMessageFromContent = generateWAMessageFromContent;
const generateWAMessage = async (jid, content, options) => (exports.generateWAMessageFromContent(jid, await exports.generateWAMessageContent(content, options), options));
exports.generateWAMessage = generateWAMessage;
/**
 * Extract the true message content from a message
 * Eg. extracts the inner message from a disappearing message/view once message
 */
const extractMessageContent = (content) => {
    var _a, _b;
    if (content === null || content === void 0 ? void 0 : content.buttonsMessage) {
        const { buttonsMessage } = content;
        if (buttonsMessage.imageMessage) {
            return { imageMessage: buttonsMessage.imageMessage };
        }
        else if (buttonsMessage.documentMessage) {
            return { documentMessage: buttonsMessage.documentMessage };
        }
        else if (buttonsMessage.videoMessage) {
            return { videoMessage: buttonsMessage.videoMessage };
        }
        else if (buttonsMessage.locationMessage) {
            return { locationMessage: buttonsMessage.locationMessage };
        }
        else {
            return { conversation: buttonsMessage.contentText };
        }
    }
    else {
        return ((_a = content === null || content === void 0 ? void 0 : content.ephemeralMessage) === null || _a === void 0 ? void 0 : _a.message) ||
            ((_b = content === null || content === void 0 ? void 0 : content.viewOnceMessage) === null || _b === void 0 ? void 0 : _b.message) ||
            content ||
            undefined;
    }
};
exports.extractMessageContent = extractMessageContent;
