import { GeneLab } from "./gene_lab.js?v=cell-atlas-5";

// Reuse the tested segment exchange and segregation model without a WebGL
// scene, physics loop, sound, or hundreds of floating DOM labels.
export class SchematicLab extends GeneLab {
  constructor() {
    super(null, { headless: true });
  }
  labelSegment(ball, segment) {
    ball.userData.segment = Object.freeze(segment);
  }
  popBall(x, y, z, color) {
    return this.addBall(x, y, z, color);
  }
  addGroupLabel() {
    return { remove() {} };
  }
}
