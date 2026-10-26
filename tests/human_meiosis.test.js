import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { GeneLab } from "../gene_lab.js";
import { HumanMeiosis, humanPairSpecs } from "../human_meiosis.js";

globalThis.document = {
  createElement() {
    const classes = new Set();
    return {
      style: {},
      dataset: {},
      setAttribute() {},
      classList: {
        toggle(name, enabled) {
          enabled ? classes.add(name) : classes.delete(name);
        },
      },
    };
  },
};

function makeLab() {
  const lab = Object.create(GeneLab.prototype);
  Object.assign(lab, {
    scene: new THREE.Scene(),
    connections: [],
    draggableObjects: [],
    animations: [],
    segmentLabelsVisible: true,
  });
  lab.popBall = lab.addBall;
  // Headless tests exercise chromosome mechanics, not group-caption DOM layout.
  lab.addGroupLabel = () => ({ remove() {} });
  return lab;
}

test("human specifications contain 22 autosome pairs plus switchable XX/XY", () => {
  assert.throws(() => humanPairSpecs("YY"));
  for (const sex of ["XX", "XY"]) {
    const specs = humanPairSpecs(sex);
    assert.equal(specs.length, 23);
    assert.deepEqual(
      specs.slice(0, 22).map((pair) => pair.id),
      Array.from({ length: 22 }, (_, i) => String(i + 1)),
    );
    assert.deepEqual(
      specs.filter((pair) => pair.detailed).map((pair) => pair.id),
      ["1", "sex"],
    );
    assert.deepEqual(
      specs.at(-1).members.map((member) => member.id),
      sex === "XX" ? ["XA", "XB"] : ["X", "Y"],
    );
  }
});

for (const sex of ["XX", "XY"]) {
  test(`${sex}: all 23 pairs segregate to four 23-chromosome products, with only two pairs labelled in detail`, async (t) => {
    const lab = makeLab();
    const model = new HumanMeiosis(lab, sex);
    assert.equal(model.chromatids.length, 46);
    assert.deepEqual(model.summary, [{ chromosomes: 46, chromatids: 46 }]);
    assert.equal(model.detailedChromatids.length, 4);
    assert.equal(model.chromatids.filter((c) => !c.detailed).length, 42);
    const initialLabels = lab.draggableObjects.filter(
      (ball) => ball.userData.segmentLabel,
    ).length;
    assert.equal(initialLabels, sex === "XX" ? 28 : 25);
    await model.duplicate(0);
    assert.equal(model.chromatids.length, 92);
    assert.equal(model.detailedChromatids.length, 8);
    assert.deepEqual(model.summary, [{ chromosomes: 46, chromatids: 92 }]);
    const balls = [...lab.draggableObjects];
    const identities = new Map(
      balls.map((ball) => [ball, ball.userData.segment]),
    );
    assert.equal(
      new Set(balls.map((ball) => ball.userData.segment.id)).size,
      balls.length,
    );
    assert.equal(
      balls.filter((ball) => ball.userData.segmentLabel).length,
      initialLabels * 2,
    );
    for (const pair of model.pairs) {
      for (let i = 0; i < 2; i++)
        pair.sisters[i].balls.forEach((ball, index) => {
          assert.equal(
            ball.userData.segment.copiedFromId,
            pair.members[i].balls[index].userData.segment.id,
          );
          assert.equal(Boolean(ball.userData.segmentLabel), pair.detailed);
        });
    }
    let now = 0;
    t.mock.method(Date, "now", () => (now += 10000));
    await model.formTetrads(1);
    assert.equal(
      new Set(
        model.pairs.map((pair) => pair.members[0].balls[0].userData.tetradId),
      ).size,
      23,
    );
    const before = new Map(
      model.chromatids.map((chromosome) => [chromosome, [...chromosome.balls]]),
    );
    await model.crossover(1);
    assert.equal(lab.crossoverHistory.length, 2);
    for (const chromosome of model.chromatids.filter((c) => !c.detailed)) {
      assert.deepEqual(chromosome.balls, before.get(chromosome));
    }
    if (sex === "XY") {
      const record = lab.crossoverHistory.find((record) =>
        record.pair.includes("X"),
      );
      assert.equal(record.crossoverIndex, 1);
      assert.equal(record.region, "PAR1 (schematic)");
      assert.ok(
        record.transfers.every((transfer) => transfer.segmentIds.length === 1),
      );
      assert.equal(model.pairs.at(-1).members[0].balls.length, 8);
      assert.equal(model.pairs.at(-1).members[1].balls.length, 5);
      const transferred = new Set(
        record.transfers.flatMap((transfer) => transfer.segmentIds),
      );
      assert.ok(
        balls
          .filter((ball) => transferred.has(ball.userData.segment.id))
          .every((ball) => ball.userData.segment.region === "PAR1"),
      );
    }
    let orientation = 0;
    t.mock.method(Math, "random", () => (orientation++ % 2 ? 0.75 : 0.25));
    await model.separate(1);
    for (let i = 0; i < model.pairs.length; i++) {
      const pair = model.pairs[i];
      assert.ok(model.groups[0].includes(pair.members[i % 2]));
      assert.ok(model.groups[1].includes(pair.members[1 - (i % 2)]));
      for (let side = 0; side < 2; side++) {
        assert.equal(
          model.groups[side].filter((c) => c.pairId === pair.id).length,
          2,
        );
      }
    }
    await model.divide(1);
    assert.equal(model.cells.length, 2);
    assert.ok(
      model.summary.every(
        (cell) => cell.chromosomes === 23 && cell.chromatids === 46,
      ),
    );
    await model.divideAgain(1);
    assert.equal(model.cells.length, 4);
    assert.ok(
      model.summary.every(
        (cell) => cell.chromosomes === 23 && cell.chromatids === 23,
      ),
    );
    assert.deepEqual(
      model.summary.map((cell) => cell.sex).sort(),
      sex === "XX" ? ["X", "X", "X", "X"] : ["X", "X", "Y", "Y"],
    );
    for (const cell of model.cells) {
      assert.equal(cell.chromosomes.length, 23);
      assert.equal(new Set(cell.chromosomes.map((c) => c.pairId)).size, 23);
    }
    const finalBalls = model.cells.flatMap((cell) =>
      cell.chromosomes.flatMap((c) => c.balls),
    );
    assert.equal(new Set(finalBalls).size, balls.length);
    for (const ball of finalBalls)
      assert.equal(ball.userData.segment, identities.get(ball));
  });
}

for (const diagonal of [true, false]) {
  test(`XY crossover diagonal=${diagonal} cannot exchange X/Y-specific long arms`, async (t) => {
    const lab = makeLab();
    const model = new HumanMeiosis(lab, "XY");
    await model.duplicate(0);
    const pair = model.pairs.at(-1);
    const before = pair.chromatids.map((c) => [...c.balls]);
    let now = 0;
    t.mock.method(Date, "now", () => (now += 10000));
    const rolls = [diagonal ? 0 : 0.99, 0.99];
    t.mock.method(Math, "random", () => rolls.shift());
    const record = await lab.crossoverTetrad(
      [pair.members[0], pair.sisters[0]],
      [pair.members[1], pair.sisters[1]],
      1,
    );
    assert.equal(record.crossoverIndex, 1);
    for (let i = 0; i < pair.chromatids.length; i++) {
      assert.deepEqual(pair.chromatids[i].balls.slice(1), before[i].slice(1));
      const chromosome = pair.chromatids[i];
      for (let j = 1; j < chromosome.balls.length; j++)
        assert.ok(
          lab.connections.some(
            (connection) =>
              connection.parent === chromosome.balls[j - 1] &&
              connection.child === chromosome.balls[j],
          ),
        );
    }
  });
}
