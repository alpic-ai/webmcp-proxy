const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "*",
  "access-control-allow-headers": "*",
  "access-control-expose-headers": "*",
};

const PREFIX = "/cors-proxy/";

export default async function handler(request: Request) {
  const url = new URL(request.url);
  const encoded = url.pathname.slice(PREFIX.length) + url.search;
  const targetUrl = decodeURIComponent(encoded);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return new Response("Invalid target URL", {
      status: 400,
      headers: CORS_HEADERS,
    });
  }

  const headers = new Headers(request.headers);
  for (const h of ["host", "origin", "referer", "connection"]) {
    headers.delete(h);
  }
  headers.set("host", parsed.host);

  try {
    const response = await fetch(parsed.toString(), {
      method: request.method,
      headers,
      body:
        request.method !== "GET" && request.method !== "HEAD"
          ? request.body
          : undefined,
    });

    const responseHeaders = new Headers(response.headers);
    for (const [key, value] of Object.entries(CORS_HEADERS)) {
      responseHeaders.set(key, value);
    }

    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(`Proxy error: ${message}`, {
      status: 502,
      headers: CORS_HEADERS,
    });
  }
}
