// src/main.ts
import * as d3 from "d3";
type Num = number;

// DOM-Elemente
const container = document.getElementById("chart") as HTMLDivElement;
const canvas = document.getElementById("points") as HTMLCanvasElement;
const svg = d3.select<SVGSVGElement, unknown>("#axes");

// Layout & Margins
const margin = { top: 10, right: 12, bottom: 36, left: 46 };
let width = 0,
  height = 0,
  innerW = 0,
  innerH = 0;

// Basis-Skalen (werden via Zoom rescaled)
const x0 = d3.scaleLinear<Num, Num>();
const y0 = d3.scaleLinear<Num, Num>();

// Aktuelle (ggf. gezoomte) Skalen
let x = x0.copy();
let y = y0.copy();

// Daten generieren (10k Punkte, zwei normalverteilte Cluster)
const N = 20_000;
const normalFactory = d3.randomNormal.source(d3.randomLcg(42));
const cluster = (cx: number, cy: number, sx: number, sy: number, n: number) =>
  d3.range(n).map(() => ({
    x: cx + normalFactory(0, sx)(),
    y: cy + normalFactory(0, sy)(),
  }));

const data: Array<{ x: number; y: number }> = [
  ...cluster(-1.5, 0.8, 0.6, 0.4, Math.round(N * 0.55)),
  ...cluster(1.2, -0.6, 0.5, 0.7, Math.round(N * 0.45)),
];

// Domains mit kleinem Puffer
const xExtent = d3.extent(data, (d) => d.x) as [number, number];
const yExtent = d3.extent(data, (d) => d.y) as [number, number];
const pad = 0.2;
x0.domain([xExtent[0] - pad, xExtent[1] + pad]);
y0.domain([yExtent[0] - pad, yExtent[1] + pad]);

// Canvas-Kontext + HiDPI
const ctx = canvas.getContext("2d", {
  alpha: false,
}) as CanvasRenderingContext2D;
const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

// SVG-Layer: Gruppen für Achsen & Raster
const g = svg
  .append("g")
  .attr("transform", `translate(${margin.left},${margin.top})`);
const gx = g.append<SVGGElement>("g").attr("class", "axis x");
const gy = g.append<SVGGElement>("g").attr("class", "axis y");
const gGridX = g.append<SVGGElement>("g").attr("class", "grid grid-x");
const gGridY = g.append<SVGGElement>("g").attr("class", "grid grid-y");

// Unsichtbares Overlay für Zoom/Pan
const hit = g
  .append<SVGRectElement>("rect")
  .attr("fill", "transparent")
  .style("cursor", "grab");

// Achsen-Generatoren
const axisBottom = d3.axisBottom(x);
const axisLeft = d3.axisLeft(y);

// Zoom einrichten
const zoom = d3
  .zoom<SVGSVGElement, unknown>()
  .scaleExtent([0.75, 40])
  .translateExtent([
    [-1e6, -1e6],
    [1e6, 1e6],
  ])
  .on("zoom", (event) => {
    const t = event.transform;
    x = t.rescaleX(x0);
    y = t.rescaleY(y0);
    renderAxes();
    drawPoints();
  });

// Reset-Button
document.getElementById("reset")?.addEventListener("click", () => {
  svg.transition().duration(350).call(zoom.transform, d3.zoomIdentity);
});

// Resize/Initialisierung
const resize = () => {
  const hostW = container.clientWidth;
  width = Math.max(500, hostW);
  height = Math.round(width * 0.56); // 16:9-ish
  innerW = width - margin.left - margin.right;
  innerH = height - margin.top - margin.bottom;

  // Canvas Größe (HiDPI)
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // SVG Größe
  svg.attr("width", width).attr("height", height);

  // Layer-Boxen angleichen
  d3.selectAll<HTMLElement, unknown>(".layer")
    .style("width", `${width}px`)
    .style("height", `${height}px`);

  // Hit-Rect (Zoomfläche)
  hit.attr("x", 0).attr("y", 0).attr("width", innerW).attr("height", innerH);

  // Skalen-Ranges
  x0.range([0, innerW]);
  y0.range([innerH, 0]);

  // Aktuelle Transform beibehalten
  const t = d3.zoomTransform(svg.node() as SVGSVGElement);
  x = t.rescaleX(x0);
  y = t.rescaleY(y0);

  renderAxes();
  drawPoints();

  // Zoom binden & Transform fortschreiben
  svg.call(zoom as any).call(zoom.transform as any, t);
};

function renderAxes() {
  // Achsen positionieren (g ist bereits verschoben um margin)
  gx.attr("transform", `translate(0,${innerH})`).call(axisBottom.scale(x));
  gy.attr("transform", `translate(0,0)`).call(axisLeft.scale(y));

  // Rasterlinien
  gGridX.attr("transform", `translate(0,${innerH})`).call(
    d3
      .axisBottom(x)
      .tickSize(-innerH)
      .tickFormat(() => "")
  );
  gGridY.attr("transform", `translate(0,0)`).call(
    d3
      .axisLeft(y)
      .tickSize(-innerW)
      .tickFormat(() => "")
  );

  // Stiljustierung
  gx.selectAll<SVGLineElement, unknown>(".tick line")
    .attr("y2", 6)
    .attr("stroke", "#3b4a5d");
  gy.selectAll<SVGLineElement, unknown>(".tick line")
    .attr("x2", -6)
    .attr("stroke", "#3b4a5d");
  gGridX.selectAll<SVGLineElement, unknown>("line").attr("stroke", "#1e2835");
  gGridY.selectAll<SVGLineElement, unknown>("line").attr("stroke", "#1e2835");
}

function drawPoints() {
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.translate(margin.left, margin.top);

  ctx.beginPath();

  // Pixelkonstanter Punkt-Radius
  const r = 3;

  for (let i = 0; i < data.length; i++) {
    const px = x(data[i].x);
    const py = y(data[i].y);
    if (px < -4 || px > innerW + 4 || py < -4 || py > innerH + 4) continue;
    ctx.moveTo(px + r, py);
    ctx.arc(px, py, r, 0, Math.PI * 2);
  }

  ctx.fillStyle = "rgba(20, 122, 246, 0.75)";
  ctx.fill();
  ctx.restore();
}

// Start
window.addEventListener("resize", resize, { passive: true });
resize();
