const inject = require('seacreature/lib/inject')

inject('ctx', () => {
  const version = require('../package.json').version
  const program = require('commander')
  program.version(version)
  return { program }
})

inject('pod', ({ program }) => {
  program
    .command('help [command]')
    .description('display help information for a command')
    .action((command) => (program.commands.find(c => c.name() === command) || program).help())

  program.on('--help', () => console.log('\n  Run `tumu help <command>` for more information on specific commands\n'))

  const args = process.argv
  if (args[2] === '--help' || args[2] === '-h') args[2] = 'help'
  if (!args[2] || !program.commands.some(c => c.name() === args[2]))
    args.splice(2, 0, 'serve')

  program.parse(args)
})