const validate_fn = (validator, root, ctx) => {
  for (const [key, [validate, constructerror]] of Object.entries(validator)) {
    const value = key.split('.').reduce((acc, key) => acc[key], root)
    if (!validate(value)) ctx.throw(400, constructerror(JSON.stringify(root)))
  }
}

const validate = (field, validator) => async (ctx, next) => {
  const entry = field.split('.').reduce((acc, key) => acc[key], ctx.request)
  if (!entry) ctx.throw(400, `Missing Required Field: ${field}`)
  validate_fn(validator, entry, ctx)
  await next()
}

const validate_array = (field, validator) => async (ctx, next) => {
  const entries = field.split('.').reduce((acc, key) => acc[key], ctx.request)
  if (!entries) ctx.throw(400, `Missing Required Array: ${field}`)
  if (!Array.isArray(entries)) ctx.throw(400, `Invalid Array: ${field}`)
  for (const entry of entries) validate_fn(validator, entry, ctx)
  await next()
}

export { validate_fn, validate, validate_array }
