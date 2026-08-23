import { describe, expect, test } from 'bun:test'
import { createRequire } from 'node:module'
import type { EventEmitter } from 'node:events'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { tmpdir } from 'node:os'
import packageManifest from '../package.json' with { type: 'json' }

interface ElectronmonWatcherOptions {
  root: string
  patterns: string[]
}

interface ElectronmonWatcher extends EventEmitter {
  close(): void
}

interface ElectronmonWatcherFactory {
  (options: ElectronmonWatcherOptions): ElectronmonWatcher
}

interface WatchEvent {
  path: string
}

const require = createRequire(import.meta.url)
const createElectronmonWatcher = require('electronmon/src/watch.js') as ElectronmonWatcherFactory

async function discoverWatchedFiles(files: string[]): Promise<Set<string>> {
  const root = mkdtempSync(join(tmpdir(), 'proma-electronmon-'))
  let watcher: ElectronmonWatcher | undefined

  try {
    for (const file of files) {
      const absolutePath = join(root, file)
      mkdirSync(dirname(absolutePath), { recursive: true })
      writeFileSync(absolutePath, '')
    }

    const watchedFiles = new Set<string>()
    watcher = createElectronmonWatcher({
      root,
      patterns: packageManifest.electronmon.patterns,
    })
    watcher.on('add', ({ path }: WatchEvent) => {
      watchedFiles.add(relative(root, path).split(sep).join('/'))
    })

    await new Promise<void>((resolve, reject) => {
      watcher?.once('ready', resolve)
      watcher?.once('error', reject)
    })

    return watchedFiles
  } finally {
    watcher?.close()
    rmSync(root, { recursive: true, force: true })
  }
}

describe('electronmon 开发态监听范围', () => {
  test('given 主进程和 renderer 源码存在 when electronmon 建立监听 then 不直接监听源码', async () => {
    const watchedFiles = await discoverWatchedFiles([
      'src/main/index.ts',
      'src/main/lib/title-generation.ts',
      'src/renderer/App.tsx',
      'src/preload/index.ts',
    ])

    expect(watchedFiles).toEqual(new Set())
  })

  test('given esbuild 开发产物存在 when electronmon 建立监听 then 只监听主进程和 preload bundle', async () => {
    const watchedFiles = await discoverWatchedFiles([
      'dist/main.cjs',
      'dist/preload.cjs',
      'dist/main.cjs.map',
      'dist/renderer/index.html',
      'package.json',
    ])

    expect(watchedFiles).toEqual(new Set([
      'dist/main.cjs',
      'dist/preload.cjs',
    ]))
  })
})
