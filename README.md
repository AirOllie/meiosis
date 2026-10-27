# Human cell division

Two scientific demos share the same chromosome identities and animated cell renderer:

- **Meiosis**: `index.html` — 23 homolog pairs, two divisions, four haploid products.
- **Mitosis**: `mitosis.html` — a diploid somatic-cell model, one division, two diploid daughters.

The header switches between demos and preserves the XX/XY selection. Both demos keep all chromosomes in one diagram, label individual sisters, and resolve DNA segments on chromosome 1 and the sex pair.

## Mitosis

Start at `mitosis.html?sex=XY` or select **Mitosis** in the header. **Play** runs the sequence; the main action button advances **Replicate → Align chromosomes → Separate sisters → Divide cell**. Zoom, Fit, Reset, and Replay work in both demos.

| Stage                          | Cells | Chromosomes per cell | DNA molecules per cell |
| ------------------------------ | ----: | -------------------: | ---------------------: |
| Before S phase                 |     1 |                   46 |                     46 |
| After S phase / metaphase      |     1 |                   46 |                     92 |
| Anaphase, before cell division |     1 |     92 (46 per pole) |                     92 |
| After cytokinesis              |     2 |                   46 |                     46 |

Each replicated chromosome aligns individually. Homologs never form tetrads and no crossover is simulated. Each daughter retains one descendant of every starting chromosome, including both homologs and both sex chromosomes, so XX stays XX and XY stays XY. Prime labels follow tracing identities; both sisters contain an old DNA strand and a new one.

During alignment, all sister-pair centromere midpoints occupy the model's x=0 metaphase plane; the depth coordinate spreads them in the 2D projection for legibility. Blue spindle fibers connect sisters to opposite poles. Arm cohesion is removed during prophase; centromeric cohesion is released at anaphase. Cytokinesis makes two cell boundaries and reforms two nuclear envelopes enclosing the full daughter genomes. Boundaries, fibers, sizes, lengths, condensation and positions remain schematic.

The underlying genome initializer and faithful replication geometry are reused from the meiosis model. The mitotic model implements its own alignment and sister segregation, with no meiotic recombination or reduction division. See [NHGRI: Mitosis](https://www.genome.gov/genetics-glossary/Mitosis).

The five mitosis tests cover complete XX/XY lifecycles, transient anaphase chromosome counts, opposite-pole sister segregation, retention of both homologs and karyotypes in each daughter, unchanged DNA chains and immutable IDs, absence of crossover/tetrads, intermediate-frame movement, cohesion release, spindle rendering and exactly two daughter nuclei containing their complete genomes.

## Meiosis

An animated scientific schematic with all **22 autosome pairs and an XX or XY sex pair**. The cell view shows chromosome movement and membrane division continuously. Only chromosome 1 and the sex pair resolve individual DNA segments; the other 21 pairs remain present and participate in both divisions.

## Controls

- **XX / XY** selects the starting karyotype and resets the run. XY is the default; `?sex=XX` selects XX.
- **Play** runs the complete sequence. **Stop** stops after the current stage. The primary action button advances one stage at a time; the circular arrow resets the run.
- Chromosome 1 and the sex pair show numbered DNA segments directly inside the same animated cell diagram. Exchange records and model notes are collapsed by default.
- **+ / −** zooms the single diagram; **Fit** fits its width. The canvas keeps a readable size on narrow screens and can be scrolled.
- Hover over a detailed segment for its stable birth identity, current owner, and copy source.

## Counts

| Stage            | Cells/products | Chromosomes per cell | Chromatids per cell |
| ---------------- | -------------- | -------------------- | ------------------- |
| Before S phase   | 1              | 46                   | 46                  |
| After S phase    | 1              | 46                   | 92                  |
| After meiosis I  | 2              | 23                   | 46                  |
| After meiosis II | 4              | 23                   | 23                  |

Each pair independently chooses its orientation at anaphase I. Each final product receives one chromosome from every autosome pair and one sex chromosome. XY produces two X-bearing and two Y-bearing products; XX produces four X-bearing products.

## Numbering and Segment Origins

Every chromosome has a short visible number: **1A / 1B** through **22A / 22B**. The sex pair is numbered **23A / 23B**, corresponding to X/X in XX mode or X/Y in XY mode. After replication, every chromatid has its own full short label: **1A** and **1A′**. Prime labels occupy an upper row with leaders to their own strands; row spacing keeps these labels clear of adjacent chromosomes. Both sister DNA molecules contain one old strand and one new strand, so the prime is a tracing convention. A prime marks the sister copy; once separated in meiosis II it is a chromosome in its own right.

Only chromosome 1 and the sex pair display segment numbers **01, 02, …**. Corresponding copies share the same position suffix. Color identifies the birth homolog, including after exchange. A source identity such as **1A′·05** remains unique and follows the segment; it appears in tooltips and the optional exchange log rather than on every object in the main cell.

Internally, immutable IDs such as `1A-O-05` and `1A-S1-05` retain birth chromosome, chromatid, position, and copy-source metadata. Display shortening never renumbers an exchanged segment. The human sex-chromosome roots (`XA`/`XB` or `X`/`Y`) map to visible numbers 23A/23B.

## Animation

The SVG cell view reads the model's chromosome/segment positions on successive animation frames. Replication creates sisters, pairing moves all 23 pairs, crossover moves the actual exchanged segments, and anaphase moves homologs to opposite poles. Cell outlines stretch and constrict during cytokinesis, ending with two and then four separate cell boundaries. Numbered DNA segments follow the actual exchanged balls in that same diagram; no separate detail view is used. Labels are packed to reduce collisions while preserving chromosome identity.

The cell has a shaded cytoplasm and membrane rim. During interphase and S phase, a blue nuclear envelope encloses the chromosomes; it is omitted for homolog pairing. Background granules are decorative cytoplasmic texture. Chromosome labels render at 13–16 px, and segment numbers at 11–12 px at 100% zoom. The two detailed pairs are magnified within the main scene; replication preserves their spacing and the other chromosomes’ angles. The final four-cell canvas grows vertically to retain legible details.

Gold bridges connect each replicated chromosome to its own sister in the same cell diagram. The detailed pairs also show arm cohesion. Arm bridges disappear at anaphase I; cohesion near the centromere remains through meiosis I and is removed when meiosis II separates sisters. These are schematic cohesin links, not DNA connections between homologs.

The original GeneLab exchange and segregation methods remain the underlying model. A headless adapter avoids the old WebGL display and floating DOM labels. The renderer uses a 2D schematic projection; it is not a physical model of cell mechanics.

## XX / XY and Scope

XX uses two equal-length schematic X chromosomes, with eligible exchanges on either arm. XY has a longer X and shorter Y. Only the outlined terminal **PAR1** segment can exchange between X and Y; chromosome-specific arms and lengths stay intact. Either randomly selected diagonal of non-sister chromatids obeys this restriction.

Chromosomes remain visibly condensed for tracking even during interphase; real interphase chromatin is normally less condensed.

Other autosomes segregate normally, but their molecular recombination is not resolved. Chromosome lengths, spatial arrangement, and segment sizes are illustrative. XX mode depicts chromosome segregation into four equal-sized products, not unequal oocyte division and polar bodies.

References: [NHGRI chromosome counts](https://www.genome.gov/about-genomics/fact-sheets/Chromosome-Abnormalities-Fact-Sheet), [NLM pseudoautosomal regions](https://meshb.nlm.nih.gov/record/ui?ui=D000071439).

## Run and Verify

This is a static app with no build step. Serve this directory over HTTP, for example with `python3 -m http.server 8000`, then open `http://localhost:8000`. The pinned Three.js 0.177.0 modules require access to jsDelivr.

With Node.js 18 or later:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm test
```

The 44 tests cover both full XX/XY lifecycles, counts and chromosome conservation, independent assortment, unique tetrad groups, stable segment and short display IDs, PAR-restricted X/Y exchanges on both diagonals, every eligible cut in the original small-scene regression tests, crossover progress, actual intermediate-frame chromosome movement, a changing membrane neck, and all 92 chromosome labels across four final products.

Original project: [rhulha/meiosis](https://github.com/rhulha/meiosis).
