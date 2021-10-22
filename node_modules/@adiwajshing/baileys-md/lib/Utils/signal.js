"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractDeviceJids = exports.parseAndInjectE2ESession = exports.encryptSenderKeyMsgSignalProto = exports.encryptSignalProto = exports.decryptSignalProto = exports.processSenderKeyMessage = exports.decryptGroupSignalProto = exports.signalStorage = exports.xmppPreKey = exports.xmppSignedPreKey = exports.generateOrGetPreKeys = exports.getPreKeys = exports.createSignalIdentity = exports.jidToSignalSenderKeyName = exports.jidToSignalProtocolAddress = exports.generateSignalPubKey = void 0;
const libsignal = __importStar(require("libsignal"));
const generics_1 = require("./generics");
const crypto_1 = require("./crypto");
const WASignalGroup_1 = require("../../WASignalGroup");
const WABinary_1 = require("../WABinary");
const generateSignalPubKey = (pubKey) => {
    const newPub = Buffer.alloc(33);
    newPub.set([5], 0);
    newPub.set(pubKey, 1);
    return newPub;
};
exports.generateSignalPubKey = generateSignalPubKey;
const jidToSignalAddress = (jid) => jid.split('@')[0];
const jidToSignalProtocolAddress = (jid) => {
    return new libsignal.ProtocolAddress(jidToSignalAddress(jid), 0);
};
exports.jidToSignalProtocolAddress = jidToSignalProtocolAddress;
const jidToSignalSenderKeyName = (group, user) => {
    return new WASignalGroup_1.SenderKeyName(group, exports.jidToSignalProtocolAddress(user)).toString();
};
exports.jidToSignalSenderKeyName = jidToSignalSenderKeyName;
const createSignalIdentity = (wid, accountSignatureKey) => {
    return {
        identifier: { name: wid, deviceId: 0 },
        identifierKey: exports.generateSignalPubKey(accountSignatureKey)
    };
};
exports.createSignalIdentity = createSignalIdentity;
const getPreKeys = async ({ getPreKey }, min, limit) => {
    const dict = {};
    for (let id = min; id < limit; id++) {
        const key = await getPreKey(id);
        if (key)
            dict[+id] = key;
    }
    return dict;
};
exports.getPreKeys = getPreKeys;
const generateOrGetPreKeys = ({ creds }, range) => {
    const avaliable = creds.nextPreKeyId - creds.firstUnuploadedPreKeyId;
    const remaining = range - avaliable;
    const lastPreKeyId = creds.nextPreKeyId + remaining - 1;
    const newPreKeys = {};
    if (remaining > 0) {
        for (let i = creds.nextPreKeyId; i <= lastPreKeyId; i++) {
            newPreKeys[i] = crypto_1.Curve.generateKeyPair();
        }
    }
    return {
        newPreKeys,
        lastPreKeyId,
        preKeysRange: [creds.firstUnuploadedPreKeyId, range],
    };
};
exports.generateOrGetPreKeys = generateOrGetPreKeys;
const xmppSignedPreKey = (key) => ({
    tag: 'skey',
    attrs: {},
    content: [
        { tag: 'id', attrs: {}, content: generics_1.encodeBigEndian(key.keyId, 3) },
        { tag: 'value', attrs: {}, content: key.keyPair.public },
        { tag: 'signature', attrs: {}, content: key.signature }
    ]
});
exports.xmppSignedPreKey = xmppSignedPreKey;
const xmppPreKey = (pair, id) => ({
    tag: 'key',
    attrs: {},
    content: [
        { tag: 'id', attrs: {}, content: generics_1.encodeBigEndian(id, 3) },
        { tag: 'value', attrs: {}, content: pair.public }
    ]
});
exports.xmppPreKey = xmppPreKey;
const signalStorage = ({ creds, keys }) => ({
    loadSession: async (id) => {
        const sess = await keys.getSession(id);
        if (sess) {
            return libsignal.SessionRecord.deserialize(sess);
        }
    },
    storeSession: async (id, session) => {
        await keys.setSession(id, session.serialize());
    },
    isTrustedIdentity: () => {
        return true;
    },
    loadPreKey: async (id) => {
        const key = await keys.getPreKey(id);
        if (key) {
            return {
                privKey: Buffer.from(key.private),
                pubKey: Buffer.from(key.public)
            };
        }
    },
    removePreKey: (id) => keys.setPreKey(id, null),
    loadSignedPreKey: (keyId) => {
        const key = creds.signedPreKey;
        return {
            privKey: Buffer.from(key.keyPair.private),
            pubKey: Buffer.from(key.keyPair.public)
        };
    },
    loadSenderKey: async (keyId) => {
        const key = await keys.getSenderKey(keyId);
        if (key)
            return new WASignalGroup_1.SenderKeyRecord(key);
    },
    storeSenderKey: async (keyId, key) => {
        await keys.setSenderKey(keyId, key.serialize());
    },
    getOurRegistrationId: () => (creds.registrationId),
    getOurIdentity: () => {
        const { signedIdentityKey } = creds;
        return {
            privKey: Buffer.from(signedIdentityKey.private),
            pubKey: exports.generateSignalPubKey(signedIdentityKey.public),
        };
    }
});
exports.signalStorage = signalStorage;
const decryptGroupSignalProto = (group, user, msg, auth) => {
    const senderName = exports.jidToSignalSenderKeyName(group, user);
    const cipher = new WASignalGroup_1.GroupCipher(exports.signalStorage(auth), senderName);
    return cipher.decrypt(Buffer.from(msg));
};
exports.decryptGroupSignalProto = decryptGroupSignalProto;
const processSenderKeyMessage = async (authorJid, item, auth) => {
    const builder = new WASignalGroup_1.GroupSessionBuilder(exports.signalStorage(auth));
    const senderName = exports.jidToSignalSenderKeyName(item.groupId, authorJid);
    const senderMsg = new WASignalGroup_1.SenderKeyDistributionMessage(null, null, null, null, item.axolotlSenderKeyDistributionMessage);
    const senderKey = await auth.keys.getSenderKey(senderName);
    if (!senderKey) {
        const record = new WASignalGroup_1.SenderKeyRecord();
        await auth.keys.setSenderKey(senderName, record);
    }
    await builder.process(senderName, senderMsg);
};
exports.processSenderKeyMessage = processSenderKeyMessage;
const decryptSignalProto = async (user, type, msg, auth) => {
    const addr = exports.jidToSignalProtocolAddress(user);
    const session = new libsignal.SessionCipher(exports.signalStorage(auth), addr);
    let result;
    switch (type) {
        case 'pkmsg':
            result = await session.decryptPreKeyWhisperMessage(msg);
            break;
        case 'msg':
            result = await session.decryptWhisperMessage(msg);
            break;
    }
    return result;
};
exports.decryptSignalProto = decryptSignalProto;
const encryptSignalProto = async (user, buffer, auth) => {
    const addr = exports.jidToSignalProtocolAddress(user);
    const cipher = new libsignal.SessionCipher(exports.signalStorage(auth), addr);
    const { type, body } = await cipher.encrypt(buffer);
    return {
        type: type === 3 ? 'pkmsg' : 'msg',
        ciphertext: Buffer.from(body, 'binary')
    };
};
exports.encryptSignalProto = encryptSignalProto;
const encryptSenderKeyMsgSignalProto = async (group, data, auth) => {
    const storage = exports.signalStorage(auth);
    const senderName = exports.jidToSignalSenderKeyName(group, auth.creds.me.id);
    const builder = new WASignalGroup_1.GroupSessionBuilder(storage);
    const senderKey = await auth.keys.getSenderKey(senderName);
    if (!senderKey) {
        const record = new WASignalGroup_1.SenderKeyRecord();
        await auth.keys.setSenderKey(senderName, record);
    }
    const senderKeyDistributionMessage = await builder.create(senderName);
    const session = new WASignalGroup_1.GroupCipher(storage, senderName);
    return {
        ciphertext: await session.encrypt(data),
        senderKeyDistributionMessageKey: senderKeyDistributionMessage.serialize(),
    };
};
exports.encryptSenderKeyMsgSignalProto = encryptSenderKeyMsgSignalProto;
const parseAndInjectE2ESession = async (node, auth) => {
    const extractKey = (key) => (key ? ({
        keyId: WABinary_1.getBinaryNodeChildUInt(key, 'id', 3),
        publicKey: exports.generateSignalPubKey(WABinary_1.getBinaryNodeChildBuffer(key, 'value')),
        signature: WABinary_1.getBinaryNodeChildBuffer(key, 'signature'),
    }) : undefined);
    node = WABinary_1.getBinaryNodeChild(WABinary_1.getBinaryNodeChild(node, 'list'), 'user');
    WABinary_1.assertNodeErrorFree(node);
    const signedKey = WABinary_1.getBinaryNodeChild(node, 'skey');
    const key = WABinary_1.getBinaryNodeChild(node, 'key');
    const identity = WABinary_1.getBinaryNodeChildBuffer(node, 'identity');
    const jid = node.attrs.jid;
    const registrationId = WABinary_1.getBinaryNodeChildUInt(node, 'registration', 4);
    const device = {
        registrationId,
        identityKey: exports.generateSignalPubKey(identity),
        signedPreKey: extractKey(signedKey),
        preKey: extractKey(key)
    };
    const cipher = new libsignal.SessionBuilder(exports.signalStorage(auth), exports.jidToSignalProtocolAddress(jid));
    await cipher.initOutgoing(device);
};
exports.parseAndInjectE2ESession = parseAndInjectE2ESession;
const extractDeviceJids = (result, myDeviceId, excludeZeroDevices) => {
    var _a;
    const extracted = [];
    for (const node of result.content) {
        const list = (_a = WABinary_1.getBinaryNodeChild(node, 'list')) === null || _a === void 0 ? void 0 : _a.content;
        if (list && Array.isArray(list)) {
            for (const item of list) {
                const { user } = WABinary_1.jidDecode(item.attrs.jid);
                const devicesNode = WABinary_1.getBinaryNodeChild(item, 'devices');
                const deviceListNode = WABinary_1.getBinaryNodeChild(devicesNode, 'device-list');
                if (Array.isArray(deviceListNode === null || deviceListNode === void 0 ? void 0 : deviceListNode.content)) {
                    for (const { tag, attrs } of deviceListNode.content) {
                        const device = +attrs.id;
                        if (tag === 'device' && myDeviceId !== device && (!excludeZeroDevices || device !== 0)) {
                            extracted.push({ user, device });
                        }
                    }
                }
            }
        }
    }
    return extracted;
};
exports.extractDeviceJids = extractDeviceJids;
