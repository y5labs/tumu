import fs from 'fs/promises'
import path from 'path'

export default ({
  dir_path = 'migrations',
  table_name = 'migrations'
} = {}) => async ({ pg }) => {
  const migrate = async ({ id, name, migration }) => {
    try {
      console.log(`migrating: ${name}`)
      await migration(pg)
      await pg.unsafe(
        `insert into ${table_name} (id, name, migration) values (${id}, '${name}', '${migration.toString()}')`
      )
    } catch (e) {
      console.error(`migration failed: ${name}`, e)
      throw e
    }
  }

  const load_migrations = async () => {
    const dir = path.join(process.cwd(), dir_path)
    const files = await fs.readdir(dir)

    const fs_all = (
      await Promise.all(
        files
          .map(f => f.match(/^(\d+)\-.*\.js$/))
          .filter(f => f !== null)
          .map(async ([name, id]) => {
            const filename = path.resolve(path.join(dir_path, name))
            return { id: Number(id), name, migration: (await import(`file://${filename}`)).default }
          })
      )
    ).sort((a, b) => Math.sign(a.id - b.id))

    const db_all = (await pg.unsafe(`select id, name, migration from ${table_name} order by id`)).sort(
      (a, b) => Math.sign(b.id - a.id)
    )

    const db_ids = new Set(db_all.map(({ id }) => id))
    return { fs_pending: fs_all.filter(m => !db_ids.has(m.id)) }
  }

  const migrate_all = async () => {
    const { fs_pending } = await load_migrations()
    for (const m of fs_pending) await migrate(m)
  }

  await pg.unsafe(`
    create table if not exists ${table_name} (
      id integer primary key,
      name text not null,
      migration text not null
    )`)
  if (process.env.MIGRATE_ON_STARTUP) await migrate_all()
}
