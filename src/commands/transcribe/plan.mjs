import { basename, dirname, extname, join } from "node:path"

export function planChunks(duration, chunkSeconds) {
  if (!(duration > 0)) return []
  const size = Math.max(1, Math.floor(Number(chunkSeconds) || 1))
  const chunks = []
  for (let start = 0, index = 0; start < duration; start += size, index += 1) {
    chunks.push({
      index,
      start,
      end: Math.min(start + size, duration),
    })
  }
  return chunks
}

export function formatTimestamp(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const remainder = total % 60
  return [hours, minutes, remainder].map((part) => String(part).padStart(2, "0")).join(":")
}

export function defaultOutputPath(input, format = "md") {
  const name = basename(input, extname(input))
  return join(dirname(input), `${name}.transcript.${format}`)
}

export function buildExtractArgs({ input, output }) {
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    input,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-c:a",
    "pcm_s16le",
    output,
  ]
}

export function buildChunkArgs({ input, output, start, end }) {
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-ss",
    String(start),
    "-i",
    input,
    "-t",
    String(Math.max(0, end - start)),
    "-c:a",
    "pcm_s16le",
    output,
  ]
}

function transcriptText(chunks) {
  return chunks
    .map((chunk) => chunk.text.trim())
    .filter(Boolean)
    .join("\n\n")
}

export function formatTranscript(report, format = "md") {
  const text = transcriptText(report.chunks)
  if (format === "json") {
    return JSON.stringify(
      {
        source: report.source,
        duration: report.duration,
        language: report.language || "auto",
        chunks: report.chunks,
        text,
      },
      null,
      2,
    )
  }
  if (format === "txt") return text

  const lines = [
    `# Transcript: ${basename(report.source)}`,
    "",
    `- Source: ${report.source}`,
    `- Duration: ${formatTimestamp(report.duration)}`,
    `- Language: ${report.language || "auto"}`,
    `- Chunks: ${report.chunks.length}`,
    "",
  ]
  for (const chunk of report.chunks) {
    lines.push(
      `## ${formatTimestamp(chunk.start)} – ${formatTimestamp(chunk.end)}`,
      "",
      chunk.text.trim(),
      "",
    )
  }
  return lines.join("\n").trim()
}
