import { proto } from '../../WAProto';
import type { AuthenticationState, SocketConfig, SignalKeyStore, AuthenticationCreds, KeyPair, LTHashState } from "../Types";
import { BinaryNode } from '../WABinary';
export declare const generateLoginNode: (userJid: string, config: Pick<SocketConfig, 'version' | 'browser'>) => Uint8Array;
export declare const generateRegistrationNode: ({ registrationId, signedPreKey, signedIdentityKey }: Pick<AuthenticationCreds, 'registrationId' | 'signedPreKey' | 'signedIdentityKey'>, config: Pick<SocketConfig, 'version' | 'browser'>) => Uint8Array;
export declare const initInMemoryKeyStore: ({ preKeys, sessions, senderKeys, appStateSyncKeys, appStateVersions }?: {
    preKeys?: {
        [k: number]: KeyPair;
    };
    sessions?: {
        [k: string]: any;
    };
    senderKeys?: {
        [k: string]: any;
    };
    appStateSyncKeys?: {
        [k: string]: proto.IAppStateSyncKeyData;
    };
    appStateVersions?: {
        [k: string]: LTHashState;
    };
}) => SignalKeyStore;
export declare const initAuthState: () => AuthenticationState;
export declare const configureSuccessfulPairing: (stanza: BinaryNode, { advSecretKey, signedIdentityKey, signalIdentities }: Pick<AuthenticationCreds, 'advSecretKey' | 'signedIdentityKey' | 'signalIdentities'>) => {
    creds: Partial<AuthenticationCreds>;
    reply: BinaryNode;
};
