import { existsSync } from "node:fs"

export function addMediaSlide(slide, data, theme, { text, title, logo }) {
  title(slide, data.title, theme)
  if (data.type === "image") {
    if (data.src && existsSync(String(data.src))) {
      slide.addImage({
        path: String(data.src),
        x: 1.5,
        y: 1.8,
        w: 10.3,
        h: 4.5,
        sizing: { type: "contain", w: 10.3, h: 4.5 },
      })
    }
    if (data.caption)
      text(
        slide,
        data.caption,
        { x: 0.8, y: 6.5, w: 11.7, h: 0.6, fontSize: theme.fonts.size_caption },
        theme,
      )
  } else if (data.type === "gallery") {
    const images = (data.images || []).filter((image) => existsSync(String(image))).slice(0, 6)
    images.forEach((image, index) => {
      const column = index % 2
      const row = Math.floor(index / 2)
      slide.addImage({
        path: String(image),
        x: 0.8 + column * 5.85,
        y: 1.8 + row * 1.55,
        w: 5.0,
        h: 1.4,
        sizing: { type: "cover", w: 5.0, h: 1.4 },
      })
    })
  } else if (data.type === "video") {
    const media = data.src && existsSync(String(data.src)) ? String(data.src) : null
    if (media && typeof slide.addMedia === "function") {
      slide.addMedia({
        type: "video",
        path: media,
        x: 1.5,
        y: 2.0,
        w: 10.3,
        h: 4.5,
      })
    } else if (data.poster && existsSync(String(data.poster))) {
      slide.addImage({
        path: String(data.poster),
        x: 1.5,
        y: 2.0,
        w: 10.3,
        h: 4.5,
        sizing: { type: "contain", w: 10.3, h: 4.5 },
      })
      text(slide, "Video preview", { x: 1.5, y: 6.6, w: 10.3, h: 0.4, fontSize: 14 }, theme)
    }
  }
  logo(slide, theme)
}
