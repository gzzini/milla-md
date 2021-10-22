var PREFIX = "."

let sock
let publicMode = false

export function init(_sock) {
    sock = _sock
}

export async function handleMsgUpsert({ messages }) {
    const msg = messages[0]
    if (!msg.message) return

    const fulltext = msg.message.conversation
    const prefixEscape = PREFIX.replace("]", "\\]").replace("\\", "\\\\")
    const group = new RegExp(`^[${prefixEscape}](\\w+)\\s*(.*)`).exec(fulltext)

    if (!group) return

    const command = group[1]
    const rawargs = group[2]

    console.log(`handling command '${command}'`)

    if (!publicMode && !msg.key.fromMe) return

    switch (command) {
    case "echo":
        await sock.sendMessage(msg.key.remoteJid, { text: "oi" })
        break
    case "pub":
        publicMode = true
        await sock.sendMessage(msg.key.remoteJid, { text: "public mode on" })
    case "self":
        publicMode = false
        await sock.sendMessage(msg.key.remoteJid, { text: "public mode off" })
    case "e":
        let result
        try { result = eval(rawargs) }
        catch (e) { result = e }

        await sock.sendMessage(msg.key.remoteJid, { text: result })
        break
    // TODO: add your case here
    }
}
