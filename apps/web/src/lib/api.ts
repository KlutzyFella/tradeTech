import type { ApiResponse } from "@tradetech/contracts"

/** A failure the server explained (it answered with an error envelope). */
export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.code = code
  }
}

/**
 * The request may or may not have taken effect: the connection failed, a
 * proxy answered instead of the API, or the server erred after possibly
 * committing. Orders must be retried with the same requestId.
 */
export class NetworkError extends Error {
  constructor() {
    super("We couldn’t reach the server reliably. Check your connection and try again.")
    this.name = "NetworkError"
  }
}

async function request<T>(method: "GET" | "POST" | "DELETE", path: string, body?: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? {} : { "content-type": "application/json" },
      body: body === undefined ? null : JSON.stringify(body),
    })
  } catch {
    throw new NetworkError()
  }
  if (response.status >= 500) throw new NetworkError()
  let envelope: ApiResponse<T>
  try {
    envelope = (await response.json()) as ApiResponse<T>
  } catch {
    throw new NetworkError()
  }
  if (!envelope.success) throw new ApiError(response.status, envelope.error.code, envelope.error.message)
  return envelope.data
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  del: <T>(path: string) => request<T>("DELETE", path),
}
