import { existsSync } from "node:fs"

import pptxgen from "pptxgenjs"

import { hexToRgb } from "../theme.mjs"
import { addChartSlide } from "./charts.mjs"
import { addMediaSlide } from "./media.mjs"
import { addTableSlide } from "./table.mjs"

const WIDE = { width: 13.333, height: 7.5 }
const TEXT_SLIDES = new Set(["title", "section", "bullets", "text", "closing"])

function color(value) {
  const [r, g, b] = hexToRgb(value)
  return `${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`
}

function text(slide, value, options, theme) {
  slide.addText(String(value ?? ""), {
    fontFace: theme.fonts.body,
    color: color(theme.colors.text),
    fontSize: theme.fonts.size_body,
    ...options,
  })
}

function title(slide, value, theme) {
  text(
    slide,
    value,
    {
      x: 0.8,
      y: 0.4,
      w: 11.7,
      h: 1,
      bold: true,
      fontFace: theme.fonts.heading,
      color: color(theme.colors.heading),
      fontSize: theme.fonts.size_heading,
    },
    theme,
  )
}

function accentBar(slide, y, theme) {
  slide.addShape("rect", {
    x: 0,
    y,
    w: WIDE.width,
    h: 0.06,
    fill: { color: color(theme.colors.accent) },
    line: { color: color(theme.colors.accent) },
  })
}

function logo(slide, theme) {
  if (!theme.logo || !existsSync(String(theme.logo))) return
  const right = theme.logo_position !== "top-left"
  slide.addImage({
    path: String(theme.logo),
    x: right ? 11.5 : 0.5,
    y: 0.3,
    w: 1.2,
    h: 0.6,
    sizing: { type: "contain", w: 1.2, h: 0.6 },
  })
}

function slideNumber(slide, index, total, theme) {
  if (theme.page?.slide_number === false) return
  text(
    slide,
    `${index + 1} / ${total}`,
    {
      x: 11.5,
      y: 7.0,
      w: 1.5,
      h: 0.4,
      fontSize: theme.fonts.size_small,
      align: "right",
    },
    theme,
  )
}

function textSlide(kind, data, slide, theme) {
  if (kind === "title") {
    slide.background = { color: color(theme.colors.accent2) }
    accentBar(slide, 3.0, theme)
    text(
      slide,
      data.title || "Title",
      {
        x: 1.5,
        y: 1.5,
        w: 10.3,
        h: 1.5,
        bold: true,
        fontFace: theme.fonts.heading,
        color: color(theme.colors.heading),
        fontSize: theme.fonts.size_title,
      },
      theme,
    )
    if (data.subtitle)
      text(slide, data.subtitle, { x: 1.5, y: 3.5, w: 10.3, h: 1, fontSize: 28 }, theme)
    const meta = [data.author, data.date].filter(Boolean).join(" | ")
    if (meta) text(slide, meta, { x: 1.5, y: 5.5, w: 10.3, h: 0.8, fontSize: 16 }, theme)
    logo(slide, theme)
    return
  }
  if (kind === "section") {
    accentBar(slide, 3.3, theme)
    text(
      slide,
      data.title || "",
      {
        x: 1.5,
        y: 2.5,
        w: 10.3,
        h: 1,
        bold: true,
        fontFace: theme.fonts.heading,
        color: color(theme.colors.heading),
        fontSize: 40,
      },
      theme,
    )
    if (data.subtitle)
      text(slide, data.subtitle, { x: 1.5, y: 3.8, w: 10.3, h: 0.8, fontSize: 24 }, theme)
  } else if (kind === "bullets") {
    title(slide, data.title, theme)
    const items = data.items || []
    if (items.length > 8) {
      const mid = Math.ceil(items.length / 2)
      slide.addText(
        items
          .slice(0, mid)
          .map((item) => ({ text: String(item), options: { bullet: true, breakLine: true } })),
        {
          x: 0.8,
          y: 1.6,
          w: 5.5,
          h: 5.5,
          fontFace: theme.fonts.body,
          color: color(theme.colors.text),
          fontSize: theme.fonts.size_body,
        },
      )
      slide.addText(
        items
          .slice(mid)
          .map((item) => ({ text: String(item), options: { bullet: true, breakLine: true } })),
        {
          x: 7.0,
          y: 1.6,
          w: 5.5,
          h: 5.5,
          fontFace: theme.fonts.body,
          color: color(theme.colors.text),
          fontSize: theme.fonts.size_body,
        },
      )
    } else {
      slide.addText(
        items.map((item) => ({ text: String(item), options: { bullet: true, breakLine: true } })),
        {
          x: 0.8,
          y: 1.6,
          w: 11.7,
          h: 5.5,
          fontFace: theme.fonts.body,
          color: color(theme.colors.text),
          fontSize: theme.fonts.size_body,
        },
      )
    }
  } else if (kind === "text") {
    title(slide, data.title, theme)
    text(slide, data.body || "", { x: 0.8, y: 1.6, w: 11.7, h: 5.5 }, theme)
  } else if (kind === "closing") {
    slide.background = { color: color(theme.colors.accent2) }
    text(
      slide,
      data.title || "Thank You",
      {
        x: 1.5,
        y: 2.5,
        w: 10.3,
        h: 1.5,
        bold: true,
        fontFace: theme.fonts.heading,
        color: color(theme.colors.heading),
        fontSize: theme.fonts.size_title,
      },
      theme,
    )
    if (data.subtitle)
      text(slide, data.subtitle, { x: 1.5, y: 4.0, w: 10.3, h: 1, fontSize: 28 }, theme)
  }
  logo(slide, theme)
}

export async function renderPptx({ config, theme, outputPath }) {
  const pptx = new pptxgen()
  pptx.layout = "LAYOUT_WIDE"
  pptx.author = config.author || "my-local-llm-tools"
  pptx.subject = config.title
  pptx.title = config.title

  const slides = config.slides || []
  for (const [index, data] of slides.entries()) {
    const slide = pptx.addSlide()
    slide.background = { color: color(theme.colors.background) }
    if (TEXT_SLIDES.has(data.type)) {
      textSlide(data.type, { ...data, author: config.author, date: config.date }, slide, theme)
    } else if (data.type === "table") {
      addTableSlide(slide, data, theme, { color, text, title })
    } else if (data.type === "chart") {
      addChartSlide(pptx, slide, data, theme, { color, title })
    } else if (["image", "gallery", "video"].includes(data.type)) {
      addMediaSlide(slide, data, theme, { color, text, title, logo })
    }
    if (!["title", "section", "closing"].includes(data.type)) {
      slideNumber(slide, index, slides.length, theme)
    }
  }
  await pptx.writeFile({ fileName: outputPath })
  return outputPath
}
