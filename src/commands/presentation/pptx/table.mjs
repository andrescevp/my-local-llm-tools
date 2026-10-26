export function addTableSlide(slide, data, theme, { color, title }) {
  title(slide, data.title, theme)
  const headers = data.headers || []
  const rows = data.rows || []
  const tableRows = [
    headers.map((value) => ({
      text: String(value),
      options: {
        bold: true,
        color: "FFFFFF",
        fill: { color: color(theme.colors.accent) },
        fontFace: theme.fonts.heading,
        fontSize: 18,
        align: "center",
      },
    })),
    ...rows.map((row, rowIndex) =>
      row.map((value) => ({
        text: String(value),
        options: {
          color: color(theme.colors.text),
          fill: {
            color:
              rowIndex % 2 === 0 ? color(theme.colors.light_bg) : color(theme.colors.background),
          },
          fontFace: theme.fonts.body,
          fontSize: 16,
        },
      })),
    ),
  ]
  slide.addTable(tableRows, {
    x: 0.8,
    y: 1.8,
    w: 11.7,
    h: 4.5,
    border: { type: "solid", color: color(theme.colors.accent), pt: 1 },
    valign: "middle",
  })
}
