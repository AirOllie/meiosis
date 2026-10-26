import test from "node:test";
import assert from "node:assert/strict";
import { SchematicLab } from "../schematic_lab.js";
import { HumanMeiosis } from "../human_meiosis.js";
import { CellView } from "../cell_view.js";
import { shortChromatid, shortSegment } from "../schematic_view.js";

class SvgNode {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.attributes = {};
    this.style = {};
    this.clientWidth = 660;
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
  test(`${sex}: compact chromosome/segment names stay unique across replication`, async () => {
    const lab = new SchematicLab();
    const model = new HumanMeiosis(lab, sex);
    const initial = model.chromatids.map((chromosome) =>
      shortChromatid(chromosome.chromatidId),
    );
    assert.equal(new Set(initial).size, 46);
    assert.deepEqual(initial.slice(-2), ["23A", "23B"]);
    await model.duplicate(0);
    assert.equal(
      new Set(
        model.chromatids.map((chromosome) =>
          shortChromatid(chromosome.chromatidId),
        ),
      ).size,
      92,
    );
    const segmentNames = model.chromatids.flatMap((chromosome) =>
      chromosome.balls.map((ball) => shortSegment(ball.userData.segment.id)),
    );
    assert.equal(new Set(segmentNames).size, segmentNames.length);
    assert.equal(shortSegment("1A-S1-01"), "1A′·01");
  });
}

test("live cell view renders every chromosome and follows actual anaphase positions between frames", async (t) => {
  const lab = new SchematicLab();
  const model = new HumanMeiosis(lab, "XY");
  const view = new CellView(new SvgNode("container"), model, lab);
  assert.equal(view.nodes.size, 46);
  assert.equal(
    view.membranes.children.filter((node) => node.tag === "ellipse").length,
    2,
  );
  await model.duplicate(0);
  view.frame();
  assert.equal(
    [...view.nodes.values()].filter(
      (node) => node.group.style.display !== "none",
    ).length,
    46,
  );
  let now = 0;
  t.mock.method(Date, "now", () => now);
  frames = [];
  const animation = model.separate(100);
  let modelFrame = frames.at(-1);
  view.update("separate");
  view.frame();
  const before = view.nodes.get("1A-O").lines[0].getAttribute("x1");
  now = 50;
  modelFrame();
  modelFrame = frames.at(-1);
  view.frame();
  const midpoint = view.nodes.get("1A-O").lines[0].getAttribute("x1");
  assert.notEqual(before, midpoint);
  now = 100;
  modelFrame();
  await animation;
  view.update(null);
  view.frame();
  assert.notEqual(view.nodes.get("1A-O").lines[0].getAttribute("x1"), midpoint);
});

test("cytokinesis changes the membrane neck continuously and ends with four numbered cell contents", async (t) => {
  const lab = new SchematicLab();
  const model = new HumanMeiosis(lab, "XX");
  await model.duplicate(0);
  let now = 0;
  t.mock.method(Date, "now", () => (now += 10000));
  await model.separate(1);
  const view = new CellView(new SvgNode("container"), model, lab);
  view.update("divide");
  view.startedAt = performance.now() - 300;
  view.frame();
  const early = view.membranes.children
    .find((node) => node.tag === "path")
    .getAttribute("d");
  view.startedAt = performance.now() - 900;
  view.frame();
  const late = view.membranes.children
    .find((node) => node.tag === "path")
    .getAttribute("d");
  assert.notEqual(early, late);
  await model.divide(1);
  view.update(null);
  view.frame();
  assert.equal(
    view.membranes.children.filter((node) => node.tag === "ellipse").length,
    4,
  );
  await model.divideAgain(1);
  view.frame();
  assert.equal(
    view.membranes.children.filter((node) => node.tag === "ellipse").length,
    8,
  );
  assert.equal(
    [...view.nodes.values()].filter(
      (node) => node.group.style.display !== "none",
    ).length,
    92,
  );
});
