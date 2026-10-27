import { SchematicLab } from "./schematic_lab.js?v=mitosis-2";
import { HumanMeiosis } from "./human_meiosis.js?v=mitosis-2";
import { shortChromatid, shortSegment } from "./schematic_view.js";
import { HumanMitosis } from "./human_mitosis.js?v=mitosis-2";
import { MitosisView } from "./mitosis_view.js?v=mitosis-2";
import { CellView } from "./cell_view.js?v=mitosis-2";

const $ = (id) => document.getElementById(id);
const sex =
  new URLSearchParams(location.search).get("sex") === "XX" ? "XX" : "XY";
const lab = new SchematicLab();
const mitosis = document.body.dataset.division === "mitosis";
const model = mitosis ? new HumanMitosis(lab, sex) : new HumanMeiosis(lab, sex);
let phase = null;
let autoPlay = false;
const mainButton = $("duplicateBtn");
const modes = [...document.querySelectorAll("[data-sex]")];
const names = mitosis
  ? [
      "Interphase",
      "S phase",
      "Prophase",
      "Metaphase",
      "Anaphase",
      "Cytokinesis",
    ]
  : ["Start", "S phase", "Prophase I", "Crossover", "Meiosis I", "Meiosis II"];
const stage = mitosis
  ? {
      initial: [0, "Interphase", "46 chromosomes, unreplicated.", "Replicate"],
      replicating: [1, "S phase", "DNA replication.", "Replicate"],
      duplicated: [
        1,
        "S phase complete",
        "46 chromosomes; 92 DNA molecules.",
        "Align chromosomes",
      ],
      aligning: [
        2,
        "Prophase / prometaphase",
        "Nuclear envelope breakdown; spindle attachment.",
        "Align chromosomes",
      ],
      metaphase: [
        3,
        "Metaphase",
        "46 duplicated chromosomes aligned individually.",
        "Separate sisters",
      ],
      anaphase: [
        4,
        "Anaphase",
        "92 chromosomes in one cell; 46 toward each pole.",
        "Divide cell",
      ],
      anaphase_done: [
        4,
        "Anaphase",
        "46 chromosomes at each pole.",
        "Divide cell",
      ],
      cytokinesis: [
        5,
        "Telophase / cytokinesis",
        "Nuclear envelopes reform; the cell divides.",
        "Divide cell",
      ],
      done: [
        5,
        "Mitosis complete",
        "46 chromosomes in each daughter cell.",
        "Restart",
      ],
    }
  : {
      initial: [0, "Interphase", "46 chromosomes, unreplicated.", "Replicate"],
      duplicated: [
        1,
        "S phase complete",
        "46 chromosomes; 92 chromatids.",
        "Pair homologs",
      ],
      tetrads_formed: [
        2,
        "Prophase I",
        `22 autosomal tetrads + ${sex} pairing.`,
        "Crossover",
      ],
      crossover_done: [
        3,
        "Recombination complete",
        "Segment origins retained.",
        "Separate homologs",
      ],
      anaphase1_done: [
        4,
        "Anaphase I",
        "Homologs at opposite poles.",
        "Divide cell",
      ],
      telophase1_done: [
        4,
        "Telophase I",
        "23 duplicated chromosomes per cell.",
        "Separate sisters",
      ],
      done: [5, "Meiosis complete", "23 chromosomes per product.", "Restart"],
    };
const action = mitosis
  ? {
      initial: ["duplicate", "Replicating…", () => model.duplicate(100)],
      duplicated: ["align", "Aligning chromosomes…", () => model.align(1800)],
      metaphase: [
        "separate",
        "Separating sisters…",
        () => model.separate(2200),
      ],
      anaphase_done: ["divide", "Cytokinesis…", () => model.divide(1600)],
    }
  : {
      initial: ["duplicate", "Replicating…", () => model.duplicate(100)],
      duplicated: [
        "formTetrads",
        "Pairing homologs…",
        () => model.formTetrads(1200),
      ],
      tetrads_formed: [
        "crossover",
        "Exchanging segments…",
        () => model.crossover(1800),
      ],
      crossover_done: [
        "separate",
        "Separating homologs…",
        () => model.separate(1800),
      ],
      anaphase1_done: ["divide", "Cytokinesis I…", () => model.divide(1200)],
      telophase1_done: [
        "divideAgain",
        "Meiosis II…",
        () => model.divideAgain(1600),
      ],
    };
const cellView = new (mitosis ? MitosisView : CellView)(
  $("genomeBoard"),
  model,
  lab,
);
for (const link of document.querySelectorAll("[data-division-link]")) {
  const url = new URL(link.getAttribute("href"), location.href);
  url.searchParams.set("sex", sex);
  link.href = url;
}
function zoom(value) {
  cellView.setZoom(value);
  $("zoomLevel").textContent = `${Math.round(cellView.zoom * 100)}%`;
}
$("zoomInBtn").addEventListener("click", () => zoom(cellView.zoom + 0.2));
$("zoomOutBtn").addEventListener("click", () => zoom(cellView.zoom - 0.2));
$("fitBtn").addEventListener("click", () =>
  zoom(Math.min(1, ($("genomeBoard").clientWidth - 24) / cellView.width)),
);

for (const mode of modes) {
  mode.setAttribute("aria-pressed", String(mode.dataset.sex === sex));
  mode.addEventListener("click", () => {
    if (mode.dataset.sex === sex) return;
    const url = new URL(location.href);
    url.searchParams.set("sex", mode.dataset.sex);
    location.assign(url);
  });
}
$("resetBtn").addEventListener("click", () => location.reload());
$("karyotypeBadge").textContent = "2n = 46";
$("sexPairLegend").textContent = `23A: X · 23B: ${sex === "XY" ? "Y" : "X"}`;

function paragraph(parent, text) {
  const element = document.createElement("p");
  element.textContent = text;
  parent.appendChild(element);
}

function renderHistory() {
  if (mitosis) return;
  const records = lab.crossoverHistory || [];
  $("exchangeCount").textContent = records.length;
  const history = $("exchangeHistory");
  history.replaceChildren();
  for (const record of records) {
    const entry = document.createElement("section");
    entry.className = "exchange-record";
    const title = document.createElement("strong");
    title.textContent = record.chromatids.map(shortChromatid).join(" ↔ ");
    entry.appendChild(title);
    for (const transfer of record.transfers) {
      paragraph(
        entry,
        `${transfer.segmentIds.map(shortSegment).join(", ")} → ${shortChromatid(transfer.to)}`,
      );
    }
    if (record.region) paragraph(entry, "XY: terminal PAR1 only.");
    const compare = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = "Before / after";
    compare.appendChild(summary);
    for (const [label, snapshots] of [
      ["Before", record.before],
      ["After", record.after],
    ]) {
      for (const snapshot of snapshots || []) {
        paragraph(
          compare,
          `${label} · ${shortChromatid(snapshot.chromatidId)}: ${snapshot.segmentIds.map(shortSegment).join(" / ")}`,
        );
      }
    }
    entry.appendChild(compare);
    history.appendChild(entry);
  }
}

function render() {
  const [index, title, description, next] = stage[model.state];
  const counts = model.summary;
  $("populationSummary").replaceChildren();
  for (const [number, label] of [
    [
      counts[0].chromosomes,
      counts.length === 1 ? "Chromosomes" : "Chromosomes / cell",
    ],
    [
      counts[0].chromatids,
      mitosis
        ? counts.length === 1
          ? "DNA molecules"
          : "DNA molecules / cell"
        : counts.length === 1
          ? "Chromatids"
          : "Chromatids / cell",
    ],
    [
      counts.length,
      model.state === "done" && !mitosis
        ? "Products"
        : counts.length === 1
          ? "Cell"
          : "Cells",
    ],
  ]) {
    const item = document.createElement("div");
    item.className = "count-item";
    const value = document.createElement("span");
    value.className = "count-number";
    value.textContent = number;
    const name = document.createElement("span");
    name.className = "count-label";
    name.textContent = label;
    item.append(value, name);
    $("populationSummary").appendChild(item);
  }
  $("stageTimeline").replaceChildren();
  names.forEach((name, i) => {
    if (i) {
      const line = document.createElement("span");
      line.className = "timeline-link";
      $("stageTimeline").appendChild(line);
    }
    const item = document.createElement("div");
    item.className = `timeline-step ${i === index ? "active" : i < index ? "complete" : ""}`;
    if (i === index) item.setAttribute("aria-current", "step");
    const number = document.createElement("span");
    number.className = "timeline-number";
    number.textContent = i < index ? "✓" : String(i + 1).padStart(2, "0");
    const label = document.createElement("span");
    label.textContent = name;
    item.append(number, label);
    $("stageTimeline").appendChild(item);
  });
  cellView.update(phase);
  $("currentStep").textContent = phase
    ? action[model.state]?.[1] || title
    : title;
  $("stepDescription").textContent = description;
  mainButton.replaceChildren(
    document.createTextNode(phase ? "Animating…" : next),
  );
  const arrow = document.createElement("span");
  arrow.textContent = "→";
  arrow.setAttribute("aria-hidden", "true");
  mainButton.appendChild(arrow);
  mainButton.disabled = Boolean(phase) || autoPlay;
  $("playBtn").textContent = autoPlay
    ? "Stop"
    : model.state === "done"
      ? "Replay"
      : "Play";
  $("playBtn").disabled = Boolean(phase) && !autoPlay;
  $("playBtn").title = autoPlay
    ? "Stop after the current stage"
    : "Play the complete sequence";
  modes.forEach((mode) => {
    mode.disabled = Boolean(phase) || autoPlay;
  });
  $("resetBtn").disabled = Boolean(phase);
  document.body.classList.toggle("is-busy", Boolean(phase));
  $("boardNote").textContent =
    !mitosis && model.state === "done" && sex === "XY"
      ? "2 X-bearing + 2 Y-bearing products"
      : `${model.summary.length} ${model.summary.length === 1 ? "cell" : model.state === "done" && !mitosis ? "products" : "cells"}`;
  $("karyotypeBadge").textContent = mitosis
    ? model.separated && model.state !== "done"
      ? "46 per pole"
      : "2n = 46"
    : ["telophase1_done", "done"].includes(model.state)
      ? "n = 23"
      : "2n = 46";
  renderHistory();
}

lab.onCrossoverChange = () => render();
async function advance() {
  if (phase) return;
  if (model.state === "done") {
    location.reload();
    return;
  }
  const [name, , run] = action[model.state];
  phase = name;
  try {
    const promise = run();
    render();
    await promise;
  } catch (error) {
    console.error(error);
    autoPlay = false;
    $("stepDescription").textContent = "Animation stopped. Restart the model.";
  } finally {
    phase = null;
    render();
  }
}
mainButton.addEventListener("click", advance);
$("playBtn").addEventListener("click", async () => {
  if (autoPlay) {
    autoPlay = false;
    render();
    return;
  }
  if (phase) return;
  if (model.state === "done") {
    const url = new URL(location.href);
    url.searchParams.set("run", "1");
    location.assign(url);
    return;
  }
  autoPlay = true;
  render();
  while (autoPlay && model.state !== "done") {
    await advance();
    if (autoPlay && model.state !== "done")
      await new Promise((resolve) => setTimeout(resolve, 450));
  }
  autoPlay = false;
  render();
});
$("infoBtn").addEventListener("click", () => $("infoOverlay").showModal());
$("infoClose").addEventListener("click", () => $("infoOverlay").close());
$("infoOverlay").addEventListener("click", (event) => {
  if (event.target === $("infoOverlay")) $("infoOverlay").close();
});
render();
if (new URLSearchParams(location.search).get("run") === "1") {
  const url = new URL(location.href);
  url.searchParams.delete("run");
  history.replaceState(null, "", url);
  $("playBtn").click();
}
