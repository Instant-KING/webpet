import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { createProjectStore } from './server/project_store'

function webPetProjectEndpoint(env: Record<string, string>): Plugin {
  return {
    name: 'webpet-project-endpoint',
    configureServer(server) {
      const projectRoot = env.WEBPET_PROJECT_ROOT || resolve(process.cwd(), 'webpet-project')
      const projectStore = createProjectStore({ root: projectRoot, frameWidth: 192, frameHeight: 208, columns: 8 })
      void projectStore.ensureTree()
      server.middlewares.use('/__webpet/project-files', async (request, response) => {
        try {
          if (request.method === 'GET') {
            const payload = await projectStore.readAll()
            response.statusCode = 200
            response.setHeader('content-type', 'application/json')
            response.end(JSON.stringify({ root: projectRoot, files: payload.files.map((file) => ({ path: file.path, dataUrl: `data:${file.contentType};base64,${file.bytes.toString('base64')}` })) }))
            return
          }
          if (request.method === 'POST') {
            const body = await readJson(request)
            const path = typeof body.path === 'string' ? body.path : ''
            const dataUrl = typeof body.dataUrl === 'string' ? body.dataUrl : ''
            const match = dataUrl.match(/^data:[^;]+;base64,(.+)$/)
            if (!match) throw new Error('项目文件必须是 base64 data URL')
            const savedPath = await projectStore.saveFile(path, Buffer.from(match[1], 'base64'))
            response.statusCode = 200
            response.setHeader('content-type', 'application/json')
            response.end(JSON.stringify({ path: savedPath }))
            return
          }
          if (request.method === 'DELETE') {
            const path = new URL(request.url || '/', 'http://localhost').searchParams.get('path') || ''
            const deletedPath = await projectStore.deletePath(path)
            response.statusCode = 200
            response.setHeader('content-type', 'application/json')
            response.end(JSON.stringify({ path: deletedPath }))
            return
          }
          response.statusCode = 405
          response.end('仅支持 GET、POST 或 DELETE')
        } catch (error) {
          response.statusCode = 400
          response.end(error instanceof Error ? error.message : '项目文件操作失败')
        }
      })
      server.middlewares.use('/__webpet/process-sprite', async (request, response) => {
        if (request.method !== 'POST') {
          response.statusCode = 405
          response.end('仅支持 POST')
          return
        }
        try {
          const frameWidth = Number(new URL(request.url || '/', 'http://localhost').searchParams.get('frameWidth'))
          const frameHeight = Number(new URL(request.url || '/', 'http://localhost').searchParams.get('frameHeight'))
          const frameCount = Number(new URL(request.url || '/', 'http://localhost').searchParams.get('frameCount'))
          const input = await readBytes(request, 24 * 1024 * 1024)
          const script = fileURLToPath(new URL('./server/sprite_processor.py', import.meta.url))
          const python = env.WEBPET_PYTHON || 'python'
          const result = await runPython(python, script, [frameWidth, frameHeight, frameCount], input)
          response.statusCode = 200
          response.setHeader('content-type', 'image/webp')
          response.end(result)
        } catch (error) {
          response.statusCode = 400
          response.end(error instanceof Error ? error.message : '图片处理失败')
        }
      })
    },
  }
}

function readBytes(request: import('node:http').IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    request.on('data', (chunk: Buffer) => {
      total += chunk.length
      if (total > limit) {
        reject(new Error('图片超过 24 MB 限制'))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => resolve(Buffer.concat(chunks)))
    request.on('error', reject)
  })
}

function runPython(python: string, script: string, args: number[], input: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(python, [script, ...args.map(String)], { windowsHide: true })
    const output: Buffer[] = []
    const errors: Buffer[] = []
    child.stdout.on('data', (chunk: Buffer) => output.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => errors.push(chunk))
    child.on('error', () => reject(new Error('无法启动 Python。请安装 Python 及 Pillow、NumPy、opencv-python，或在 .env 设置 WEBPET_PYTHON。')))
    child.on('close', (code) => {
      if (code === 0) resolve(Buffer.concat(output))
      else reject(new Error(Buffer.concat(errors).toString('utf8').trim() || `PetX 图像处理失败（${code}）`))
    })
    child.stdin.on('error', reject)
    child.stdin.end(input)
  })
}

function readJson(request: import('node:http').IncomingMessage): Promise<Record<string, any>> {
  return new Promise((resolve, reject) => {
    let raw = ''
    request.setEncoding('utf8')
    request.on('data', (chunk) => { raw += chunk })
    request.on('end', () => {
      try { resolve(JSON.parse(raw) as Record<string, any>) } catch { reject(new Error('请求内容不是有效 JSON')) }
    })
    request.on('error', reject)
  })
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), webPetProjectEndpoint(env)],
  server: {
    host: '127.0.0.1',
    port: 5987,
    strictPort: true,
  },
  }
})
