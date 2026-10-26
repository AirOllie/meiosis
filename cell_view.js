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
    rx: (right - left) * 0.66 + 15,
    ry: (bottom - top) * 0.66 + 15,
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
    this.zoom = 1;
    this.svg = svg("svg", {
      role: "img",
      "aria-label": "Animated cells and numbered chromosomes",
    });
    const defs = svg("defs");
    const cytoplasm = svg("radialGradient", {
      id: "cytoplasm",
      cx: "38%",
      cy: "30%",
      r: "72%",
    });
    for (const [offset, shade] of [
      ["0%", "#fbf6ee"],
      ["65%", "#e4eee8"],
      ["92%", "#a6cbc2"],
      ["100%", "#528f88"],
    ])
      cytoplasm.appendChild(svg("stop", { offset, "stop-color": shade }));
    const nucleus = svg("radialGradient", {
      id: "nucleoplasm",
      cx: "38%",
      cy: "28%",
      r: "80%",
    });
    nucleus.append(
      svg("stop", { offset: "0%", "stop-color": "#f8f5ff" }),
      svg("stop", { offset: "100%", "stop-color": "#d9e1f1" }),
    );
    const shadow = svg("filter", {
      id: "cell-shadow",
      x: "-20%",
      y: "-20%",
      width: "140%",
      height: "140%",
    });
    shadow.appendChild(
      svg("feDropShadow", {
        dx: 0,
        dy: 1,
        stdDeviation: 1.5,
        "flood-color": "#264f55",
        "flood-opacity": 0.12,
      }),
    );
    defs.append(cytoplasm, nucleus, shadow);
    this.svg.appendChild(defs);
    this.layer = svg("g");
    this.membranes = svg("g", { class: "cell-membranes" });
    this.interior = svg("g", { class: "cell-interior" });
    this.strands = svg("g");
    this.labels = svg("g");
    this.layer.append(this.membranes, this.interior, this.strands, this.labels);
    this.svg.appendChild(this.layer);
    container.replaceChildren(this.svg);
    container.className = "live-cell-view";
    this.observer = new ResizeObserver(() => this.update(this.phase));
    this.observer.observe(container);
    this.update(null);
  }

  setZoom(value) {
    this.zoom = Math.max(0.2, Math.min(2, value));
    this.update(this.phase);
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
    const cohesion = svg("g", { class: "sister-cohesion" });
    group.appendChild(cohesion);
    const label = svg(
      "text",
      {
        "text-anchor": "middle",
        class: `live-chromosome-label${id.split("-")[1]?.startsWith("S") ? " sister-label" : ""}`,
        "data-chromatid-label": id,
      },
      shortChromatid(id),
    );
    const leader = svg("line", {
      stroke: "#9db7b8",
      "stroke-linecap": "round",
    });
    const sisterLabel = {
      label: svg("text", {
        "text-anchor": "middle",
        class: "live-chromosome-label sister-label",
      }),
      leader: svg("line", { stroke: "#7b91a1", "stroke-linecap": "round" }),
    };
    sisterLabel.label.style.display = "none";
    sisterLabel.leader.style.display = "none";
    this.labels.append(sisterLabel.leader, sisterLabel.label);
    this.strands.appendChild(group);
    this.labels.appendChild(leader);
    this.labels.appendChild(label);
    const unit = {
      group,
      label,
      leader,
      lines: [],
      segments: new Map(),
      sisterLabel,
      cohesion,
      cohesionLinks: [],
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
            x:
              ball.position.x +
              (unit.chromosome.detailed ? 5.8 : 2.2) * progress,
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
          (unit.chromosome.detailed ? 7 : 6) / scale,
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
      cap.setAttribute("stroke-width", 7 / scale);
      cap.style.display = "";
    }
    node.lines.slice(n).forEach((line) => {
      line.style.display = "none";
    });
    this.drawSegments(node, unit, chromosomes, scale);
    this.drawCohesion(node, unit, chromosomes, scale);
    // Every real chromatid gets its own name. Anchor to its centromere,
    // so exchanging a terminal segment cannot move the chromatid's label.
    const place = (slot, chromosome, sister) => {
      const index =
        (chromosome.pattern.split("-")[0].match(/o/g) || []).length - 1;
      const anchor = point(
        chromosome.balls[Math.min(index, chromosome.balls.length - 1)],
      );
      const top = Math.min(...chromosome.balls.map((ball) => point(ball).y));
      const font = chromosome.detailed ? 16 : 13;
      const rise =
        (chromosome.detailed ? 17 : 9) +
        (sister ? (chromosome.detailed ? 23 : 20) : 0);
      const y = top - rise / scale;
      slot.label.textContent = shortChromatid(chromosome.chromatidId);
      slot.label.setAttribute("data-chromatid-label", chromosome.chromatidId);
      slot.label.style.display = "";
      slot.label.setAttribute("x", anchor.x);
      slot.label.setAttribute("y", y);
      slot.label.setAttribute("font-size", font / scale);
      slot.labelPosition = { x: anchor.x, y, anchorY: top, font, sister };
    };
    place(node, unit.chromosome, false);
    node.sisterLabel.label.style.display = "none";
    node.sisterLabel.leader.style.display = "none";
    if (unit.sister) place(node.sisterLabel, unit.sister, true);
  }

  drawCohesion(node, unit, chromosomes, scale) {
    node.cohesionLinks.forEach((link) => {
      link.style.display = "none";
    });
    if (chromosomes.length !== 2) return;
    const [original, sister] = chromosomes;
    const left = original.balls.map(point),
      right = sister.balls.map(point);
    const boundary = (original.pattern.split("-")[0].match(/o/g) || []).length;
    const centromere = (points) => ({
      x: (points[boundary - 1].x + points[boundary].x) / 2,
      y: (points[boundary - 1].y + points[boundary].y) / 2,
    });
    const armCohesion =
      this.phase !== "separate" &&
      !["anaphase1_done", "telophase1_done"].includes(this.model.state);
    const active = new Set(
      (this.lab.crossoverHistory || [])
        .filter((record) => record.status === "exchanging")
        .flatMap((record) =>
          record.transfers.flatMap((transfer) => transfer.segmentIds),
        ),
    );
    const links = [
      { a: centromere(left), b: centromere(right), central: true },
    ];
    if (armCohesion && original.detailed) {
      for (let i = 0; i < left.length; i++) {
        if (i === boundary - 1 || i === boundary) continue;
        if (
          active.has(original.balls[i].userData.segment.id) ||
          active.has(sister.balls[i].userData.segment.id)
        )
          continue;
        links.push({ a: left[i], b: right[i], central: false });
      }
    }
    links.forEach(({ a, b, central }, i) => {
      let link = node.cohesionLinks[i];
      if (!link) {
        link = svg("line", { "stroke-linecap": "round" });
        link.appendChild(svg("title"));
        node.cohesionLinks.push(link);
        node.cohesion.appendChild(link);
      }
      link.style.display = "";
      link.setAttribute("data-cohesion", central ? "centromere" : "arm");
      link.setAttribute(
        "data-sisters",
        `${original.chromatidId} ${sister.chromatidId || "replicating"}`,
      );
      link.children[0].textContent = central
        ? "Sister cohesion near the centromere; released in meiosis II"
        : "Sister arm cohesion; released at anaphase I (schematic)";
      link.setAttribute("x1", a.x);
      link.setAttribute("y1", a.y);
      link.setAttribute("x2", b.x);
      link.setAttribute("y2", b.y);
      link.setAttribute("stroke", central ? "#b88838" : "#c6a15b");
      link.setAttribute("stroke-width", (central ? 4.5 : 1.6) / scale);
      link.setAttribute("opacity", central ? 1 : 0.65);
    });
  }

  drawSegments(node, unit, chromosomes, scale) {
    for (const marker of node.segments.values())
      marker.group.style.display = "none";
    if (!unit.chromosome.detailed) return;
    const active = new Set(
      (this.lab.crossoverHistory || [])
        .filter((record) => record.status === "exchanging")
        .flatMap((record) =>
          record.transfers.flatMap((transfer) => transfer.segmentIds),
        ),
    );
    chromosomes.forEach((chromosome) => {
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
      const radius = Math.max(5, Math.min(12, gap * 0.44));
      const inside = radius >= 8;
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
          inside ? 0 : ((i % 2 ? 1 : -1) * (radius + 7)) / scale,
        );
        marker.number.setAttribute("y", 4 / scale);
        marker.number.setAttribute("font-size", (inside ? 12 : 11) / scale);
        marker.number.setAttribute("fill", inside ? "white" : "#42636f");
        marker.number.setAttribute("paint-order", "stroke");
        marker.number.setAttribute("stroke", inside ? "none" : "#edf5f2");
        marker.number.setAttribute("stroke-width", 2 / scale);
      });
    });
  }

  layoutLabels(scale) {
    const rows = [];
    const visible = [...this.nodes.values()]
      .filter((node) => node.group.style.display !== "none")
      .flatMap((node) =>
        node.sisterLabel.label.style.display !== "none"
          ? [node, node.sisterLabel]
          : [node],
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
        const half =
          (node.label.textContent.length * node.labelPosition.font * 0.32) /
          scale;
        const x = Math.max(node.labelPosition.x, right + half + 4 / scale);
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
        const shifted =
          node.labelPosition.sister ||
          Math.abs(adjusted - node.labelPosition.x) * scale > 2;
        node.leader.style.display = shifted ? "" : "none";
        node.leader.setAttribute("x1", node.labelPosition.x);
        node.leader.setAttribute("y1", node.labelPosition.anchorY - 1 / scale);
        node.leader.setAttribute("x2", adjusted);
        node.leader.setAttribute("y2", node.labelPosition.y + 0.5 / scale);
        node.leader.setAttribute("stroke-width", 0.65 / scale);
      }
    }
  }

  drawInterior(shape, opacity, scale) {
    const group = svg("g", { opacity });
    // Peripheral granules add a quiet cytoplasmic texture; they do not encode data.
    for (let i = 0; i < 42; i++) {
      const angle = i * 2.399963;
      const radial = 0.82 + (i % 4) * 0.035;
      group.appendChild(
        svg("circle", {
          cx: shape.x + Math.cos(angle) * shape.rx * radial,
          cy: shape.y + Math.sin(angle) * shape.ry * radial,
          r: (i % 3 === 0 ? 1.7 : 1) / scale,
          fill: "#658f85",
          opacity: 0.25,
        }),
      );
    }
    const nuclear =
      ["initial", "duplicated"].includes(this.model.state) &&
      this.phase !== "formTetrads";
    if (nuclear) {
      group.appendChild(
        svg("ellipse", {
          cx: shape.x,
          cy: shape.y,
          rx: shape.rx * 0.9,
          ry: shape.ry * 0.9,
          fill: "url(#nucleoplasm)",
          stroke: "#9bacc6",
          "stroke-width": 1.6 / scale,
          "stroke-dasharray": `${5 / scale} ${3 / scale}`,
        }),
      );
    }
    this.interior.appendChild(group);
  }

  frame() {
    const elapsed = performance.now() - (this.startedAt || performance.now());
    this.width = Math.max(this.container.clientWidth - 24, 960);
    const divided = this.model.state === "done" || this.phase === "divideAgain";
    this.height = divided
      ? Math.max(1100, this.width * 1.08)
      : Math.max(790, this.width * 0.74);
    this.svg.style.width = `${this.width * this.zoom}px`;
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
    this.interior.replaceChildren();
    const ellipse = (shape, opacity = 1) => {
      this.drawInterior(shape, opacity, scale);
      this.membranes.appendChild(
        svg("ellipse", {
          cx: shape.x,
          cy: shape.y,
          rx: shape.rx,
          ry: shape.ry,
          fill: "url(#cytoplasm)",
          "fill-opacity": opacity,
          filter: "url(#cell-shadow)",
          stroke: "#4a8781",
          "stroke-opacity": opacity,
          "stroke-width": 3 / scale,
        }),
      );
      this.membranes.appendChild(
        svg("ellipse", {
          cx: shape.x,
          cy: shape.y,
          rx: shape.rx + 0.8 / scale,
          ry: shape.ry + 0.8 / scale,
          fill: "none",
          stroke: "#b6d8cc",
          "stroke-opacity": opacity,
          "stroke-width": 6 / scale,
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
          fill: "url(#cytoplasm)",
          "fill-opacity": 0.8 * (1 - group.progress * 0.65),
          stroke: "#4a8781",
          "stroke-width": 3 / scale,
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
      node.sisterLabel.label.style.display = "none";
      node.sisterLabel.leader.style.display = "none";
    }
    this.units().forEach((unit) => this.drawUnit(unit, scale, elapsed));
    this.layoutLabels(scale);
    if (this.phase || this.settle-- > 0)
      requestAnimationFrame(() => this.frame());
    else this.running = false;
  }
}
