const { chmodSync, existsSync, readdirSync, statSync } = require('node:fs')
const { dirname, join, resolve } = require('node:path')

const SCRIPT_DIR = __dirname
const APP_DIR = resolve(SCRIPT_DIR, '..')
const REPO_ROOT = resolve(APP_DIR, '../..')

function resolveNodePtyRoot() {
  const packagePath = require.resolve('node-pty/package.json', {
    paths: [APP_DIR, REPO_ROOT],
  })
  return dirname(packagePath)
}

function isExecutable(filePath) {
  if (process.platform === 'win32') return true
  return (statSync(filePath).mode & 0o111) !== 0
}

function chmodExecutable(filePath) {
  if (process.platform === 'win32') return
  if (!existsSync(filePath)) return
  chmodSync(filePath, 0o755)
  console.log(`[node-pty] 已设置可执行权限: ${filePath}`)
}

function currentPlatformArch() {
  return `${process.platform}-${process.arch}`
}

function validateNodePtyRoot(nodePtyRoot, platformArch = currentPlatformArch()) {
  const prebuildRoot = join(nodePtyRoot, 'prebuilds', platformArch)
  const buildRoot = join(nodePtyRoot, 'build', 'Release')
  const nativeCandidates = [
    join(prebuildRoot, 'pty.node'),
    join(buildRoot, 'pty.node'),
  ]
  const nativeModule = nativeCandidates.find((candidate) => existsSync(candidate))

  if (!nativeModule) {
    throw new Error(`[node-pty] 缺少当前平台 native module: ${nativeCandidates.join(', ')}`)
  }

  if (!platformArch.startsWith('win32-')) {
    const helperCandidates = [
      join(prebuildRoot, 'spawn-helper'),
      join(buildRoot, 'spawn-helper'),
    ]
    const helper = helperCandidates.find((candidate) => existsSync(candidate))
    if (!helper) {
      throw new Error(`[node-pty] 缺少 spawn-helper: ${helperCandidates.join(', ')}`)
    }
    chmodExecutable(helper)
    if (!isExecutable(helper)) {
      throw new Error(`[node-pty] spawn-helper 仍不可执行: ${helper}`)
    }
  }

  console.log(`[node-pty] native 产物校验通过: ${nativeModule}`)
}

function findAppResourceDirs(appOutDir) {
  const resourceDirs = []
  const resourcesDir = join(appOutDir, 'resources')
  if (existsSync(resourcesDir)) resourceDirs.push(resourcesDir)

  if (existsSync(appOutDir)) {
    for (const entry of readdirSync(appOutDir)) {
      if (!entry.endsWith('.app')) continue
      const macResourcesDir = join(appOutDir, entry, 'Contents', 'Resources')
      if (existsSync(macResourcesDir)) resourceDirs.push(macResourcesDir)
    }
  }

  return resourceDirs
}

function collectPackagedNodePtyRoots(appOutDir) {
  const roots = new Set()
  for (const resourcesDir of findAppResourceDirs(appOutDir)) {
    for (const relativeRoot of [
      'app.asar.unpacked/node_modules/node-pty',
      'app/node_modules/node-pty',
    ]) {
      const nodePtyRoot = join(resourcesDir, relativeRoot)
      if (existsSync(nodePtyRoot)) roots.add(nodePtyRoot)
    }
  }
  return Array.from(roots)
}

function platformArchFromContext(context) {
  const platformName = context.electronPlatformName || context.packager?.platform?.nodeName || process.platform
  const archName = normalizeArch(context.arch || context.packager?.arch || process.arch)
  return `${platformName}-${archName}`
}

function normalizeArch(arch) {
  if (typeof arch === 'string') return arch
  if (typeof arch !== 'number') return process.arch
  const archNames = {
    0: 'ia32',
    1: 'x64',
    2: 'armv7l',
    3: 'arm64',
    4: 'universal',
  }
  return archNames[arch] || process.arch
}

async function afterPack(context) {
  const roots = collectPackagedNodePtyRoots(context.appOutDir)
  if (roots.length === 0) {
    throw new Error(`[node-pty] 打包产物中未找到 node-pty: ${context.appOutDir}`)
  }

  const platformArch = platformArchFromContext(context)
  for (const nodePtyRoot of roots) {
    validateNodePtyRoot(nodePtyRoot, platformArch)
  }
}

function runLocal() {
  const nodePtyRoot = resolveNodePtyRoot()
  validateNodePtyRoot(nodePtyRoot)
}

module.exports = afterPack

if (require.main === module) {
  try {
    runLocal()
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}
