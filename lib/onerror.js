const is_production = process.env.NODE_ENV == 'production'

export default () => async (ctx, next) => {
  try {
    await next()
    if (!ctx.status || (ctx.status >= 400 && ctx.status < 500)) ctx.throw(ctx.status, ctx.body)
  }
  catch (e) {
    ctx.body = Object.assign({}, {
      name: e.name,
      message: e.message,
      stack: !is_production ? e.stack : undefined,
      type: e.type,
      status: e.status ?? e.statusCode ?? 500
    })
    ctx.status = ctx.body.status
    if (!e.expose && ctx.status >= 500)
      ctx.app.emit('error', e, ctx)
    if (!is_production)
      ctx.body = JSON.stringify(ctx.body, null, 2)
  }
}
