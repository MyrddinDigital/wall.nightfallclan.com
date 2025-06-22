import { Context } from '@netlify/functions'

export default (request: Request, context: Context) => {
  try {
    const { pathname, search } = new URL(request.url)
    const proxiedUrl = new URL(`https://thumbnails.roblox.com/v1${pathname.replace('/.netlify/functions/roblox-proxy', '')}${search}`)
    const response = fetch(proxiedUrl.toString(), {
      headers: {
        ...request.headers,
        host: proxiedUrl.host,
      },
      method: request.method,
    })
    return response
  } catch (error) {
    return new Response(error.toString(), {
      status: 500,
    })
  }
}
