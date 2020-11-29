const fetch = require('node-fetch')
const fs = require('fs').promises
const { decrypt } = require('./lib/crypto')
const mutex = require('seacreature/lib/mutex')
const diff_specs = require('./diff_specs')
const engine = require('./engine')
const SparseArray = require('seacreature/analytics/sparsearray')
const Hub = require('seacreature/lib/hub')
const path = require('path')

const TUMU_PORT_START =
  process.env.TUMU_PORT_START
  ? Number(process.env.TUMU_PORT_START)
  : 8080
const TUMU_SPECIFICATION_REFRESH =
  process.env.TUMU_SPECIFICATION_REFRESH
  ? Number(process.env.TUMU_SPECIFICATION_REFRESH)
  : 3e5

const get = async url => {
  if (url.startsWith('http')) {
    const res = await fetch(url)
    if (!res.ok) throw 'Non 200 response'
    return await res.text()
  }
  const file_path = path.resolve(process.cwd(), url)
  return await fs.readFile(file_path, 'utf8')
}

const parse = async content => {
  if (content[0] == '[') return JSON.parse(content)
  return JSON.parse(await decrypt(content))
}

module.exports = async url => {
  if (!url) url = process.env.TUMU_SPECIFICATION

  const port_pool = new SparseArray()
  const port_start = TUMU_PORT_START
  let caddy_log_port = null
  let caddy_refresh = false

  const hub = Hub()

  const apps_mutex = mutex()
  let specs = []

  const apps = new Map()

  hub.on('check_changes', ({ repo, branch }) => {
    for (const app of apps.values()) {
      const spec = app.spec()
      if (spec.repo == repo && spec.branch == branch)
        app.check_changes()
    }
  })

  // TODO: Detect when the instance is restarted and remove?
  hub.on('enable_caddy_logging', ({ port }) => {
    caddy_log_port = port
    caddy_refresh = true
    load()
  })

  // TODO: Detect when the instance is restarted and remove?
  hub.on('subscribe_stdout', ({ worker, spec }) => {
    hub.on('worker.stdout', p => {
      worker.postMessage(JSON.stringify({ e: 'worker.stdout', p }))
    })
  })

  // TODO: Detect when the instance is restarted and remove?
  hub.on('subscribe_stderr', ({ worker, spec }) => {
    hub.on('worker.stderr', p => {
      worker.postMessage(JSON.stringify({ e: 'worker.stderr', p }))
    })
  })

  // TODO: Detect when the instance is restarted and remove?
  hub.on('subscribe_state', ({ worker, spec }) => {
    for (const app of apps.values()) {
      worker.postMessage(JSON.stringify({ e: 'worker.state', p: {
        spec: app.spec(),
        state: app.state()
      } }))
    }
    hub.on('worker.state', p => {
      worker.postMessage(JSON.stringify({ e: 'worker.state', p }))
    })
  })

  const load = async () => {
    const release = await apps_mutex.acquire()
    let new_specs = null
    try {
      new_specs = await parse((await get(url)).trim())
    }
    catch (e) {
      console.error(`Unable to read specifications from ${url}`, e)
      return release()
    }

    try {
      const actions = diff_specs(specs, new_specs)
      specs = new_specs
      for (const [key, spec] of actions.delete.entries()) {
        const app = apps.get(key)
        port_pool.remove(app.port - port_start)
        app.terminate()
        apps.delete(key)
      }
      for (const [key, spec] of actions.create.entries())
        apps.set(key, engine(
          spec,
          port_start + port_pool.add(spec.name),
          hub
        ))
      for (const [key, specs] of actions.change_repo.entries()) {
        const app = apps.get(key)
        app.set_spec(specs[1])
        app.get_code()
      }
      for (const [key, specs] of actions.change_env.entries()) {
        const app = apps.get(key)
        app.set_spec(specs[1])
        app.restart()
      }
      for (const [key, specs] of actions.change_domains.entries())
        apps.get(key).set_spec(specs[1])
      if (actions.change_domains.size > 0
        || actions.create.size > 0
        || actions.delete.size > 0
        || caddy_refresh) {
        caddy_refresh = false
        const reverse_proxies = new Map()
        for (const app of apps.values()) {
          const spec = app.spec()
          if (!spec.domains) continue
          reverse_proxies.set(app.port, spec.domains)
        }
        try {

          const res = await fetch('http://localhost:2019/load', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...(caddy_log_port ? {
                logging: { logs: {
                  default: {
                    writer: { output: 'net', address: `:${caddy_log_port}` },
                    encoder: { format: 'json' },
                    level: 'INFO'
                  }
                } }
              } : {}),
              apps: { http: { servers: { srv0: {
                listen: [':443'],
                routes: Array.from(reverse_proxies.entries(), ([port, domains]) => ({
                  handle: [{
                    handler: 'reverse_proxy',
                    upstreams: [{ dial: `127.0.0.1:${port}` }]
                  }],
                  match: [{ host: domains }],
                  terminal: true
                }))
              } } } }
            })
          })
          if (!res.ok) {
            console.error('Unable to update caddy', await res.text())
            return release()
          }
        }
        catch (e) {
          console.error('Unable to update caddy', e)
          return release()
        }
      }
    }
    catch (e) {
      console.error('Trouble applying new specifications', e)
      return release()
    }

    release()
  }
  await load()

  // setInterval(() => {
  //   for (const app of apps.values())
  //     app.check_changes()
  // }, 10000)

  setInterval(load, Number(TUMU_SPECIFICATION_REFRESH))
}

