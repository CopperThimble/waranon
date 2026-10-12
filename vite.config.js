import fs from 'node:fs'
import process from 'node:process'
import path from 'node:path'
import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

// Dev only: serve SampleMods/modexample at /__modexample/ so the exporter can be
// tried on localhost without picking a folder. Never part of the production build.
function sampleModPlugin() {
  const root = path.resolve('SampleMods/modexample')
  return {
    name: 'waranon-sample-mod',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__modexample', (req, res) => {
        const url = new URL(req.url, 'http://localhost')
        const target = path.resolve(root, '.' + decodeURIComponent(url.pathname))
        if (!target.startsWith(root) || !fs.existsSync(target)) {
          res.statusCode = 404
          return res.end()
        }
        if (fs.statSync(target).isDirectory()) {
          const entries = fs.readdirSync(target, { withFileTypes: true }).map((d) => ({
            name: d.name,
            kind: d.isDirectory() ? 'directory' : 'file',
          }))
          res.setHeader('Content-Type', 'application/json')
          return res.end(JSON.stringify(entries))
        }
        fs.createReadStream(target).pipe(res)
      })
      server.middlewares.use('/__modexample-available', (req, res) => {
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(fs.existsSync(root)))
      })
    },
  }
}

// Game art switch: "gameArt" in waranon.config.json, overridable with WARANON_GAME_ART=on|off
// (e.g. in CI). When off, "game-art" resolves to an empty module, so no images/ file is bundled.
const siteConfig = JSON.parse(fs.readFileSync('waranon.config.json', 'utf8'))
const envArt = process.env.WARANON_GAME_ART
const gameArt = envArt ? envArt !== 'off' : siteConfig.gameArt !== false

// https://vite.dev/config/
export default defineConfig({
  base: '/waranon/',
  resolve: {
    alias: {
      'game-art': path.resolve(gameArt ? 'src/lib/gameArt.on.js' : 'src/lib/gameArt.off.js'),
    },
  },
  define: {
    'import.meta.env.VITE_GAME_ART': JSON.stringify(gameArt ? 'on' : 'off'),
  },
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    sampleModPlugin(),
  ],
})
