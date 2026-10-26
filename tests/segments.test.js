import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GeneLab } from '../gene_lab.js';

// Only the label DOM is stubbed; meshes, identity, connections and meiosis use
// the production methods without requiring a WebGL window in Node.
globalThis.document = {
    createElement() {
        const classes = new Set();
        return {
            style: {}, dataset: {}, setAttribute() {},
            classList: {
                toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); },
                contains(name) { return classes.has(name); }
            }
        };
    }
};

function makeLab() {
    const lab = Object.create(GeneLab.prototype);
    Object.assign(lab, {
        scene: new THREE.Scene(), connections: [], draggableObjects: [],
        animations: [], segmentLabelsVisible: true
    });
    lab.popBall = lab.addBall;
    return lab;
}

async function makeChromatids(lab) {
    const originals = [
        lab.addChromosome('oo-oooo', 0xff1493, -15, 5),
        lab.addChromosome('ooo-ooooooo', 0xffff00, -5, 8),
        lab.addChromosome('oo-oooo', 0xffff00, 5, 10),
        lab.addChromosome('ooo-ooooooo', 0xff1493, 10, -5)
    ];
    const copies = await Promise.all(originals.map(c => lab.duplicateChromosome(c, 2.2, 0, 0, 0)));
    return { originals, copies, all: [...originals, ...copies] };
}

function ids(chromosome) {
    return chromosome.balls.map(ball => ball.userData.segment.id);
}

function assertChains(lab, chromosomes) {
    for (const chromosome of chromosomes) {
        for (let i = 1; i < chromosome.balls.length; i++) {
            assert.ok(lab.connections.some(c =>
                c.parent === chromosome.balls[i - 1] && c.child === chromosome.balls[i]
            ), `missing connection in ${chromosome.chromatidId} at ${i}`);
        }
    }
}

test('concurrent replication gives 64 unique, deterministic IDs with distinct sister origins', async () => {
    const lab = makeLab();
    // A hidden setting also applies to labels born during replication.
    lab.setSegmentLabelsVisible(false);
    const { originals, copies, all } = await makeChromatids(lab);
    const balls = all.flatMap(c => c.balls);
    assert.equal(balls.length, 64);
    assert.equal(new Set(balls.map(b => b.userData.segment.id)).size, 64);
    assert.deepEqual(originals.map(c => c.chromatidId), ['C1-O', 'C2-O', 'C3-O', 'C4-O']);
    assert.deepEqual(copies.map(c => c.chromatidId), ['C1-S1', 'C2-S1', 'C3-S1', 'C4-S1']);
    assert.deepEqual(copies.map(c => ids(c)[0]), ['33', '39', '49', '55']);
    for (let i = 0; i < originals.length; i++) {
        originals[i].balls.forEach((ball, index) => {
            const segment = ball.userData.segment;
            const copy = copies[i].balls[index].userData.segment;
            assert.equal(segment.copiedFromId, null);
            assert.equal(copy.copiedFromId, segment.id);
            assert.equal(copy.originChromosomeId, segment.originChromosomeId);
            assert.equal(copy.originalIndex, index + 1);
            assert.ok(Object.isFrozen(copy));
        });
    }
    assert.ok(balls.every(b => !b.userData.segmentLabel.visible));
    lab.setSegmentLabelsVisible(true);
    assert.ok(balls.every(b => b.userData.segmentLabel.visible));
    const anotherSister = await lab.duplicateChromosome(originals[0], 2.2, 0, 0, 0);
    assert.equal(anotherSister.chromatidId, 'C1-S2');
    assert.equal(ids(anotherSister)[0], '65');
});

test('moving labels are highlighted throughout the animation, then cleared on completion', async t => {
    const lab = makeLab();
    const { originals, copies } = await makeChromatids(lab);
    let now = 0;
    let nextFrame;
    t.mock.method(Date, 'now', () => now);
    globalThis.requestAnimationFrame = callback => { nextFrame = callback; };
    t.after(() => { delete globalThis.requestAnimationFrame; });
    const promise = lab.crossoverTetrad([originals[0], copies[0]], [originals[2], copies[2]], 100);
    const record = lab.crossoverHistory[0];
    const movingIds = new Set(record.transfers.flatMap(transfer => transfer.segmentIds));
    for (const ball of lab.draggableObjects) {
        assert.equal(ball.userData.segmentLabel.element.classList.contains('exchanging'), movingIds.has(ball.userData.segment.id));
    }
    now = 50;
    nextFrame();
    assert.equal(record.status, 'exchanging');
    assert.equal(record.after, null);
    now = 100;
    nextFrame();
    await promise;
    assert.equal(record.status, 'complete');
    assert.ok(lab.draggableObjects.every(ball => !ball.userData.segmentLabel.element.classList.contains('exchanging')));
});

test('identities and labels survive tetrads, crossover, both divisions and four gametes', async t => {
    const lab = makeLab();
    const { originals: o, copies: s, all } = await makeChromatids(lab);
    const identities = new Map(lab.draggableObjects.map(ball => [ball, ball.userData.segment]));
    let now = 0;
    t.mock.method(Date, 'now', () => now += 10000);
    const membrane = lab.addMembrane(all);
    await Promise.all([
        lab.formTetrad4(o[0], s[0], o[2], s[2]),
        lab.formTetrad4(o[1], s[1], o[3], s[3])
    ]);
    await Promise.all([
        lab.crossoverTetrad([o[0], s[0]], [o[2], s[2]]),
        lab.crossoverTetrad([o[1], s[1]], [o[3], s[3]])
    ]);
    const groupA = [o[0], s[0], o[1], s[1]];
    const groupB = [o[2], s[2], o[3], s[3]];
    await lab.anaphaseI(groupA, groupB);
    const [memA, memB] = await lab.cytokinesis(membrane, groupA, groupB);
    const gametes = await lab.meiosisII(memA, memB, [[o[0], s[0]], [o[1], s[1]]], [[o[2], s[2]], [o[3], s[3]]]);
    assert.equal(gametes.length, 4);
    assert.ok(gametes.every(gamete => gamete.chromosomes.length === 2));
    const finalBalls = gametes.flatMap(gamete => gamete.chromosomes.flatMap(c => c.balls));
    assert.equal(new Set(finalBalls).size, 64);
    for (const ball of finalBalls) {
        assert.equal(ball.userData.segment, identities.get(ball));
        assert.equal(ball.userData.segmentLabel.parent, ball);
        assert.equal(ball.userData.segmentLabel.element.textContent, ball.userData.segment.id);
    }
    assert.equal(lab.crossoverHistory.length, 2);
    assertChains(lab, all);
});

// Cover both diagonals and every valid cut on BOTH homolog pairs. In particular,
// cutting above the centromere rewires parents, while cutting below rewires children.
for (const [pairA, pairB, length, centromere] of [[0, 2, 6, 2], [1, 3, 10, 3]]) {
    const points = Array.from({ length: length - 1 }, (_, i) => i + 1)
        .filter(i => i !== centromere && i < length - 1);
    for (const diagonal of [true, false]) {
        for (const cut of points) {
            test(`C${pairA + 1}/C${pairB + 1}, diagonal=${diagonal}, cut=${cut}: identities travel and chains stay connected`, async t => {
                const lab = makeLab();
                const { originals, copies, all } = await makeChromatids(lab);
                const a = diagonal ? originals[pairA] : copies[pairA];
                const b = diagonal ? copies[pairB] : originals[pairB];
                const beforeA = [...a.balls];
                const beforeB = [...b.balls];
                const beforeAll = all.map(c => [...c.balls]);
                const identities = new Map(lab.draggableObjects.map(ball => [ball, ball.userData.segment]));
                const labels = new Map(lab.draggableObjects.map(ball => [ball, ball.userData.segmentLabel]));
                const rolls = [diagonal ? 0 : 0.99, (points.indexOf(cut) + 0.5) / points.length];
                t.mock.method(Math, 'random', () => rolls.shift());
                // Advance only the crossover clock, allowing its completion branch to run.
                let now = 0;
                t.mock.method(Date, 'now', () => now += 10);
                const notifications = [];
                lab.onCrossoverChange = record => {
                    notifications.push(record.status);
                    // The panel reapplies focus to the chromatid's CURRENT balls.
                    lab.setSegmentLabelFocus(a);
                };
                const record = await lab.crossoverTetrad(
                    [originals[pairA], copies[pairA]], [originals[pairB], copies[pairB]], 1
                );
                const above = cut < centromere;
                assert.deepEqual(a.balls, above ? [...beforeB.slice(0, cut), ...beforeA.slice(cut)] : [...beforeA.slice(0, cut), ...beforeB.slice(cut)]);
                assert.deepEqual(b.balls, above ? [...beforeA.slice(0, cut), ...beforeB.slice(cut)] : [...beforeB.slice(0, cut), ...beforeA.slice(cut)]);
                all.forEach((c, i) => { if (c !== a && c !== b) assert.deepEqual(c.balls, beforeAll[i]); });
                assert.equal(new Set(all.flatMap(c => c.balls)).size, 64);
                for (const ball of lab.draggableObjects) {
                    assert.equal(ball.userData.segment, identities.get(ball));
                    assert.equal(ball.userData.segmentLabel, labels.get(ball));
                    assert.equal(ball.userData.segmentLabel.element.textContent, ball.userData.segment.id);
                    assert.equal(ball.userData.segmentLabel.parent, ball);
                    assert.equal(ball.userData.segmentLabel.visible, a.balls.includes(ball));
                    assert.ok(!ball.userData.pinned);
                    assert.ok(!ball.userData.segmentLabel.element.classList.contains('exchanging'));
                }
                assertChains(lab, all);
                assert.deepEqual(notifications, ['exchanging', 'complete']);
                assert.deepEqual(record.chromatids, [a.chromatidId, b.chromatidId]);
                assert.deepEqual(record.before[0].segmentIds, beforeA.map(b => b.userData.segment.id));
                assert.deepEqual(record.after.map(s => s.segmentIds), [ids(a), ids(b)]);
                assert.deepEqual(record.transfers[0].segmentIds,
                    (above ? beforeA.slice(0, cut) : beforeA.slice(cut)).map(b => b.userData.segment.id));
                // The before/after history is a snapshot, independent of later array edits.
                const saved = [...record.after[0].segmentIds];
                a.balls.reverse();
                assert.deepEqual(record.after[0].segmentIds, saved);
            });
        }
    }
}
