# Meiosis 3D Simulation

An interactive 3D animation that walks you through every stage of meiosis — the cell division that produces gametes (sperm and egg cells).

## What You'll See

Click through each stage and watch it happen in 3D:

1. **S Phase** — Each chromosome duplicates, forming sister chromatids joined at the centromere.
2. **Prophase I** — Homologous chromosomes pair up (synapsis) and crossing over swaps segments between non-sister chromatids, creating new genetic combinations.
3. **Anaphase I** — Homologous pairs are pulled to opposite poles. Sister chromatids stay together.
4. **Telophase I** — The cell divides into two haploid daughter cells.
5. **Meiosis II** — Sister chromatids separate and each cell divides again, producing four unique haploid gametes.

## How to Use

Try it here: [https://rhulha.github.io/meiosis/](https://rhulha.github.io/meiosis/)

Click the button to advance through each stage. You can rotate the view with the right mouse button, pan with the left, and zoom with the scroll wheel.

## Track DNA Segments

Every ball represents an **abstract DNA segment**, not a nucleotide, and has a unique ID such as `C1-O-01`. IDs are assigned at birth and stay attached to the same ball through crossing over and both divisions. Restart begins a new run with the same initial numbering.

- `C1`–`C4` identify the four starting chromosomes. Homolog pairs are **C1/C3** and **C2/C4**.
- `C1-O` is C1's starting chromatid; `C1-S1` is its sister produced in S phase. `O`/`S1` describe model copies, not old/new strands of a DNA double helix.
- Solid ID borders mark starting segments; dashed borders mark sister-copy segments. Corresponding positions use matching suffixes: `C1-O-01` is copied to `C1-S1-01`, `C1-O-02` to `C1-S1-02`, and so on. The prefix identifies the birth chromosome and chromatid, so all 64 full IDs remain unique. Matching suffixes indicate corresponding positions before exchange, not that DNA sequences in different homologs must be identical.
- **Show segment IDs** toggles labels, including labels created while it is off. Labels follow balls when the view rotates, balls are dragged, and chromosomes move.
- **Label focus** shows only one chromatid's current segment labels, making overlapping chromatids easier to read. After exchange it follows the chosen chromatid's new contents, including segments received from its homolog. The tracker starts collapsed on small screens to leave the model visible.
- **Current chromatid contents** lists the IDs currently in each chromatid. Hover or keyboard-focus an ID for its birth chromatid, original position, and source segment if it was copied. Its origin stays the same when its current owner changes.
- **Exchange history** opens during crossover. Orange labels mark moving segments. Each record names the randomly selected non-sister chromatids, the cut between two positions, both transferred ID lists, and expandable before/after sequences. Positions are 1-based slots; IDs are persistent identities. Both records remain available through the final gametes.

For example, an exchange from `C1-O` to `C3-S1` moves C1's numbered balls into C3's sister; their numbers and birth origins remain C1's. The unchanged sisters keep their original contents. Rotate or zoom to separate labels that overlap in a projected 3D view.

## Run and Verify Locally

This is a static browser app; there is no build step. Serve this directory with an HTTP server (for example, `python3 -m http.server 8000`) and open `http://localhost:8000`. The browser imports the pinned Three.js 0.177.0 modules from jsDelivr, so an internet connection is needed.

With Node.js 18 or later:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm test
```

Tests cover deterministic IDs during concurrent replication, label visibility, immutable birth metadata, both homolog pairs and random diagonals, every eligible cut on both centromere arms, preservation of the same mesh/label objects, connection rewiring, unchanged nonparticipants, and before/after history snapshots.

## Preview

![Meiosis Simulation](./example.jpg)
