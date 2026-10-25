import { homedir } from "node:os"
import { join } from "node:path"

export const BASE = process.env.COMFY_BASE ?? "http://127.0.0.1:8188"
export const OUTDIR = process.env.COMFY_OUTPUT ?? join(homedir(), "ComfyUI", "output")

async function request(path, init, timeout) {
  let response
  try {
    response = await fetch(`${BASE}${path}`, {
      ...init,
      signal: AbortSignal.timeout(timeout * 1000),
    })
  } catch (error) {
    throw new Error(`cannot reach ${BASE}${path}: ${error.message}`)
  }
  if (!response.ok) {
    const detail = await response.text()
    const error = new Error(`HTTP ${response.status}: ${detail.slice(0, 4000)}`)
    error.status = response.status
    error.detail = detail
    throw error
  }
  return response
}

export async function getJson(path, timeout = 30) {
  const response = await request(path, { method: "GET" }, timeout)
  return response.json()
}

export async function postJson(path, data, timeout = 60) {
  const response = await request(
    path,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
    timeout,
  )
  return response.json()
}

export async function getBytes(path, timeout = 120) {
  const response = await request(path, { method: "GET" }, timeout)
  return Buffer.from(await response.arrayBuffer())
}
