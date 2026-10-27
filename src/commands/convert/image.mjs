import { extname } from "node:path"

const IMAGE_INPUT_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "tiff",
  "tif",
  "bmp",
  "gif",
  "avif",
  "ico",
])
const IMAGE_OUTPUT_FORMATS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "tiff",
  "tif",
  "bmp",
  "gif",
  "avif",
  "ico",
  "pdf",
])
const MEDIA_ONLY_FLAGS = [
  "start",
  "end",
  "duration",
  "frames",
  "at",
  "fps",
  "mute",
  "volume",
  "normalize",
  "codec",
  "audioCodec",
  "crf",
  "preset",
  "bitrate",
  "audioBitrate",
  "sampleRate",
  "channels",
]

function extension(value) {
  return extname(String(value)).slice(1).toLowerCase()
}

export function imageKind(path) {
  return IMAGE_INPUT_EXTENSIONS.has(extension(path)) ? "image" : ""
}

export function imageOutputFormat(value) {
  const format = String(value ?? "")
    .replace(/^\./, "")
    .toLowerCase()
  return IMAGE_OUTPUT_FORMATS.has(format) ? format : ""
}

export function validateImageRequest({ values }) {
  if (values.filter) throw new Error("--filter is LibreOffice-only")
  if (!values.to) throw new Error("--to is required for image conversion")
  const format = imageOutputFormat(values.to)
  if (!format) throw new Error(`unsupported image target: ${values.to}`)
  for (const key of MEDIA_ONLY_FLAGS) {
    if (values[key] !== undefined) throw new Error(`--${key} is not valid for images`)
  }
  if (values.resize !== undefined && values.scale !== undefined) {
    throw new Error("use --resize or --scale, not both")
  }
  const resize = values.resize ?? values.scale
  if (resize !== undefined && !/^\d+x\d*$|^x\d+$/.test(String(resize))) {
    throw new Error("--resize/--scale must be WxH for images, for example 800x600")
  }
  if (values.crop !== undefined && !/^\d+x\d+\+\d+\+\d+$/.test(String(values.crop))) {
    throw new Error("--crop must be WxH+X+Y for images")
  }
  if (values.rotate !== undefined && !Number.isFinite(Number(values.rotate))) {
    throw new Error("--rotate must be a number")
  }
  if (values.flip !== undefined && !["horizontal", "vertical"].includes(values.flip)) {
    throw new Error("--flip must be horizontal or vertical")
  }
  if (
    values.quality !== undefined &&
    (!Number.isInteger(values.quality) || values.quality < 1 || values.quality > 100)
  ) {
    throw new Error("--quality must be an integer from 1 to 100")
  }
  if (values.background !== undefined && !String(values.background).trim()) {
    throw new Error("--background must be a color")
  }
  return { format }
}

export function buildImageArgs({ input, output, values }) {
  const args = [input]
  if (values.autoOrient) args.push("-auto-orient")
  if (values.trim) args.push("-trim")
  const resize = values.resize ?? values.scale
  if (resize !== undefined) args.push("-resize", String(resize))
  if (values.crop !== undefined) args.push("-crop", String(values.crop))
  if (values.rotate !== undefined) args.push("-rotate", String(values.rotate))
  if (values.flip === "horizontal") args.push("-flop")
  else if (values.flip === "vertical") args.push("-flip")
  if (values.grayscale) args.push("-colorspace", "Gray")
  if (values.strip) args.push("-strip")
  if (values.quality !== undefined) args.push("-quality", String(values.quality))
  if (values.background !== undefined) {
    args.push("-background", String(values.background), "-alpha", "remove", "-alpha", "off")
  }
  args.push(output)
  return args
}
