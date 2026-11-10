import { existsSync } from 'node:fs'
import { join, sep } from 'node:path'
import fastifyStatic from '@fastify/static'
import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'

interface WebAppOptions {
  distDir: string
}

/**
 * Serves the built web app from the API's own origin (ADR 0004), so session
 * cookies stay first-party and HTTP and WebSockets need no CORS. Unknown
 * non-API GETs fall back to index.html for client-side navigation.
 */
const webApp: FastifyPluginAsync<WebAppOptions> = async (app, opts) => {
  const index = join(opts.distDir, 'index.html')
  if (!existsSync(index)) throw new Error(`WEB_DIST_DIR has no index.html: ${opts.distDir}`)
  await app.register(fastifyStatic, {
    root: opts.distDir,
    wildcard: false,
    // Hashed assets are immutable; index.html must always revalidate.
    setHeaders: (res, path) => {
      // Only Vite's content-hashed /assets/ files are immutable; everything else revalidates.
      res.header('cache-control', path.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache')
    },
  })
  app.setNotFoundHandler((request, reply) => {
    const path = request.url.split('?')[0] ?? ''
    // Paths with a file extension are files: a missing one (e.g. a stale chunk after a deploy) is a real 404,
    // never the HTML shell, which would break the old tab with a MIME error.
    const looksLikeFile = /\.[a-z0-9]+$/i.test(path)
    if (request.method === 'GET' && !looksLikeFile && !path.startsWith('/api') && !path.startsWith('/socket.io')) {
      return reply.header('cache-control', 'no-cache').sendFile('index.html')
    }
    return reply.status(404).send({ success: false, error: { code: 'not_found', message: 'Route not found' } })
  })
}

export const webAppPlugin = fp(webApp, { name: 'web-app' })
