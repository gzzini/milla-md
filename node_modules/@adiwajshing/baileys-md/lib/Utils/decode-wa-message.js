"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decodeMessageStanza = void 0;
const boom_1 = require("@hapi/boom");
const generics_1 = require("./generics");
const WABinary_1 = require("../WABinary");
const signal_1 = require("./signal");
const WAProto_1 = require("../../WAProto");
const decodeMessageStanza = async (stanza, auth) => {
    var _a;
    const deviceIdentity = (_a = stanza.content) === null || _a === void 0 ? void 0 : _a.find(m => m.tag === 'device-identity');
    const deviceIdentityBytes = deviceIdentity ? deviceIdentity.content : undefined;
    let msgType;
    let chatId;
    let author;
    const msgId = stanza.attrs.id;
    const from = stanza.attrs.from;
    const participant = stanza.attrs.participant;
    const recipient = stanza.attrs.recipient;
    const isMe = (jid) => WABinary_1.areJidsSameUser(jid, auth.creds.me.id);
    if (WABinary_1.isJidUser(from)) {
        if (recipient) {
            if (!isMe(from)) {
                throw new boom_1.Boom('');
            }
            chatId = recipient;
        }
        else {
            chatId = from;
        }
        msgType = 'chat';
        author = from;
    }
    else if (WABinary_1.isJidGroup(from)) {
        if (!participant) {
            throw new boom_1.Boom('No participant in group message');
        }
        msgType = 'group';
        author = participant;
        chatId = from;
    }
    else if (WABinary_1.isJidBroadcast(from)) {
        if (!participant) {
            throw new boom_1.Boom('No participant in group message');
        }
        const isParticipantMe = isMe(participant);
        if (WABinary_1.isJidStatusBroadcast(from)) {
            msgType = isParticipantMe ? 'direct_peer_status' : 'other_status';
        }
        else {
            msgType = isParticipantMe ? 'peer_broadcast' : 'other_broadcast';
        }
        chatId = from;
        author = participant;
    }
    const sender = msgType === 'chat' ? author : chatId;
    const successes = [];
    const failures = [];
    if (Array.isArray(stanza.content)) {
        for (const { tag, attrs, content } of stanza.content) {
            if (tag !== 'enc')
                continue;
            if (!Buffer.isBuffer(content) && !(content instanceof Uint8Array))
                continue;
            try {
                let msgBuffer;
                const e2eType = attrs.type;
                switch (e2eType) {
                    case 'skmsg':
                        msgBuffer = await signal_1.decryptGroupSignalProto(sender, author, content, auth);
                        break;
                    case 'pkmsg':
                    case 'msg':
                        const user = WABinary_1.isJidUser(sender) ? sender : author;
                        msgBuffer = await signal_1.decryptSignalProto(user, e2eType, content, auth);
                        break;
                }
                const msg = WAProto_1.proto.Message.decode(generics_1.unpadRandomMax16(msgBuffer));
                if (msg.senderKeyDistributionMessage) {
                    await signal_1.processSenderKeyMessage(author, msg.senderKeyDistributionMessage, auth);
                }
                successes.push(msg);
            }
            catch (error) {
                failures.push({ error: new boom_1.Boom(error, { data: Buffer.from(WABinary_1.encodeBinaryNode(stanza)).toString('base64') }) });
            }
        }
    }
    return {
        msgId,
        chatId,
        author,
        from,
        timestamp: +stanza.attrs.t,
        participant,
        recipient,
        pushname: stanza.attrs.notify,
        successes,
        failures
    };
};
exports.decodeMessageStanza = decodeMessageStanza;
