import postgres from 'postgres'

export default async ({}) => {
  const pg = postgres(process.env.PG_DB, {
    onnotice: () => {},
    connection: {
      application_name: process.env.APP_NAME
    }
  })
  return { pg }
}
