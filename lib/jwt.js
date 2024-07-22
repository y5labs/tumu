import jwt from 'jsonwebtoken'

// openssl ecparam -name prime256v1 -genkey -noout -out privatekey.pem
// openssl ec -in privatekey.pem -pubout > publickey.pem
export default async ({ }) => {
  return {
    jwt: {
      sign: payload => jwt.sign(payload, process.env.XY_PRIVATE_KEY, { algorithm: 'ES256',  }),
      verify: token =>  jwt.verify(token, process.env.XY_PUBLIC_KEY, { algorithms: ['ES256'] })
    }
  }
}
