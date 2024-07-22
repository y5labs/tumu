import jwt from 'jsonwebtoken'
import fingerprint from './fingerprint.js'

const public_key = process.env.TOKEN_PUBLIC_KEY
const private_key = process.env.TOKEN_PRIVATE_KEY
const algorithm = process.env.TOKEN_ALGORITHM

const keyid = fingerprint(public_key)

const header = {
  alg: algorithm,
  typ: 'JWT',
  kid: keyid
}

export default async () => {
  return {
    jwt_dist: {
      sign: ({ issuer, account, service, access }) => {
        const claim_set = {
          iss: issuer,
          sub: account,
          aud: service,
          exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30, // 30 days
          nbf: Math.floor(Date.now() / 1000) - 10,
          iat: Math.floor(Date.now() / 1000),
          jti: Math.random().toString(36).substring(7),
          access
        }
        return jwt.sign(claim_set, private_key, { algorithm, keyid, header })
      },
      verify: token => jwt.verify(token, public_key, { algorithms: [algorithm] })
    }
  }
}
