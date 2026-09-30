"""PDF / CSV investigation reports for one water column. Pure reportlab — no browser, no matplotlib.

Everything in the document comes from the same profile payload the web app shows, plus the
reconstructed field at the requested depth for the map inset. Nothing is invented: missing values
are printed as "—" and every block states its provenance (measured / reconstructed / derived / estimated).
"""
from __future__ import annotations

import csv
import io
from datetime import datetime, timezone

import numpy as np
from reportlab.graphics.charts.lineplots import LinePlot
from reportlab.graphics.shapes import Circle, Drawing, Line, Rect, String
from reportlab.graphics.widgets.markers import makeMarker
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

CYAN = colors.HexColor("#1b8fa6")
ORANGE = colors.HexColor("#d9822b")
GREEN = colors.HexColor("#199e70")
GREY = colors.HexColor("#8a96a8")
INK = colors.HexColor("#1d2733")
# same thermal ramp as the web map (frontend/lib/colormap.ts)
THERMAL = ["#04142e", "#172a73", "#3c3b9c", "#6b479d", "#99558f", "#c96578", "#ec7a5a", "#fca046", "#fdd05a", "#f6f7a0"]

PROVENANCE = (
    "<b>Measured</b> — direct observation (Argo floats). <b>Reconstructed</b> — OceanSight model output "
    "(temperature, uncertainty). <b>Derived</b> — calculated from reconstructed or measured values (MLD, D20, D26, TCHP, "
    "thermocline, halocline). <b>Estimated</b> — inferred quantity with additional uncertainty (calibrated ±1 sd). "
    "<b>Satellite</b> — satellite-derived surface observation product. <b>Reanalysis</b> — data-assimilative ocean model "
    "analysis. No forecast values are included in this report."
)
LABEL = {"measured": "Measured", "reconstructed": "Reconstructed", "derived": "Derived", "estimated": "Estimated",
         "satellite": "Satellite", "reanalysis": "Reanalysis", "baseline": "Baseline", "forecast": "Forecast"}
METHOD = (
    "Temperature at 15 standard depths (0–1000 m) is reconstructed on a 0.25° daily grid from satellite surface "
    "observations (sea-surface temperature, salinity, sea level, geostrophic currents, winds) by a U-Net trained on "
    "the HYCOM ocean analysis (2019–2021). The model predicts the departure from a seasonal climatology and a "
    "per-depth uncertainty (one standard deviation, sd), calibrated against 2022 Argo profiles. Derived quantities: MLD — first depth below 10 m "
    "that is 0.5 °C colder than 10 m; D20 / D26 — depth of the 20 / 26 °C isotherm; TCHP — heat content above 26 °C."
)
CAVEAT = (
    "Validation floats are independent of model training but not fully independent of the ocean analysis used as "
    "the training target (it assimilates Argo). OceanSight reconstructs past ocean states; it is not a forecast."
)


def profile_csv(p: dict, extras: dict | None = None) -> bytes:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["# OceanSight reconstructed temperature profile (Subsurface Ocean Intelligence)"])
    w.writerow([f"# date={p['date']} lat={p['lat']} lon={p['lon']} grid_cell=({p['cell']['lat']},{p['cell']['lon']}) "
                f"model={p['model_version']} data_label={p['data_label']}"])
    w.writerow(["# provenance: temperature_c/uncertainty_c = reconstructed; climatology_c = model baseline; argo = measured"])
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
        w.writerow([f"# derived {k}", "" if v is None else v])
    for r in extra_records(p, extras or {}):
        w.writerow([f"# {r['classification']} {r['variable']}", "" if r["value"] is None else r["value"], r["unit"],
                    r.get("note") or ""])
    return buf.getvalue().encode()


def extra_records(p: dict, extras: dict) -> list[dict]:
    """Single-value investigation results beyond the profile table, each with its classification."""
    out = []
    st = extras.get("stratification")
    if st:
        th = st["reconstructed"]["thermocline"]
        out.append({"variable": "thermocline_depth", "value": th["depth_m"], "unit": "m", "classification": "derived",
                    "source": "gradient of the reconstructed profile", "quality": th["quality"],
                    "note": f"layer {th['depth_range_m'][0]:g}-{th['depth_range_m'][1]:g} m" if th["depth_range_m"] else th["quality_reasons"][0] if th["quality_reasons"] else None})
        out.append({"variable": "thermocline_max_gradient", "value": th["strength_per_m"], "unit": "degC/m", "classification": "derived",
                    "source": "gradient of the reconstructed profile", "quality": th["quality"], "note": "-dT/dz"})
        ob = st.get("observed")
        if ob:
            src = f"Argo {ob['argo']['platform_number']} ({ob['argo']['distance_km']} km, {ob['argo']['profile_date'][:10]})"
            if ob.get("thermocline"):
                out.append({"variable": "observed_thermocline_depth", "value": ob["thermocline"]["depth_m"], "unit": "m",
                            "classification": "derived", "source": src, "quality": ob["thermocline"]["quality"], "note": "from measured temperature"})
            if ob.get("halocline"):
                out.append({"variable": "halocline_depth", "value": ob["halocline"]["depth_m"], "unit": "m", "classification": "derived",
                            "source": src, "quality": ob["halocline"]["quality"], "note": "from measured salinity"})
            ml = ob.get("mixed_layers") or {}
            for k, name in (("mld_density_m", "mixed_layer_depth_density"), ("barrier_layer_thickness_m", "barrier_layer_thickness")):
                if ml.get(k) is not None:
                    out.append({"variable": name, "value": ml[k], "unit": "m", "classification": "derived", "source": src,
                                "note": "TEOS-10, de Boyer Montegut (2004) thresholds"})
            sal = [x for x in (ob.get("salinity_psu") or []) if x is not None]
            if sal:
                out.append({"variable": "argo_salinity_shallowest", "value": sal[0], "unit": "PSU", "classification": "measured",
                            "source": src, "note": f"{ob['bin_m']:g} m bin average"})
    for k, (name, unit) in {"sss": ("sea_surface_salinity", "PSU"), "sla": ("sea_level_anomaly", "cm"),
                            "wind_speed": ("wind_speed_10m", "m/s")}.items():
        v = (extras.get("surface") or {}).get(k)
        if v is not None:
            out.append({"variable": name, "value": v, "unit": unit, "classification": "satellite", "source": "satellite model input"})
    return out


def investigation_json(p: dict, extras: dict) -> dict:
    """Machine-readable investigation: one record per value, each with classification and source."""
    model = p["model_version"]
    recs = []
    unc = p.get("uncertainty_c") or [None] * len(p["depths_m"])
    argo = p.get("nearest_argo_float")
    for k, z in enumerate(p["depths_m"]):
        t, c = p["temperature_c"][k], p["baseline_climatology_c"][k]
        recs.append({"variable": "temperature", "value": t, "unit": "degC", "depth_m": z, "date": p["date"],
                     "classification": "reconstructed", "source": "OceanSight U-Net", "model_version": model,
                     "uncertainty": unc[k], "uncertainty_meaning": "calibrated 1 standard deviation"})
        recs.append({"variable": "climatology", "value": c, "unit": "degC", "depth_m": z, "date": p["date"],
                     "classification": "baseline", "source": "harmonic seasonal climatology"})
        if t is not None and c is not None:
            recs.append({"variable": "temperature_anomaly", "value": round(t - c, 2), "unit": "degC", "depth_m": z, "date": p["date"],
                         "classification": "derived", "source": "reconstruction minus climatology", "model_version": model})
        if argo and argo["temperature_c_std_depths"][k] is not None:
            recs.append({"variable": "temperature", "value": argo["temperature_c_std_depths"][k], "unit": "degC", "depth_m": z,
                         "date": argo["profile_date"][:10], "classification": "measured",
                         "source": f"Argo {argo['platform_number']} cycle {argo['cycle_number']}", "distance_km": argo["distance_km"]})
    for key, unit in (("mld_m", "m"), ("d20_m", "m"), ("d26_m", "m"), ("tchp_kj_cm2", "kJ/cm2")):
        recs.append({"variable": key.rsplit("_", 1)[0] if key != "tchp_kj_cm2" else "tchp", "value": p["derived"].get(key),
                     "unit": unit, "date": p["date"], "classification": "derived", "source": "computed from the reconstructed column",
                     "model_version": model})
    for r in extra_records(p, extras):
        recs.append({**r, "date": p["date"]})
    return {"product": "OceanSight", "kind": "investigation",
            "investigation_point": {"lat": p["lat"], "lon": p["lon"], "grid_cell": p["cell"], "date": p["date"],
                                    "requested_date": p["requested_date"], "map_depth_m": extras.get("depth")},
            "model_version": model, "data_label": p["data_label"], "nearest_observation": argo and {
                k: argo[k] for k in ("platform_number", "cycle_number", "profile_date", "lat", "lon", "distance_km", "independent")},
            "data_quality": extras.get("quality"), "records": recs,
            "classifications": {k: v for k, v in LABEL.items() if k != "forecast"},
            "provenance": "GET /v1/provenance lists the source, processing and lineage of every variable.",
            "generated_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}


def _ramp(t: float) -> colors.Color:
    t = min(1.0, max(0.0, t)) * (len(THERMAL) - 1)
    k = min(len(THERMAL) - 2, int(t))
    a, b = colors.HexColor(THERMAL[k]), colors.HexColor(THERMAL[k + 1])
    f = t - k
    return colors.Color(a.red + f * (b.red - a.red), a.green + f * (b.green - a.green), a.blue + f * (b.blue - a.blue))


def map_inset(field: np.ndarray, lats: np.ndarray, lons: np.ndarray, lat: float, lon: float, depth: float, half: float = 6.0) -> Drawing:
    """Reconstructed field at `depth` in a ±`half` degree box around the point, north up, point marked."""
    ii = np.where((lats >= lat - half) & (lats <= lat + half))[0]
    jj = np.where((lons >= lon - half) & (lons <= lon + half))[0]
    sub = field[np.ix_(ii, jj)]
    W, H = 78 * mm, 78 * mm
    d = Drawing(W + 26 * mm, H + 14 * mm)
    ox, oy = 2 * mm, 10 * mm
    cw, ch = W / max(1, jj.size), H / max(1, ii.size)
    finite = sub[np.isfinite(sub)]
    vmin, vmax = (float(np.floor(finite.min())), float(np.ceil(finite.max()))) if finite.size else (0.0, 1.0)
    d.add(Rect(ox, oy, W, H, fillColor=colors.HexColor("#1b2530"), strokeColor=None))  # land / no data
    for r, i in enumerate(ii):
        for c, j in enumerate(jj):
            v = sub[r, c]
            if np.isfinite(v):
                d.add(Rect(ox + c * cw, oy + r * ch, cw + 0.15, ch + 0.15, strokeColor=None,
                           fillColor=_ramp((v - vmin) / (vmax - vmin or 1))))
    px = ox + (lon - lons[jj[0]] + 0.125) / 0.25 * cw
    py = oy + (lat - lats[ii[0]] + 0.125) / 0.25 * ch
    d.add(Circle(px, py, 2.2 * mm, fillColor=None, strokeColor=colors.white, strokeWidth=1.4))
    d.add(Circle(px, py, 0.6 * mm, fillColor=colors.white, strokeColor=None))
    for k in range(40):  # colour bar
        d.add(Rect(W + 8 * mm, oy + k * H / 40, 5 * mm, H / 40 + 0.2, strokeColor=None, fillColor=_ramp(k / 39)))
    d.add(String(W + 14 * mm, oy + H - 2 * mm, f"{vmax:.0f} °C", fontSize=6.5, fillColor=INK))
    d.add(String(W + 14 * mm, oy, f"{vmin:.0f} °C", fontSize=6.5, fillColor=INK))
    d.add(String(ox, 5 * mm, f"{lons[jj[0]]:.1f}°E", fontSize=6.5, fillColor=GREY))
    d.add(String(ox + W - 12 * mm, 5 * mm, f"{lons[jj[-1]]:.1f}°E", fontSize=6.5, fillColor=GREY))
    d.add(String(ox, 1.5 * mm, f"Reconstructed temperature at {depth:.0f} m · {lats[ii[0]]:.1f}–{lats[ii[-1]]:.1f}°N · "
                 "white ring = report location", fontSize=6.5, fillColor=GREY))
    d.add(Line(ox, oy, ox + W, oy, strokeColor=GREY, strokeWidth=0.4))
    return d


def _chart(p: dict) -> Drawing:
    d = Drawing(170 * mm, 92 * mm)
    lp = LinePlot()
    lp.x, lp.y, lp.width, lp.height = 18 * mm, 12 * mm, 140 * mm, 72 * mm
    depths = p["depths_m"]
    series, cols = [], []
    unc = p.get("uncertainty_c") or [None] * len(depths)
    for vals, col in ((p["temperature_c"], CYAN), (p["baseline_climatology_c"], GREY)):
        pts = [(t, -z) for t, z in zip(vals, depths) if t is not None]
        if pts:
            series.append(pts); cols.append(col)
    for sign in (-1, 1):  # ±σ envelope as thin lines
        pts = [(t + sign * s, -z) for t, s, z in zip(p["temperature_c"], unc, depths) if t is not None and s is not None]
        if pts:
            series.append(pts); cols.append("sigma")
    argo = p.get("nearest_argo_float")
    if argo:
        pts = [(t, -z) for t, z in zip(argo["temperature_c_std_depths"], depths) if t is not None]
        if pts:
            series.append(pts); cols.append(GREEN)
    lp.data = series
    for k, c in enumerate(cols):
        if c == "sigma":
            lp.lines[k].strokeColor = colors.HexColor("#9fd3dd")
            lp.lines[k].strokeWidth = 0.6
            lp.lines[k].strokeDashArray = [2, 2]
            continue
        lp.lines[k].strokeColor = c
        lp.lines[k].strokeWidth = 1.6
        if c is GREEN:
            lp.lines[k].strokeColor = None  # markers only: measured points, not a line
            lp.lines[k].symbol = makeMarker("FilledCircle", size=4, fillColor=GREEN)
    lp.yValueAxis.valueMin, lp.yValueAxis.valueMax = -1000, 0
    lp.yValueAxis.valueSteps = [-1000, -700, -500, -300, -200, -100, 0]
    lp.yValueAxis.labelTextFormat = lambda v: f"{int(-v)}"
    lp.xValueAxis.labelTextFormat = "%d"
    d.add(lp)
    d.add(String(2 * mm, 48 * mm, "depth (m)", fontSize=7, fillColor=GREY))
    d.add(String(80 * mm, 3 * mm, "temperature (°C)", fontSize=7, fillColor=GREY))
    legend = [("OceanSight reconstruction (reconstructed)", CYAN), ("±1 sd uncertainty (estimated)", colors.HexColor("#6fb4c2")),
              ("seasonal climatology (baseline)", GREY)] + ([("Argo float (measured)", GREEN)] if argo else [])
    for k, (name, c) in enumerate(legend):
        d.add(String(100 * mm, (30 - 4.5 * k) * mm, "— " + name, fontSize=7, fillColor=c))
    return d


def _kv_table(rows: list[list[str]], widths) -> Table:
    t = Table(rows, colWidths=widths)
    t.setStyle(TableStyle([("FONT", (0, 0), (0, -1), "Helvetica-Bold", 8), ("TEXTCOLOR", (0, 0), (0, -1), GREY),
                           ("FONT", (1, 0), (-1, -1), "Helvetica", 8.5), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                           ("LINEBELOW", (0, 0), (-1, -2), 0.25, colors.HexColor("#d5dbe3")),
                           ("TOPPADDING", (0, 0), (-1, -1), 2.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5)]))
    return t


def profile_pdf(p: dict, summary: str, validation_line: str, *, inset: Drawing | None = None, depth: float | None = None,
                period: str | None = None, extras: dict | None = None) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=14 * mm,
                            bottomMargin=14 * mm, title=f"OceanSight water-column report {p['date']}", author="OceanSight")
    ss = getSampleStyleSheet()
    small = ParagraphStyle("small", parent=ss["Normal"], fontSize=7.5, textColor=GREY, leading=9.5)
    body = ParagraphStyle("body", parent=ss["Normal"], fontSize=9, leading=12, textColor=INK)
    h2 = ParagraphStyle("h2", parent=ss["Heading3"], fontSize=10.5, spaceBefore=6, spaceAfter=3, textColor=INK)
    argo = p.get("nearest_argo_float")
    if argo:
        off = "same day" if argo["date_offset_days"] == 0 else "%+d d" % argo["date_offset_days"]
        indep = "held-out year (independent)" if argo["independent"] else "training-year float"
        obs = f"Argo {argo['platform_number']} (measured) · {argo['distance_km']} km away · {off} · {indep}"
    else:
        obs = "No Argo float within 100 km and ±3 days"
    meta_rows = [
        ["Location", f"{p['lat']:.2f}°N, {p['lon']:.2f}°E  (grid cell {p['cell']['lat']:.3f}°N, {p['cell']['lon']:.3f}°E)"],
        ["Date", p["date"] + ("" if p["date"] == p["requested_date"] else f"  (requested {p['requested_date']}; nearest available)")],
        ["Map depth", "—" if depth is None else f"{depth:.0f} m"],
        ["Variables", "temperature (reconstructed) · ±1 sd uncertainty (estimated) · climatology (baseline) · MLD, D20, D26, TCHP (derived)"],
        ["Observations", obs],
        ["Model", f"{p['model_version']} (U-Net reconstruction)" + (f" · data {period}" if period else "")],
    ]
    story = [
        Paragraph("<b>OceanSight</b> <font color='#8a96a8' size='9'>· Subsurface Ocean Intelligence</font>", ss["Title"]),
        Paragraph("Water-column report", h2),
        _kv_table(meta_rows, [28 * mm, 146 * mm]),
        Spacer(1, 3 * mm),
        Paragraph(summary, body),
    ]
    if inset is not None:
        story += [Paragraph("Location on the reconstructed field", h2), inset]
    story += [KeepTogether([Paragraph("Temperature profile", h2), _chart(p)])]
    d = p["derived"]
    f = lambda v, u: "—" if v is None else f"{v:.1f} {u}"
    chips = [["TCHP", "MLD", "D26", "D20"],
             [f(d.get("tchp_kj_cm2"), "kJ/cm²"), f(d.get("mld_m"), "m"), f(d.get("d26_m"), "m"), f(d.get("d20_m"), "m")]]
    t = Table(chips, colWidths=[40 * mm] * 4)
    t.setStyle(TableStyle([("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 8), ("TEXTCOLOR", (0, 0), (-1, 0), GREY),
                           ("FONT", (0, 1), (-1, 1), "Helvetica", 11), ("BOX", (0, 0), (-1, -1), 0.5, GREY),
                           ("INNERGRID", (0, 0), (-1, -1), 0.25, GREY)]))
    story += [Paragraph("Derived structure <font color='#8a96a8' size='8'>· derived from the reconstructed column</font>", h2), t]
    rows = [["depth (m)", "T (°C) · reconstructed", "±1 sd (°C) · estimated", "climatology (°C)"] + (["Argo (°C) · measured"] if argo else [])]
    unc = p["uncertainty_c"] or [None] * len(p["depths_m"])
    for k, (z, tv, s, c) in enumerate(zip(p["depths_m"], p["temperature_c"], unc, p["baseline_climatology_c"])):
        row = [f"{z:.0f}", "—" if tv is None else f"{tv:.2f}", "—" if s is None else f"{s:.2f}", "—" if c is None else f"{c:.2f}"]
        if argo:
            a = argo["temperature_c_std_depths"][k]
            row.append("—" if a is None else f"{a:.2f}")
        rows.append(row)
    ncol = len(rows[0])
    tt = Table(rows, colWidths=[174 * mm / ncol] * ncol)
    tt.setStyle(TableStyle([("FONT", (0, 0), (-1, -1), "Helvetica", 7.5), ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 7),
                            ("ALIGN", (1, 0), (-1, -1), "RIGHT"), ("LINEBELOW", (0, 0), (-1, 0), 0.5, GREY)]))
    rows_x = extra_records(p, extras or {})
    if rows_x:
        xt = [["Quantity", "Value", "Type", "Source / quality"]]
        for r in rows_x:
            v = "—" if r["value"] is None else f"{r['value']:g} {r['unit']}"
            src = r["source"] + (f" · {r['quality']}" if r.get("quality") else "") + (f" · {r['note']}" if r.get("note") else "")
            xt.append([r["variable"].replace("_", " "), v, LABEL[r["classification"]], Paragraph(src, small)])
        xtab = Table(xt, colWidths=[44 * mm, 26 * mm, 24 * mm, 80 * mm])
        xtab.setStyle(TableStyle([("FONT", (0, 0), (-1, -1), "Helvetica", 7.5), ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 7),
                                  ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LINEBELOW", (0, 0), (-1, 0), 0.5, GREY)]))
        story += [Paragraph("Stratification, salinity and surface conditions", h2), xtab]
    q = (extras or {}).get("quality")
    if q:
        story += [Paragraph("Data quality: " + " · ".join(f"{d['name']} — {d['status'] or 'n/a'}" for d in q), small)]
    story += [Paragraph("Values at the standard depths", h2), tt,
              Paragraph("Method, provenance and validation", h2), Paragraph(METHOD, small), Spacer(1, 1.5 * mm),
              Paragraph(PROVENANCE, small), Spacer(1, 1.5 * mm), Paragraph(validation_line, small),
              Paragraph(CAVEAT, small), Spacer(1, 1.5 * mm),
              Paragraph(f"Generated {datetime.now(timezone.utc):%Y-%m-%d %H:%M} UTC by OceanSight · data label: {p['data_label']}", small)]
    doc.build(story)
    return buf.getvalue()
