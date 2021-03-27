const fetch = require('node-fetch')
const fs = require('fs').promises
const path = require('path')
const SparseArray = require('seacreature/analytics/sparsearray')
const mutex = require('seacreature/lib/mutex')
const pathie = require('seacreature/lib/pathie')
const Hub = require('seacreature/lib/hub')
const { decrypt } = require('./lib/crypto')
const diff_specs = require('./diff_specs')
const diff_proxies = require('./diff_proxies')
const engine = require('./engine')

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

const fetch_get = async url => {
  const res = await fetch(url)
  if (!res.ok) return null
  return await res.json()
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
        const proxies_next = new Map()
        for (const app of apps.values()) {
          const spec = app.spec()
          if (!spec.domains) continue
          proxies_next.set(spec.name, {
            name: spec.name,
            port: app.port,
            domains: spec.domains
          })
        }
        try {
          let tumu_config = await fetch_get('http://localhost:2019/id/tumu/')
          if (!tumu_config) {
            tumu_config = {
              '@id': 'tumu',
              listen: [':443'],
              routes: []
            }
            let config = await fetch_get('http://localhost:2019/config/')
            if (!config || !pathie.get(config, ['apps', 'http', 'servers', 'tumu'])) {
              config = { apps: { http: { servers: { tumu: tumu_config }}}}
              await fetch('http://localhost:2019/load', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
              })
            }
          }

          const proxies_prev = tumu_config.routes
            .filter(r => r['@id'] && r['@id'].startsWith('tumu_'))
            .reduce((map, r) => {
              const name = r['@id'].slice(5)
              map.set(name, {
                name: name,
                port: r.handle[0].upstreams[0].dial.split(':')[1],
                domains: r.match[0].host
              })
              return map
            }, new Map())

          const diff = diff_proxies(proxies_prev, proxies_next)

          const gen_route = r => ({
            '@id': `tumu_${r.name}`,
            handle: [{
              handler: 'reverse_proxy',
              upstreams: [{ dial: `127.0.0.1:${r.port}` }]
            }],
            match: [{ host: r.domains }],
            terminal: true
          })

          const changes = [
            Array.from(diff.create.values(), r =>
              fetch('http://localhost:2019/id/tumu/routes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(gen_route(r))
              })),
            Array.from(diff.update.values(), r =>
              fetch(`http://localhost:2019/id/tumu_${r[1].name}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(gen_route(r[1]))
              })),
            Array.from(diff.delete.values(), r =>
              fetch(`http://localhost:2019/id/tumu_${r.name}`, {
                method: 'DELETE' }))
          ].flat()

          if (changes.length > 0)
            console.log(JSON.stringify({
              create: Object.fromEntries(diff.create.entries()),
              update: Object.fromEntries(diff.update.entries()),
              delete: Object.fromEntries(diff.delete.entries())
            }, null, 2))

          await Promise.all(changes)
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

