import mutunga from 'http-mutunga'
import Koa from 'koa'
import responseTime from 'koa-response-time'
import compress from 'koa-compress'
import cors from '@koa/cors'
import serve from 'koa-static'
import logger from 'koa-logger'
import onerror from './onerror.js'
import conditional from 'koa-conditional-get'
import etag from 'koa-etag'
import helmet from 'koa-helmet'
import { koaBody } from 'koa-body'
import json from 'koa-json'
import Router from '@koa/router'
import port_from_string from './port.js'

export default async ({ app_name, hub, startup }) => {
  const release = startup.retain()
  const app = new Koa()
  const router = new Router()
  const httpServer = mutunga(app.callback())
  httpServer.setTimeout(5 * 60 * 1000)

  app.use(responseTime({ hrtime: true }))
  app.use(
    cors({
      origin(ctx) {
        return ctx.get('Origin') || '*'
      }
    })
  )
  app.use(compress())
  app.use(logger())
  app.use(onerror())
  app.use(conditional())
  app.use(etag())
  app.use(helmet())
  app.use(koaBody())
  app.use(json({ pretty: process.env.NODE_ENV != 'production' }))
  app.use(router.routes())
  app.use(router.allowedMethods())
  app.proxy = true

  const port = process.env.KOA_PORT ?? process.env.NODE_ENV == 'production' ? 8080 : port_from_string(app_name)

  hub.on('ready', () => {
    httpServer.listen(port, async () => {
      release()
      const { address, port } = httpServer.address()
      hub.on('shutdown', () => httpServer.terminate())
      console.log(`${app_name} @ ${address}:${port}`)
    })
  })

  return { koa: { app, router, serve, httpServer } }
}
