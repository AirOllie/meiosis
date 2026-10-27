import { CellView } from "./cell_view.js?v=mitosis-2";

const NS = "http://www.w3.org/2000/svg";
function svg(tag, attributes) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attributes))
    node.setAttribute(key, value);
  return node;
}
const project = (position) => ({
  x: position.x + position.z * 1.7,
  y: -position.y,
});

export class MitosisView extends CellView {
  membraneGroups(elapsed) {
    if (this.model.state === "done")
      return this.model.cells.map((cell) => ({
        chromosomes: cell.chromosomes,
      }));
    if (this.phase === "divide")
      return [
        {
          split: this.model.groups,
          progress: Math.min(elapsed / this.model.cleavageDuration, 1),
          vertical: false,
        },
      ];
    return [{ chromosomes: this.model.chromatids }];
  }

  units() {
    return this.model.separated
      ? this.model.chromatids.map((chromosome) => ({ chromosome }))
      : super.units();
  }

  nucleusScale() {
    return this.model.state === "done" || this.phase === "divide" ? 0.95 : 0.9;
  }

  showNucleus() {
    return (
      (["initial", "replicating", "duplicated"].includes(this.model.state) &&
        this.phase !== "align") ||
      this.model.state === "done" ||
      this.phase === "divide"
    );
  }

  drawInterior(shape, opacity, scale) {
    super.drawInterior(shape, opacity, scale);
    const active = [
      "aligning",
      "metaphase",
      "anaphase",
      "anaphase_done",
    ].includes(this.model.state);
    if (!active || !this.model.groups) return;
    const group = svg("g", { class: "mitotic-spindle", opacity });
    if (this.model.state === "metaphase") {
      const centers = this.model.chromatids.map((c) =>
        project(this.model.centromere(c)),
      );
      const xs = centers.map((p) => p.x),
        ys = centers.map((p) => p.y);
      group.appendChild(
        svg("rect", {
          x: Math.min(...xs) - 7,
          y: Math.min(...ys) - 8,
          width: Math.max(...xs) - Math.min(...xs) + 14,
          height: Math.max(...ys) - Math.min(...ys) + 16,
          rx: 7,
          fill: "#b9b8d9",
          "fill-opacity": 0.12,
          stroke: "#9b9bc0",
          "stroke-width": 1 / scale,
          "stroke-dasharray": `${5 / scale} ${5 / scale}`,
          class: "metaphase-plate",
        }),
      );
    }
    for (const [side, chromosomes] of this.model.groups.entries()) {
      const pole = {
        x: shape.x + (side ? 1 : -1) * shape.rx * 0.83,
        y: shape.y,
      };
      for (const chromosome of chromosomes) {
        const target = project(this.model.centromere(chromosome));
        group.appendChild(
          svg("path", {
            d: `M${pole.x},${pole.y} Q${(pole.x + target.x) / 2},${target.y * 0.7 + pole.y * 0.3} ${target.x},${target.y}`,
            fill: "none",
            stroke: "#799eb3",
            "stroke-width": 0.75 / scale,
            "stroke-opacity": 0.3,
          }),
        );
      }
      for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI) / 4;
        group.appendChild(
          svg("line", {
            x1: pole.x,
            y1: pole.y,
            x2: pole.x + (Math.cos(angle) * 10) / scale,
            y2: pole.y + (Math.sin(angle) * 10) / scale,
            stroke: "#b38a52",
            "stroke-width": 1.5 / scale,
          }),
        );
      }
      group.appendChild(
        svg("circle", {
          cx: pole.x,
          cy: pole.y,
          r: 3.5 / scale,
          fill: "#b38a52",
        }),
      );
    }
    this.interior.appendChild(group);
  }
}
