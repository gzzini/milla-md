"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeChatsSocket = void 0;
const WABinary_1 = require("../WABinary");
const WAProto_1 = require("../../WAProto");
const Utils_1 = require("../Utils");
const messages_recv_1 = require("./messages-recv");
const makeChatsSocket = (config) => {
    const { logger } = config;
    const sock = messages_recv_1.makeMessagesRecvSocket(config);
    const { ev, ws, authState, processMessage, relayMessage, generateMessageTag, sendNode, query } = sock;
    const interactiveQuery = async (userNodes, queryNode) => {
        const result = await query({
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
                        context: 'interactive',
                    },
                    content: [
                        {
                            tag: 'query',
                            attrs: {},
                            content: [queryNode]
                        },
                        {
                            tag: 'list',
                            attrs: {},
                            content: userNodes
                        }
                    ]
                }
            ],
        });
        const usyncNode = WABinary_1.getBinaryNodeChild(result, 'usync');
        const listNode = WABinary_1.getBinaryNodeChild(usyncNode, 'list');
        const users = WABinary_1.getBinaryNodeChildren(listNode, 'user');
        return users;
    };
    const onWhatsApp = async (...jids) => {
        const results = await interactiveQuery([
            {
                tag: 'user',
                attrs: {},
                content: jids.map(jid => ({
                    tag: 'contact',
                    attrs: {},
                    content: `+${jid}`
                }))
            }
        ], { tag: 'contact', attrs: {} });
        return results.map(user => {
            const contact = WABinary_1.getBinaryNodeChild(user, 'contact');
            return { exists: contact.attrs.type === 'in', jid: user.attrs.jid };
        }).filter(item => item.exists);
    };
    const fetchStatus = async (jid) => {
        const [result] = await interactiveQuery([{ tag: 'user', attrs: { jid } }], { tag: 'status', attrs: {} });
        if (result) {
            const status = WABinary_1.getBinaryNodeChild(result, 'status');
            return {
                status: status.content.toString(),
                setAt: new Date(+status.attrs.t * 1000)
            };
        }
    };
    const updateProfilePicture = async (jid, content) => {
        const { img } = await Utils_1.generateProfilePicture('url' in content ? content.url.toString() : content);
        await query({
            tag: 'iq',
            attrs: {
                to: WABinary_1.jidNormalizedUser(jid),
                type: 'set',
                xmlns: 'w:profile:picture'
            },
            content: [
                {
                    tag: 'picture',
                    attrs: { type: 'image' },
                    content: img
                }
            ]
        });
    };
    const fetchBlocklist = async () => {
        const result = await query({
            tag: 'iq',
            attrs: {
                xmlns: 'blocklist',
                to: WABinary_1.S_WHATSAPP_NET,
                type: 'get'
            }
        });
        console.log('blocklist', result);
    };
    const updateBlockStatus = async (jid, action) => {
        await query({
            tag: 'iq',
            attrs: {
                to: WABinary_1.S_WHATSAPP_NET,
                type: 'set'
            },
            content: [
                {
                    tag: 'item',
                    attrs: {
                        action,
                        jid
                    }
                }
            ]
        });
    };
    const fetchPrivacySettings = async () => {
        const result = await query({
            tag: 'iq',
            attrs: {
                xmlns: 'privacy',
                to: WABinary_1.S_WHATSAPP_NET,
                type: 'get'
            },
            content: [
                { tag: 'privacy', attrs: {} }
            ]
        });
        const nodes = WABinary_1.getBinaryNodeChildren(result, 'category');
        const settings = nodes.reduce((dict, { attrs }) => {
            dict[attrs.name] = attrs.value;
            return dict;
        }, {});
        return settings;
    };
    const updateAccountSyncTimestamp = async () => {
        await sendNode({
            tag: 'iq',
            attrs: {
                to: WABinary_1.S_WHATSAPP_NET,
                type: 'set',
                xmlns: 'urn:xmpp:whatsapp:dirty',
                id: generateMessageTag(),
            },
            content: [
                {
                    tag: 'clean',
                    attrs: {}
                }
            ]
        });
    };
    const collectionSync = async (collections) => {
        const result = await query({
            tag: 'iq',
            attrs: {
                to: WABinary_1.S_WHATSAPP_NET,
                xmlns: 'w:sync:app:state',
                type: 'set'
            },
            content: [
                {
                    tag: 'sync',
                    attrs: {},
                    content: collections.map(({ name, version }) => ({
                        tag: 'collection',
                        attrs: { name, version: version.toString(), return_snapshot: 'true' }
                    }))
                }
            ]
        });
        const syncNode = WABinary_1.getBinaryNodeChild(result, 'sync');
        const collectionNodes = WABinary_1.getBinaryNodeChildren(syncNode, 'collection');
        return collectionNodes.reduce((dict, node) => {
            const snapshotNode = WABinary_1.getBinaryNodeChild(node, 'snapshot');
            if (snapshotNode) {
                dict[node.attrs.name] = snapshotNode.content;
            }
            return dict;
        }, {});
    };
    const profilePictureUrl = async (jid) => {
        var _a;
        jid = WABinary_1.jidNormalizedUser(jid);
        const result = await query({
            tag: 'iq',
            attrs: {
                to: jid,
                type: 'get',
                xmlns: 'w:profile:picture'
            },
            content: [
                { tag: 'picture', attrs: { type: 'preview', query: 'url' } }
            ]
        });
        const child = WABinary_1.getBinaryNodeChild(result, 'picture');
        return (_a = child === null || child === void 0 ? void 0 : child.attrs) === null || _a === void 0 ? void 0 : _a.url;
    };
    const sendPresenceUpdate = async (type, toJid) => {
        if (type === 'available' || type === 'unavailable') {
            await sendNode({
                tag: 'presence',
                attrs: {
                    name: authState.creds.me.name,
                    type
                }
            });
        }
        else {
            await sendNode({
                tag: 'chatstate',
                attrs: {
                    from: authState.creds.me.id,
                    to: toJid,
                },
                content: [
                    { tag: type, attrs: {} }
                ]
            });
        }
    };
    const presenceSubscribe = (toJid) => (sendNode({
        tag: 'presence',
        attrs: {
            to: toJid,
            id: generateMessageTag(),
            type: 'subscribe'
        }
    }));
    const handlePresenceUpdate = ({ tag, attrs, content }) => {
        let presence;
        const jid = attrs.from;
        const participant = attrs.participant || attrs.from;
        if (tag === 'presence') {
            presence = {
                lastKnownPresence: attrs.type === 'unavailable' ? 'unavailable' : 'available',
                lastSeen: attrs.t ? +attrs.t : undefined
            };
        }
        else if (Array.isArray(content)) {
            const [firstChild] = content;
            let type = firstChild.tag;
            if (type === 'paused') {
                type = 'available';
            }
            presence = { lastKnownPresence: type };
        }
        else {
            logger.error({ tag, attrs, content }, 'recv invalid presence node');
        }
        if (presence) {
            ev.emit('presence.update', { id: jid, presences: { [participant]: presence } });
        }
    };
    const processSyncActions = (actions) => {
        var _a, _b, _c, _d;
        const updates = {};
        const contactUpdates = {};
        const msgDeletes = [];
        for (const { action, index: [_, id, msgId, fromMe] } of actions) {
            const update = { id };
            if (action === null || action === void 0 ? void 0 : action.muteAction) {
                update.mute = ((_a = action.muteAction) === null || _a === void 0 ? void 0 : _a.muted) ?
                    Utils_1.toNumber(action.muteAction.muteEndTimestamp) :
                    undefined;
            }
            else if (action === null || action === void 0 ? void 0 : action.archiveChatAction) {
                update.archive = !!((_b = action.archiveChatAction) === null || _b === void 0 ? void 0 : _b.archived);
            }
            else if (action === null || action === void 0 ? void 0 : action.markChatAsReadAction) {
                update.unreadCount = !!((_c = action.markChatAsReadAction) === null || _c === void 0 ? void 0 : _c.read) ? 0 : -1;
            }
            else if (action === null || action === void 0 ? void 0 : action.clearChatAction) {
                msgDeletes.push({
                    remoteJid: id,
                    id: msgId,
                    fromMe: fromMe === '1'
                });
            }
            else if (action === null || action === void 0 ? void 0 : action.contactAction) {
                contactUpdates[id] = {
                    ...(contactUpdates[id] || {}),
                    id,
                    name: action.contactAction.fullName
                };
            }
            else if (action === null || action === void 0 ? void 0 : action.pushNameSetting) {
                authState.creds.me.name = (_d = action === null || action === void 0 ? void 0 : action.pushNameSetting) === null || _d === void 0 ? void 0 : _d.name;
                ev.emit('auth-state.update', authState);
            }
            else {
                logger.warn({ action, id }, 'unprocessable update');
            }
            if (Object.keys(update).length > 1) {
                updates[update.id] = {
                    ...(updates[update.id] || {}),
                    ...update
                };
            }
        }
        if (Object.values(updates).length) {
            ev.emit('chats.update', Object.values(updates));
        }
        if (Object.values(contactUpdates).length) {
            ev.emit('contacts.upsert', Object.values(contactUpdates));
        }
        if (msgDeletes.length) {
            ev.emit('messages.delete', { keys: msgDeletes });
        }
    };
    const appPatch = async (patchCreate) => {
        const name = patchCreate.type;
        try {
            await resyncState(name, false);
        }
        catch (error) {
            logger.info({ name, error: error.stack }, 'failed to sync state from version, trying from scratch');
            await resyncState(name, true);
        }
        const { patch, state } = await Utils_1.encodeSyncdPatch(patchCreate, authState);
        const initial = await authState.keys.getAppStateSyncVersion(name);
        // temp: verify it was encoded correctly
        const result = await Utils_1.decodePatches({ syncds: [{ ...patch, version: { version: state.version }, }], name }, initial, authState);
        const node = {
            tag: 'iq',
            attrs: {
                to: WABinary_1.S_WHATSAPP_NET,
                type: 'set',
                xmlns: 'w:sync:app:state'
            },
            content: [
                {
                    tag: 'sync',
                    attrs: {},
                    content: [
                        {
                            tag: 'collection',
                            attrs: {
                                name,
                                version: (state.version - 1).toString(),
                                return_snapshot: 'false'
                            },
                            content: [
                                {
                                    tag: 'patch',
                                    attrs: {},
                                    content: WAProto_1.proto.SyncdPatch.encode(patch).finish()
                                }
                            ]
                        }
                    ]
                }
            ]
        };
        await query(node);
        await authState.keys.setAppStateSyncVersion(name, state);
        ev.emit('auth-state.update', authState);
        if (config.emitOwnEvents) {
            processSyncActions(result.newMutations);
        }
    };
    const chatModify = (mod, jid, lastMessages) => {
        const patch = Utils_1.chatModificationToAppPatch(mod, jid, lastMessages);
        return appPatch(patch);
    };
    const fetchAppState = async (name, fromVersion) => {
        const result = await query({
            tag: 'iq',
            attrs: {
                type: 'set',
                xmlns: 'w:sync:app:state',
                to: WABinary_1.S_WHATSAPP_NET
            },
            content: [
                {
                    tag: 'sync',
                    attrs: {},
                    content: [
                        {
                            tag: 'collection',
                            attrs: {
                                name,
                                version: fromVersion.toString(),
                                return_snapshot: 'false'
                            }
                        }
                    ]
                }
            ]
        });
        return result;
    };
    const resyncState = async (name, fromScratch) => {
        let state = fromScratch ? undefined : await authState.keys.getAppStateSyncVersion(name);
        if (!state)
            state = { version: 0, hash: Buffer.alloc(128), mutations: [] };
        logger.info(`resyncing ${name} from v${state.version}`);
        const result = await fetchAppState(name, state.version);
        const decoded = Utils_1.extractSyncdPatches(result); // extract from binary node
        const { newMutations, state: newState } = await Utils_1.decodePatches(decoded, state, authState, true);
        await authState.keys.setAppStateSyncVersion(name, newState);
        logger.info(`synced ${name} to v${newState.version}`);
        processSyncActions(newMutations);
        ev.emit('auth-state.update', authState);
    };
    ws.on('CB:presence', handlePresenceUpdate);
    ws.on('CB:chatstate', handlePresenceUpdate);
    ws.on('CB:notification,type:server_sync', (node) => {
        const update = WABinary_1.getBinaryNodeChild(node, 'collection');
        if (update) {
            resyncState(update.attrs.name, false);
        }
    });
    ev.on('connection.update', ({ connection }) => {
        if (connection === 'open') {
            sendPresenceUpdate('available');
            fetchBlocklist();
            fetchPrivacySettings();
        }
    });
    return {
        ...sock,
        appPatch,
        sendPresenceUpdate,
        presenceSubscribe,
        profilePictureUrl,
        onWhatsApp,
        fetchBlocklist,
        fetchPrivacySettings,
        fetchStatus,
        updateProfilePicture,
        updateBlockStatus,
        resyncState,
        chatModify,
    };
};
exports.makeChatsSocket = makeChatsSocket;
