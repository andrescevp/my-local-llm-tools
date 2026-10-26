const TYPES = {
  bar: ["bar", {}],
  column: ["bar", {}],
  line: ["line", {}],
  pie: ["pie", {}],
  doughnut: ["doughnut", {}],
  area: ["area", {}],
  bar_stacked: ["bar", { barGrouping: "stacked" }],
  line_markers: ["line", { lineDataSymbol: "circle" }],
}

export function addChartSlide(pptx, slide, data, theme, { color, title }) {
  title(slide, data.title, theme)
  const [name, extra] = TYPES[data.chart_type] || TYPES.bar
  const chartType = pptx.ChartType?.[name] ?? name
  const datasets = data.datasets || []
  const chartData = datasets.map((dataset) => ({
    name: dataset.label || "Series",
    labels: data.labels || [],
    values: dataset.data || [],
  }))
  slide.addChart(chartType, chartData, {
    x: 0.8,
    y: 1.8,
    w: 11.7,
    h: 5.0,
    showLegend: datasets.length > 1,
    legendPos: "b",
    chartColors: datasets.map((dataset, index) =>
      color(
        dataset.color ||
          theme.chart_accent_colors?.[index % (theme.chart_accent_colors?.length || 1)],
      ),
    ),
    ...extra,
  })
}
