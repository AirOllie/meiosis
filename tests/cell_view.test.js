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

test("one cell diagram shows only the two detailed pairs and retains exchanged segment identities", async (t) => {
  const lab = new SchematicLab();
  const model = new HumanMeiosis(lab, "XY");
  const view = new CellView(new SvgNode("container"), model, lab);
  const visibleSegments = () =>
    [...view.nodes.values()].flatMap((node) =>
      [...node.segments.values()].filter(
        (marker) =>
          node.group.style.display !== "none" &&
          marker.group.style.display !== "none",
      ),
    );
  assert.equal(visibleSegments().length, 25);
  assert.equal(view.nodes.get("2A-O").segments.size, 0);
  await model.duplicate(0);
  view.frame();
  const before = new Set(
    visibleSegments().map((marker) =>
      marker.group.getAttribute("data-segment-id"),
    ),
  );
  assert.equal(before.size, 50);
  let now = 0;
  t.mock.method(Date, "now", () => (now += 10000));
  await model.formTetrads(1);
  await model.crossover(1);
  view.frame();
  const markers = visibleSegments();
  assert.deepEqual(
    new Set(
      markers.map((marker) => marker.group.getAttribute("data-segment-id")),
    ),
    before,
  );
  for (const pair of model.pairs.filter((pair) => pair.detailed)) {
    for (const chromosome of [...pair.members, ...pair.sisters]) {
      for (const ball of chromosome.balls) {
        const segment = ball.userData.segment;
        const marker = markers.find(
          (marker) =>
            marker.group.getAttribute("data-segment-id") === segment.id,
        );
        assert.equal(
          marker.number.textContent,
          String(segment.originalIndex).padStart(2, "0"),
        );
        assert.ok(
          marker.title.textContent.includes(
            `in ${shortChromatid(chromosome.chromatidId)}`,
          ),
        );
        assert.equal(
          marker.group.getAttribute("transform"),
          `translate(${ball.position.x + ball.position.z * 1.7},${-ball.position.y})`,
        );
        if (segment.region === "PAR1")
          assert.equal(marker.circle.getAttribute("stroke"), "#235f99");
      }
    }
  }
  await model.separate(1);
  await model.divide(1);
  await model.divideAgain(1);
  view.frame();
  assert.deepEqual(
    new Set(
      visibleSegments().map((marker) =>
        marker.group.getAttribute("data-segment-id"),
      ),
    ),
    before,
  );
});

for (const sex of ["XX", "XY"]) {
  test(`${sex}: cohesion joins each chromosome to its own sister through meiosis I and releases in II`, async (t) => {
    const lab = new SchematicLab();
    const model = new HumanMeiosis(lab, sex);
    const view = new CellView(new SvgNode("container"), model, lab);
    const links = () =>
      [...view.nodes.values()].flatMap((node) =>
        node.group.style.display === "none"
          ? []
          : node.cohesionLinks.filter((link) => link.style.display !== "none"),
      );
    const central = () =>
      links().filter(
        (link) => link.getAttribute("data-cohesion") === "centromere",
      );
    assert.equal(links().length, 0);
    view.update("duplicate");
    view.frame();
    assert.equal(central().length, 46);
    await model.duplicate(0);
    view.update(null);
    view.frame();
    assert.equal(central().length, 46);
    assert.ok(links().length > 46);
    const checkEndpoints = () => {
      for (const pair of model.pairs) {
        pair.members.forEach((chromosome, i) => {
          const sister = pair.sisters[i];
          const link = view.nodes.get(chromosome.chromatidId).cohesionLinks[0];
          assert.equal(
            link.getAttribute("data-sisters"),
            `${chromosome.chromatidId} ${sister.chromatidId}`,
          );
          const boundary = chromosome.pattern.split("-")[0].length;
          for (const [member, endpoint] of [
            [chromosome, 1],
            [sister, 2],
          ]) {
            const [a, b] = [member.balls[boundary - 1], member.balls[boundary]];
            assert.equal(
              Number(link.getAttribute(`x${endpoint}`)),
              (a.position.x +
                b.position.x +
                (a.position.z + b.position.z) * 1.7) /
                2,
            );
            assert.equal(
              Number(link.getAttribute(`y${endpoint}`)),
              -(a.position.y + b.position.y) / 2,
            );
          }
        });
      }
    };
    checkEndpoints();
    let now = 0;
    t.mock.method(Date, "now", () => (now += 10000));
    await model.formTetrads(1);
    await model.crossover(1);
    view.frame();
    checkEndpoints();
    view.update("separate");
    view.frame();
    assert.equal(links().length, 46);
    await model.separate(1);
    view.update(null);
    view.frame();
    checkEndpoints();
    await model.divide(1);
    view.frame();
    assert.equal(links().length, 46);
    view.update("divideAgain");
    view.frame();
    assert.equal(links().length, 0);
    await model.divideAgain(1);
    view.update(null);
    view.frame();
    assert.equal(links().length, 0);
  });
}
