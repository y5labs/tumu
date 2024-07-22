import Hub from '../lib/hub.js'
import Lifecycle from '../lib/lifecycle.js'
import JWT from '../lib/jwt.js'
import JWTDist from '../lib/jwt-dist.js'
// import PG from '../lib/pg.js'
// import PGMigrate from '../lib/pg-migrate.js'
import Koa from '../lib/koa.js'
// import { createServer } from 'xy-websocket'
import AuthDist from '../src/auth-dist.js'

process.on('unhandledRejection', e => {
  console.error('unhandledRejection', e)
})

const ctx = {
  app_name: process.env.APP_NAME ?? 'tumu'
}
const use = async m => Object.assign(ctx, await m(ctx))
await use(Hub)
await use(Lifecycle)
await use(JWT)
await use(JWTDist)
// await use(PG)
// await use(
//   PGMigrate({
//     dir_path: process.env.MIGRATIONS_DIR_NAME,
//     table_name: process.env.MIGRATIONS_TABLE_NAME
//   })
// )
await use(Koa)
// await use(() => ({ ws: createServer() }))
await use(AuthDist)

const { hub } = ctx

await hub.emit('ready')
