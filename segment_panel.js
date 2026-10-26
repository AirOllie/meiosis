// The panel reads mesh identities; it never assigns IDs from current positions.
export function setupSegmentPanel(lab, chromosomes) {
    const contents = document.getElementById('chromatidContents');
    const history = document.getElementById('exchangeHistory');
    const status = document.getElementById('exchangeStatus');
    const focus = document.getElementById('labelFocus');
    document.getElementById('trackerDetails').open = !window.matchMedia('(max-width: 700px)').matches;
    document.getElementById('showSegmentIds').addEventListener('change', event => {
        lab.setSegmentLabelsVisible(event.target.checked);
    });
    function applyFocus() {
        lab.setSegmentLabelFocus(chromosomes.find(chromosome => chromosome.chromatidId === focus.value) || null);
    }
    focus.addEventListener('change', applyFocus);

    function paragraph(parent, text) {
        const p = document.createElement('p');
        p.textContent = text;
        parent.appendChild(p);
    }

    function refresh() {
        const selected = focus.value;
        focus.replaceChildren(new Option('All chromatids', ''));
        for (const chromosome of chromosomes) {
            focus.add(new Option(chromosome.chromatidId, chromosome.chromatidId));
        }
        focus.value = selected;
        applyFocus();
        contents.replaceChildren();
        for (const chromosome of chromosomes) {
            const row = document.createElement('div');
            row.className = 'chromatid-row';
            const name = document.createElement('strong');
            name.textContent = chromosome.chromatidId;
            row.appendChild(name);
            for (const ball of chromosome.balls) {
                const segment = ball.userData.segment;
                const chip = document.createElement('span');
                chip.className = 'segment-chip';
                chip.textContent = segment.id;
                chip.tabIndex = 0;
                chip.title = `ID ${segment.id}: born in ${segment.originChromatidId}, position ${segment.originalIndex}` +
                    (segment.copiedFromId ? `; copied from ID ${segment.copiedFromId}` : '; starting segment');
                chip.setAttribute('aria-label', chip.title);
                chip.classList.toggle('sister-segment', segment.copiedFromId !== null);
                row.appendChild(chip);
            }
            contents.appendChild(row);
        }

        history.replaceChildren();
        const records = lab.crossoverHistory || [];
        if (records.length) {
            document.getElementById('exchangeDetails').open = true;
            const complete = records.filter(record => record.status === 'complete').length;
            status.textContent = `${complete}/${records.length} exchanges complete. IDs are preserved after exchange.`;
        }
        for (const record of records) {
            const entry = document.createElement('section');
            entry.className = 'exchange-record';
            const heading = document.createElement('h3');
            heading.textContent = `${record.pair.join(' ↔ ')}: ${record.chromatids.join(' ↔ ')}`;
            entry.appendChild(heading);
            paragraph(entry, `${record.status === 'complete' ? 'Complete' : 'Exchanging…'} · cut between positions ${record.crossoverIndex} and ${record.crossoverIndex + 1} · ${record.arm === 'start' ? 'start' : 'end'} arm`);
            for (const transfer of record.transfers) {
                paragraph(entry, `${transfer.from} → ${transfer.to}: ${transfer.segmentIds.join(', ')}`);
            }
            const sequences = document.createElement('details');
            const summary = document.createElement('summary');
            summary.textContent = 'Before / after sequences';
            sequences.appendChild(summary);
            for (const [label, snapshots] of [['Before', record.before], ['After', record.after]]) {
                for (const snapshot of snapshots || []) {
                    paragraph(sequences, `${label} ${snapshot.chromatidId}: ${snapshot.segmentIds.join(' · ')}`);
                }
            }
            entry.appendChild(sequences);
            history.appendChild(entry);
        }
    }

    lab.onCrossoverChange = refresh;
    refresh();
    return refresh;
}
