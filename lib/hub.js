const inject = require('seacreature/lib/inject')
const Hub = require('seacreature/lib/hub')

inject('ctx', () => {
  const hub = Hub()
  const log = (...args) => hub.emit('log', ...args)
  log.error = (...args) => hub.emit('error', ...args)
  hub.on('log', (...args) => console.log(...args))
  hub.on('error', (...args) => console.error(...args))
  return { hub, log }
})
