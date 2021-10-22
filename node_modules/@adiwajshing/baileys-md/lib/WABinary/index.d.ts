/// <reference types="node" />
/**
 * the binary node WA uses internally for communication
 *
 * this is manipulated soley as an object and it does not have any functions.
 * This is done for easy serialization, to prevent running into issues with prototypes &
 * to maintain functional code structure
 * */
export declare type BinaryNode = {
    tag: string;
    attrs: {
        [key: string]: string;
    };
    content?: BinaryNode[] | string | Uint8Array;
};
export declare type BinaryNodeAttributes = BinaryNode['attrs'];
export declare type BinaryNodeData = BinaryNode['content'];
export declare const decodeBinaryNode: (data: any) => BinaryNode;
export declare const encodeBinaryNode: (node: BinaryNode) => Uint8Array;
export declare const getBinaryNodeChildren: ({ content }: BinaryNode, childTag: string) => BinaryNode[];
export declare const getBinaryNodeChild: ({ content }: BinaryNode, childTag: string) => BinaryNode;
export declare const getBinaryNodeChildBuffer: (node: BinaryNode, childTag: string) => Uint8Array | Buffer;
export declare const getBinaryNodeChildUInt: (node: BinaryNode, childTag: string, length: number) => number;
export declare const assertNodeErrorFree: (node: BinaryNode) => void;
export * from './jid-utils';
export { Binary } from '../../WABinary/Binary';
