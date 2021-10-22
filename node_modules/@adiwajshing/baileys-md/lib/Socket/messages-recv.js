"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeMessagesRecvSocket = void 0;
const Types_1 = require("../Types");
const Utils_1 = require("../Utils");
const WABinary_1 = require("../WABinary");
const WAProto_1 = require("../../WAProto");
const Defaults_1 = require("../Defaults");
const messages_send_1 = require("./messages-send");
const makeMessagesRecvSocket = (config) => {
    const { logger } = config;
    const sock = messages_send_1.makeMessagesSocket(config);
    const { ev, authState, ws, assertingPreKeys, sendNode, relayMessage, } = sock;
    const sendMessageAck = async ({ attrs }) => {
        const isGroup = !!attrs.participant;
        const { user: meUser } = WABinary_1.jidDecode(authState.creds.me.id);
        const stanza = {
            tag: 'ack',
            attrs: {
                class: 'receipt',
                id: attrs.id,
                to: isGroup ? attrs.from : authState.creds.me.id,
            }
        };
        if (isGroup) {
            stanza.attrs.participant = WABinary_1.jidEncode(meUser, 's.whatsapp.net');
        }
        await sendNode(stanza);
    };
    const sendRetryRequest = async (node) => {
        const retryCount = +(node.attrs.retryCount || 0) + 1;
        const isGroup = !!node.attrs.participant;
        const { account, signedPreKey, signedIdentityKey: identityKey } = authState.creds;
        const deviceIdentity = WAProto_1.proto.ADVSignedDeviceIdentity.encode(account).finish();
        await assertingPreKeys(1, async (preKeys) => {
            const [keyId] = Object.keys(preKeys);
            const key = preKeys[+keyId];
            const decFrom = node.attrs.from ? WABinary_1.jidDecode(node.attrs.from) : undefined;
            const receipt = {
                tag: 'receipt',
                attrs: {
                    id: node.attrs.id,
                    type: 'retry',
                    to: isGroup ? node.attrs.from : WABinary_1.jidEncode(decFrom.user, 's.whatsapp.net', decFrom.device, 0)
                },
                content: [
                    {
                        tag: 'retry',
                        attrs: {
                            count: retryCount.toString(), id: node.attrs.id,
                            t: node.attrs.t,
                            v: '1'
                        }
                    },
                    {
                        tag: 'registration',
                        attrs: {},
                        content: Utils_1.encodeBigEndian(authState.creds.registrationId)
                    }
                ]
            };
            if (node.attrs.recipient) {
                receipt.attrs.recipient = node.attrs.recipient;
            }
            if (node.attrs.participant) {
                receipt.attrs.participant = node.attrs.participant;
            }
            if (retryCount > 1) {
                const exec = Utils_1.generateSignalPubKey(Buffer.from(Defaults_1.KEY_BUNDLE_TYPE)).slice(0, 1);
                node.content.push({
                    tag: 'keys',
                    attrs: {},
                    content: [
                        { tag: 'type', attrs: {}, content: exec },
                        { tag: 'identity', attrs: {}, content: identityKey.public },
                        Utils_1.xmppPreKey(key, +keyId),
                        Utils_1.xmppSignedPreKey(signedPreKey),
                        { tag: 'device-identity', attrs: {}, content: deviceIdentity }
                    ]
                });
            }
            await sendNode(node);
            logger.info({ msgId: node.attrs.id, retryCount }, 'sent retry receipt');
            ev.emit('auth-state.update', authState);
        });
    };
    const processMessage = async (message, chatUpdate) => {
        var _a;
        const protocolMsg = (_a = message.message) === null || _a === void 0 ? void 0 : _a.protocolMessage;
        if (protocolMsg) {
            switch (protocolMsg.type) {
                case WAProto_1.proto.ProtocolMessage.ProtocolMessageType.HISTORY_SYNC_NOTIFICATION:
                    const histNotification = protocolMsg.historySyncNotification;
                    logger.info({ type: histNotification.syncType, id: message.key.id }, 'got history notification');
                    const history = await Utils_1.downloadHistory(histNotification);
                    processHistoryMessage(history);
                    const meJid = authState.creds.me.id;
                    await sendNode({
                        tag: 'receipt',
                        attrs: {
                            id: message.key.id,
                            type: 'hist_sync',
                            to: WABinary_1.jidEncode(WABinary_1.jidDecode(meJid).user, 'c.us')
                        }
                    });
                    break;
                case WAProto_1.proto.ProtocolMessage.ProtocolMessageType.APP_STATE_SYNC_KEY_REQUEST:
                    const keys = await Promise.all(protocolMsg.appStateSyncKeyRequest.keyIds.map(async (id) => {
                        const keyId = Buffer.from(id.keyId).toString('base64');
                        const keyData = await authState.keys.getAppStateSyncKey(keyId);
                        logger.info({ keyId }, 'received key request');
                        return {
                            keyId: id,
                            keyData
                        };
                    }));
                    const msg = {
                        protocolMessage: {
                            type: WAProto_1.proto.ProtocolMessage.ProtocolMessageType.APP_STATE_SYNC_KEY_SHARE,
                            appStateSyncKeyShare: {
                                keys
                            }
                        }
                    };
                    await relayMessage(message.key.remoteJid, msg, {});
                    logger.info({ with: message.key.remoteJid }, 'shared key');
                    break;
                case WAProto_1.proto.ProtocolMessage.ProtocolMessageType.APP_STATE_SYNC_KEY_SHARE:
                    for (const { keyData, keyId } of protocolMsg.appStateSyncKeyShare.keys || []) {
                        const str = Buffer.from(keyId.keyId).toString('base64');
                        logger.info({ str }, 'injecting new app state sync key');
                        await authState.keys.setAppStateSyncKey(str, keyData);
                        authState.creds.myAppStateKeyId = str;
                    }
                    ev.emit('auth-state.update', authState);
                    break;
                case WAProto_1.proto.ProtocolMessage.ProtocolMessageType.REVOKE:
                    ev.emit('messages.update', [
                        {
                            key: protocolMsg.key,
                            update: { message: null, messageStubType: Types_1.WAMessageStubType.REVOKE, key: message.key }
                        }
                    ]);
                    break;
                case WAProto_1.proto.ProtocolMessage.ProtocolMessageType.EPHEMERAL_SETTING:
                    chatUpdate.ephemeralSettingTimestamp = Utils_1.toNumber(message.messageTimestamp);
                    chatUpdate.ephemeralExpiration = protocolMsg.ephemeralExpiration || null;
                    break;
            }
        }
        else if (message.messageStubType) {
            const meJid = authState.creds.me.id;
            const jid = message.key.remoteJid;
            //let actor = whatsappID (message.participant)
            let participants;
            const emitParticipantsUpdate = (action) => (ev.emit('group-participants.update', { id: jid, participants, action }));
            const emitGroupUpdate = (update) => {
                ev.emit('groups.update', [{ id: jid, ...update }]);
            };
            switch (message.messageStubType) {
                case Types_1.WAMessageStubType.GROUP_PARTICIPANT_LEAVE:
                case Types_1.WAMessageStubType.GROUP_PARTICIPANT_REMOVE:
                    participants = message.messageStubParameters;
                    emitParticipantsUpdate('remove');
                    // mark the chat read only if you left the group
                    if (participants.includes(meJid)) {
                        chatUpdate.readOnly = true;
                    }
                    break;
                case Types_1.WAMessageStubType.GROUP_PARTICIPANT_ADD:
                case Types_1.WAMessageStubType.GROUP_PARTICIPANT_INVITE:
                case Types_1.WAMessageStubType.GROUP_PARTICIPANT_ADD_REQUEST_JOIN:
                    participants = message.messageStubParameters;
                    if (participants.includes(meJid)) {
                        chatUpdate.readOnly = false;
                    }
                    emitParticipantsUpdate('add');
                    break;
                case Types_1.WAMessageStubType.GROUP_CHANGE_ANNOUNCE:
                    const announce = message.messageStubParameters[0] === 'on';
                    emitGroupUpdate({ announce });
                    break;
                case Types_1.WAMessageStubType.GROUP_CHANGE_RESTRICT:
                    const restrict = message.messageStubParameters[0] === 'on';
                    emitGroupUpdate({ restrict });
                    break;
                case Types_1.WAMessageStubType.GROUP_CHANGE_SUBJECT:
                case Types_1.WAMessageStubType.GROUP_CREATE:
                    chatUpdate.name = message.messageStubParameters[0];
                    emitGroupUpdate({ subject: chatUpdate.name });
                    break;
            }
        }
    };
    const processHistoryMessage = (item) => {
        const messages = [];
        switch (item.syncType) {
            case WAProto_1.proto.HistorySync.HistorySyncHistorySyncType.INITIAL_BOOTSTRAP:
                const chats = item.conversations.map(c => {
                    const chat = { ...c };
                    //@ts-expect-error
                    delete chat.messages;
                    for (const msg of c.messages || []) {
                        if (msg.message) {
                            messages.push(msg.message);
                        }
                    }
                    return chat;
                });
                ev.emit('chats.set', { chats, messages });
                break;
            case WAProto_1.proto.HistorySync.HistorySyncHistorySyncType.RECENT:
                // push remaining messages
                for (const conv of item.conversations) {
                    for (const m of (conv.messages || [])) {
                        messages.push(m.message);
                    }
                }
                ev.emit('messages.upsert', { messages, type: 'prepend' });
                break;
            case WAProto_1.proto.HistorySync.HistorySyncHistorySyncType.PUSH_NAME:
                const contacts = item.pushnames.map(p => ({ notify: p.pushname, id: p.id }));
                ev.emit('contacts.upsert', contacts);
                break;
            case WAProto_1.proto.HistorySync.HistorySyncHistorySyncType.INITIAL_STATUS_V3:
                // TODO
                break;
        }
    };
    const processNotification = (node) => {
        var _a;
        const result = {};
        const child = (_a = node.content) === null || _a === void 0 ? void 0 : _a[0];
        if (node.attrs.type === 'w:gp2') {
            switch (child === null || child === void 0 ? void 0 : child.tag) {
                case 'ephemeral':
                case 'not_ephemeral':
                    result.message = {
                        protocolMessage: {
                            type: WAProto_1.proto.ProtocolMessage.ProtocolMessageType.EPHEMERAL_SETTING,
                            ephemeralExpiration: +(child.attrs.expiration || 0)
                        }
                    };
                    break;
                case 'promote':
                case 'demote':
                case 'remove':
                case 'add':
                case 'leave':
                    const stubType = `GROUP_PARTICIPANT_${child.tag.toUpperCase()}`;
                    result.messageStubType = Types_1.WAMessageStubType[stubType];
                    result.messageStubParameters = WABinary_1.getBinaryNodeChildren(child, 'participant').map(p => p.attrs.jid);
                    break;
                case 'subject':
                    result.messageStubType = Types_1.WAMessageStubType.GROUP_CHANGE_SUBJECT;
                    result.messageStubParameters = [child.attrs.subject];
                    break;
                case 'announcement':
                case 'not_announcement':
                    result.messageStubType = Types_1.WAMessageStubType.GROUP_CHANGE_ANNOUNCE;
                    result.messageStubParameters = [(child.tag === 'announcement').toString()];
                    break;
                case 'locked':
                case 'unlocked':
                    result.messageStubType = Types_1.WAMessageStubType.GROUP_CHANGE_RESTRICT;
                    result.messageStubParameters = [(child.tag === 'locked').toString()];
                    break;
            }
        }
        else {
            switch (child.tag) {
                case 'count':
                    if (child.attrs.value === '0') {
                        logger.info('recv all pending notifications');
                        ev.emit('connection.update', { receivedPendingNotifications: true });
                    }
                    break;
                case 'devices':
                    const devices = WABinary_1.getBinaryNodeChildren(child, 'device');
                    if (WABinary_1.areJidsSameUser(child.attrs.jid, authState.creds.me.id)) {
                        const deviceJids = devices.map(d => d.attrs.jid);
                        logger.info({ deviceJids }, 'got my own devices');
                    }
                    break;
            }
        }
        if (Object.keys(result).length) {
            return result;
        }
    };
    // recv a message
    ws.on('CB:message', async (stanza) => {
        var _a, _b;
        const dec = await Utils_1.decodeMessageStanza(stanza, authState);
        const fullMessages = [];
        for (const msg of dec.successes) {
            const { attrs } = stanza;
            const isGroup = !!stanza.attrs.participant;
            const sender = (_a = (attrs.participant || attrs.from)) === null || _a === void 0 ? void 0 : _a.toString();
            const isMe = WABinary_1.areJidsSameUser(sender, authState.creds.me.id);
            // send delivery receipt
            let recpAttrs;
            if (isMe) {
                recpAttrs = {
                    type: 'sender',
                    id: stanza.attrs.id,
                    to: stanza.attrs.from,
                };
                if (isGroup) {
                    recpAttrs.participant = stanza.attrs.participant;
                }
                else {
                    recpAttrs.recipient = stanza.attrs.recipient;
                }
            }
            else {
                const isStatus = WABinary_1.isJidStatusBroadcast(stanza.attrs.from);
                recpAttrs = {
                    type: 'inactive',
                    id: stanza.attrs.id,
                };
                if (isGroup || isStatus) {
                    recpAttrs.participant = stanza.attrs.participant;
                    recpAttrs.to = dec.chatId;
                }
                else {
                    recpAttrs.to = WABinary_1.jidEncode(WABinary_1.jidDecode(dec.chatId).user, 'c.us');
                }
            }
            await sendNode({ tag: 'receipt', attrs: recpAttrs });
            logger.debug({ msgId: dec.msgId }, 'sent message receipt');
            await sendMessageAck(stanza);
            logger.debug({ msgId: dec.msgId, sender }, 'sent message ack');
            const message = ((_b = msg.deviceSentMessage) === null || _b === void 0 ? void 0 : _b.message) || msg;
            fullMessages.push({
                key: {
                    remoteJid: dec.chatId,
                    fromMe: isMe,
                    id: dec.msgId,
                    participant: dec.participant
                },
                message,
                status: isMe ? WAProto_1.proto.WebMessageInfo.WebMessageInfoStatus.SERVER_ACK : null,
                messageTimestamp: dec.timestamp,
                pushName: dec.pushname,
                participant: dec.participant
            });
        }
        if (dec.successes.length) {
            ev.emit('auth-state.update', authState);
            if (fullMessages.length) {
                ev.emit('messages.upsert', {
                    messages: fullMessages.map(m => WAProto_1.proto.WebMessageInfo.fromObject(m)),
                    type: stanza.attrs.offline ? 'append' : 'notify'
                });
            }
        }
        for (const { error } of dec.failures) {
            logger.error({ msgId: dec.msgId, trace: error.stack, data: error.data }, 'failure in decrypting message');
            await sendRetryRequest(stanza);
        }
    });
    ws.on('CB:ack,class:message', async (node) => {
        await sendNode({
            tag: 'ack',
            attrs: {
                class: 'receipt',
                id: node.attrs.id,
                from: node.attrs.from
            }
        });
        logger.debug({ attrs: node.attrs }, 'sending receipt for ack');
    });
    const handleReceipt = ({ tag, attrs, content }) => {
        if (tag === 'receipt') {
            // if not read or no type (no type = delivered, but message sent from other device)
            if (attrs.type !== 'read' && !!attrs.type) {
                return;
            }
        }
        const status = attrs.type === 'read' ? WAProto_1.proto.WebMessageInfo.WebMessageInfoStatus.READ : WAProto_1.proto.WebMessageInfo.WebMessageInfoStatus.DELIVERY_ACK;
        const ids = [attrs.id];
        if (Array.isArray(content)) {
            const items = WABinary_1.getBinaryNodeChildren(content[0], 'item');
            ids.push(...items.map(i => i.attrs.id));
        }
        const remoteJid = attrs.recipient || attrs.from;
        const fromMe = attrs.recipient ? false : true;
        ev.emit('messages.update', ids.map(id => ({
            key: {
                remoteJid,
                id: id,
                fromMe,
                participant: attrs.participant
            },
            update: { status }
        })));
    };
    ws.on('CB:receipt', handleReceipt);
    ws.on('CB:ack,class:message', handleReceipt);
    ws.on('CB:notification', async (node) => {
        const sendAck = async () => {
            await sendNode({
                tag: 'ack',
                attrs: {
                    class: 'notification',
                    id: node.attrs.id,
                    type: node.attrs.type,
                    to: node.attrs.from
                }
            });
            logger.debug({ msgId: node.attrs.id }, 'ack notification');
        };
        await sendAck();
        const msg = processNotification(node);
        if (msg) {
            const fromMe = WABinary_1.areJidsSameUser(node.attrs.participant || node.attrs.from, authState.creds.me.id);
            msg.key = {
                remoteJid: node.attrs.from,
                fromMe,
                participant: node.attrs.participant,
                id: node.attrs.id
            };
            msg.messageTimestamp = +node.attrs.t;
            const fullMsg = WAProto_1.proto.WebMessageInfo.fromObject(msg);
            ev.emit('messages.upsert', { messages: [fullMsg], type: 'append' });
        }
    });
    ev.on('messages.upsert', async ({ messages }) => {
        var _a;
        const chat = { id: messages[0].key.remoteJid };
        const contactNameUpdates = {};
        for (const msg of messages) {
            if (!!msg.pushName) {
                const jid = msg.key.fromMe ? WABinary_1.jidNormalizedUser(authState.creds.me.id) : (msg.key.participant || msg.key.remoteJid);
                contactNameUpdates[jid] = msg.pushName;
                // update our pushname too
                if (msg.key.fromMe && ((_a = authState.creds.me) === null || _a === void 0 ? void 0 : _a.name) !== msg.pushName) {
                    authState.creds.me.name = msg.pushName;
                    ev.emit('auth-state.update', authState);
                }
            }
            await processMessage(msg, chat);
            if (!!msg.message && !msg.message.protocolMessage) {
                chat.conversationTimestamp = Utils_1.toNumber(msg.messageTimestamp);
                if (!msg.key.fromMe) {
                    chat.unreadCount = (chat.unreadCount || 0) + 1;
                }
            }
        }
        if (Object.keys(chat).length > 1) {
            ev.emit('chats.update', [chat]);
        }
        if (Object.keys(contactNameUpdates).length) {
            ev.emit('contacts.update', Object.keys(contactNameUpdates).map(id => ({ id, notify: contactNameUpdates[id] })));
        }
    });
    return { ...sock, processMessage };
};
exports.makeMessagesRecvSocket = makeMessagesRecvSocket;
