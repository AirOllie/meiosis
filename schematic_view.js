export function shortChromatid(id) {
  const [origin, kind] = id.split("-");
  const root = { X: "23A", Y: "23B", XA: "23A", XB: "23B" }[origin] || origin;
  return (
    root +
    (kind?.startsWith("S") ? (kind === "S1" ? "′" : `′${kind.slice(1)}`) : "")
  );
}

export function shortSegment(id) {
  const parts = id.split("-");
  return `${shortChromatid(parts.slice(0, -1).join("-"))}·${parts.at(-1)}`;
}
