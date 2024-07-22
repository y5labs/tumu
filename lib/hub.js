const Hub = initial => {
  const listeners = {}
  const unhandled = []
  if (initial) for (let e of Object.keys(initial)) listeners[e] = [initial[e]]

  const emit = (e, ...args) => {
    if (listeners[e] == null)
      return Promise.all(unhandled.slice().map(fn => fn(e, ...args)))
    return Promise.all(listeners[e].slice().map(fn => fn(...args)))
  }

  const res = {
    on: (e, fn) => {
      if (!listeners[e]) listeners[e] = []
      listeners[e].push(fn)
    },
    off: (e, fn) => {
      if (!listeners[e]) return
      const index = listeners[e].indexOf(fn)
      if (index !== -1) listeners[e].splice(index, 1)
    },
    emit: emit,
    unhandled: fn => unhandled.push(fn),
    unhandledOff: fn => {
      const index = unhandled.indexOf(fn)
      if (index !== -1) unhandled.splice(index, 1)
    },
    child: initial => {
      const res = Hub(initial)
      res.unhandled((e, ...args) => emit(e, ...args))
      return res
    },
    create: (initial) => Hub(initial),
    effect: fn => () => {
      const listeners = []
      const fin = fn({
        ...res,
        on: (e, fn) => {
          listeners.push([e, fn])
          res.on(e, fn)
        }
      })
      return () => {
        for (const [e, fn] of listeners)
          res.off(e, fn)
        if (fin) fin()
      }
    }
  }

  return res
}

export default () => ({ hub: Hub() })
export {
  Hub
}