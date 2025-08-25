export default async (request, context) => {
  try {
    console.log("got request:", request);
    const { pathname, search } = new URL(request.url);
    const proxiedUrl = new URL(`https://thumbnails.roblox.com/v1${pathname.replace('/.netlify/functions/roblox-proxy', '')}${search}`);
    
    const response = await fetch(proxiedUrl.toString(), {
      headers: {
        ...request.headers,
        host: proxiedUrl.host,
      },
      method: request.method,
    });
    
    console.log("sending response:", response);
    return response;
  } catch (error) {
    console.error("got error:", error);
    return new Response(error.toString(), {
      status: 500,
    });
  }
};
