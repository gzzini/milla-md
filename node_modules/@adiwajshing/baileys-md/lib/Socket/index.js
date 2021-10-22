"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Defaults_1 = require("../Defaults");
const chats_1 = require("./chats");
// export the last socket layer
const makeWASocket = (config) => (chats_1.makeChatsSocket({
    ...Defaults_1.DEFAULT_CONNECTION_CONFIG,
    ...config
}));
exports.default = makeWASocket;
