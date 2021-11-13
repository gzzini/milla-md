const fs = require("fs")
const { default: makeWASocket, BufferJSON, initInMemoryKeyStore, DisconnectReason, MessageType,
    MessageOptions, MimeType } = require("@adiwajshing/baileys-md")
const config = require('./config/config.json')
const { banner, getBuffer, getRandom } = require('./lib/functions')

const prefix = config.prefix

async function start() {
    let milla = undefined;

    const connect = () => {
        let status = undefined;
        try {
            const value = JSON.parse(fs.readFileSync('./config/session.json', { encoding: 'utf-8' }), BufferJSON.reviver);
            status = {
                creds: value.creds,
                keys: initInMemoryKeyStore(value.keys)
            };
        } catch { }
        return status;
    };

    const saveConnection = (status) => {
        status = status || (milla === null || milla === void 0 ? void 0 : milla.authState);
        fs.writeFileSync('./config/session.json',
            JSON.stringify(status, BufferJSON.replacer, 2));
    };

    const starts = () => {
        const client = makeWASocket({
            auth: connect(),
            printQRInTerminal: true,
        })
        console.log(banner.string)
        return client;
    }

    milla = starts();

    milla.ev.on('messages.upsert', async ({ messages }) => {
        console.log(JSON.stringify(messages, undefined, 2))
        try {
            // Reading Messages //
            msg = messages[0]
            if (!msg.message) return
            if (msg.key.fromMe) return
            const type = Object.keys(msg.message)[0]
            // body  = msg.message?.conversation.startsWith(prefix) || msg.message?.extendedTextMessage?.text.startsWith(prefix) || msg.message?.imageMessage?.caption.startsWith(prefix) || msg.message?.videoMessage?.caption.startsWith(prefix) || msg.message?.viewOnceMessage?.message?.imageMessage?.caption.startsWith(prefix) || msg.message?.viewOnceMessage?.message?.videoMessage?.caption.startsWith(prefix) || msg.message?.templateMessage?.hydratedTemplate?.hydratedTitleText || msg.message?.buttonsResponseMessage?.selectedDisplayText || msg.message?.listResponseMessage?.title || " ";
            body = (type === 'conversation' && msg.message.conversation.startsWith(prefix)) ? msg.message.conversation : (type == 'imageMessage') && msg.message[type].caption.startsWith(prefix) ? msg.message[type].caption : (type == 'videoMessage') && msg.message[type].caption.startsWith(prefix) ? msg.message[type].caption : (type == 'extendedTextMessage') && msg.message[type].text.startsWith(prefix) ? msg.message[type].text : (type == 'listResponseMessage') && msg.message[type].singleSelectReply.selectedRowId ? msg.message[type].singleSelectReply.selectedRowId : (type == 'buttonsResponseMessage') && msg.message[type].selectedButtonId ? msg.message[type].selectedButtonId : ""
            button = (type == 'buttonsResponseMessage') ? msg.message.buttonsResponseMessage.selectedDisplayText : ''
            chats = (type === 'conversation') ? msg.message.conversation : (type === 'extendedTextMessage') ? msg.message.extendedTextMessage.text : ''
            selectedButton = (type == 'buttonsResponseMessage') ? msg.message.buttonsResponseMessage.selectedButtonId : ''
            responseButton = (type == 'listResponseMessage') ? msg.message.listResponseMessage.title : ''
            const from = msg.isGroup ? msg.participant : msg.key.fromMe ? milla.user.jid : msg.key.remoteJid
            const isGroup = from.endsWith('@g.us')
            const sender = isGroup ? msg.participant : msg.key.remoteJid
            const command = body.slice(1).trim().split(/ +/).shift().toLowerCase()
            // Reading Messages //

            // Important //
            const ownerNumber = [`${config.dev}`]
            const isOwner = ownerNumber.includes(sender)
            const pushname = msg.message.pushname
            const args = body.trim().split(/ +/).slice(1)
            const q = args.join(" ")
            // Important //

            const isUrl = (url) => {
                return url.match(new RegExp(/https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&/=]*)/, 'gi'))
            }

            const reply = (string) => {
                milla.sendMessage(from, { text: string })
            }

            const sendPhoto = (imageDir, caption) => {
                milla.sendMessage(from, {
                    image: fs.readFileSync(imageDir),
                    caption: caption
                })
            }

            const textButtons = (firstId, firstText, secondId, secondText, content) => {
                var buttonsContent = [
                    { buttonId: firstId, buttonText: { displayText: firstText }, type: 1 },
                    { buttonId: secondId, buttonText: { displayText: secondText }, type: 1 }
                ]

                var msgContent = {
                    contentText: content,
                    footerText: 'Milla - Multi Device',
                    buttons: buttonsContent,
                    headerType: 1
                }

                return msgContent
            }

            switch (command) {

                case 'menu':
                    if (!isOwner) return reply('Opa, estou em fases de testes ainda!')
                    await reply(`${pushname}`)
                break

                case 'imagem':
                    await sendPhoto('./assets/logo.png', 'Oi! Isso é um teste de envio de imagem.')
                break

                case 'download':
                    if(args == 'story') {
                        let username = args[1]
                        hx.igstory(username)
						.then(async (result) => {
							for (let i of result.medias) {
								if (i.url.includes('mp4')) {
									const jays = await getBuffer(i.url)
									await milla.sendMessage(from, {
                                        video: jays,
                                        quoted: msg
                                    })
                                    reply('Prontinho.')
								} else {
									const jays = await getBuffer(i.url)
									await milla.sendMessage(from, {
                                        video: jays,
                                        quoted: msg
                                    })
                                    reply('Prontinho.')
								}
							}
						});
                    }
                break

                case 'buttons':
                    await milla.sendMessage(from, {
                        buttons: {
                            contentText: "Teste",
                            footerText: "MillaBot",
                            buttons: [
                                {
                                    buttonId: "teste1",
                                    buttonText: {
                                        displayText: "MP3 (audio)"
                                    },
                                    type: 1
                                },
                                {
                                    buttonId: "teste2",
                                    buttonText: {
                                        displayText: "MP4 (video)"
                                    },
                                    type: 1
                                }
                            ],
                            headerType: 1
                        }
                    })
                break

                case 'list':
                    const lista = {
                        buttonText: 'button.buttonText',
                        description: 'button.description',
                        sections: [{//início
                            "title": "Menus",
                            "rows": [{
                                "title": "Sobre a Milla",
                                "rowId": "#about"
                            },
                            {
                                "title": "Novidades da Versão (25/09/21)",
                                "rowId": "#logs"
                            }]
                        }],
                        listType: 1
                    }
                    await milla.sendMessage(from, { list: lista })
                    break
            }

        } catch (e) {
            console.log(e)
        }

    })

    milla.ev.on('connection.update', (update) => {
        var _a, _b;
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            // reconnect if not logged out
            if (lastDisconnect.error) {
                milla = starts();
            }
            else {
                console.log('connection closed');
            }
        }
        console.log('connection update', update.connection);
        
    });
    // listen for when the auth state is updated
    // it is imperative you save this data, it affects the signing keys you need to have conversations
    milla.ev.on('auth-state.update', saveConnection)
}

start()
