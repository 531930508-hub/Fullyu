import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

/**
 * 测试用 CRM 假服务：严格按真实契约校验签名，避免测试与线上算法漂移。
 * 只实现身份解析与余额读取，不触碰任何真实数据库。
 */

export interface FakeCrmMember {
  memberId: string
  memberNo: string
  name: string
  balance: number
}

export interface FakeCrmRequest {
  method: string
  path: string
  body: string
  keyId: string
  signatureOk: boolean
}

export interface FakeCrm {
  url: string
  members: Map<string, FakeCrmMember>
  birthdays: Map<string, string | null>
  requests: FakeCrmRequest[]
  failNext: { status: number; body: unknown } | null
  delayMs: number
  close: () => Promise<void>
}

const readBody = (req: IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })

const reply = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

const sign = (secret: string, timestamp: string, method: string, url: string, rawBody: string) => {
  const bodyHash = createHash('sha256').update(rawBody, 'utf8').digest('hex')
  return createHmac('sha256', secret)
    .update(`${timestamp}\n${method.toUpperCase()}\n${url}\n${bodyHash}`, 'utf8')
    .digest('hex')
}

export async function startFakeCrm(options: { keyId: string; secret: string }): Promise<FakeCrm> {
  const { keyId, secret } = options
  const members = new Map<string, FakeCrmMember>()
  const birthdays = new Map<string, string | null>()
  const requests: FakeCrmRequest[] = []
  let seq = 0
  const state: FakeCrm = {
    url: '',
    members,
    birthdays,
    requests,
    failNext: null,
    delayMs: 0,
    close: async () => undefined,
  }

  const handler = async (req: IncomingMessage, res: ServerResponse) => {
    const path = req.url || '/'
    const rawBody = await readBody(req)
    const key = String(req.headers['x-crm-key'] || '')
    const timestamp = String(req.headers['x-crm-timestamp'] || '')
    const given = Buffer.from(String(req.headers['x-crm-signature'] || ''), 'utf8')
    const expected = Buffer.from(
      sign(secret, timestamp, req.method || 'GET', path, rawBody),
      'utf8',
    )
    const ok =
      key === keyId && given.length === expected.length && timingSafeEqual(given, expected)
    requests.push({ method: req.method || '', path, body: rawBody, keyId: key, signatureOk: ok })

    if (state.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, state.delayMs))
    }
    if (state.failNext) {
      const failure = state.failNext
      state.failNext = null
      reply(res, failure.status, failure.body)
      return
    }
    if (!ok) {
      reply(res, 401, { error: 'UNAUTHORIZED', message: '签名不正确' })
      return
    }

    if (req.method === 'POST' && path === '/api/external/members/resolve') {
      const input = JSON.parse(rawBody) as { localUserId?: string; name?: string | null }
      const localUserId = String(input.localUserId || '')
      let member = members.get(localUserId)
      if (!member) {
        seq += 1
        member = {
          memberId: `mem-${seq}`,
          memberNo: `FY-TEST-${String(seq).padStart(6, '0')}`,
          name: String(input.name || '会员'),
          balance: 0,
        }
        members.set(localUserId, member)
        reply(res, 200, { ...member, created: true, bound: false })
        return
      }
      reply(res, 200, { ...member, created: false, bound: false })
      return
    }

    if (req.method === 'POST' && path === '/api/external/members/birthdays') {
      const input = JSON.parse(rawBody) as { localUserIds?: string[] }
      reply(res, 200, {
        items: (input.localUserIds || [])
          .filter((id) => birthdays.has(id))
          .map((id) => ({ localUserId: id, birthday: birthdays.get(id) ?? null })),
      })
      return
    }

    const match = /^\/api\/external\/members\/([^/]+)$/.exec(path)
    if (req.method === 'GET' && match) {
      const member = members.get(decodeURIComponent(match[1]))
      if (!member) {
        reply(res, 404, { error: 'NOT_FOUND', message: '该本地用户尚未同步到 CRM' })
        return
      }
      reply(res, 200, { ...member, status: 'ACTIVE' })
      return
    }

    reply(res, 404, { error: 'NOT_FOUND', message: '接口不存在' })
  }

  const server: Server = createServer((req, res) => {
    void handler(req, res).catch(() => {
      if (!res.headersSent) reply(res, 500, { error: 'SERVER_ERROR' })
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as AddressInfo
  state.url = `http://127.0.0.1:${address.port}`
  state.close = () =>
    new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    )
  return state
}
