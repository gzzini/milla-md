"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateMessageID = exports.promiseTimeout = exports.delayCancellable = exports.delay = exports.debouncedTimeout = exports.unixTimestampSeconds = exports.shallowChanges = exports.toNumber = exports.encodeBigEndian = exports.encodeInt = exports.generateRegistrationId = exports.encodeWAMessage = exports.unpadRandomMax16 = exports.writeRandomPadMax16 = exports.BufferJSON = exports.Browsers = void 0;
const boom_1 = require("@hapi/boom");
const crypto_1 = require("crypto");
const os_1 = require("os");
const WAProto_1 = require("../../WAProto");
const WABinary_1 = require("../WABinary");
const PLATFORM_MAP = {
    'aix': 'AIX',
    'darwin': 'Mac OS',
    'win32': 'Windows',
    'android': 'Android'
};
exports.Browsers = {
    ubuntu: browser => ['Ubuntu', browser, '18.04'],
    macOS: browser => ['Mac OS', browser, '10.15.3'],
    baileys: browser => ['Baileys', browser, '4.0.0'],
    /** The appropriate browser based on your OS & release */
    appropriate: browser => [PLATFORM_MAP[os_1.platform()] || 'Ubuntu', browser, os_1.release()]
};
exports.BufferJSON = {
    replacer: (k, value) => {
        if (Buffer.isBuffer(value) || value instanceof Uint8Array || (value === null || value === void 0 ? void 0 : value.type) === 'Buffer') {
            return { type: 'Buffer', data: Buffer.from((value === null || value === void 0 ? void 0 : value.data) || value).toString('base64') };
        }
        return value;
    },
    reviver: (_, value) => {
        if (typeof value === 'object' && !!value && (value.buffer === true || value.type === 'Buffer')) {
            const val = value.data || value.value;
            return typeof val === 'string' ? Buffer.from(val, 'base64') : Buffer.from(val);
        }
        return value;
    }
};
const writeRandomPadMax16 = function (e) {
    function r(e, t) {
        for (var r = 0; r < t; r++)
            e.writeUint8(t);
    }
    var t = crypto_1.randomBytes(1);
    r(e, 1 + (15 & t[0]));
    return e;
};
exports.writeRandomPadMax16 = writeRandomPadMax16;
const unpadRandomMax16 = (e) => {
    const t = new Uint8Array(e);
    if (0 === t.length) {
        throw new Error('unpadPkcs7 given empty bytes');
    }
    var r = t[t.length - 1];
    if (r > t.length) {
        throw new Error(`unpad given ${t.length} bytes, but pad is ${r}`);
    }
    return new Uint8Array(t.buffer, t.byteOffset, t.length - r);
};
exports.unpadRandomMax16 = unpadRandomMax16;
const encodeWAMessage = (message) => (Buffer.from(exports.writeRandomPadMax16(new WABinary_1.Binary(WAProto_1.proto.Message.encode(message).finish())).readByteArray()));
exports.encodeWAMessage = encodeWAMessage;
const generateRegistrationId = () => (Uint16Array.from(crypto_1.randomBytes(2))[0] & 0x3fff);
exports.generateRegistrationId = generateRegistrationId;
const encodeInt = (e, t) => {
    for (var r = t, a = new Uint8Array(e), i = e - 1; i >= 0; i--) {
        a[i] = 255 & r;
        r >>>= 8;
    }
    return a;
};
exports.encodeInt = encodeInt;
const encodeBigEndian = (e, t = 4) => {
    let r = e;
    let a = new Uint8Array(t);
    for (let i = t - 1; i >= 0; i--) {
        a[i] = 255 & r;
        r >>>= 8;
    }
    return a;
};
exports.encodeBigEndian = encodeBigEndian;
const toNumber = (t) => ((typeof t === 'object' && 'toNumber' in t) ? t.toNumber() : t);
exports.toNumber = toNumber;
function shallowChanges(old, current, { lookForDeletedKeys }) {
    let changes = {};
    for (let key in current) {
        if (old[key] !== current[key]) {
            changes[key] = current[key] || null;
        }
    }
    if (lookForDeletedKeys) {
        for (let key in old) {
            if (!changes[key] && old[key] !== current[key]) {
                changes[key] = current[key] || null;
            }
        }
    }
    return changes;
}
exports.shallowChanges = shallowChanges;
/** unix timestamp of a date in seconds */
const unixTimestampSeconds = (date = new Date()) => Math.floor(date.getTime() / 1000);
exports.unixTimestampSeconds = unixTimestampSeconds;
const debouncedTimeout = (intervalMs = 1000, task = undefined) => {
    let timeout;
    return {
        start: (newIntervalMs, newTask) => {
            task = newTask || task;
            intervalMs = newIntervalMs || intervalMs;
            timeout && clearTimeout(timeout);
            timeout = setTimeout(task, intervalMs);
        },
        cancel: () => {
            timeout && clearTimeout(timeout);
            timeout = undefined;
        },
        setTask: (newTask) => task = newTask,
        setInterval: (newInterval) => intervalMs = newInterval
    };
};
exports.debouncedTimeout = debouncedTimeout;
const delay = (ms) => exports.delayCancellable(ms).delay;
exports.delay = delay;
const delayCancellable = (ms) => {
    const stack = new Error().stack;
    let timeout;
    let reject;
    const delay = new Promise((resolve, _reject) => {
        timeout = setTimeout(resolve, ms);
        reject = _reject;
    });
    const cancel = () => {
        clearTimeout(timeout);
        reject(new boom_1.Boom('Cancelled', {
            statusCode: 500,
            data: {
                stack
            }
        }));
    };
    return { delay, cancel };
};
exports.delayCancellable = delayCancellable;
async function promiseTimeout(ms, promise) {
    if (!ms)
        return new Promise(promise);
    const stack = new Error().stack;
    // Create a promise that rejects in <ms> milliseconds
    let { delay, cancel } = exports.delayCancellable(ms);
    const p = new Promise((resolve, reject) => {
        delay
            .then(() => reject(new boom_1.Boom('Timed Out', {
            statusCode: 408,
            data: {
                stack
            }
        })))
            .catch(err => reject(err));
        promise(resolve, reject);
    })
        .finally(cancel);
    return p;
}
exports.promiseTimeout = promiseTimeout;
// generate a random ID to attach to a message
const generateMessageID = () => 'BAE5' + crypto_1.randomBytes(6).toString('hex').toUpperCase();
exports.generateMessageID = generateMessageID;
