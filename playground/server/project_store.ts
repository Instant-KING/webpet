import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'

export type ProjectStoreOptions = {
  root: string
  frameWidth: number
  frameHeight: number
  columns: number
}

type StoredFile = { path: string; bytes: Buffer; contentType: string }

function safeName(value: string, fallback: string): string {
  const clean = value.trim().replace(/[^a-zA-Z0-9._-]+/g, '-')
  return clean || fallback
}

export function createProjectStore(options: ProjectStoreOptions) {
  const root = resolve(options.root)
  const arrestRoot = join(root, 'arrest')
  const animationRoot = join(root, 'animation')

  async function ensureTree() {
    await mkdir(arrestRoot, { recursive: true })
    await mkdir(animationRoot, { recursive: true })
  }

  async function scanFiles(directory: string): Promise<StoredFile[]> {
    const output: StoredFile[] = []
    for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
      const fullPath = join(directory, entry.name)
      if (entry.isDirectory()) output.push(...await scanFiles(fullPath))
      else if (/\.webp$/i.test(entry.name)) output.push({ path: relative(root, fullPath).replaceAll('\\', '/'), bytes: await readFile(fullPath), contentType: 'image/webp' })
      else if (entry.name.toLowerCase() === 'manifest.json' && fullPath === join(root, entry.name)) output.push({ path: entry.name, bytes: await readFile(fullPath), contentType: 'application/json' })
    }
    return output
  }

  async function readAll() {
    await ensureTree()
    const manifestPath = join(root, 'manifest.json')
    const manifest = await readFile(manifestPath).then((bytes) => ({ path: 'manifest.json', bytes, contentType: 'application/json' })).catch(() => null)
    return { files: [...(manifest ? [manifest] : []), ...await scanFiles(arrestRoot), ...await scanFiles(animationRoot)] }
  }

  async function saveFile(relativePath: string, bytes: Buffer) {
    const normalized = relativePath.replaceAll('\\', '/').replace(/^\/+/, '')
    if (normalized !== 'manifest.json' && !normalized.startsWith('arrest/') && !normalized.startsWith('animation/')) throw new Error('只允许写入 manifest、arrest 或 animation 目录')
    const fullPath = resolve(root, normalized)
    if (!fullPath.startsWith(root)) throw new Error('非法项目路径')
    await mkdir(dirname(fullPath), { recursive: true })
    await writeFile(fullPath, bytes)
    return normalized
  }

  async function deletePath(relativePath: string) {
    const normalized = relativePath.replaceAll('\\', '/').replace(/^\/+/, '').replace(/\/+$/, '')
    if (normalized !== 'manifest.json' && !normalized.startsWith('arrest/') && !normalized.startsWith('animation/')) throw new Error('只允许删除 manifest、arrest 或 animation 目录')
    const fullPath = resolve(root, normalized)
    if (!fullPath.startsWith(`${root}${process.platform === 'win32' ? '\\' : '/'}`)) throw new Error('非法项目路径')
    await rm(fullPath, { recursive: true, force: true })
    return normalized
  }

  return { root, arrestRoot, animationRoot, ensureTree, readAll, saveFile, deletePath, safeName }
}
