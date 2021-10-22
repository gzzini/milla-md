import { Boom } from '@hapi/boom';
import { AuthenticationState } from "../Types";
import { BinaryNode as BinaryNodeM } from '../WABinary';
import { proto } from '../../WAProto';
export declare const decodeMessageStanza: (stanza: BinaryNodeM, auth: AuthenticationState) => Promise<{
    msgId: string;
    chatId: string;
    author: string;
    from: string;
    timestamp: number;
    participant: string;
    recipient: string;
    pushname: string;
    successes: proto.Message[];
    failures: {
        error: Boom;
    }[];
}>;
