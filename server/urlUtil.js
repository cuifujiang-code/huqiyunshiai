import nodeUrl from 'node:url'

let legacyUrlParseShimApplied = false

/** 服务端 origin，供 WHATWG URL 解析相对路径 */
export function getServerOrigin(req) {
  if (process.env.VERCEL_URL) {
    return new URL(`https://${process.env.VERCEL_URL}`).origin
  }
  const host = req?.headers?.host
  if (host) {
    const proto = req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http'
    return new URL(`${proto}://${host}`).origin
  }
  const port = process.env.PORT || 3001
  return new URL(`http://127.0.0.1:${port}`).origin
}

/** 基于 WHATWG URL 拼接服务端绝对地址 */
export function buildServerUrl(path, req) {
  return new URL(path, getServerOrigin(req)).href
}

/** 从 Vercel catch-all / Express 请求中解析教师 API 路径段 */
export function getTeacherApiPathSegments(req) {
  return getPathSegmentsFromRequest(req, '/api/teacher')
}

export function getPathSegmentsFromRequest(req, mountPath = '/api/teacher') {
  const slug = req.query?.path
  if (Array.isArray(slug) && slug.length) {
    return slug.map(String).filter(Boolean)
  }
  if (typeof slug === 'string' && slug) {
    return slug.split('/').filter(Boolean)
  }

  if (typeof req.url === 'string' && req.url) {
    try {
      const pathname = new URL(req.url, getServerOrigin(req)).pathname
      const normalizedMount = mountPath.endsWith('/') ? mountPath.slice(0, -1) : mountPath
      if (pathname === normalizedMount || pathname.startsWith(`${normalizedMount}/`)) {
        const rest = pathname.slice(normalizedMount.length).replace(/^\//, '')
        return rest ? rest.split('/').filter(Boolean) : []
      }
    } catch {
      // ignore malformed URL
    }
  }

  return []
}

function legacyParseWithWhatwg(urlString, parseQueryString = false, slashesDenoteHost = false) {
  if (typeof urlString !== 'string') {
    throw new TypeError('The "url" argument must be of type string')
  }

  if (!urlString) {
    return legacyObjectFromParts({ href: urlString })
  }

  if (slashesDenoteHost && urlString.startsWith('//')) {
    const slashIndex = urlString.indexOf('/', 2)
    const hostPart = slashIndex === -1 ? urlString.slice(2) : urlString.slice(2, slashIndex)
    const pathname = slashIndex === -1 ? '/' : urlString.slice(slashIndex)
    return legacyObjectFromParts({
      protocol: null,
      host: hostPart,
      hostname: hostPart.split(':')[0],
      port: hostPart.includes(':') ? hostPart.split(':')[1] : null,
      pathname,
      path: pathname,
      href: urlString,
      parseQueryString,
    })
  }

  const hasProtocol = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(urlString)
  if (!hasProtocol) {
    const hashIndex = urlString.indexOf('#')
    const withoutHash = hashIndex >= 0 ? urlString.slice(0, hashIndex) : urlString
    const hash = hashIndex >= 0 ? urlString.slice(hashIndex) : null
    const searchIndex = withoutHash.indexOf('?')
    const pathname = searchIndex >= 0 ? withoutHash.slice(0, searchIndex) : withoutHash
    const search = searchIndex >= 0 ? withoutHash.slice(searchIndex) : null
    return legacyObjectFromParts({
      protocol: null,
      pathname,
      search,
      hash,
      href: urlString,
      parseQueryString,
    })
  }

  const parsed = new URL(urlString)

  return legacyObjectFromParts({
    protocol: parsed.protocol,
    host: parsed.host,
    hostname: parsed.hostname,
    port: parsed.port || null,
    pathname: parsed.pathname,
    search: parsed.search || null,
    hash: parsed.hash || null,
    href: parsed.href,
    parseQueryString,
  })
}

function legacyObjectFromParts({
  protocol = null,
  host = null,
  hostname = null,
  port = null,
  pathname = '/',
  search = null,
  hash = null,
  href = pathname,
  parseQueryString = false,
}) {
  const path = `${pathname || ''}${search || ''}`
  const query = parseQueryString && search
    ? Object.fromEntries(new URL(`http://localhost${search.startsWith('?') ? search : `?${search}`}`).searchParams)
    : search
      ? search.slice(1)
      : null

  return {
    protocol,
    slashes: protocol ? true : null,
    auth: null,
    host,
    port,
    hostname,
    hash,
    search,
    query,
    pathname,
    path,
    href,
  }
}

/**
 * 将 node:url.parse 替换为 WHATWG URL 实现，供 mammoth/pdf-parse 等仍依赖 legacy API 的包使用。
 * 必须在加载这些依赖之前调用。
 */
export function applyLegacyUrlParseShim() {
  if (legacyUrlParseShimApplied) return
  legacyUrlParseShimApplied = true

  const originalParse = nodeUrl.parse.bind(nodeUrl)
  nodeUrl.parse = (urlString, parseQueryString, slashesDenoteHost) => {
    try {
      return legacyParseWithWhatwg(urlString, parseQueryString, slashesDenoteHost)
    } catch {
      return originalParse(urlString, parseQueryString, slashesDenoteHost)
    }
  }
}
