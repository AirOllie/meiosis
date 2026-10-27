export function humanPairSpecs(sex = "XY") {
  if (!["XX", "XY"].includes(sex)) throw new Error("Choose XX or XY");
  const pairs = Array.from({ length: 22 }, (_, index) => {
    const number = index + 1;
    return {
      id: String(number),
      name: `Chromosome ${number}`,
      detailed: number === 1,
      members: ["A", "B"].map((homolog) => ({
        id: `${number}${homolog}`,
        pattern: number === 1 ? "oo-oooo" : "oo-oo",
      })),
    };
  });
  pairs.push({
    id: "sex",
    name: `${sex} sex chromosomes`,
    detailed: true,
    members: (sex === "XX" ? ["XA", "XB"] : ["X", "Y"]).map((id) => ({
      id,
      pattern: id === "Y" ? "oo-ooo" : "oo-oooooo",
      crossoverPoints: sex === "XY" ? [1] : null,
    })),
  });
  return pairs;
}

// Chromosome objects represent individual chromatids in GeneLab. Keep the
// chromosome count distinct from chromatid count until sisters separate in II.
export class HumanMeiosis {
  constructor(lab, sex = "XY") {
    this.lab = lab;
    this.sex = sex;
    this.state = "initial";
    this.chromatids = [];
    this.labels = [];
    this.pairs = humanPairSpecs(sex).map((spec) => {
      const detailed = spec.detailed;
      const slot = Number(spec.id) - 2;
      const x =
        spec.id === "1" ? -28 : spec.id === "sex" ? 28 : ((slot % 7) - 3) * 13;
      const y = detailed
        ? 36
        : -20 - Math.floor(slot / 7) * 22 + ((slot % 7) - 3) ** 2 * 0.65;
      const members = spec.members.map((member, index) => {
        const colors = detailed ? [0xff5599, 0xffdf40] : [0x69869c, 0x91a3b2];
        const chromosome = lab.addChromosome(
          member.pattern,
          colors[index],
          x + (index ? 1 : -1) * (detailed ? 7 : 4),
          y,
          {
            id: member.id,
            pairId: spec.id,
            detailed,
            crossoverPoints: member.crossoverPoints,
          },
        );
        // A common depth and aligned short-arm tips allow the unequal
        // X/Y pair to meet only in its schematic terminal PAR1 region.
        const tipY = chromosome.balls[0].position.y;
        for (const ball of chromosome.balls) {
          // Magnify the two resolved pairs in the same physical scene.
          // Stable IDs and corresponding sister geometry are preserved.
          if (detailed) ball.position.y = tipY + (ball.position.y - tipY) * 2.2;
          else
            ball.position.x +=
              (ball.position.y - tipY) *
              Math.sin((slot + index * 3) * 2.4) *
              0.16;
          ball.position.z = 0;
          ball.userData.oldX = ball.position.x;
          ball.userData.oldY = ball.position.y;
          ball.userData.oldZ = ball.position.z;
        }
        return chromosome;
      });
      const pair = { ...spec, members, sisters: [], chromatids: [...members] };
      this.chromatids.push(...members);
      this.labels.push(
        lab.addGroupLabel(
          pair.chromatids,
          detailed
            ? spec.id === "1"
              ? "1 · detailed autosome"
              : `${sex} · detailed sex pair`
            : spec.id,
          detailed ? "pair-label detailed-pair-label" : "pair-label",
        ),
      );
      return pair;
    });
    this.cells = [lab.addMembrane([...this.chromatids])];
  }

  get detailedChromatids() {
    return this.chromatids.filter((chromosome) => chromosome.detailed);
  }

  get summary() {
    if (this.state === "done")
      return this.cells.map((cell) => ({
        chromosomes: cell.chromosomes.length,
        chromatids: cell.chromosomes.length,
        sex:
          cell.chromosomes.find((c) => c.pairId === "sex")
            .originChromosomeId === "Y"
            ? "Y"
            : "X",
      }));
    if (this.state === "telophase1_done")
      return [0, 1].map(() => ({ chromosomes: 23, chromatids: 46 }));
    return [
      { chromosomes: 46, chromatids: this.state === "initial" ? 46 : 92 },
    ];
  }

  async duplicate(delay = 100) {
    await Promise.all(
      this.pairs.map(async (pair) => {
        pair.sisters = await Promise.all(
          pair.members.map((member) =>
            this.lab.duplicateChromosome(
              member,
              pair.detailed ? 5.8 : 2.2,
              0,
              0,
              pair.detailed ? delay : 0,
            ),
          ),
        );
        pair.chromatids.push(...pair.sisters);
      }),
    );
    // Preserve array references used by the panel and camera.
    for (const pair of this.pairs) this.chromatids.push(...pair.sisters);
    this.cells[0].chromosomes.push(
      ...this.pairs.flatMap((pair) => pair.sisters),
    );
    this.state = "duplicated";
  }

  async formTetrads(duration = 2000) {
    await Promise.all(
      this.pairs.map((pair) =>
        this.lab.formTetrad4(
          pair.members[0],
          pair.sisters[0],
          pair.members[1],
          pair.sisters[1],
          pair.detailed ? 6 : 2.2,
          duration,
        ),
      ),
    );
    this.state = "tetrads_formed";
  }

  async crossover(duration = 2000) {
    // The other 21 pairs participate in segregation; their molecular
    // recombination is deliberately unresolved by the coarse model.
    await Promise.all(
      this.pairs
        .filter((pair) => pair.detailed)
        .map((pair) =>
          this.lab.crossoverTetrad(
            [pair.members[0], pair.sisters[0]],
            [pair.members[1], pair.sisters[1]],
            duration,
          ),
        ),
    );
    this.state = "crossover_done";
  }

  async separate(duration = 3000) {
    this.groups = [[], []];
    this.sisterPairs = [[], []];
    for (const pair of this.pairs) {
      // Independent assortment chooses each pair's orientation separately.
      const first = Math.random() < 0.5 ? 0 : 1;
      for (let side = 0; side < 2; side++) {
        const index = side ? 1 - first : first;
        const sisters = [pair.members[index], pair.sisters[index]];
        this.groups[side].push(...sisters);
        this.sisterPairs[side].push(sisters);
      }
    }
    this.labels.forEach((label) => label.remove());
    this.labels = [];
    await this.lab.anaphaseI(this.groups[0], this.groups[1], 160, duration);
    this.state = "anaphase1_done";
  }

  async divide(duration = 2000) {
    this.cells = await this.lab.cytokinesis(
      this.cells[0],
      this.groups[0],
      this.groups[1],
      20,
      duration,
    );
    this.state = "telophase1_done";
    this.labels = this.cells.map((cell, i) =>
      this.lab.addGroupLabel(
        cell.chromosomes,
        `Daughter ${i + 1} · 23 chromosomes / 46 chromatids`,
        "cell-label",
      ),
    );
  }

  async divideAgain(duration = 3000) {
    this.labels.forEach((label) => label.remove());
    this.cells = await this.lab.meiosisII(
      this.cells[0],
      this.cells[1],
      this.sisterPairs[0],
      this.sisterPairs[1],
      160,
      duration,
    );
    this.state = "done";
    this.labels = this.cells.map((cell, i) =>
      this.lab.addGroupLabel(
        cell.chromosomes,
        `Product ${i + 1} · 23 chromosomes · ${this.summary[i].sex}`,
        "cell-label",
      ),
    );
  }
}
