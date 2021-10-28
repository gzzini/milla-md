const chalk = require('chalk')
const axios = require('axios')
const cfonts = require('cfonts')

exports.color = color = (text, color) => {
    return !color ? chalk.green(text) : chalk.keyword(color)(text)
}

exports.getRandom = getRandom = (ext) => {
	return `${Math.floor(Math.random() * 10000)}${ext}`
}

exports.getBuffer = getBuffer = async (url, options) => {
	try {
		options ? options : {}
		const res = await axios({
			method: "get",
			url,
			headers: {
				'DNT': 1,
				'Upgrade-Insecure-Request': 1
			},
			...options,
			responseType: 'arraybuffer'
		})
		return res.data
	} catch (e) {
		console.log(`Error : ${e}`)
	}
}

exports.banner = banner = cfonts.render(('MILLA|MULTI-DEVICE'), {
	font: '3d',
    colors: ['#f36fc8', 'white'],
    align: 'center',
    lineHeight: 3
});