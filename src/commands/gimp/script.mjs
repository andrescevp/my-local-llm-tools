function pyStr(value) {
  return JSON.stringify(String(value))
}

function number(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function load(input) {
  return [
    "import gi",
    'gi.require_version("Gimp", "3.0")',
    "from gi.repository import Gimp, Gio",
    `img = Gimp.file_load(Gimp.RunMode.NONINTERACTIVE, Gio.File.new_for_path(${pyStr(input)}))`,
    "d = img.get_selected_drawables()[0]",
  ]
}

function save(output) {
  return [
    `Gimp.file_save(Gimp.RunMode.NONINTERACTIVE, img, Gio.File.new_for_path(${pyStr(output)}))`,
    "img.delete()",
    'print("ok")',
  ]
}

function filterCode(name, properties) {
  const lines = [
    `f = Gimp.DrawableFilter.new(d, ${pyStr(name)}, "filter")`,
    `f.set_properties(${JSON.stringify(properties)})`,
    "d.append_filter(f)",
  ]
  return lines
}

/** Build a GIMP 3 Python-Fu script for one whitelisted operation. */
export function buildScript(operation, options = {}) {
  const { input, output } = options
  const lines = load(input)

  switch (operation) {
    case "resize":
      lines.push(
        `img.scale(${Math.round(number(options.width, 800))}, ${Math.round(number(options.height, 600))})`,
      )
      break
    case "crop":
      lines.push(
        `img.crop(${Math.round(number(options.width, 100))}, ${Math.round(number(options.height, 100))}, ${Math.round(number(options.x, 0))}, ${Math.round(number(options.y, 0))})`,
      )
      break
    case "rotate": {
      const angle = String(options.angle ?? "90")
      const type = angle === "180" ? "DEGREES180" : angle === "270" ? "DEGREES270" : "DEGREES90"
      lines.push(`img.rotate(Gimp.RotationType.${type})`)
      break
    }
    case "flip": {
      const type = options.direction === "vertical" ? "VERTICAL" : "HORIZONTAL"
      lines.push(`img.flip(Gimp.OrientationType.${type})`)
      break
    }
    case "grayscale":
      lines.push("img.convert_grayscale()")
      break
    case "brightness-contrast":
      lines.push(
        `d.brightness_contrast(${number(options.brightness, 0)}, ${number(options.contrast, 0)})`,
      )
      break
    case "hue-saturation":
      lines.push(
        `d.hue_saturation(Gimp.HueRange.ALL, ${number(options.hue, 0)}, ${number(options.lightness, 0)}, ${number(options.saturation, 0)}, 0)`,
      )
      break
    case "levels":
      lines.push(
        `d.levels(${number(options.black, 0)}, ${number(options.white, 1)}, ${number(options.gamma, 1)}, 0, 255, 0, 255)`,
      )
      break
    case "autocrop":
      lines.push("img.autocrop()")
      break
    case "sepia":
      lines.push("d.colorize_hsl(30, 50, 0)")
      break
    case "blur":
      lines.push(
        ...filterCode("gegl:gaussian-blur", {
          "std-dev-x": number(options.radius, 5),
          "std-dev-y": number(options.radius, 5),
        }),
      )
      break
    case "sharpen":
      lines.push(
        ...filterCode("gegl:unsharp-mask", {
          scale: number(options.amount, 0.5),
          "std-dev": number(options.radius, 3),
        }),
      )
      break
    case "vignette":
      lines.push(
        ...filterCode("gegl:vignette", {
          radius: number(options.radius, 1.2),
          softness: number(options.softness, 0.5),
        }),
      )
      break
    case "border": {
      const border = Math.round(number(options.border, 10))
      lines.push(
        `img.resize(img.get_width() + ${border * 2}, img.get_height() + ${border * 2}, ${border}, ${border})`,
      )
      break
    }
    case "text": {
      const text = pyStr(options.text ?? "Text")
      const size = Math.round(number(options.size, 48))
      lines.push(
        `Gimp.text_font(img, d, ${Math.round(number(options.x, 0))}, ${Math.round(number(options.y, 0))}, ${text}, 0, True, ${size}, Gimp.context_get_font())`,
        "img.flatten()",
      )
      break
    }
    case "convert":
    case "optimize":
      break
    default:
      throw new Error(`unsupported GIMP operation: ${operation}`)
  }

  lines.push(...save(output))
  return `${lines.join("\n")}\n`
}

export { pyStr }
