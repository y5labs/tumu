const inject = require('seacreature/lib/inject')
const Hub = require('seacreature/lib/hub')
const pjson = require('../package.json')
const now = () => new Date().valueOf()

inject('ctx', ({ log, hub }) => {
  let isobserving = Boolean(process.env.OBSERVATIONS_ENABLED)
  let observation = {}
  const noop = () => {}
  const push = (topic, context) => {
    if (!Array.isArray(observation[topic])) observation[topic] = []
    observation[topic].push(context)
  }
  const publish = context => {
    if (context) observation = { ...observation, ...context }
    hub.emit('observation', observation)
    observation = {}
  }
  const observe = context => {
    if (isobserving) observation = { ...observation, ...context }
  }
  observe.isobserving = () => isobserving
  if (isobserving) {
    observe.push = push
    observe.publish = publish
  }
  else {
    observe.push = noop
    observe.publish = noop
  }
  hub.on('observe.enable', async () => {
    await log('observations enabled')
    isobserving = true
    observe.push = push
    observe.publish = publish
  })
  hub.on('observe.disable', async () => {
    await log('observations disabled')
    isobserving = true
    observe.push = push
    observe.publish = publish
  })
  return { observe }
})

inject('command.observe', async ({ args, observe, log, hub }) => {
  if (args.length == 0)
    await log(`Observations are ${observe.isobserving()
      ? 'enabled'
      : 'disabled'}`)
  else if (args[0] == 'enable') await hub.emit('observe.enable')
  else if (args[0] == 'disable') await hub.emit('observe.disable')
})

inject('pod', ({ app, observe, hub }) => {
  app.use((req, res, next) => {
    if (!observe.isobserving()) return next()
    observe({
      app: `${pjson.name}@${pjson.version}`,
      event: 'express',
      request: {
        host: req.hostname,
        original_url: req.originalUrl,
        remote_addr: req.ip,
        secure: req.secure,
        method: req.method,
        scheme: req.protocol,
        path: req.path,
        query: req.query,
        http_version: `HTTP/${req.httpVersion}`,
        fresh: req.fresh,
        xhr: req.xhr,
        x_forwarded_for: req.get('X-Forwarded-For'),
        x_forwarded_proto: req.get('X-Forwarded-Proto'),
        x_forwarded_port: req.get('X-Forwarded-Port'),
        user_agent: req.get('User-Agent'),
        content_type: req.get('Content-Type'),
        accept: req.get('Accept')
      }
    })
    observe.push('timings', { name: 'request_begin', ms: now() })
    res.on('finish', () => {
      const headers = res.getHeaders()
      observe.push('timings', { name: 'request_finish', ms: now() })
      if (req.user) observe({
        user: Object.keys(req.user).reduce((res, k) => {
          const obj = req.user[k]
          if (typeof obj != 'function') res[k] = obj
          return res
        }, {})
      })
      observe.publish({
        time: now(),
        response: {
          status_code: String(res.statusCode),
          content_length: headers['content-length'],
          content_type: headers['content-type'],
          content_encoding: headers['content-encoding']
        }
      })
    })
    next()
  })
  app.get('/lib/observe', (req, res) => res.send(observe.isobserving()))
  app.post('/lib/observe/enable', async (req, res) => {
    await hub.emit('observe.enable')
    res.send(true)
  })
  app.post('/lib/observe/disable', async (req, res) => {
    await hub.emit('observe.disable')
    res.send(false)
  })
})
