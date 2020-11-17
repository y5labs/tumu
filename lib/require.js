const inject = require('seacreature/lib/inject')
const path = require('path')

inject('command.require', async ({ args, log }) => {
  if (!args.length > 0) return
  try {
    const filename = path.resolve(process.cwd(), args[0])
    delete require.cache[require.resolve(filename)]
    require(filename)
  }
  catch (e) {
    await log.error(e)
  }
})
