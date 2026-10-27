import test from "node:test";
import assert from "node:assert/strict";
import { SchematicLab } from "../schematic_lab.js";
import { HumanMitosis } from "../human_mitosis.js";
import { MitosisView } from "../mitosis_view.js";
import { shortChromatid } from "../schematic_view.js";

class SvgNode {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.attributes = {};
    this.style = {};
    this.clientWidth = 1100;
  }
  setAttribute(key, value) {
    this.attributes[key] = String(value);
  }
  getAttribute(key) {
    return this.attributes[key];
  }
  appendChild(node) {
    this.children.push(node);
  }
  append(...nodes) {
    this.children.push(...nodes);
  }
  replaceChildren(...nodes) {
    this.children = nodes;
  }
}
globalThis.document = { createElementNS: (_, tag) => new SvgNode(tag) };
globalThis.ResizeObserver = class {
  observe() {}
};
let frames = [];
globalThis.requestAnimationFrame = (callback) => {
  frames.push(callback);
};

for (const sex of ["XX", "XY"]) {
  test(`${sex} mitosis preserves both homologs and produces two 46-chromosome daughters without exchange`, async (t) => {
    const lab = new SchematicLab();
    const model = new HumanMitosis(lab, sex);
    assert.deepEqual(model.summary, [{ chromosomes: 46, chromatids: 46 }]);
    assert.equal(model.chromatids.length, 46);
    assert.equal(typeof model.crossover, "undefined");
    await assert.rejects(model.align(0), /Expected duplicated/);
    await model.duplicate(0);
    await assert.rejects(model.duplicate(0), /Expected initial/);
    assert.deepEqual(model.summary, [{ chromosomes: 46, chromatids: 92 }]);
    const chains = new Map(model.chromatids.map((c) => [c, [...c.balls]]));
    const identities = new Map(
      model.chromatids.flatMap((c) =>
        c.balls.map((ball) => [ball, ball.userData.segment]),
      ),
    );
    let roll = 0;
    t.mock.method(Math, "random", () => (roll++ % 2 ? 0.75 : 0.25));
    await model.align(0);
    assert.equal(model.state, "metaphase");
    for (const pair of model.pairs) {
      for (let i = 0; i < 2; i++) {
        const a = model.centromere(pair.members[i]),
          b = model.centromere(pair.sisters[i]);
        assert.ok(Math.abs((a.x + b.x) / 2) < 1e-9);
        assert.ok(Math.abs(a.y - b.y) < 1e-9);
        assert.equal(a.z, b.z);
        assert.ok(a.x * b.x < 0);
      }
    }
    assert.equal(model.armCohesion, false);
    await model.separate(0);
    assert.deepEqual(model.summary, [{ chromosomes: 92, chromatids: 92 }]);
    assert.equal(model.separated, true);
    assert.equal(model.cells.length, 1);
    const roots = new Set(
      model.pairs.flatMap((p) => p.members.map((c) => c.originChromosomeId)),
    );
    for (const [side, group] of model.groups.entries()) {
      assert.equal(group.length, 46);
      assert.deepEqual(new Set(group.map((c) => c.originChromosomeId)), roots);
      assert.ok(
        group.every((c) =>
          side ? model.centromere(c).x > 100 : model.centromere(c).x < -100,
        ),
      );
    }
    let now = 0;
    t.mock.method(Date, "now", () => (now += 10000));
    await model.divide(1);
    assert.equal(model.cells.length, 2);
    assert.deepEqual(
      model.summary,
      Array.from({ length: 2 }, () => ({ chromosomes: 46, chromatids: 46 })),
    );
    for (const cell of model.cells) {
      assert.equal(cell.chromosomes.length, 46);
      assert.deepEqual(
        new Set(cell.chromosomes.map((c) => c.originChromosomeId)),
        roots,
      );
      assert.deepEqual(
        cell.chromosomes
          .filter((c) => c.pairId === "sex")
          .map((c) => c.originChromosomeId)
          .sort(),
        sex === "XX" ? ["XA", "XB"] : ["X", "Y"],
      );
      for (const c of cell.chromosomes) {
        assert.deepEqual(c.balls, chains.get(c));
        assert.deepEqual(
          c.balls.map((ball) => ball.userData.segment.originalIndex),
          Array.from({ length: c.balls.length }, (_, i) => i + 1),
        );
        assert.ok(
          c.balls.every(
            (ball) =>
              ball.userData.segment.originChromosomeId === c.originChromosomeId,
          ),
        );
      }
    }
    const final = model.cells.flatMap((cell) =>
      cell.chromosomes.flatMap((c) => c.balls),
    );
    assert.equal(new Set(final).size, identities.size);
    for (const ball of final) {
      assert.equal(ball.userData.segment, identities.get(ball));
      assert.equal(ball.userData.tetradId, undefined);
    }
    assert.equal(lab.crossoverHistory?.length || 0, 0);
    await assert.rejects(model.separate(0), /Expected metaphase/);
  });

  test(`${sex} mitotic view shows the spindle, releases cohesion, and reforms exactly two daughter nuclei`, async (t) => {
    const lab = new SchematicLab();
    const model = new HumanMitosis(lab, sex);
    const view = new MitosisView(new SvgNode("container"), model, lab);
    const labels = () =>
      [...view.nodes.values()]
        .filter((n) => n.group.style.display !== "none")
        .flatMap((n) => [n, n.sisterLabel])
        .filter((slot) => slot.label.style.display !== "none");
    const links = () =>
      [...view.nodes.values()]
        .filter((n) => n.group.style.display !== "none")
        .flatMap((n) =>
          n.cohesionLinks.filter((link) => link.style.display !== "none"),
        );
    const nuclei = () =>
      view.interior.children
        .flatMap((g) => g.children)
        .filter((n) => n.tag === "ellipse");
    assert.equal(labels().length, 46);
    assert.equal(nuclei().length, 1);
    await model.duplicate(0);
    view.frame();
    assert.equal(labels().length, 92);
    assert.ok(links().length > 46);
    assert.ok(
      links().every((n) => !n.children[0].textContent.includes("meiosis")),
    );
    await model.align(0);
    view.frame();
    assert.equal(nuclei().length, 0);
    assert.equal(links().length, 46);
    const spindle = view.interior.children.find(
      (n) => n.getAttribute("class") === "mitotic-spindle",
    );
    assert.ok(spindle);
    assert.equal(spindle.children.filter((n) => n.tag === "path").length, 92);
    assert.equal(
      spindle.children.filter(
        (n) => n.getAttribute("class") === "metaphase-plate",
      ).length,
      1,
    );
    await model.separate(0);
    view.frame();
    assert.equal(links().length, 0);
    assert.equal(labels().length, 92);
    let now = 0;
    t.mock.method(Date, "now", () => (now += 10000));
    await model.divide(1);
    view.frame();
    assert.equal(
      view.membranes.children.filter((n) => n.tag === "ellipse").length,
      4,
    );
    assert.equal(nuclei().length, 2);
    for (const [i, cell] of model.cells.entries()) {
      const nucleus = nuclei()[i];
      const cx = Number(nucleus.getAttribute("cx")),
        cy = Number(nucleus.getAttribute("cy"));
      const rx = Number(nucleus.getAttribute("rx")),
        ry = Number(nucleus.getAttribute("ry"));
      for (const chromosome of cell.chromosomes)
        for (const ball of chromosome.balls) {
          const x = ball.position.x + ball.position.z * 1.7,
            y = -ball.position.y;
          assert.ok(
            ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1,
            "daughter nucleus contains its full genome",
          );
        }
    }
    assert.equal(labels().length, 92);
    assert.deepEqual(
      new Set(labels().map((slot) => slot.label.textContent)),
      new Set(model.chromatids.map((c) => shortChromatid(c.chromatidId))),
    );
    assert.ok(
      !view.interior.children.some(
        (n) => n.getAttribute("class") === "mitotic-spindle",
      ),
    );
  });
}

test("mitotic alignment and anaphase move continuously between frames with correct counts", async (t) => {
  const model = new HumanMitosis(new SchematicLab(), "XY");
  await model.duplicate(0);
  let now = 0;
  t.mock.method(Date, "now", () => now);
  frames = [];
  const ball = model.chromatids[0].balls[0];
  const start = ball.position.clone();
  const alignment = model.align(100);
  assert.equal(model.state, "aligning");
  now = 50;
  frames.pop()();
  const middle = ball.position.clone();
  assert.ok(start.distanceTo(middle) > 1);
  assert.equal(model.summary[0].chromosomes, 46);
  now = 100;
  frames.pop()();
  await alignment;
  assert.ok(middle.distanceTo(ball.position) > 1);
  const alignedX = ball.position.x;
  frames = [];
  const separation = model.separate(100);
  assert.equal(model.summary[0].chromosomes, 92);
  now = 150;
  frames.pop()();
  const midX = ball.position.x;
  assert.ok(Math.abs(midX - alignedX) > 10);
  now = 200;
  frames.pop()();
  await separation;
  assert.ok(Math.abs(ball.position.x - midX) > 10);
});
