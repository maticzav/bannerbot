import { App } from '@octokit/app'
import { throttling } from '@octokit/plugin-throttling'
import { Octokit } from '@octokit/rest'
import { PrismaClient } from '@prisma/client'
import * as bodyParser from 'body-parser'
import express from 'express'

/* Environment */

Octokit.plugin([throttling])

const PORT = process.env.PORT!
const POSTGRESQL_URL = process.env.POSTGRESQL_URL!
const APP_ID = parseInt(process.env.APP_ID!, 10)
const PRIVATE_KEY = process.env.PRIVATE_KEY!

/* Datasources */

const prisma = new PrismaClient()
const app = new App({ id: APP_ID, privateKey: PRIVATE_KEY })

/* API */

const server = express()

server.use(bodyParser.json())

server.get(`/auth/ticket`, async (req, res) => {
  const result = await prisma.user.create({
    data: {
      ...req.body,
    },
  })
  res.json(result)
})

/**
 * Performs a banners sync.
 */
server.post(`/sync`, async (req, res) => {
  const banner = req.body.banner

  if (!banner) {
    return res.sendStatus(404)
  }

  const installationId = 1

  const octokit = new Octokit({
    auth: `Bearer ${app.getInstallationAccessToken({ installationId })}`,
    throttle: {
      onRateLimit: () => true,
      onAbuseLimit: () => {},
    },
  })

  const installations = await octokit.apps
    .listInstallationReposForAuthenticatedUser({
      installation_id: 1,
      per_page: 100,
    })
    .then(res => res.data)

  /**
   * Performs sync on all installed items.
   */
  for (const repository of installations.repositories) {
    const res = await octokit.repos.getContents({
      owner: repository.owner.login,
      repo: repository.name,
      path: 'README.md',
    })

    /* Make sure response is a file. */
    /* istanbul ignore if */
    if (Array.isArray(res.data) || !res.data.content) {
      continue
    }

    const readme = Buffer.from(res.data.content, 'base64').toString()

    /* Update banner */

    const bbReadme = bannerbot(readme, banner)

    /* ignore unchanged READMEs. */
    /* istanbul ignore if */
    if (bbReadme === readme) {
      continue
    }

    await octokit.repos.createOrUpdateFile({
      owner: repository.owner.login,
      repo: repository.name,
      path: 'README.md',
      content: Buffer.from(bbReadme).toString('base64'),
      message: 'chore: bannerbot banner sync',
    })

    console.log(`Synced ${repository.owner.login}/${repository.name}!`)
  }

  return res.sendStatus(200)
})

/* Start the server */

server.listen(PORT, () =>
  console.log(`🚀 Server ready at: http://localhost:${PORT}`),
)

/* Helper functions */

/**
 * Replaces the text between two <!--- bannerbot --> tags.
 *
 * @param readme
 * @param banner
 */
function bannerbot(readme: string, banner: string): string {
  return readme.replace(
    /<!---\s+bannerbot\s+-->\n((?:.|\n)*)<!---\s+bannerbot\s+-->/,
    banner,
  )
}
