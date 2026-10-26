const NS = "http://www.w3.org/2000/svg";
const A = "#348b96";
const B = "#de8b77";

export function shortChromatid(id) {
  const [origin, kind] = id.split("-");
  const root = { X: "23A", Y: "23B", XA: "23A", XB: "23B" }[origin] || origin;
  return (
    root +
    (kind?.startsWith("S") ? (kind === "S1" ? "′" : `′${kind.slice(1)}`) : "")
  );
}

export function shortSegment(id) {
  const parts = id.split("-");
  return `${shortChromatid(parts.slice(0, -1).join("-"))}·${parts.at(-1)}`;
}

function svgNode(tag, attributes = {}, text) {
  const node = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attributes))
    node.setAttribute(name, value);
  if (text !== undefined) node.textContent = text;
  return node;
}

function sourceColor(ball) {
  return /B$|^Y$/.test(ball.userData.segment.originChromosomeId) ? B : A;
}

export function renderDetail(container, pair, lab) {
  const chromatids = pair.sisters.length
    ? [pair.members[0], pair.sisters[0], pair.members[1], pair.sisters[1]]
    : pair.members;
  const svg = svgNode("svg", {
    viewBox: "0 0 300 290",
    role: "img",
    "aria-label": `${pair.id === "1" ? "Chromosome 1" : "Sex pair"} DNA segments`,
  });
  const exchanging = (lab.crossoverHistory || []).filter(
    (record) => record.status === "exchanging",
  );
  const active = new Set(
    exchanging.flatMap((record) =>
      record.transfers.flatMap((transfer) => transfer.segmentIds),
    ),
  );
  chromatids.forEach((chromosome, ci) => {
    const x =
      150 +
      (ci - (chromatids.length - 1) / 2) * (chromatids.length === 2 ? 110 : 68);
    const label = shortChromatid(chromosome.chromatidId);
    svg.appendChild(
      svgNode(
        "text",
        { x, y: 22, "text-anchor": "middle", class: "detail-chromosome-name" },
        label,
      ),
    );
    if (pair.id === "sex") {
      svg.appendChild(
        svgNode(
          "text",
          { x, y: 39, "text-anchor": "middle", class: "detail-sex-name" },
          chromosome.originChromosomeId === "Y" ? "Y" : "X",
        ),
      );
    }
    const top = pair.id === "sex" ? 62 : 50;
    const gap = 25;
    const positions = chromosome.balls.map((ball, index) => {
      const record = exchanging.find((record) =>
        record.transfers.some((transfer) =>
          transfer.segmentIds.includes(ball.userData.segment.id),
        ),
      );
      const transfer = record?.transfers.find((transfer) =>
        transfer.segmentIds.includes(ball.userData.segment.id),
      );
      const targetIndex = transfer
        ? chromatids.findIndex((c) => c.chromatidId === transfer.to)
        : -1;
      const targetX =
        targetIndex < 0
          ? x
          : 150 + (targetIndex - (chromatids.length - 1) / 2) * 68;
      const progress = record?.progress || 0;
      return {
        x: x + (targetX - x) * progress,
        y:
          top +
          index * gap +
          (targetX > x ? -1 : 1) * Math.sin(progress * Math.PI) * 9,
      };
    });
    positions.forEach((position, index) => {
      if (!index) return;
      const previous = positions[index - 1];
      const dx = position.x - previous.x,
        dy = position.y - previous.y;
      const distance = Math.hypot(dx, dy) || 1;
      svg.appendChild(
        svgNode("line", {
          x1: previous.x + (dx * 10) / distance,
          y1: previous.y + (dy * 10) / distance,
          x2: position.x - (dx * 10) / distance,
          y2: position.y - (dy * 10) / distance,
          stroke: "#d9e2e6",
          "stroke-width": 3,
        }),
      );
    });
    chromosome.balls.forEach((ball, index) => {
      const segment = ball.userData.segment;
      const { x: segmentX, y } = positions[index];
      const g = svgNode("g", {
        class: active.has(segment.id)
          ? "detail-segment exchanging"
          : "detail-segment",
      });
      g.appendChild(
        svgNode(
          "title",
          {},
          `Segment ${shortSegment(segment.id)}; currently in ${label}${segment.copiedFromId ? `; copied from ${shortSegment(segment.copiedFromId)}` : ""}`,
        ),
      );
      g.appendChild(
        svgNode("circle", {
          cx: segmentX,
          cy: y,
          r: 10,
          fill: sourceColor(ball),
          stroke: segment.region === "PAR1" ? "#1d5c9a" : "white",
          "stroke-width": segment.region === "PAR1" ? 3 : 2,
        }),
      );
      g.appendChild(
        svgNode(
          "text",
          {
            x: segmentX,
            y: y + 3.5,
            "text-anchor": "middle",
            class: "detail-segment-number",
          },
          String(segment.originalIndex).padStart(2, "0"),
        ),
      );
      svg.appendChild(g);
    });
  });
  container.replaceChildren(svg);
}
