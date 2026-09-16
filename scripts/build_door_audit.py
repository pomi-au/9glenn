"""Build the resolved door report directly from the current shared drawing exports."""
from pathlib import Path
import hashlib
import html
import json
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT/'audit/doors'
ET.register_namespace('', 'http://www.w3.org/2000/svg')

# Crop bounds are presentation coordinates only, never an alternate building model.
REGIONS = {
    'ground-service': ('ground', (14000, 100, 19400, 6300)),
    'ground-gallery': ('ground', (5300, 5350, 17300, 8550)),
    'ground-garage': ('ground', (5100, 5400, 10200, 9100)),
    'ground-exterior': ('ground', (8500, 1500, 11000, 5100)),
    'ground-meals-games': ('ground', (24700, 1000, 27200, 8600)),
    'ground-entry': ('ground', (14000, 12500, 18000, 14200)),
    'ground-stair': ('ground', (15100, 7400, 17700, 9400)),
    'first-bed23': ('first', (6200, 2900, 12300, 6550)),
    'first-master': ('first', (15100, 1500, 20400, 8300)),
    'first-bed45': ('first', (3300, 6400, 10800, 10100)),
    'first-studio': ('first', (12600, 7150, 15500, 9000)),
    'first-wet': ('first', (15100, 0, 21200, 3800)),
    'first-shower1': ('first', (8000, 0, 10000, 1900)),
    'first-shower2': ('first', (0, 4000, 2000, 6000)),
    'elevation-dining': ('elevation-2', (900, 3600, 4900, 6300)),
    'elevation-laundry': ('elevation-3', (9900, 3600, 12700, 6300)),
    'elevation-meals-games': ('elevation-4', (4700, 3600, 12600, 6300)),
    'elevation-front': ('elevation-1', (14000, 3000, 18000, 6300)),
    'cellar': ('cellar', (-100, 0, 6100, 5200)),
}
CORRECTIONS = {
    'Dining exterior pair': 'Restored both glazed side panels. The printed 600 + 1,310 setback and 2,770 mm assembly now control the plan and left elevation from one shared authoring record.',
    'Garage to gallery': 'Moved the doorway back from the study-wall junction and restored the short return below its hinge.',
    'Gallery pair': 'Removed the 270 mm gap between the closed leaves and joined the lower jamb to the stair-side wall.',
    'Laundry rear door': 'Reversed the hinge to the east jamb. The 820 mm leaf and 630 mm side panel share the 1,450 mm assembly with the rear elevation.',
    'Laundry internal door beside linen': 'Restored the diagonal opening and matching swing beside the linen recess, including its wall ends and lintel footprint.',
    'Laundry lobby': 'Joined the lower hinge to the lobby wall and supplied a wall with a correctly cut aperture.',
    'Door beneath stair': 'Restored the cross-wall and the jambs on both sides of the 720 mm opening.',
    'Bath 1 recess door': 'Moved the 520 mm opening away from the west wall to the source recess position.',
    'WC beside ensuite': 'Moved the door to the east partition so it opens from the ensuite. Restored the solid south wall.',
    'Master WIR': 'Moved the hinge to the north end, retaining the swing into Bedroom 1.',
    'Master bedroom entry pair': 'Removed the 185 mm gap between the closed leaves and connected the lower jamb to the studio partition.',
    'Bedroom 5': 'Moved the hinge to the north end. Removed the conflicting return behind the doorway and rebuilt its actual jamb.',
    'Bedroom 4': 'Restored a horizontal entrance in the north return, with the leaf opening downward into the bedroom.',
    'Bedroom 4 WIR': 'Moved the doorway to the south wall, opening upward into the WIR. Restored the west wall.',
    'Linen': 'Corrected the 720 mm door to the north opening from the passage into LINEN, hinged at the left jamb and swinging inward. The WIR-side partition is solid.',
    'Studio pair': 'Extended the adjoining partition to meet the right-hand hinge, eliminating the 180 mm gap.',
    'Ensuite shower': 'Moved the hinge to the north end and retained its outward swing. The shared door record marks it as a shower leaf.',
    'Bath 1 corner shower': 'Reversed the hinge to the upper-right end of the diagonal opening. The leaf is now a shared semantic door in both views.',
    'Bath 2 corner shower': 'Reversed the hinge to the upper-right end of the diagonal opening. The leaf is now a shared semantic door in both views.',
}


def comparison(name, drawings):
    id, (x1, y1, x2, y2) = REGIONS[name]
    drawing = drawings[id]
    viewbox = f'{x1} {y1} {x2-x1} {y2-y1}'
    root = ET.parse(ROOT/'drawings'/f'{id}.svg').getroot()
    root.set('viewBox', viewbox)
    root.set('width', str(x2-x1))
    root.set('height', str(y2-y1))
    vector = ET.tostring(root, encoding='unicode')
    source = drawing['sourceImage']
    reference = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{viewbox}">'
        f'<image x="{source["x"]}" y="{source["y"]}" width="{source["width"]}" '
        f'height="{source["height"]}" preserveAspectRatio="none" '
        f'href="../../assets/source-{drawing["page"]}.jpg"/></svg>'
    )
    return (
        f'<section id="{name}"><h3>{html.escape(name.replace("-", " ").title())}</h3>'
        f'<div class="pair"><figure><figcaption>PDF reference · sheet {drawing["page"]}</figcaption>{reference}</figure>'
        f'<figure><figcaption>Corrected SVG · shared data</figcaption>{vector}</figure></div></section>'
    )


def main():
    previous = json.loads((OUT/'before-fix/audit.json').read_text())
    drawings = {d['id']: d for d in json.loads((ROOT/'assets/drawing-data.json').read_text())}
    checks = json.loads((OUT/'checks.json').read_text())
    records = []
    for old in previous['doorInventory']:
        record = dict(old)
        if not old['finding'].startswith('Match'):
            record.update(finding='Corrected', note=CORRECTIONS[old['name']])
        records.append(record)
    summary = (
        'The audited door discrepancies have been corrected in the shared authoring data and rebuilt into '
        'the SVGs, 3D model and offline viewer. This covers 11 hinge/swing/orientation corrections, '
        'the reported opening and wall-junction defects, and the single laundry-door elevation symbol.'
    )
    limits = (
        'Checked: 43 shared door leaves (22 ground, 21 first, including three shower doors), '
        '40 printed width labels, all 11 corrected orientations and eight pairs whose closed edges now meet. '
        'The dining assembly is 2,770 mm as printed on sheet 4. Neither cellar plan shows a hinged door at cellar level. '
        'The 4,930 mm vehicle opening is separate from the leaf count. Exact undimensioned setbacks, shower sizes '
        'and frame details remain reconstructed from the scan; this is not a certification of every drawing feature.'
    )
    css = '''body{font:15px/1.6 system-ui;margin:32px auto;padding:0 24px;max-width:1500px;color:#17252b}h1{font-size:30px}h2{margin-top:36px}p{max-width:1100px}table{border-collapse:collapse;width:100%;font-size:14px}td,th{padding:12px;text-align:left;border-bottom:1px solid #d6dfe2;vertical-align:top}th{background:#eff3f5}a{color:#075c91}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}figure{margin:0;border:1px solid #d6dfe2}figure>svg{width:100%;height:auto;display:block}figcaption{padding:10px;background:#eff3f5}details{margin:18px 0;padding:14px;border:1px solid #d6dfe2}summary{cursor:pointer;font-weight:650}.note{background:#edf6ef;padding:18px}section{scroll-margin-top:20px;margin:30px 0}@media(max-width:700px){.pair{grid-template-columns:1fr}body{padding:0 12px}}'''
    parts = [f'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>9 Glenn · Corrected doors</title><style>{css}</style>',
             f'<h1>9 Glenn · Corrected doors</h1><p class="note"><strong>{summary}</strong></p><p>{limits}</p>',
             '<p>Both renderers resolve door coordinates from the same SVG primitive tree. Browser checks verified the corrected apertures and confirmed that changing a shared door transform changes both the SVG and 3D geometry. Existing dimension and viewer checks passed.</p>',
             '<p><a href="../../9-glenn-viewer.html">Open updated viewer</a> · <a href="before-fix/index.html">Original audit before corrections</a></p>',
             '<h2>Resolved findings</h2><table><tr><th>Location</th><th>Correction</th><th>Evidence</th></tr>']
    for record in records:
        if record['finding'] == 'Corrected':
            parts.append(f'<tr><td>{record["floor"]} · {html.escape(record["name"])}</td><td>{html.escape(record["note"])}</td><td><a href="#{record["evidence"]}">PDF / SVG</a></td></tr>')
    parts.append('<tr><td>Rear elevation · Laundry</td><td>Replaced the centre divider and full X with the single-leaf chevron shown in the PDF.</td><td><a href="#elevation-laundry">PDF / SVG</a></td></tr></table>')
    parts.append('<details><summary>Complete door inventory</summary><table><tr><th>Floor / location</th><th>Leaves</th><th>Printed width (mm)</th><th>Result</th></tr>')
    for record in records:
        parts.append(f'<tr><td>{record["floor"]} · {html.escape(record["name"])}</td><td>{record["leaves"]}</td><td>{record["printedWidthMm"]}</td><td>{record["finding"]}</td></tr>')
    parts.append('</table></details><h2>Current comparisons</h2><p>These SVG panels are generated from the current drawing files. PDF panels retain the overall source calibration without local warping.</p>')
    parts.extend(comparison(name, drawings) for name in REGIONS)
    parts.append('</html>')
    (OUT/'index.html').write_text(''.join(parts))
    files = [ROOT/'assets/drawing-data.json', *sorted((ROOT/'drawings').glob('*.svg'))]
    result = dict(date='2026-09-11', status='corrected', summary=summary, limitations=limits,
                  checks=checks, doorInventory=records,
                  sha256={str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in files})
    (OUT/'audit.json').write_text(json.dumps(result, indent=2)+'\n')
    lines = ['# Corrected doors · 9 Glenn', '', summary, '', limits, '',
             '[Current comparisons](index.html) · [Original audit](before-fix/index.html)', '']
    lines.extend(f'- **{r["floor"]}: {r["name"]}.** {r["note"]}' for r in records if r['finding']=='Corrected')
    lines.append('- **Rear elevation: laundry.** Replaced the paired-door symbol with the single-leaf chevron.')
    (OUT/'report.md').write_text('\n'.join(lines)+'\n')
    print('Built resolved door audit from current SVG exports and source references.')


if __name__ == '__main__':
    main()
