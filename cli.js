#!/usr/bin/env node

require('dotenv').config()
const sleep = require('seacreature/lib/sleep')
const program = require('commander')
const path = require('path')
const fs = require('fs').promises
const { encrypt, decrypt } = require('./lib/crypto')
const version = require('./package.json').version
program.version(version)
const serve = require('./index')

const is_interactive = process.stdin.isTTY == true

const read = async stream => {
  const chunks = []
  for await (const chunk of stream)
    chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

const help_input = () => {
  console.error(`
An input file is not specified — please fix by:
1. Passing a file path to this command
2. Or piping text to this command
`)
  process.exit(-1)
}

program
  .command('serve [url]')
  .description('run a tumu instance from an encrypted json file')
  .action(serve)

program
  .command('encrypt [input]')
  .description('encrypt a json configuration file')
  .action(async input => {
    if (is_interactive) {
      if (!input) return help_input()
      const file = path.resolve(process.cwd(), input)
      const content = await fs.readFile(file, 'utf8')
      return process.stdout.write(await encrypt(content))
    }
    const content = await read(process.stdin)
    return process.stdout.write(await encrypt(content))
  })

program
  .command('decrypt [input]')
  .description('decrypt a json configuration file')
  .action(async input => {
    if (is_interactive) {
      if (!input) return help_input()
      const file = path.resolve(process.cwd(), input)
      const content = await fs.readFile(file, 'utf8')
      return process.stdout.write(await decrypt(content))
    }
    const content = await read(process.stdin)
    return process.stdout.write(await decrypt(content))
  })

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