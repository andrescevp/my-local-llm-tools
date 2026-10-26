/** Convert a normalized U2Net mask to an alpha channel. */
export function maskToAlpha(mask, width, height, { threshold = 0.5, softness = 0 } = {}) {
  const alpha = new Uint8Array(width * height)
  for (let index = 0; index < alpha.length; index += 1) {
    const value = mask[index] ?? 0
    let a = value
    if (softness > 0) {
      const low = Math.max(0, threshold - softness)
      const high = Math.min(1, threshold + softness)
      a =
        high === low
          ? value >= threshold
            ? 1
            : 0
          : Math.min(1, Math.max(0, (value - low) / (high - low)))
    } else {
      a = value >= threshold ? 1 : 0
    }
    alpha[index] = Math.round(a * 255)
  }
  return alpha
}

/** Apply an alpha mask to an RGBA buffer. */
export function applyAlpha(rgba, alpha) {
  const output = Buffer.from(rgba)
  for (let index = 0; index < alpha.length; index += 1) {
    output[index * 4 + 3] = alpha[index]
  }
  return output
}

/** Bounding box of non-transparent pixels. */
export function alphaBounds(alpha, width, height, minimum = 8) {
  let left = width
  let top = height
  let right = -1
  let bottom = -1
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (alpha[y * width + x] <= minimum) continue
      left = Math.min(left, x)
      top = Math.min(top, y)
      right = Math.max(right, x)
      bottom = Math.max(bottom, y)
    }
  }
  if (right < left || bottom < top) return { x: 0, y: 0, width, height }
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 }
}

/** Crop an RGBA buffer to a rectangle. */
export function cropRgba(rgba, width, height, rect) {
  const output = Buffer.alloc(rect.width * rect.height * 4)
  for (let y = 0; y < rect.height; y += 1) {
    const source = ((rect.y + y) * width + rect.x) * 4
    const target = y * rect.width * 4
    rgba.copy(output, target, source, source + rect.width * 4)
  }
  return { buffer: output, width: rect.width, height: rect.height }
}

/** Add transparent padding. */
export function padRgba(rgba, width, height, padding) {
  if (padding <= 0) return { buffer: rgba, width, height }
  const outWidth = width + padding * 2
  const outHeight = height + padding * 2
  const output = Buffer.alloc(outWidth * outHeight * 4)
  for (let y = 0; y < height; y += 1) {
    rgba.copy(output, ((y + padding) * outWidth + padding) * 4, y * width * 4, (y + 1) * width * 4)
  }
  return { buffer: output, width: outWidth, height: outHeight }
}

/** Center an RGBA buffer on a square transparent canvas, scaled to fit 80%. */
export function centerOnCanvas(rgba, width, height, canvasSize) {
  const scale = Math.min((canvasSize * 0.8) / width, (canvasSize * 0.8) / height, 1)
  const targetWidth = Math.max(1, Math.round(width * scale))
  const targetHeight = Math.max(1, Math.round(height * scale))
  const canvas = Buffer.alloc(canvasSize * canvasSize * 4)
  const offsetX = Math.floor((canvasSize - targetWidth) / 2)
  const offsetY = Math.floor((canvasSize - targetHeight) / 2)
  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY = Math.min(height - 1, Math.floor(y / scale))
    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = Math.min(width - 1, Math.floor(x / scale))
      const source = (sourceY * width + sourceX) * 4
      const target = ((offsetY + y) * canvasSize + offsetX + x) * 4
      rgba.copy(canvas, target, source, source + 4)
    }
  }
  return { buffer: canvas, width: canvasSize, height: canvasSize }
}
