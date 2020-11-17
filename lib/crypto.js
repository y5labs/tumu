// Use an ssh public key to encrypt content that can only be unencrypted with the ssh private key
// Internally shares an AES key for the main content.

const sshpk = require('sshpk')
const fs = require('fs').promises
const {
  publicEncrypt,
  privateDecrypt,
  generateKeySync,
  randomFillSync,
  createCipheriv,
  createDecipheriv
} = require('crypto')

const { TUMU_PUBLIC_KEY_PATH, TUMU_PRIVATE_KEY_PATH } = require('./ssh')

module.exports = {
  encrypt: async content => {
    const pub_id = await fs.readFile(TUMU_PUBLIC_KEY_PATH)
    const pub_pem = sshpk.parseKey(pub_id, 'ssh').toBuffer('pkcs8')

    const key_generated = generateKeySync('aes', { length: 256 }).export()
    const header_encrypted = publicEncrypt(pub_pem, key_generated)

    const payload = Buffer.from(content, 'utf8')

    const iv_generated = randomFillSync(new Uint8Array(16))
    const cipher = createCipheriv('aes-256-cbc', key_generated, iv_generated)
    const body_encrypted = Buffer.concat([cipher.update(payload), cipher.final()])

    return [header_encrypted, body_encrypted, Buffer.from(iv_generated)]
      .map(x => x.toString('hex')).join('.')
  },
  decrypt: async content => {
    const priv_id = await fs.readFile(TUMU_PRIVATE_KEY_PATH)
    const priv_pem = sshpk.parsePrivateKey(priv_id, 'ssh').toBuffer('pkcs8')

    const [header_hex, body_hex, iv_hex] = content.split('.')

    const decipher = createDecipheriv(
      'aes-256-cbc',
      privateDecrypt(priv_pem, Buffer.from(header_hex, 'hex')),
      Uint8Array.from(Buffer.from(iv_hex, 'hex'))
    )

    return Buffer.concat([decipher.update(body_hex, 'hex'), decipher.final()]).toString('utf8')
  }
}
