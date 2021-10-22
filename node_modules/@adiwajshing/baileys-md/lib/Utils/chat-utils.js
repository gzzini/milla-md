"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.chatModificationToAppPatch = exports.decodePatches = exports.extractSyncdPatches = exports.decodeSyncdPatch = exports.encodeSyncdPatch = exports.generateSnapshotMac = exports.mutationKeys = void 0;
const boom_1 = require("@hapi/boom");
const crypto_1 = require("./crypto");
const WAProto_1 = require("../../WAProto");
const lt_hash_1 = require("./lt-hash");
const WABinary_1 = require("../WABinary");
const generics_1 = require("./generics");
const mutationKeys = (keydata) => {
    const expanded = crypto_1.hkdf(keydata, 160, { info: 'WhatsApp Mutation Keys' });
    return {
        indexKey: expanded.slice(0, 32),
        valueEncryptionKey: expanded.slice(32, 64),
        valueMacKey: expanded.slice(64, 96),
        snapshotMacKey: expanded.slice(96, 128),
        patchMacKey: expanded.slice(128, 160)
    };
};
exports.mutationKeys = mutationKeys;
const generateMac = (operation, data, keyId, key) => {
    const getKeyData = () => {
        let r;
        switch (operation) {
            case WAProto_1.proto.SyncdMutation.SyncdMutationSyncdOperation.SET:
                r = 0x01;
                break;
            case WAProto_1.proto.SyncdMutation.SyncdMutationSyncdOperation.REMOVE:
                r = 0x02;
                break;
        }
        const buff = Buffer.from([r]);
        return Buffer.concat([buff, Buffer.from(keyId, 'base64')]);
    };
    const keyData = getKeyData();
    const last = Buffer.alloc(8); // 8 bytes
    last.set([keyData.length], last.length - 1);
    const total = Buffer.concat([keyData, data, last]);
    const hmac = crypto_1.hmacSign(total, key, 'sha512');
    return hmac.slice(0, 32);
};
const to64BitNetworkOrder = function (e) {
    const t = new ArrayBuffer(8);
    new DataView(t).setUint32(4, e, !1);
    return Buffer.from(t);
};
const computeLtHash = (initial, macs, getPrevSetValueMac) => {
    const addBuffs = [];
    const subBuffs = [];
    for (let i = 0; i < macs.length; i++) {
        const { indexMac, valueMac, operation } = macs[i];
        const subBuff = getPrevSetValueMac(indexMac, i);
        if (operation === WAProto_1.proto.SyncdMutation.SyncdMutationSyncdOperation.REMOVE) {
            if (!subBuff) {
                throw new boom_1.Boom('');
            }
        }
        else {
            addBuffs.push(new Uint8Array(valueMac).buffer);
        }
        if (subBuff) {
            subBuffs.push(new Uint8Array(subBuff).buffer);
        }
    }
    const result = lt_hash_1.LT_HASH_ANTI_TAMPERING.subtractThenAdd(new Uint8Array(initial).buffer, addBuffs, subBuffs);
    const buff = Buffer.from(result);
    return buff;
};
const generateSnapshotMac = (lthash, version, name, key) => {
    const total = Buffer.concat([
        lthash,
        to64BitNetworkOrder(version),
        Buffer.from(name, 'utf-8')
    ]);
    return crypto_1.hmacSign(total, key, 'sha256');
};
exports.generateSnapshotMac = generateSnapshotMac;
const generatePatchMac = (snapshotMac, valueMacs, version, type, key) => {
    const total = Buffer.concat([
        snapshotMac,
        ...valueMacs,
        to64BitNetworkOrder(version),
        Buffer.from(type, 'utf-8')
    ]);
    return crypto_1.hmacSign(total, key);
};
const encodeSyncdPatch = async ({ type, index, syncAction, apiVersion }, { creds: { myAppStateKeyId }, keys }) => {
    const key = !!myAppStateKeyId ? await keys.getAppStateSyncKey(myAppStateKeyId) : undefined;
    if (!key) {
        throw new boom_1.Boom(`myAppStateKey not present`, { statusCode: 404 });
    }
    const encKeyId = Buffer.from(myAppStateKeyId, 'base64');
    const operation = WAProto_1.proto.SyncdMutation.SyncdMutationSyncdOperation.SET;
    const state = { ...await keys.getAppStateSyncVersion(type) };
    const indexBuffer = Buffer.from(JSON.stringify(index));
    const encoded = WAProto_1.proto.SyncActionData.encode({
        index: indexBuffer,
        value: syncAction,
        padding: new Uint8Array(0),
        version: apiVersion
    }).finish();
    const keyValue = exports.mutationKeys(key.keyData);
    const encValue = crypto_1.aesEncrypt(encoded, keyValue.valueEncryptionKey);
    const valueMac = generateMac(operation, encValue, encKeyId, keyValue.valueMacKey);
    const indexMac = crypto_1.hmacSign(indexBuffer, keyValue.indexKey);
    state.hash = computeLtHash(state.hash, [{ indexMac, valueMac, operation }], (index) => { var _a; return (_a = [...state.mutations].reverse().find(m => Buffer.compare(m.indexMac, index) === 0)) === null || _a === void 0 ? void 0 : _a.valueMac; });
    state.version += 1;
    const snapshotMac = exports.generateSnapshotMac(state.hash, state.version, type, keyValue.snapshotMacKey);
    const patch = {
        patchMac: generatePatchMac(snapshotMac, [valueMac], state.version, type, keyValue.patchMacKey),
        snapshotMac: snapshotMac,
        keyId: { id: encKeyId },
        mutations: [
            {
                operation: operation,
                record: {
                    index: {
                        blob: indexMac
                    },
                    value: {
                        blob: Buffer.concat([encValue, valueMac])
                    },
                    keyId: { id: encKeyId }
                }
            }
        ]
    };
    state.mutations = [
        ...state.mutations,
        {
            action: syncAction,
            index,
            valueMac,
            indexMac,
            operation
        }
    ];
    return { patch, state };
};
exports.encodeSyncdPatch = encodeSyncdPatch;
const decodeSyncdPatch = async (msg, name, { keys }, validateMacs = true) => {
    const keyCache = {};
    const getKey = async (keyId) => {
        const base64Key = Buffer.from(keyId).toString('base64');
        let key = keyCache[base64Key];
        if (!key) {
            const keyEnc = await keys.getAppStateSyncKey(base64Key);
            if (!keyEnc) {
                throw new boom_1.Boom(`failed to find key "${base64Key}" to decode mutation`, { statusCode: 500, data: msg });
            }
            const result = exports.mutationKeys(keyEnc.keyData);
            keyCache[base64Key] = result;
            key = result;
        }
        return key;
    };
    const mutations = [];
    if (validateMacs) {
        const mainKey = await getKey(msg.keyId.id);
        const mutationmacs = msg.mutations.map(mutation => mutation.record.value.blob.slice(-32));
        const patchMac = generatePatchMac(msg.snapshotMac, mutationmacs, generics_1.toNumber(msg.version.version), name, mainKey.patchMacKey);
        if (Buffer.compare(patchMac, msg.patchMac) !== 0) {
            throw new boom_1.Boom('Invalid patch mac');
        }
    }
    // indexKey used to HMAC sign record.index.blob
    // valueEncryptionKey used to AES-256-CBC encrypt record.value.blob[0:-32]
    // the remaining record.value.blob[0:-32] is the mac, it the HMAC sign of key.keyId + decoded proto data + length of bytes in keyId
    for (const { operation, record } of msg.mutations) {
        const key = await getKey(record.keyId.id);
        const content = Buffer.from(record.value.blob);
        const encContent = content.slice(0, -32);
        const ogValueMac = content.slice(-32);
        if (validateMacs) {
            const contentHmac = generateMac(operation, encContent, record.keyId.id, key.valueMacKey);
            if (Buffer.compare(contentHmac, ogValueMac) !== 0) {
                throw new boom_1.Boom('HMAC content verification failed');
            }
        }
        const result = crypto_1.aesDecrypt(encContent, key.valueEncryptionKey);
        const syncAction = WAProto_1.proto.SyncActionData.decode(result);
        if (validateMacs) {
            const hmac = crypto_1.hmacSign(syncAction.index, key.indexKey);
            if (Buffer.compare(hmac, record.index.blob) !== 0) {
                throw new boom_1.Boom('HMAC index verification failed');
            }
        }
        const indexStr = Buffer.from(syncAction.index).toString();
        mutations.push({
            action: syncAction.value,
            index: JSON.parse(indexStr),
            indexMac: record.index.blob,
            valueMac: ogValueMac,
            operation: operation
        });
    }
    return { mutations };
};
exports.decodeSyncdPatch = decodeSyncdPatch;
const extractSyncdPatches = (result) => {
    const syncNode = WABinary_1.getBinaryNodeChild(result, 'sync');
    const collectionNode = WABinary_1.getBinaryNodeChild(syncNode, 'collection');
    const patchesNode = WABinary_1.getBinaryNodeChild(collectionNode, 'patches');
    const patches = WABinary_1.getBinaryNodeChildren(patchesNode || collectionNode, 'patch');
    const syncds = [];
    const name = collectionNode.attrs.name;
    for (let { content } of patches) {
        if (content) {
            const syncd = WAProto_1.proto.SyncdPatch.decode(content);
            if (!syncd.version) {
                syncd.version = { version: +collectionNode.attrs.version + 1 };
            }
            syncds.push(syncd);
        }
    }
    return { syncds, name };
};
exports.extractSyncdPatches = extractSyncdPatches;
const decodePatches = async ({ syncds, name }, initial, auth, validateMacs = true) => {
    const successfulMutations = [];
    let current = initial.hash;
    let currentVersion = initial.version;
    for (const syncd of syncds) {
        const { mutations, version, keyId, snapshotMac } = syncd;
        const macs = mutations.map(m => ({
            operation: m.operation,
            indexMac: m.record.index.blob,
            valueMac: m.record.value.blob.slice(-32)
        }));
        currentVersion = generics_1.toNumber(version.version);
        current = computeLtHash(current, macs, (index, maxIndex) => {
            let value;
            for (const item of initial.mutations) {
                if (Buffer.compare(item.indexMac, index) === 0) {
                    value = item.valueMac;
                }
            }
            for (const { version, mutations } of syncds) {
                const versionNum = generics_1.toNumber(version.version);
                const mutationIdx = mutations.findIndex(m => {
                    return Buffer.compare(m.record.index.blob, index) === 0;
                });
                if (mutationIdx >= 0 && (versionNum < currentVersion || mutationIdx < maxIndex)) {
                    value = mutations[mutationIdx].record.value.blob.slice(-32);
                }
                if (versionNum >= currentVersion) {
                    break;
                }
            }
            return value;
        });
        if (validateMacs) {
            const base64Key = Buffer.from(keyId.id).toString('base64');
            const keyEnc = await auth.keys.getAppStateSyncKey(base64Key);
            if (!keyEnc) {
                throw new boom_1.Boom(`failed to find key "${base64Key}" to decode mutation`, { statusCode: 500 });
            }
            const result = exports.mutationKeys(keyEnc.keyData);
            const computedSnapshotMac = exports.generateSnapshotMac(current, currentVersion, name, result.snapshotMacKey);
            if (Buffer.compare(snapshotMac, computedSnapshotMac) !== 0) {
                throw new boom_1.Boom(`failed to verify LTHash at ${currentVersion}`, { statusCode: 500 });
            }
        }
        const decodeResult = await exports.decodeSyncdPatch(syncd, name, auth, validateMacs);
        successfulMutations.push(...decodeResult.mutations);
    }
    return {
        newMutations: successfulMutations,
        state: {
            hash: current,
            version: currentVersion,
            mutations: [...initial.mutations, ...successfulMutations]
        }
    };
};
exports.decodePatches = decodePatches;
const chatModificationToAppPatch = (mod, jid, lastMessages) => {
    const messageRange = {
        lastMessageTimestamp: lastMessages[lastMessages.length - 1].messageTimestamp,
        messages: lastMessages
    };
    const timestamp = Date.now();
    let patch;
    if ('mute' in mod) {
        patch = {
            syncAction: {
                timestamp,
                muteAction: {
                    muted: !!mod.mute,
                    muteEndTimestamp: mod.mute || undefined
                }
            },
            index: ['mute', jid],
            type: 'regular_high',
            apiVersion: 2
        };
    }
    else if ('archive' in mod) {
        patch = {
            syncAction: {
                timestamp,
                archiveChatAction: {
                    archived: !!mod.archive,
                    messageRange
                }
            },
            index: ['archive', jid],
            type: 'regular_low',
            apiVersion: 3
        };
    }
    else if ('markRead' in mod) {
        patch = {
            syncAction: {
                timestamp,
                markChatAsReadAction: {
                    read: mod.markRead,
                    messageRange
                }
            },
            index: ['markChatAsRead', jid],
            type: 'regular_low',
            apiVersion: 3
        };
    }
    else if ('clear' in mod) {
        if (mod.clear === 'all') {
            throw new boom_1.Boom('not supported');
        }
        else {
            const key = mod.clear.message;
            patch = {
                syncAction: {
                    timestamp,
                    deleteMessageForMeAction: {
                        deleteMedia: false
                    }
                },
                index: ['deleteMessageForMe', jid, key.id, key.fromMe ? '1' : '0', '0'],
                type: 'regular_high',
                apiVersion: 3,
            };
        }
    }
    else {
        throw new boom_1.Boom('not supported');
    }
    return patch;
};
exports.chatModificationToAppPatch = chatModificationToAppPatch;
