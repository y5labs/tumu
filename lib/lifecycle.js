import ref from './ref.js'

export default ({ hub }) => {
  let isstartingup = true
  let isshuttingdown = false

  const startup = ref()
  const sensitive = ref()

  hub.on('terminate', async method => {
    try {
      if (isshuttingdown) {
        if (method == 'SIGTERM') {
          console.log('SIGTERM – E noho rā!')
          process.exit(0)
        }
        return
      }
      isshuttingdown = true
      await sensitive.released()
      console.log(`${method} – Ohākī...`)
      await hub.emit('shutdown')
      console.log('E noho rā!')
      process.exit(0)
    } catch (e) {
      console.error(e)
      process.exit(0)
    }
  })

  hub.on('ready', () => {
    ;(async () => {
      await startup.released()
      isstartingup = false
    })()
  })

  process.on('SIGTERM', () => hub.emit('terminate', 'SIGTERM'))
  process.on('SIGINT', () => hub.emit('terminate', 'SIGINT'))

  return {
    startup,
    sensitive
  }
}
