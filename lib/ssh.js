const path = require('path')
const home = require('os').homedir()

const TUMU_PRIVATE_KEY_PATH = process.env.TUMU_PRIVATE_KEY_PATH
  ? path.resolve(process.cwd(), process.env.TUMU_PRIVATE_KEY_PATH)
  : `${home}/.ssh/id_rsa`
const TUMU_PUBLIC_KEY_PATH = process.env.TUMU_PUBLIC_KEY_PATH
  ? path.resolve(process.cwd(), process.env.TUMU_PUBLIC_KEY_PATH)
  : `${home}/.ssh/id_rsa.pub`

module.exports = {
  TUMU_PRIVATE_KEY_PATH,
  TUMU_PUBLIC_KEY_PATH
}