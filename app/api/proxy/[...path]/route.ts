import { NextRequest, NextResponse } from "next/server"

import { getBackendBaseUrl } from "@/lib/backend-url"

function buildForwardHeaders(
  request: NextRequest,
  contentType?: string | null,
): Record<string, string> {
  const headers: Record<string, string> = {}
  const authorization = request.headers.get("Authorization")
  if (authorization) headers.Authorization = authorization
  if (contentType) headers["Content-Type"] = contentType
  return headers
}

async function proxyRequest(
  request: NextRequest,
  path: string[],
  method: string,
) {
  const targetPath = "/" + path.join("/")
  const searchParams = request.nextUrl.searchParams.toString()
  const url = `${getBackendBaseUrl()}${targetPath}${searchParams ? `?${searchParams}` : ""}`

  const contentType = request.headers.get("Content-Type")

  try {
    let body: string | FormData | undefined
    let headers: Record<string, string>

    if (method === "GET" || method === "HEAD") {
      headers = buildForwardHeaders(request)
      const response = await fetch(url, { method, headers, cache: "no-store" })
      const data = await response.text()
      return new NextResponse(data, {
        status: response.status,
        headers: {
          "Content-Type": response.headers.get("Content-Type") || "application/json",
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      })
    }

    if (contentType?.includes("multipart/form-data")) {
      body = await request.formData()
      headers = buildForwardHeaders(request)
    } else {
      body = await request.text()
      headers = buildForwardHeaders(request, contentType)
    }

    const response = await fetch(url, { method, headers, body })
    const data = await response.text()

    return new NextResponse(data, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("Content-Type") || "application/json",
      },
    })
  } catch (error) {
    console.error("[Proxy] error:", error)
    return NextResponse.json({ error: "Proxy error" }, { status: 500 })
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params
  return proxyRequest(request, path, "GET")
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params
  return proxyRequest(request, path, "POST")
}
