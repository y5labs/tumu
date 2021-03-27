module.exports = (prev, next) => {
  const changes = {
    create: new Map(),
    update: new Map(),
    delete: new Map()
  }

  const same = new Map()

  for (const [key, value] of prev.entries())
    if (next.has(key)) same.set(key, [value, next.get(key)])
    else changes.delete.set(key, value)
  for (const [key, value] of next.entries())
    if (!prev.has(key)) changes.create.set(key, value)

  for (const [prev_service, next_service] of same.values()) {
    if (prev_service.port != next_service.port
        || JSON.stringify(prev_service.domains.sort())
          != JSON.stringify(next_service.domains.sort()))
      changes.update.set(prev_service.name, [prev_service, next_service])
  }

  return changes
}
