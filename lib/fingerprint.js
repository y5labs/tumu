import crypto from 'crypto'
import base32encode from 'base32-encode'

export default public_key => {
  const key = crypto.createPublicKey(public_key)
  const buf = key.export({ type: 'spki', format: 'der' })
  const hash = crypto.createHash('sha256').update(buf).digest()
  const base32 = base32encode(hash.subarray(0, 30), 'RFC3548')

  let kid = ''
  for (let i = 0; i < 48; ++i) {
    kid += base32[i]
    if (i % 4 === 3 && i + 1 !== 48) kid += ':'
  }

  return kid
}
