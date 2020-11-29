const sleep = require('seacreature/lib/sleep')
const fs = require('fs').promises
const { Worker } = require('worker_threads')
const path = require('path')
const child_process = require('child_process')
const Git = require('nodegit')

const TUMU_RETRY_DELAY_WINDOW =
  process.env.TUMU_RETRY_DELAY_WINDOW
  ? Number(process.env.TUMU_RETRY_DELAY_WINDOW)
  : 3e5
const TUMU_RETRY_DELAY_ESCALATION =
  process.env.TUMU_RETRY_DELAY_ESCALATION
  ? Number(process.env.TUMU_RETRY_DELAY_ESCALATION)
  : 5e3
const TUMU_RETRY_DELAY_LIMIT =
  process.env.TUMU_RETRY_DELAY_LIMIT
  ? Number(process.env.TUMU_RETRY_DELAY_LIMIT)
  : 6e4

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

  const set_state = (new_state, e) => {
    state = new_state
    hub.emit('worker.state', { spec, state })
  }
  const emit_log = data => hub.emit('worker.stdout', { spec, data })
  const emit_error = data => hub.emit('worker.stderr', { spec, data })

  const actions = {
    get_code: async () => {
      state_level = 1
      set_state('getting_code')
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
              emit_log('No existing repo or repo not correct, cloning.')
            }
          }
          await fs.rmdir(dir_path, { recursive: true })
          return await Git.Clone(spec.repo, dir_path, {
            fetchOpts: { callbacks: authCallbacks } })
        })()
        return 'get_latest'
      }
      catch (e) {
        emit_error(e)
        set_state('could_not_get_code')
      }
    },
    get_latest: async () => {
      state_level = 2
      set_state('getting_latest')
      try {
        let prev_commit_id = await repo.getHeadCommit()
        if (process.env.NODE_ENV != 'development')
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
        emit_error(e)
        set_state('could_not_get_latest')
      }
    },
    install_dependencies: async () => {
      state_level = 3
      set_state('installing_dependencies')
      try {
        pjson = await fs.readFile(path.join(dir_path, 'package.json'), 'utf8')
        pjson = JSON.parse(pjson)
        if (!pjson.main) throw 'package.json does not have a main'
        await new Promise((resolve, reject) => {
          const npmi = child_process.spawn('npm', ['i', '--production', '-s'], {
            cwd: dir_path
          })
          npmi.stdout.on('data', data =>
            hub.emit('worker.stdout', { spec, data: data.toString() }))
          npmi.stderr.on('data', data =>
            hub.emit('worker.stderr', { spec, data: data.toString() }))
          npmi.on('exit', code => code == 0 ? resolve() : reject())
        })
        return 'run'
      }
      catch (e) {
        emit_error(e)
        set_state('could_not_install_dependencies')
      }
    },
    run: async () => {
      await kill()
      state_level = 4
      set_state('running')
      worker = new Worker(path.join(dir_path, pjson.main), {
        env: { PORT: port, ...spec.env },
        stdout: true,
        stderr: true
      })
      worker.stdout.on('data', data =>
        hub.emit('worker.stdout', { spec, data: data.toString() }))
      worker.stderr.on('data', data =>
        hub.emit('worker.stderr', { spec, data: data.toString() }))
      worker.on('message', msg => {
        const { e, p } = JSON.parse(msg)
        hub.emit(e, { worker, spec, ...p })
      })
      worker.on('error', e => emit_error(e))
      worker.on('exit', async code => {
        worker = null
        if (code > 0 && state_level == 4) {
          const now = Math.floor(new Date().getTime() / 1000)
          if (last_fail > now - TUMU_RETRY_DELAY_WINDOW)
            restart_delay += TUMU_RETRY_DELAY_ESCALATION
          else
            restart_delay = 0
          restart_delay = Math.min(restart_delay, TUMU_RETRY_DELAY_LIMIT)
          last_fail = now
          emit_error(`exit(${code}). Waiting ${restart_delay / 1000}s`)
          handle = setTimeout(() => {
            if (state == 'stopped') exec('run')
          }, restart_delay)
        }
        else emit_error(`exit(${code}). Waiting for changes.`)
        if (state_level == 4) {
          state_level = 5
          set_state('stopped')
        }
      })
    },
    restart: async () => {
      state_level = 3
      set_state('restarting')
      await kill()
      last_fail = 0
      return 'run'
    },
    check_changes: async () => {
      set_state('check_changes')
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
        emit_error(e)
        set_state('could_not_check_changes')
      }
      set_state('running')
    },
    terminate: async () => {
      state_level = -1
      set_state('terminating')
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
    state: () => state,
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