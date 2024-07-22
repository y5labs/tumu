// Inspired from https://forums.docker.com/t/private-docker-registry-with-token-authentication-not-able-to-list-the-images/135178
// This is also good https://medium.com/@adigunhammedolalekan/creating-docker-registry-token-authentication-server-with-go-1ce3aa030c17
// And this https://github.com/jetstack/jwt-registry-auth

const get_user = ctx => {
  if (!ctx.request.headers.authorization) return null
  const s = ctx.request.headers.authorization.split(' ')[1]
  const c = Buffer.from(s, 'base64').toString()
  const [username, password] = c.split(':')
  return { username, password }
}

const get_scopes = ctx => {
  if (!ctx.request.query.scope) return []
  const raw_scopes = ctx.request.query.scope
  const scopes = Array.isArray(raw_scopes) ? raw_scopes : raw_scopes.split(' ')
  return scopes.map(scope => {
    const res = {}
    const parts = scope.split(':')
    if (parts && parts.length > 0) res.type = parts[0] // const repository
    if (parts && parts.length > 1) res.name = parts[1] // foo/repoName
    if (parts && parts.length > 2) res.actions = parts[2].split(',') // requested actions e.g. pull,push
    return res
  })
}

const get_account = ctx => {
  if (ctx.request.query.account) return ctx.request.query.account
  const user = get_user(ctx)
  return user?.username
}

const issuer = process.env.TOKEN_ISSUER

export default ({ koa: { router }, jwt_dist }) => {
  router.get('/dist_auth', async ctx => {
    // Three different types of requests
    // 1. account=username&client_id=docker&offline_token=true&service=Authentication
    // 2. POST!?
    // 3. scope=repository%3Atest%3Apull&scope=repository%3Atest%3Apull%2Cpush&service=Authentication

    // const user = get_user(ctx)
    const scopes = get_scopes(ctx)
    const account = get_account
    const token = jwt_dist.sign({
      issuer,
      account,
      service: 'Authentication',
      access: scopes.map(({ type, name, actions }) => ({ type, name, actions }))
    })
    // console.log({ user, scopes, token })
    ctx.body = {
      status: 'success',
      message: 'Authenticated user successfully.',
      token
    }
  })
}
