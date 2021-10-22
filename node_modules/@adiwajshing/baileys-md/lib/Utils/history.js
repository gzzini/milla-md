"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadHistory = void 0;
const messages_media_1 = require("./messages-media");
const WAProto_1 = require("../../WAProto");
const util_1 = require("util");
const zlib_1 = require("zlib");
const inflatePromise = util_1.promisify(zlib_1.inflate);
const downloadHistory = async (msg) => {
    const stream = await messages_media_1.downloadContentFromMessage(msg, 'history');
    let buffer = Buffer.from([]);
    for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
    }
    // decompress buffer
    buffer = await inflatePromise(buffer);
    const syncData = WAProto_1.proto.HistorySync.decode(buffer);
    return syncData;
};
exports.downloadHistory = downloadHistory;
