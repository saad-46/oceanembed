"""PDF / CSV profile reports (docs/12 screen 7). Pure reportlab - no browser, no matplotlib."""
from __future__ import annotations

import csv
import io
from datetime import datetime, timezone

from reportlab.graphics.charts.lineplots import LinePlot
from reportlab.graphics.shapes import Drawing, String
from reportlab.graphics.widgets.markers import makeMarker
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

CYAN = colors.HexColor("#1b8fa6")
ORANGE = colors.HexColor("#d9822b")
GREY = colors.HexColor("#8a96a8")


def profile_csv(p: dict) -> bytes:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["# OceanSight / OceanEmbed (SIH26066) reconstructed temperature profile"])
    w.writerow([f"# date={p['date']} lat={p['lat']} lon={p['lon']} grid_cell=({p['cell']['lat']},{p['cell']['lon']}) "
                f"model={p['model_version']} data_label={p['data_label']}"])
    argo = p.get("nearest_argo_float") or {}
    header = ["depth_m", "temperature_c", "uncertainty_c", "climatology_c"]
    if argo:
        header.append(f"argo_{argo['platform_number']}_c")
    w.writerow(header)
    for k, z in enumerate(p["depths_m"]):
        row = [z, p["temperature_c"][k], (p["uncertainty_c"] or [None] * 15)[k], p["baseline_climatology_c"][k]]
        if argo:
            row.append(argo["temperature_c_std_depths"][k])
        w.writerow(["" if v is None else v for v in row])
    w.writerow([])
    for k, v in p["derived"].items():
        w.writerow([f"# {k}", "" if v is None else v])
    return buf.getvalue().encode()


def _chart(p: dict) -> Drawing:
    d = Drawing(170 * mm, 95 * mm)
    lp = LinePlot()
    lp.x, lp.y, lp.width, lp.height = 18 * mm, 12 * mm, 140 * mm, 75 * mm
    depths = p["depths_m"]
    series, cols = [], []
    for vals, col in ((p["temperature_c"], CYAN), (p["baseline_climatology_c"], GREY)):
        pts = [(t, -z) for t, z in zip(vals, depths) if t is not None]
        if pts:
            series.append(pts); cols.append(col)
    argo = p.get("nearest_argo_float")
    if argo:
        pts = [(t, -z) for t, z in zip(argo["temperature_c_std_depths"], depths) if t is not None]
        if pts:
            series.append(pts); cols.append(ORANGE)
    lp.data = series
    for k, c in enumerate(cols):
        lp.lines[k].strokeColor = c
        lp.lines[k].strokeWidth = 1.6
        if c is ORANGE:
            lp.lines[k].strokeColor = None  # markers only: measured points, not a line
            lp.lines[k].symbol = makeMarker("FilledCircle", size=4, fillColor=ORANGE)
    lp.yValueAxis.valueMin, lp.yValueAxis.valueMax = -1000, 0
    lp.yValueAxis.valueSteps = [-1000, -700, -500, -300, -200, -100, 0]
    lp.yValueAxis.labelTextFormat = lambda v: f"{int(-v)}"
    lp.xValueAxis.labelTextFormat = "%d"
    d.add(lp)
    d.add(String(2 * mm, 50 * mm, "depth (m)", fontSize=7, fillColor=GREY))
    d.add(String(80 * mm, 3 * mm, "temperature (°C)", fontSize=7, fillColor=GREY))
    legend = [("reconstruction", CYAN), ("climatology", GREY)] + ([("Argo float", ORANGE)] if argo else [])
    for k, (name, c) in enumerate(legend):
        d.add(String(120 * mm, (30 - 5 * k) * mm, "— " + name, fontSize=7, fillColor=c))
    return d


def profile_pdf(p: dict, summary: str, validation_line: str) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm,
                            bottomMargin=16 * mm, title=f"OceanSight profile {p['date']}")
    ss = getSampleStyleSheet()
    small = ParagraphStyle("small", parent=ss["Normal"], fontSize=8, textColor=GREY, leading=10)
    story = [
        Paragraph("<b>OceanSight</b> · Subsurface temperature reconstruction", ss["Title"]),
        Paragraph(f"SIH26066 OceanEmbed · {p['date']} · {p['lat']:.2f}°N, {p['lon']:.2f}°E "
                  f"(grid cell {p['cell']['lat']:.3f}°N, {p['cell']['lon']:.3f}°E) · model {p['model_version']}", small),
        Spacer(1, 4 * mm), Paragraph(summary, ss["Normal"]), Spacer(1, 3 * mm), _chart(p), Spacer(1, 3 * mm),
    ]
    d = p["derived"]
    fmt = lambda v, u: "—" if v is None else f"{v:.1f} {u}"
    chips = [["TCHP", "MLD", "D26", "D20"],
             [fmt(d.get("tchp_kj_cm2"), "kJ/cm²"), fmt(d.get("mld_m"), "m"), fmt(d.get("d26_m"), "m"), fmt(d.get("d20_m"), "m")]]
    t = Table(chips, colWidths=[40 * mm] * 4)
    t.setStyle(TableStyle([("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 8), ("TEXTCOLOR", (0, 0), (-1, 0), GREY),
                           ("FONT", (0, 1), (-1, 1), "Helvetica", 11), ("BOX", (0, 0), (-1, -1), 0.5, GREY),
                           ("INNERGRID", (0, 0), (-1, -1), 0.25, GREY)]))
    story += [t, Spacer(1, 4 * mm)]
    rows = [["depth (m)", "T (°C)", "± σ (°C)", "climatology (°C)"]]
    unc = p["uncertainty_c"] or [None] * len(p["depths_m"])
    for z, tv, s, c in zip(p["depths_m"], p["temperature_c"], unc, p["baseline_climatology_c"]):
        rows.append([f"{z:.0f}", "—" if tv is None else f"{tv:.2f}", "—" if s is None else f"{s:.2f}", "—" if c is None else f"{c:.2f}"])
    tt = Table(rows, colWidths=[30 * mm] * 4)
    tt.setStyle(TableStyle([("FONT", (0, 0), (-1, -1), "Helvetica", 7.5), ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 7.5),
                            ("ALIGN", (1, 0), (-1, -1), "RIGHT"), ("LINEBELOW", (0, 0), (-1, 0), 0.5, GREY)]))
    story += [tt, Spacer(1, 4 * mm), Paragraph(validation_line, small),
              Paragraph("Caveat: validation floats are independent of model training but not fully independent of the "
                        "ocean reanalysis used as training target (it assimilates Argo). Proof-of-concept, not an "
                        "operational INCOIS product. Inputs: open NOAA satellite products; see docs/DECISIONS.md.", small),
              Paragraph(f"Generated {datetime.now(timezone.utc):%Y-%m-%d %H:%M} UTC · data label: {p['data_label']}", small)]
    doc.build(story)
    return buf.getvalue()
