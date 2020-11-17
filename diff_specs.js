module.exports = (prev, next) => {
  const prev_services = prev.reduce((map, service) => {
      map.set(service.name, service)
      return map
    }, new Map())
  const next_services = next.reduce((map, service) => {
      map.set(service.name, service)
      return map
    }, new Map())
  const changes = {
    create: new Map(),
    delete: new Map(),
    change_repo: new Map(),
    change_env: new Map(),
    change_domains: new Map()
  }

  const same = new Map()

  for (const [key, value] of prev_services.entries())
    if (next_services.has(key)) same.set(key, [value, next_services.get(key)])
    else changes.delete.set(key, value)
  for (const [key, value] of next_services.entries())
    if (!prev_services.has(key)) changes.create.set(key, value)

  for (const [prev_service, next_service] of same.values()) {
    if (prev_service.repo != next_service.repo || prev_service.branch != next_service.branch)
      changes.change_repo.set(prev_service.name, [prev_service, next_service])
    else if (JSON.stringify(prev_service.env) != JSON.stringify(next_service.env))
      changes.change_env.set(prev_service.name, [prev_service, next_service])
    if (JSON.stringify(prev_service.domains) != JSON.stringify(next_service.domains))
      changes.change_domains.set(prev_service.name, [prev_service, next_service])
  }

  return changes
}
