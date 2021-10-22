/// <reference types="node" />
import { AuthenticationState, WAPatchCreate, ChatMutation, WAPatchName, LTHashState, ChatModification } from "../Types";
import { proto } from '../../WAProto';
import { BinaryNode } from '../WABinary';
export declare const mutationKeys: (keydata: Uint8Array) => {
    indexKey: Buffer;
    valueEncryptionKey: Buffer;
    valueMacKey: Buffer;
    snapshotMacKey: Buffer;
    patchMacKey: Buffer;
};
export declare const generateSnapshotMac: (lthash: Uint8Array, version: number, name: WAPatchName, key: Buffer) => Buffer;
export declare const encodeSyncdPatch: ({ type, index, syncAction, apiVersion }: WAPatchCreate, { creds: { myAppStateKeyId }, keys }: AuthenticationState) => Promise<{
    patch: proto.ISyncdPatch;
    state: {
        version: number;
        hash: Buffer;
        mutations: ChatMutation[];
    };
}>;
export declare const decodeSyncdPatch: (msg: proto.ISyncdPatch, name: WAPatchName, { keys }: AuthenticationState, validateMacs?: boolean) => Promise<{
    mutations: ChatMutation[];
}>;
export declare const extractSyncdPatches: (result: BinaryNode) => {
    syncds: proto.ISyncdPatch[];
    name: WAPatchName;
};
export declare const decodePatches: ({ syncds, name }: ReturnType<typeof extractSyncdPatches>, initial: LTHashState, auth: AuthenticationState, validateMacs?: boolean) => Promise<{
    newMutations: ChatMutation[];
    state: LTHashState;
}>;
export declare const chatModificationToAppPatch: (mod: ChatModification, jid: string, lastMessages: Pick<proto.IWebMessageInfo, 'key' | 'messageTimestamp'>[]) => WAPatchCreate;
