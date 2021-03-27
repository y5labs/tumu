const fetch = require('node-fetch')
const pathie = require('seacreature/lib/pathie')
const diff_proxies = require('./diff_proxies')

const fetch_get = async url => {
  const res = await fetch(url)
  if (!res.ok) return null
  return await res.json()
}

const gen_route = r => ({
  '@id': r.name,
  handle: [{
    handler: 'reverse_proxy',
    upstreams: [{ dial: `127.0.0.1:${r.port}` }]
  }],
  match: [{ host: r.domains }],
  terminal: true
})

;(async () => {
  await fetch('http://localhost:2019/id/tumu/routes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      "handle": [{
        "handler": "static_response",
        "body": "Hello, world!"
      }],
      match: [{ host: ['thing.thomascoats.com'] }],
      terminal: true
    })
  })
  // const proxies_prev = new Map(Object.entries({
  //   '_tumu-deploy-webhook': {
  //     name: '_tumu-deploy-webhook',
  //     port: 8080,
  //     domains: [ 'deploy-webhook.thomascoats.com' ]
  //   },
  //   '_tumu-control': {
  //     name: '_tumu-control',
  //     port: 8082,
  //     domains: [ 'control.thomascoats.com' ]
  //   },
  //   'tumu-test': {
  //     name: 'tumu-test',
  //     port: 8083,
  //     domains: [ 'test.thomascoats.com', 'test1.thomascoats.com' ]
  //   },
  //   'tumu-test2': {
  //     name: 'tumu-test2',
  //     port: 8084,
  //     domains: [ 'test2.thomascoats.com' ]
  //   }
  // }))
  // const proxies_next = new Map(Object.entries({
  //   '_tumu-deploy-webhook': {
  //     name: '_tumu-deploy-webhook',
  //     port: 8080,
  //     domains: [ 'deploy-webhook.thomascoats.com', 'asomd' ]
  //   },
  //   '_tumu-control': {
  //     name: '_tumu-control',
  //     port: 8085,
  //     domains: [ 'control.thomascoats.com' ]
  //   },
  //   'tumu-test2': {
  //     name: 'tumu-test2',
  //     port: 8084,
  //     domains: [ 'test2.thomascoats.com' ]
  //   },
  //   'tumu-test3': {
  //     name: 'tumu-test123',
  //     port: 8090,
  //     domains: [ 'test123.thomascoats.com' ]
  //   }
  // }))
  // const changes = diff_proxies(proxies_prev, proxies_next)
  // // const changes = diff_proxies(new Map(), proxies_prev)

  // console.log(JSON.stringify({
  //   create: Object.fromEntries(changes.create.entries()),
  //   update: Object.fromEntries(changes.update.entries()),
  //   delete: Object.fromEntries(changes.delete.entries())
  // }, null, 2))

  // const entry2route = r => ({
  //   '@id': `tumu_${r.name}`,
  //   handle: [{
  //     handler: 'reverse_proxy',
  //     upstreams: [{ dial: `127.0.0.1:${r.port}` }]
  //   }],
  //   match: [{ host: r.domains }],
  //   terminal: true
  // })

  // await Promise.all([
  //   Array.from(changes.create.values(), r => fetch('http://localhost:2019/id/tumu/routes', {
  //     method: 'POST',
  //     headers: { 'Content-Type': 'application/json' },
  //     body: JSON.stringify(entry2route(r))
  //   })),
  //   Array.from(changes.update.values(), r => fetch(`http://localhost:2019/id/${r[1].name}`, {
  //     method: 'POST',
  //     headers: { 'Content-Type': 'application/json' },
  //     body: JSON.stringify(entry2route(r[1]))
  //   })),
  //   Array.from(changes.delete.values(), r => fetch(`http://localhost:2019/id/${r.name}`, { method: 'DELETE' }))
  // ].flat())
})()
