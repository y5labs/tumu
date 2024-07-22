import { config } from 'dotenv'
config()
import fs from 'fs/promises'
const app = process.env.TUMU_APP ?? 'default'
const path = `./apps/${app}.js`
try {
  await fs.stat(path)
  import(path)
} catch (e) {
  console.error(`Application ${app} at ${path} does not exist`, e)
  process.exit(1)
}
