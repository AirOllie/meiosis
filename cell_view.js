import { shortChromatid, shortSegment } from "./schematic_view.js";

const NS = "http://www.w3.org/2000/svg";
const svg = (tag, attrs = {}, text) => {
  const node = document.createElementNS(NS, tag);
  Object.entries(attrs).forEach(([key, value]) =>
    node.setAttribute(key, value),
  );
  if (text !== undefined) node.textContent = text;
  return node;
};
const point = (ball) => ({
  x: ball.position.x + ball.position.z * 1.7,
  y: -ball.position.y,
});
const color = (ball) =>
  /B$|^Y$/.test(ball.userData.segment.originChromosomeId)
    ? "#d67f6c"
    : "#2b8796";

function envelope(chromosomes) {
  const points = chromosomes.flatMap((c) => c.balls.map(point));
  const left = Math.min(...points.map((p) => p.x));
  const right = Math.max(...points.map((p) => p.x));
  const top = Math.min(...points.map((p) => p.y));
  const bottom = Math.max(...points.map((p) => p.y));
  return {
    x: (left + right) / 2,
    y: (top + bottom) / 2,
    rx: (right - left) * 0.59 + 12,
    ry: (bottom - top) * 0.59 + 12,
  };
}

function cleavagePath(a, b, progress, vertical) {
  const convert = (p) =>
    vertical ? { x: p.y, y: p.x, rx: p.ry, ry: p.rx } : p;
  let first = convert(a),
    second = convert(b);
  if (first.x > second.x) [first, second] = [second, first];
  const mid = (first.x + second.x) / 2;
  const cy = (first.y + second.y) / 2;
  const neck = Math.max(0.05, Math.min(first.ry, second.ry) * (1 - progress));
  const left = first.x - first.rx,
    right = second.x + second.rx;
  const coord = (x, y) => (vertical ? `${y},${x}` : `${x},${y}`);
  return `M${coord(left, first.y)} C${coord(left, first.y - first.ry)} ${coord(first.x, first.y - first.ry)} ${coord(mid, cy - neck)} C${coord(second.x, second.y - second.ry)} ${coord(right, second.y - second.ry)} ${coord(right, second.y)} C${coord(right, second.y + second.ry)} ${coord(second.x, second.y + second.ry)} ${coord(mid, cy + neck)} C${coord(first.x, first.y + first.ry)} ${coord(left, first.y + first.ry)} ${coord(left, first.y)} Z`;
}

export class CellView {
  constructor(container, model, lab) {
    Object.assign(this, { container, model, lab });
    this.phase = null;
    this.nodes = new Map();
    this.svg = svg("svg", {
      role: "img",
      "aria-label": "Animated cells and numbered chromosomes",
    });
    this.layer = svg("g");
    this.membranes = svg("g", { class: "cell-membranes" });
    this.strands = svg("g");
    this.labels = svg("g");
    this.layer.append(this.membranes, this.strands, this.labels);
    this.svg.appendChild(this.layer);
    container.replaceChildren(this.svg);
    container.className = "live-cell-view";
    this.observer = new ResizeObserver(() => this.update(this.phase));
    this.observer.observe(container);
    this.update(null);
  }

  update(phase) {
    if (phase !== this.phase) {
      this.phase = phase;
      this.startedAt = performance.now();
    }
    this.settle = 35;
    if (!this.running) {
      this.running = true;
      this.frame();
    }
  }

  membraneGroups(elapsed) {
    const model = this.model;
    if (model.state === "done")
      return model.cells.map((cell) => ({ chromosomes: cell.chromosomes }));
    if (this.phase === "divide") {
      const progress = Math.min(elapsed / 1200, 1);
      return [{ split: model.groups, progress, vertical: false }];
    }
    if (this.phase === "divideAgain" && elapsed > 1600) {
      return model.sisterPairs.map((pairs) => ({
        split: [pairs.map((pair) => pair[0]), pairs.map((pair) => pair[1])],
        progress: Math.min((elapsed - 1600) / 2000, 1),
        vertical: true,
      }));
    }
    if (model.state === "telophase1_done")
      return model.cells.map((cell) => ({ chromosomes: cell.chromosomes }));
    return [{ chromosomes: model.chromatids }];
  }

  units() {
    if (this.model.state === "done" || this.phase === "divideAgain") {
      return this.model.chromatids.map((chromosome) => ({ chromosome }));
    }
    return this.model.pairs.flatMap((pair) =>
      pair.members.map((chromosome, i) => ({
        chromosome,
        sister: pair.sisters[i],
        virtualCopy: !pair.sisters[i] && this.phase === "duplicate",
      })),
    );
  }

  makeUnit(id) {
    const group = svg("g", { "data-chromosome-id": id });
    const title = svg("title", {}, shortChromatid(id));
    group.appendChild(title);
    const label = svg(
      "text",
      { "text-anchor": "middle", class: "live-chromosome-label" },
      shortChromatid(id),
    );
    const leader = svg("line", {
      stroke: "#9db7b8",
      "stroke-linecap": "round",
    });
    this.strands.appendChild(group);
    this.labels.appendChild(leader);
    this.labels.appendChild(label);
    const unit = {
      group,
      label,
      leader,
      lines: [],
      segments: new Map(),
      copies: [],
    };
    this.nodes.set(id, unit);
    return unit;
  }

  drawUnit(unit, scale, elapsed) {
    const id = unit.chromosome.chromatidId;
    const node = this.nodes.get(id) || this.makeUnit(id);
    node.group.style.display = "";
    node.label.style.display = "";
    const chromosomes = [unit.chromosome];
    if (unit.sister) chromosomes.push(unit.sister);
    if (unit.virtualCopy) {
      const progress = Math.min(elapsed / 800, 1);
      chromosomes.push({
        balls: unit.chromosome.balls.map((ball) => ({
          position: {
            x: ball.position.x + 2.2 * progress,
            y: ball.position.y,
            z: ball.position.z,
          },
          userData: ball.userData,
        })),
      });
    }
    let n = 0;
    for (const chromosome of chromosomes) {
      const points = chromosome.balls.map(point);
      for (let i = 1; i < points.length; i++) {
        let line = node.lines[n++];
        if (!line) {
          line = svg("line", { "stroke-linecap": "round" });
          node.lines.push(line);
          node.group.appendChild(line);
        }
        const a = points[i - 1],
          b = points[i];
        line.setAttribute("x1", a.x);
        line.setAttribute("y1", a.y);
        line.setAttribute("x2", b.x);
        line.setAttribute("y2", b.y);
        line.setAttribute("stroke", color(chromosome.balls[i]));
        line.setAttribute(
          "stroke-width",
          (points.length === 2 ? 4.2 : 4.6) / scale,
        );
        line.style.display = "";
      }
      // A separate terminal cap preserves the origin of the tiny X/Y PAR
      // segment while the model moves that exact ball during exchange.
      let cap = node.lines[n++];
      if (!cap) {
        cap = svg("line", { "stroke-linecap": "round" });
        node.lines.push(cap);
        node.group.appendChild(cap);
      }
      const p = points[0];
      cap.setAttribute("x1", p.x);
      cap.setAttribute("x2", p.x + 0.01);
      cap.setAttribute("y1", p.y);
      cap.setAttribute("y2", p.y);
      cap.setAttribute("stroke", color(chromosome.balls[0]));
      cap.setAttribute("stroke-width", 4.8 / scale);
      cap.style.display = "";
    }
    node.lines.slice(n).forEach((line) => {
      line.style.display = "none";
    });
    this.drawSegments(node, unit, chromosomes, scale);
    // Anchor names at the centromere, which remains with its chromosome
    // even when a terminal segment is exchanged.
    const index =
      (unit.chromosome.pattern.split("-")[0].match(/o/g) || []).length - 1;
    const anchors = chromosomes.map((c) =>
      point(c.balls[Math.min(index, c.balls.length - 1)]),
    );
    const top = Math.min(...unit.chromosome.balls.map((ball) => point(ball).y));
    const labelX = anchors.reduce((sum, p) => sum + p.x, 0) / anchors.length;
    const labelY = top - (unit.chromosome.detailed ? 10 : 4) / scale;
    node.label.setAttribute("x", labelX);
    node.label.setAttribute("y", labelY);
    node.label.setAttribute(
      "font-size",
      (this.width < 450 ? 7.5 : 8.5) / scale,
    );
    node.labelPosition = { x: labelX, y: labelY, anchorY: top };
  }

  drawSegments(node, unit, chromosomes, scale) {
    for (const marker of node.segments.values())
      marker.group.style.display = "none";
    node.copies.forEach((label) => {
      label.style.display = "none";
    });
    if (!unit.chromosome.detailed) return;
    const active = new Set(
      (this.lab.crossoverHistory || [])
        .filter((record) => record.status === "exchanging")
        .flatMap((record) =>
          record.transfers.flatMap((transfer) => transfer.segmentIds),
        ),
    );
    chromosomes.forEach((chromosome, ci) => {
      // A virtual replication preview has no new identity until its real copy exists.
      if (!chromosome.chromatidId) return;
      const points = chromosome.balls.map(point);
      const gap = Math.min(
        ...points
          .slice(1)
          .map(
            (p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y) * scale,
          ),
      );
      const radius = Math.max(2.3, Math.min(6.2, gap * 0.44));
      const inside = radius >= 3.8;
      chromosome.balls.forEach((ball, i) => {
        const segment = ball.userData.segment;
        let marker = node.segments.get(segment.id);
        if (!marker) {
          const group = svg("g", {
            class: "live-segment",
            "data-segment-id": segment.id,
          });
          const title = svg("title");
          const circle = svg("circle");
          const number = svg("text", {
            class: "live-segment-number",
            "text-anchor": "middle",
          });
          group.append(title, circle, number);
          node.group.appendChild(group);
          marker = { group, title, circle, number };
          node.segments.set(segment.id, marker);
        }
        marker.group.style.display = "";
        marker.group.setAttribute(
          "transform",
          `translate(${points[i].x},${points[i].y})`,
        );
        marker.title.textContent = `${shortSegment(segment.id)}; in ${shortChromatid(chromosome.chromatidId)}${segment.copiedFromId ? `; copied from ${shortSegment(segment.copiedFromId)}` : ""}${segment.region ? `; ${segment.region}` : ""}`;
        marker.circle.setAttribute("r", radius / scale);
        marker.circle.setAttribute("fill", color(ball));
        marker.circle.setAttribute(
          "stroke",
          active.has(segment.id)
            ? "#d49a38"
            : segment.region === "PAR1"
              ? "#235f99"
              : "#f6faf8",
        );
        marker.circle.setAttribute(
          "stroke-width",
          (active.has(segment.id) || segment.region === "PAR1" ? 1.8 : 0.8) /
            scale,
        );
        marker.number.textContent = String(segment.originalIndex).padStart(
          2,
          "0",
        );
        marker.number.setAttribute(
          "x",
          inside ? 0 : ((i % 2 ? 1 : -1) * (radius + 5)) / scale,
        );
        marker.number.setAttribute("y", 2.5 / scale);
        marker.number.setAttribute(
          "font-size",
          (inside ? Math.min(7, radius * 1.35) : 7.5) / scale,
        );
        marker.number.setAttribute("fill", inside ? "white" : "#42636f");
        marker.number.setAttribute("paint-order", "stroke");
        marker.number.setAttribute("stroke", inside ? "none" : "#edf5f2");
        marker.number.setAttribute("stroke-width", 2 / scale);
      });
      if (chromosomes.length > 1) {
        let label = node.copies[ci];
        if (!label) {
          label = svg("text", {
            class: "live-chromosome-label",
            "text-anchor": "middle",
          });
          node.copies[ci] = label;
          node.group.appendChild(label);
        }
        const bottom = points.reduce((a, b) => (a.y > b.y ? a : b));
        label.style.display = "";
        label.textContent = ci ? "′" : "";
        label.setAttribute("x", bottom.x);
        label.setAttribute("y", bottom.y + (radius + 9) / scale);
        label.setAttribute("font-size", 11 / scale);
      }
    });
  }

  layoutLabels(scale) {
    const rows = [];
    const font = this.width < 450 ? 7.5 : 8.5;
    const visible = [...this.nodes.values()].filter(
      (node) => node.group.style.display !== "none",
    );
    visible.sort((a, b) => a.labelPosition.y - b.labelPosition.y);
    for (const node of visible) {
      let row = rows.find(
        (row) => Math.abs(row.y - node.labelPosition.y) * scale < 5,
      );
      if (!row) {
        row = { y: node.labelPosition.y, nodes: [] };
        rows.push(row);
      }
      row.nodes.push(node);
    }
    for (const row of rows) {
      row.nodes.sort((a, b) => a.labelPosition.x - b.labelPosition.x);
      let right = -Infinity;
      const placed = row.nodes.map((node) => {
        const half = (node.label.textContent.length * font * 0.3) / scale;
        const x = Math.max(node.labelPosition.x, right + half + 1.5 / scale);
        right = x + half;
        return { node, x };
      });
      const offset =
        placed.reduce(
          (sum, item) => sum + item.x - item.node.labelPosition.x,
          0,
        ) / placed.length;
      for (const { node, x } of placed) {
        const adjusted = x - offset;
        node.label.setAttribute("x", adjusted);
        const shifted = Math.abs(adjusted - node.labelPosition.x) * scale > 2;
        node.leader.style.display = shifted ? "" : "none";
        node.leader.setAttribute("x1", node.labelPosition.x);
        node.leader.setAttribute("y1", node.labelPosition.anchorY - 1 / scale);
        node.leader.setAttribute("x2", adjusted);
        node.leader.setAttribute("y2", node.labelPosition.y + 0.5 / scale);
        node.leader.setAttribute("stroke-width", 0.65 / scale);
      }
    }
  }

  frame() {
    const elapsed = performance.now() - (this.startedAt || performance.now());
    this.width = Math.max(this.container.clientWidth, 300);
    this.height =
      this.width < 450 ? 440 : Math.min(720, Math.max(500, this.width * 0.62));
    this.svg.setAttribute("viewBox", `0 0 ${this.width} ${this.height}`);
    const groups = this.membraneGroups(elapsed);
    const shapes = groups.flatMap((group) =>
      group.split ? group.split.map(envelope) : [envelope(group.chromosomes)],
    );
    const left = Math.min(...shapes.map((shape) => shape.x - shape.rx));
    const right = Math.max(...shapes.map((shape) => shape.x + shape.rx));
    const top = Math.min(...shapes.map((shape) => shape.y - shape.ry));
    const bottom = Math.max(...shapes.map((shape) => shape.y + shape.ry));
    const target = {
      x: (left + right) / 2,
      y: (top + bottom) / 2,
      scale: Math.min(
        (this.width - 35) / (right - left),
        (this.height - 45) / (bottom - top),
      ),
    };
    if (!this.camera) this.camera = { ...target };
    for (const key of ["x", "y", "scale"])
      this.camera[key] += (target[key] - this.camera[key]) * 0.18;
    const { x, y, scale } = this.camera;
    this.layer.setAttribute(
      "transform",
      `translate(${this.width / 2},${this.height / 2}) scale(${scale}) translate(${-x},${-y})`,
    );
    this.membranes.replaceChildren();
    const ellipse = (shape, opacity = 1) => {
      this.membranes.appendChild(
        svg("ellipse", {
          cx: shape.x,
          cy: shape.y,
          rx: shape.rx,
          ry: shape.ry,
          fill: "#edf5f2",
          "fill-opacity": 0.78 * opacity,
          stroke: "#86b2aa",
          "stroke-opacity": opacity,
          "stroke-width": 1.8 / scale,
        }),
      );
      this.membranes.appendChild(
        svg("ellipse", {
          cx: shape.x,
          cy: shape.y,
          rx: shape.rx + 0.8 / scale,
          ry: shape.ry + 0.8 / scale,
          fill: "none",
          stroke: "#d5e5df",
          "stroke-opacity": opacity,
          "stroke-width": 4 / scale,
        }),
      );
    };
    for (const group of groups) {
      if (!group.split) {
        ellipse(envelope(group.chromosomes));
        continue;
      }
      const [a, b] = group.split.map(envelope);
      this.membranes.appendChild(
        svg("path", {
          d: cleavagePath(a, b, group.progress, group.vertical),
          fill: "#edf5f2",
          "fill-opacity": 0.8 * (1 - group.progress * 0.65),
          stroke: "#86b2aa",
          "stroke-width": 1.8 / scale,
          opacity: 1 - group.progress,
        }),
      );
      ellipse(a, group.progress);
      ellipse(b, group.progress);
    }
    for (const node of this.nodes.values()) {
      node.group.style.display = "none";
      node.label.style.display = "none";
      node.leader.style.display = "none";
    }
    this.units().forEach((unit) => this.drawUnit(unit, scale, elapsed));
    this.layoutLabels(scale);
    if (this.phase || this.settle-- > 0)
      requestAnimationFrame(() => this.frame());
    else this.running = false;
  }
}
