const sleep = require('seacreature/lib/sleep')
const fs = require('fs').promises
const { Worker } = require('worker_threads')
const path = require('path')
const child_process = require('child_process')
const Git = require('nodegit')

const is_dir = async dir_path => {
  try {
    const stat = await fs.lstat(dir_path)
    return stat.isDirectory()
  }
  catch (e) { return false }
}

module.exports = (spec, port, hub) => {
  hub = hub.child({})
  let state = ''
  let state_level = 0
  let handle = null
  let next_action = null

  let restart_delay = 0
  let last_fail = null

  const authCallbacks = { credentials: (url, userName) => Git.Cred.sshKeyFromAgent(userName) }
  const dir_path = path.resolve(process.cwd(), spec.name)
  let repo = null
  let pjson = null
  let worker = null
  const kill = async () => {
    if (!worker) return
    await worker.postMessage(JSON.stringify({ e: 'terminate', p: 'SIGINT' }))
    await sleep(2000)
    if (!worker) return
    await worker.postMessage(JSON.stringify({ e: 'terminate', p: 'SIGTERM' }))
    await sleep(2000)
    if (!worker) return
    await worker.terminate()
    worker = null
  }

  const actions = {
    get_code: async () => {
      state_level = 1
      state = 'getting_code'
      console.log(spec.name, 'getting_code')
      try {
        repo = await (async () => {
          if (await is_dir(dir_path)) {
            try {
              const repo = await Git.Repository.open(dir_path)
              const remote = await Git.Remote.lookup(repo, 'origin')
              if (remote.url() != spec.repo) throw 'Remote does not match'
              return repo
            }
            catch (e) {
              console.log(spec.name, 'No existing repo or repo not correct, cloning.', e)
            }
          }
          await fs.rmdir(dir_path, { recursive: true })
          return await Git.Clone(spec.repo, dir_path, {
            fetchOpts: { callbacks: authCallbacks } })
        })()
        return 'get_latest'
      }
      catch (e) {
        state = 'could_not_get_code'
        console.error(spec.name, 'could_not_get_code', e)
      }
    },
    get_latest: async () => {
      state_level = 2
      state = 'getting_latest'
      console.log(spec.name, 'getting_latest')
      try {
        let prev_commit_id = await repo.getHeadCommit()
        await Git.Reset.reset(repo, prev_commit_id, Git.Reset.TYPE.HARD)
        await repo.fetchAll({ callbacks: authCallbacks })
        if ((await repo.getCurrentBranch()).name() != `refs/heads/${spec.branch}`) {
          const branch = await repo.createBranch(spec.branch, prev_commit_id, true)
          await Git.Branch.setUpstream(branch, `origin/${spec.branch}`)
        }
        await repo.checkoutBranch(spec.branch)
        await repo.mergeBranches(
          spec.branch,
          `origin/${spec.branch}`,
          await Git.Signature.default(repo),
          Git.Merge.PREFERENCE.FASTFORWARD_ONLY)
        return 'install_dependencies'
      }
      catch (e) {
        state = 'could_not_get_latest'
        console.error(spec.name, 'could_not_get_latest', e)
      }
    },
    install_dependencies: async () => {
      state_level = 3
      state = 'installing_dependencies'
      console.log(spec.name, 'installing_dependencies')
      try {
        pjson = await fs.readFile(path.join(dir_path, 'package.json'), 'utf8')
        pjson = JSON.parse(pjson)
        if (!pjson.main) throw 'package.json does not have a main'
        await new Promise((resolve, reject) => {
          const npmi = child_process.spawn('npm', ['i', '--production', '-s'], {
            cwd: dir_path
          })
          npmi.stdout.on('data', data => process.stdout.write(data))
          npmi.stderr.on('data', data => process.stderr.write(data))
          npmi.on('exit', code => code == 0 ? resolve() : reject())
        })
        return 'run'
      }
      catch (e) {
        state = 'could_not_install_dependencies'
        console.error(spec.name, 'could_not_install_dependencies', e)
      }
    },
    run: async () => {
      await kill()
      state_level = 4
      state = 'running'
      console.log(spec.name, 'running')
      worker = new Worker(path.join(dir_path, pjson.main), {
        env: { PORT: port, ...spec.env },
        stdout: true,
        stderr: true
      })
      // TODO: Prefix lines? Stream elsewhere?
      worker.stdout.on('data', data => process.stdout.write(data))
      worker.stderr.on('data', data => process.stderr.write(data))
      worker.on('message', msg => {
        const { e, p } = JSON.parse(msg)
        hub.emit(e, p)
      })
      worker.on('error', e => console.error(spec.name, e))
      worker.on('exit', async code => {
        worker = null
        if (code > 0 && state_level == 4) {
          const now = Math.floor(new Date().getTime() / 1000)
          // TODO: Turn these constants into ENVs
          if (last_fail > now - 3e5) restart_delay += 5000
          else restart_delay = 0
          restart_delay = Math.min(restart_delay, 6e4)
          last_fail = now
          console.log(spec.name, `exit(${code}). Waiting ${restart_delay / 1000}s`)
          handle = setTimeout(() => {
            if (state == 'stopped') exec('run')
          }, restart_delay)
        }
        else console.log(spec.name, `exit(${code}). Waiting for changes.`)
        if (state_level == 4) {
          state_level = 5
          state = 'stopped'
        }
      })
    },
    restart: async () => {
      state_level = 3
      state = 'restarting'
      console.log(spec.name, 'restarting')
      await kill()
      last_fail = 0
      return 'run'
    },
    check_changes: async () => {
      state = 'check_changes'
      console.log(spec.name, 'check_changes')
      try {
        let prev_commit_id = await repo.getHeadCommit()
        await Git.Reset.reset(repo, prev_commit_id, Git.Reset.TYPE.HARD)
        await repo.fetchAll({ callbacks: authCallbacks })
        if ((await repo.getCurrentBranch()).name() != `refs/heads/${spec.branch}`) {
          const branch = await repo.createBranch(spec.branch, prev_commit_id, true)
          await Git.Branch.setUpstream(branch, `origin/${spec.branch}`)
        }
        await repo.checkoutBranch(spec.branch)
        await repo.mergeBranches(
          spec.branch,
          `origin/${spec.branch}`,
          await Git.Signature.default(repo),
          Git.Merge.PREFERENCE.FASTFORWARD_ONLY)
        let current_commit_id = await repo.getHeadCommit()
        if (!prev_commit_id.id().equal(current_commit_id.id()))
          return 'install_dependencies'
      }
      catch (e) {
        console.error(spec.name, 'could_not_check_changes', e)
      }
      state = 'running'
    },
    terminate: async () => {
      state_level = -1
      state = 'terminating'
      console.log(spec.name, 'terminating')
      await kill()
    }
  }

  let in_progress = false
  const exec = async new_action => {
    if (new_action)
      next_action = new_action
    if (handle) {
      clearTimeout(handle)
      handle = null
    }
    if (in_progress) return
    if (!next_action) return
    in_progress = true
    const action = next_action
    next_action = null
    const further_action = await actions[action]()
    if (further_action && !next_action)
      next_action = further_action
    in_progress = false
    if (next_action) setImmediate(exec)
  }
  setImmediate(() => exec('get_code'))

  return {
    spec: () => spec,
    port,
    state,
    set_spec: next_spec => spec = next_spec,
    get_code: () => {
      if (state_level <= 0) return
      exec('get_code')
    },
    get_latest: () => {
      if (state_level <= 1) return
      exec('get_latest')
    },
    restart: () => {
      if (state_level <= 3) return
      exec('restart')
    },
    check_changes: () => {
      if (state_level <= 3) return
      exec('check_changes')
    },
    terminate: () => {
      if (state_level < 0) return
      exec('terminate')
    }
  }
}