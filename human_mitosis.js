import { HumanMeiosis } from "./human_meiosis.js?v=mitosis-2";

// Shared genome and replication mechanics; mitotic segregation is independent
// of the meiotic pairing, recombination and reduction-division methods.
export class HumanMitosis {
  constructor(lab, sex = "XY") {
    this.kind = "mitosis";
    this.lab = lab;
    this.sex = sex;
    this.genome = new HumanMeiosis(lab, sex);
    this.pairs = this.genome.pairs;
    this.chromatids = this.genome.chromatids;
    this.cells = this.genome.cells;
    this.state = "initial";
    this.separated = false;
    this.armCohesion = true;
    const detailed = this.chromatids.filter((c) => c.detailed);
    const background = this.chromatids.filter((c) => !c.detailed);
    for (const [i, chromosome] of [...detailed, ...background].entries()) {
      const detail = i < 4;
      // Interleave homolog identities instead of arranging them as pairs.
      const slot = ((i - 4) * 17) % 42;
      const x = detail ? [-45, -15, 15, 45][i] : ((slot % 14) - 6.5) * 10;
      const y = detail
        ? 36
        : -20 - Math.floor(slot / 14) * 22 + ((slot % 14) - 6.5) ** 2 * 0.12;
      const first = chromosome.balls[0].position;
      const dx = x - first.x,
        dy = y - first.y;
      for (const ball of chromosome.balls)
        this.moveBall(ball, {
          x: ball.position.x + dx,
          y: ball.position.y + dy,
          z: 0,
        });
    }
  }

  get summary() {
    if (this.state === "done")
      return this.cells.map(() => ({ chromosomes: 46, chromatids: 46 }));
    return [
      {
        chromosomes: this.separated ? 92 : 46,
        chromatids: this.state === "initial" ? 46 : 92,
      },
    ];
  }

  requireState(expected) {
    if (this.state !== expected)
      throw new Error(`Expected ${expected}; got ${this.state}`);
  }

  moveBall(ball, position) {
    ball.position.set(position.x, position.y, position.z);
    ball.userData.oldX = position.x;
    ball.userData.oldY = position.y;
    ball.userData.oldZ = position.z;
  }

  centromere(chromosome) {
    const boundary = chromosome.pattern.split("-")[0].length;
    return chromosome.balls[boundary - 1].position
      .clone()
      .add(chromosome.balls[boundary].position)
      .multiplyScalar(0.5);
  }

  animate(targets, duration) {
    const entries = targets.map(({ ball, target }) => ({
      ball,
      target,
      start: ball.position.clone(),
    }));
    if (duration <= 0) {
      entries.forEach(({ ball, target }) => this.moveBall(ball, target));
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const start = Date.now();
      const frame = () => {
        const progress = Math.min((Date.now() - start) / duration, 1);
        const eased = this.lab.easeInOutCubic(progress);
        for (const { ball, target, start: source } of entries) {
          this.moveBall(ball, {
            x: source.x + (target.x - source.x) * eased,
            y: source.y + (target.y - source.y) * eased,
            z: source.z + (target.z - source.z) * eased,
          });
        }
        if (progress < 1) requestAnimationFrame(frame);
        else resolve();
      };
      frame();
    });
  }

  async duplicate(delay = 100) {
    this.requireState("initial");
    this.state = "replicating";
    await this.genome.duplicate(delay);
    this.state = "duplicated";
  }

  async align(duration = 1800) {
    this.requireState("duplicated");
    this.state = "aligning";
    this.armCohesion = false;
    this.groups = [[], []];
    const units = this.pairs.flatMap((pair) =>
      pair.members.map((chromosome, i) => ({
        chromosome,
        sister: pair.sisters[i],
      })),
    );
    units.sort(
      (a, b) => Number(b.chromosome.detailed) - Number(a.chromosome.detailed),
    );
    const targets = [];
    for (const [i, unit] of units.entries()) {
      const detailed = unit.chromosome.detailed;
      const slot = i - 4;
      const y = detailed ? 70 : 10 - Math.floor(slot / 6) * 22;
      const z = detailed ? [-35, -12, 12, 35][i] : ((slot % 6) - 2.5) * 9;
      const spacing = detailed ? 5.8 : 3.5;
      const left = Math.random() < 0.5 ? unit.chromosome : unit.sister;
      const right = left === unit.chromosome ? unit.sister : unit.chromosome;
      this.groups[0].push(left);
      this.groups[1].push(right);
      for (const [side, chromosome] of [left, right].entries()) {
        const center = this.centromere(chromosome);
        for (const ball of chromosome.balls)
          targets.push({
            ball,
            target: {
              x: ((side ? 1 : -1) * spacing) / 2,
              y: y + ball.position.y - center.y,
              z,
            },
          });
      }
    }
    // All centromeres occupy the x=0 equatorial plane (with sisters on
    // opposite sides); z spreads them in its schematic 2D projection.
    await this.animate(targets, duration);
    this.state = "metaphase";
  }

  async separate(duration = 2000) {
    this.requireState("metaphase");
    this.separated = true;
    this.state = "anaphase";
    const targets = this.groups.flatMap((group, side) =>
      group.flatMap((chromosome) =>
        chromosome.balls.map((ball) => ({
          ball,
          target: {
            x: ball.position.x + (side ? 110 : -110),
            y: ball.position.y,
            z: ball.position.z,
          },
        })),
      ),
    );
    await this.animate(targets, duration);
    this.state = "anaphase_done";
  }

  async divide(duration = 1600) {
    this.requireState("anaphase_done");
    this.state = "cytokinesis";
    this.cleavageDuration = duration;
    this.cells = await this.lab.cytokinesis(
      this.cells[0],
      this.groups[0],
      this.groups[1],
      28,
      duration,
    );
    this.state = "done";
  }
}
