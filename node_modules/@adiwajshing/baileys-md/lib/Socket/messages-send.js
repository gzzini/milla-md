"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeMessagesSocket = void 0;
const got_1 = __importDefault(require("got"));
const boom_1 = require("@hapi/boom");
const Utils_1 = require("../Utils");
const WABinary_1 = require("../WABinary");
const WAProto_1 = require("../../WAProto");
const Defaults_1 = require("../Defaults");
const groups_1 = require("./groups");
const makeMessagesSocket = (config) => {
    const { logger } = config;
    const sock = groups_1.makeGroupsSocket(config);
    const { ev, authState, query, generateMessageTag, sendNode, groupMetadata, groupToggleEphemeral } = sock;
    let mediaConn;
    const refreshMediaConn = async (forceGet = false) => {
        let media = await mediaConn;
        if (!media || forceGet || (new Date().getTime() - media.fetchDate.getTime()) > media.ttl * 1000) {
            mediaConn = (async () => {
                const result = await query({
                    tag: 'iq',
                    attrs: {
                        type: 'set',
                        xmlns: 'w:m',
                        to: WABinary_1.S_WHATSAPP_NET,
                    },
                    content: [{ tag: 'media_conn', attrs: {} }]
                });
                const mediaConnNode = WABinary_1.getBinaryNodeChild(result, 'media_conn');
                const node = {
                    hosts: WABinary_1.getBinaryNodeChildren(mediaConnNode, 'host').map(item => item.attrs),
                    auth: mediaConnNode.attrs.auth,
                    ttl: +mediaConnNode.attrs.ttl,
                    fetchDate: new Date()
                };
                logger.debug('fetched media conn');
                return node;
            })();
        }
        return mediaConn;
    };
    const sendReadReceipt = async (jid, participant, messageIds) => {
        const node = {
            tag: 'receipt',
            attrs: {
                id: messageIds[0],
                t: Date.now().toString(),
                to: jid,
                type: 'read'
            },
        };
        if (participant) {
            node.attrs.participant = participant;
        }
        const remainingMessageIds = messageIds.slice(1);
        if (remainingMessageIds.length) {
            node.content = [
                {
                    tag: 'list',
                    attrs: {},
                    content: remainingMessageIds.map(id => ({
                        tag: 'item',
                        attrs: { id }
                    }))
                }
            ];
        }
        logger.debug({ jid, messageIds }, 'reading messages');
        await sendNode(node);
    };
    const getUSyncDevices = async (jids, ignoreZeroDevices) => {
        jids = Array.from(new Set(jids));
        const users = jids.map(jid => ({
            tag: 'user',
            attrs: { jid: WABinary_1.jidNormalizedUser(jid) }
        }));
        const iq = {
            tag: 'iq',
            attrs: {
                to: WABinary_1.S_WHATSAPP_NET,
                type: 'get',
                xmlns: 'usync',
            },
            content: [
                {
                    tag: 'usync',
                    attrs: {
                        sid: generateMessageTag(),
                        mode: 'query',
                        last: 'true',
                        index: '0',
                        context: 'message',
                    },
                    content: [
                        {
                            tag: 'query',
                            attrs: {},
                            content: [
                                {
                                    tag: 'devices',
                                    attrs: { version: '2' }
                                }
                            ]
                        },
                        { tag: 'list', attrs: {}, content: users }
                    ]
                },
            ],
        };
        const result = await query(iq);
        const { device } = WABinary_1.jidDecode(authState.creds.me.id);
        return Utils_1.extractDeviceJids(result, device, ignoreZeroDevices);
    };
    const assertSession = async (jid, force) => {
        const addr = Utils_1.jidToSignalProtocolAddress(jid).toString();
        const session = await authState.keys.getSession(addr);
        if (!session || force) {
            logger.debug({ jid }, `fetching session`);
            const identity = {
                tag: 'user',
                attrs: { jid, reason: 'identity' },
            };
            const result = await query({
                tag: 'iq',
                attrs: {
                    xmlns: 'encrypt',
                    type: 'get',
                    to: WABinary_1.S_WHATSAPP_NET,
                },
                content: [
                    {
                        tag: 'key',
                        attrs: {},
                        content: [identity]
                    }
                ]
            });
            await Utils_1.parseAndInjectE2ESession(result, authState);
            return true;
        }
        return false;
    };
    const createParticipantNode = async (jid, bytes) => {
        await assertSession(jid, false);
        const { type, ciphertext } = await Utils_1.encryptSignalProto(jid, bytes, authState);
        const node = {
            tag: 'to',
            attrs: { jid },
            content: [{
                    tag: 'enc',
                    attrs: { v: '2', type },
                    content: ciphertext
                }]
        };
        return node;
    };
    const relayMessage = async (jid, message, { messageId: msgId, additionalAttributes, cachedGroupMetadata }) => {
        const { user, server } = WABinary_1.jidDecode(jid);
        const isGroup = server === 'g.us';
        msgId = msgId || Utils_1.generateMessageID();
        const encodedMsg = Utils_1.encodeWAMessage(message);
        const participants = [];
        let stanza;
        const destinationJid = WABinary_1.jidEncode(user, isGroup ? 'g.us' : 's.whatsapp.net');
        if (isGroup) {
            const { ciphertext, senderKeyDistributionMessageKey } = await Utils_1.encryptSenderKeyMsgSignalProto(destinationJid, encodedMsg, authState);
            let groupData = cachedGroupMetadata ? await cachedGroupMetadata(jid) : undefined;
            if (!groupData)
                groupData = await groupMetadata(jid);
            const participantsList = groupData.participants.map(p => p.id);
            const devices = await getUSyncDevices(participantsList, false);
            logger.debug(`got ${devices.length} additional devices`);
            const encSenderKeyMsg = Utils_1.encodeWAMessage({
                senderKeyDistributionMessage: {
                    axolotlSenderKeyDistributionMessage: senderKeyDistributionMessageKey,
                    groupId: destinationJid
                }
            });
            for (const { user, device, agent } of devices) {
                const jid = WABinary_1.jidEncode(user, 's.whatsapp.net', device, agent);
                const participant = await createParticipantNode(jid, encSenderKeyMsg);
                participants.push(participant);
            }
            const binaryNodeContent = [];
            if ( // if there are some participants with whom the session has not been established
            // if there are, we overwrite the senderkey
            !!participants.find((p) => (!!p.content.find(({ attrs }) => attrs.type == 'pkmsg')))) {
                binaryNodeContent.push({
                    tag: 'participants',
                    attrs: {},
                    content: participants
                });
            }
            binaryNodeContent.push({
                tag: 'enc',
                attrs: { v: '2', type: 'skmsg' },
                content: ciphertext
            });
            stanza = {
                tag: 'message',
                attrs: {
                    id: msgId,
                    type: 'text',
                    to: destinationJid
                },
                content: binaryNodeContent
            };
        }
        else {
            const { user: meUser } = WABinary_1.jidDecode(authState.creds.me.id);
            const messageToMyself = {
                deviceSentMessage: {
                    destinationJid,
                    message
                }
            };
            const encodedMeMsg = Utils_1.encodeWAMessage(messageToMyself);
            participants.push(await createParticipantNode(WABinary_1.jidEncode(user, 's.whatsapp.net'), encodedMsg));
            participants.push(await createParticipantNode(WABinary_1.jidEncode(meUser, 's.whatsapp.net'), encodedMeMsg));
            const devices = await getUSyncDevices([authState.creds.me.id, jid], true);
            logger.debug(`got ${devices.length} additional devices`);
            for (const { user, device, agent } of devices) {
                const isMe = user === meUser;
                participants.push(await createParticipantNode(WABinary_1.jidEncode(user, 's.whatsapp.net', device, agent), isMe ? encodedMeMsg : encodedMsg));
            }
            stanza = {
                tag: 'message',
                attrs: {
                    id: msgId,
                    type: 'text',
                    to: destinationJid,
                    ...(additionalAttributes || {})
                },
                content: [
                    {
                        tag: 'participants',
                        attrs: {},
                        content: participants
                    },
                ]
            };
        }
        const shouldHaveIdentity = !!participants.find((p) => (!!p.content.find(({ attrs }) => attrs.type == 'pkmsg')));
        if (shouldHaveIdentity) {
            stanza.content.push({
                tag: 'device-identity',
                attrs: {},
                content: WAProto_1.proto.ADVSignedDeviceIdentity.encode(authState.creds.account).finish()
            });
        }
        logger.debug({ msgId }, 'sending message');
        await sendNode(stanza);
        ev.emit('auth-state.update', authState);
        return msgId;
    };
    const waUploadToServer = async (stream, { mediaType, fileEncSha256B64 }) => {
        // send a query JSON to obtain the url & auth token to upload our media
        let uploadInfo = await refreshMediaConn(false);
        let mediaUrl;
        for (let host of uploadInfo.hosts) {
            const auth = encodeURIComponent(uploadInfo.auth); // the auth token
            const url = `https://${host.hostname}${Defaults_1.MEDIA_PATH_MAP[mediaType]}/${fileEncSha256B64}?auth=${auth}&token=${fileEncSha256B64}`;
            try {
                const { body: responseText } = await got_1.default.post(url, {
                    headers: {
                        'Content-Type': 'application/octet-stream',
                        'Origin': Defaults_1.DEFAULT_ORIGIN
                    },
                    agent: {
                        https: config.agent
                    },
                    body: stream
                });
                const result = JSON.parse(responseText);
                mediaUrl = result === null || result === void 0 ? void 0 : result.url;
                if (mediaUrl)
                    break;
                else {
                    uploadInfo = await refreshMediaConn(true);
                    throw new Error(`upload failed, reason: ${JSON.stringify(result)}`);
                }
            }
            catch (error) {
                const isLast = host.hostname === uploadInfo.hosts[uploadInfo.hosts.length - 1].hostname;
                logger.debug(`Error in uploading to ${host.hostname} (${error}) ${isLast ? '' : ', retrying...'}`);
            }
        }
        if (!mediaUrl) {
            throw new boom_1.Boom('Media upload failed on all hosts', { statusCode: 500 });
        }
        return { mediaUrl };
    };
    return {
        ...sock,
        assertSession,
        relayMessage,
        sendReadReceipt,
        refreshMediaConn,
        sendMessage: async (jid, content, options = {}) => {
            const userJid = authState.creds.me.id;
            if (typeof content === 'object' &&
                'disappearingMessagesInChat' in content &&
                typeof content['disappearingMessagesInChat'] !== 'undefined' &&
                WABinary_1.isJidGroup(jid)) {
                const { disappearingMessagesInChat } = content;
                const value = typeof disappearingMessagesInChat === 'boolean' ?
                    (disappearingMessagesInChat ? Defaults_1.WA_DEFAULT_EPHEMERAL : 0) :
                    disappearingMessagesInChat;
                await groupToggleEphemeral(jid, value);
            }
            else {
                const fullMsg = await Utils_1.generateWAMessage(jid, content, {
                    ...options,
                    logger,
                    userJid: userJid,
                    // multi-device does not have this yet
                    //getUrlInfo: generateUrlInfo,
                    upload: waUploadToServer
                });
                const isDeleteMsg = 'delete' in content && !!content.delete;
                const additionalAttributes = {};
                // required for delete
                if (isDeleteMsg) {
                    additionalAttributes.edit = '7';
                }
                await relayMessage(jid, fullMsg.message, { messageId: fullMsg.key.id, additionalAttributes });
                if (config.emitOwnEvents) {
                    process.nextTick(() => {
                        ev.emit('messages.upsert', { messages: [fullMsg], type: 'append' });
                    });
                }
                return fullMsg;
            }
        }
    };
};
exports.makeMessagesSocket = makeMessagesSocket;
