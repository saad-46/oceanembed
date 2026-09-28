"""Build the OceanBed SIH 2026 idea-submission deck by editing the official template.

    python scripts/build_sih_deck.py --template <SIH2026-IDEA-Presentation-Format.pptx> \n        --shots deliverables/assets --out deliverables/OceanBed_SIH2026_Idea_Submission.pptx

Screenshots come from the running prototype (headless Chrome, 1600x900 @2x):
/map?date=2023-05-11&depth=100 and /analysis?mode=cyclone. Export the PDF from PowerPoint.

Keeps the template's slides, SIH logo, title placeholders, team oval, blue footer and page
numbers; replaces only the content text boxes; deletes the "IMPORTANT INSTRUCTIONS" slide.
Every number comes from docs/RESULTS.md (computed by the prototype pipeline).
"""
from __future__ import annotations

import argparse
import copy
from pathlib import Path

from PIL import Image
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.oxml.ns import qn
from pptx.util import Inches, Pt

NAVY = RGBColor(0x0B, 0x2F, 0x4E)
BLUE = RGBColor(0x00, 0x70, 0xC0)      # SIH footer blue
TEAL = RGBColor(0x0E, 0x86, 0x9A)
TEAL_LIGHT = RGBColor(0xE3, 0xF3, 0xF6)
PANEL = RGBColor(0xF2, 0xF6, 0xF9)
LINE = RGBColor(0xC9, 0xD6, 0xE2)
TEXT = RGBColor(0x1B, 0x23, 0x30)
MUTED = RGBColor(0x55, 0x65, 0x78)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
GREEN = RGBColor(0x1B, 0x8A, 0x4B)
AMBER = RGBColor(0xB3, 0x6B, 0x00)
FONT = "Arial"


# ---------------------------------------------------------------- helpers
def box(slide, x, y, w, h, fill=None, line=None, shape=MSO_SHAPE.RECTANGLE, radius=None, line_w=0.75):
    s = slide.shapes.add_shape(shape, Inches(x), Inches(y), Inches(w), Inches(h))
    if fill is None:
        s.fill.background()
    else:
        s.fill.solid()
        s.fill.fore_color.rgb = fill
    if line is None:
        s.line.fill.background()
    else:
        s.line.color.rgb = line
        s.line.width = Pt(line_w)
    if radius is not None and shape == MSO_SHAPE.ROUNDED_RECTANGLE:
        s.adjustments[0] = radius
    s.shadow.inherit = False
    if s.has_text_frame:
        s.text_frame.text = ""
    return s


def text(slide, x, y, w, h, paras, anchor=MSO_ANCHOR.TOP, margin=0.04):
    """paras: list of paragraphs; each paragraph = dict(runs=[(text, {fmt})], align, space_after, bullet)."""
    tb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    for side in ("left", "right", "top", "bottom"):
        setattr(tf, f"margin_{side}", Inches(margin))
    fill_paras(tf, paras)
    return tb


def set_font(run, name=FONT):
    """Set latin + east-asian + complex-script typefaces so symbols like ° and σ don't fall back."""
    run.font.name = name
    rPr = run._r.get_or_add_rPr()
    for tag in ("a:ea", "a:cs"):
        el = rPr.find(qn(tag))
        if el is None:
            el = rPr.makeelement(qn(tag), {})
            rPr.append(el)
        el.set("typeface", name)


def fill_paras(tf, paras):
    for i, p in enumerate(paras):
        para = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        para.alignment = p.get("align", PP_ALIGN.LEFT)
        if "space_after" in p:
            para.space_after = Pt(p["space_after"])
        if "space_before" in p:
            para.space_before = Pt(p["space_before"])
        para.line_spacing = p.get("line_spacing", 1.0)
        for t, f in p["runs"]:
            r = para.add_run()
            r.text = t
            set_font(r, f.get("font", FONT))
            r.font.size = Pt(f.get("size", 12))
            r.font.bold = f.get("bold", False)
            r.font.italic = f.get("italic", False)
            r.font.color.rgb = f.get("color", TEXT)


def P(*runs, align=PP_ALIGN.LEFT, **kw):
    return {"runs": list(runs), "align": align, **kw}


def R(t, size=12, bold=False, color=TEXT, italic=False, font=FONT):
    return (t, {"size": size, "bold": bold, "color": color, "italic": italic, "font": font})


def section_label(slide, x, y, w, label, sub=None):
    """Template pointer as a section heading: teal bar + navy caps text."""
    box(slide, x, y + 0.03, 0.07, 0.24, fill=TEAL)
    runs = [R(label, 12.5, True, NAVY)]
    if sub:
        runs.append(R("   " + sub, 10.5, False, MUTED))
    text(slide, x + 0.12, y - 0.02, w - 0.12, 0.34, [P(*runs)], anchor=MSO_ANCHOR.MIDDLE, margin=0.01)


def arrow(slide, x, y, w=0.16, h=0.22, color=TEAL):
    a = slide.shapes.add_shape(MSO_SHAPE.RIGHT_ARROW, Inches(x), Inches(y), Inches(w), Inches(h))
    a.fill.solid()
    a.fill.fore_color.rgb = color
    a.line.fill.background()
    a.shadow.inherit = False
    return a


def down_arrow(slide, x, y, w=0.22, h=0.16, color=TEAL):
    a = slide.shapes.add_shape(MSO_SHAPE.DOWN_ARROW, Inches(x), Inches(y), Inches(w), Inches(h))
    a.fill.solid()
    a.fill.fore_color.rgb = color
    a.line.fill.background()
    a.shadow.inherit = False
    return a


def picture(slide, path, x, y, w=None, h=None, crop=None):
    """crop = (left, top, right, bottom) fractions of the source image."""
    img = Image.open(path)
    if crop:
        W, H = img.size
        img = img.crop((int(crop[0] * W), int(crop[1] * H), int(crop[2] * W), int(crop[3] * H)))
        path = Path(path).with_name(Path(path).stem + f"_crop_{abs(hash(crop)) % 10**6}.png")
        img.save(path)
    ar = img.size[0] / img.size[1]
    if w is not None and h is None:
        h = w / ar
    elif h is not None and w is None:
        w = h * ar
    pic = slide.shapes.add_picture(str(path), Inches(x), Inches(y), Inches(w), Inches(h))
    pic.line.color.rgb = LINE
    pic.line.width = Pt(0.75)
    return pic, w, h


def remove_shape(shape):
    el = shape._element
    el.getparent().remove(el)


def delete_slide(prs, index):
    sldIdLst = prs.slides._sldIdLst
    sld = sldIdLst[index]
    prs.part.drop_rel(sld.rId)
    sldIdLst.remove(sld)


def set_title(slide, lines):
    """Replace the title placeholder text, keeping its font family (Times New Roman) and position."""
    ph = slide.shapes.title
    tf = ph.text_frame
    first = tf.paragraphs[0]
    font_name = next((r.font.name for r in first.runs if r.font.name), "Times New Roman")
    for p in list(tf.paragraphs)[1:]:
        p._p.getparent().remove(p._p)
    for r in list(first.runs):
        r._r.getparent().remove(r._r)
    for i, (t, size, color, bold) in enumerate(lines):
        para = first if i == 0 else tf.add_paragraph()
        para.alignment = PP_ALIGN.CENTER
        r = para.add_run()
        r.text = t
        r.font.size = Pt(size)
        r.font.bold = bold
        r.font.color.rgb = color
        set_font(r, font_name if i == 0 else FONT)


def clear_content_boxes(slide):
    for sh in list(slide.shapes):
        if sh.shape_type == 17 and sh.has_text_frame:  # TEXT_BOX with template pointer text
            remove_shape(sh)


# ---------------------------------------------------------------- slides
def slide1(s):
    # Subtitle placeholder "TITLE PAGE" -> project name, placed left so it doesn't cover the SIH graphic
    sub = next(sh for sh in s.shapes if sh.is_placeholder and "TITLE PAGE" in sh.text_frame.text)
    sub.left, sub.top, sub.width, sub.height = Inches(0.36), Inches(1.1), Inches(7.1), Inches(1.2)
    tf = sub.text_frame
    tf.clear()
    tf.vertical_anchor = MSO_ANCHOR.TOP
    fill_paras(tf, [
        P(R("OceanBed", 48, True, NAVY, font="Arial")),
        P(R("Seeing 1000 m beneath the ocean surface — from satellites alone", 14.5, False, TEAL)),
    ])
    for p in tf.paragraphs:
        p.alignment = PP_ALIGN.LEFT
    # Fields text box (keeps its position and bullets style)
    tb = next(sh for sh in s.shapes if sh.shape_type == 17 and "Problem Statement ID" in sh.text_frame.text)
    tb.left, tb.top, tb.width, tb.height = Inches(0.36), Inches(2.5), Inches(6.5), Inches(4.85)
    tf = tb.text_frame
    tf.word_wrap = True
    paras = [p for p in tf.paragraphs if p.text.strip()]
    values = [
        ("Problem Statement ID – ", "SIH26066"),
        ("Problem Statement Title – ", "OceanEmbed – Satellite Embedding-Based Deep Learning Framework for "
                                       "Reconstruction of Subsurface Ocean Temperature from Surface Satellite Observations"),
        ("Theme – ", "Space Technology"),
        ("PS Category – ", "Software"),
        ("Team ID – ", "[fill in]"),
        ("Team Name (Registered on portal) – ", "[fill in]"),
    ]
    for para, (label, value) in zip(paras, values):
        for r in list(para.runs):
            r._r.getparent().remove(r._r)
        para.space_after = Pt(17)
        para.space_before = Pt(0)
        para.line_spacing = 1.0
        para.alignment = PP_ALIGN.LEFT
        r1 = para.add_run(); r1.text = label
        r1.font.size = Pt(18); r1.font.bold = True; r1.font.color.rgb = TEXT; set_font(r1)
        r2 = para.add_run(); r2.text = value
        small = len(value) > 40
        r2.font.size = Pt(15 if small else 18); r2.font.bold = not small
        r2.font.color.rgb = (AMBER if value.startswith("[") else NAVY); set_font(r2)
    # drop empty paragraphs (template has blank lines)
    for p in list(tf.paragraphs):
        if not p.text.strip():
            p._p.getparent().remove(p._p)


def slide2(s, shots):
    clear_content_boxes(s)
    set_title(s, [("OceanBed", 32, NAVY, True),
                  ("Daily 0–1000 m ocean temperature for the North Indian Ocean — from satellites alone", 13, TEAL, False)])
    L, W = 0.35, 8.55
    # A. Proposed solution
    section_label(s, L, 1.30, W, "Proposed Solution", "Detailed explanation of the proposed solution")
    text(s, L, 1.62, W, 0.78, [P(
        R("OceanBed ", 12.5, True, NAVY),
        R("reconstructs ocean temperature at ", 12.5),
        R("15 depths (0–1000 m), every day, on a 0.25° grid", 12.5, True),
        R(" over the Bay of Bengal & Arabian Sea — using only ", 12.5),
        R("5 satellite surface fields", 12.5, True),
        R(" — and turns it into cyclone-heat and mixed-layer products for ocean analysts and forecasters.", 12.5),
        line_spacing=1.05)])
    # B. How it addresses the problem
    section_label(s, L, 2.46, W, "How it addresses the problem")
    pb = box(s, L, 2.8, 3.05, 0.68, fill=PANEL, line=LINE, shape=MSO_SHAPE.ROUNDED_RECTANGLE, radius=0.12)
    text(s, L + 0.08, 2.8, 2.92, 0.68, [
        P(R("THE GAP", 9, True, AMBER)),
        P(R("Floats, buoys & ships sample the subsurface only at scattered points and times", 9))],
        anchor=MSO_ANCHOR.MIDDLE)
    arrow(s, L + 3.12, 3.02, 0.22, 0.22)
    text(s, L + 3.42, 2.8, W - 3.42, 0.68, [
        P(R("OCEANBED", 9, True, TEAL)),
        P(R("Satellites see the whole basin daily; a deep network learns the physical surface → subsurface link "
            "(e.g. sea-level anomaly → thermocline depth)", 9.5))], anchor=MSO_ANCHOR.MIDDLE)
    stages = [
        ("Satellite inputs", "SST · SSS · SLA ·\ncurrents · winds"),
        ("Harmonise", "QC + regrid to\n0.25°, daily"),
        ("Satellite embedding", "U-Net encoder\ncompresses the basin"),
        ("Reconstruct", "15 depths, 0–1000 m\n+ uncertainty"),
        ("Derive", "TCHP · MLD ·\nD20 · D26"),
        ("Deliver", "GIS dashboard ·\nAPI · reports"),
    ]
    n, gap = len(stages), 0.2
    bw = (W - gap * (n - 1)) / n
    y0 = 3.55
    for i, (t, sub) in enumerate(stages):
        x = L + i * (bw + gap)
        head = box(s, x, y0, bw, 0.34, fill=NAVY if i != 2 else TEAL, shape=MSO_SHAPE.RECTANGLE)
        text(s, x, y0, bw, 0.34, [P(R(t, 9, True, WHITE), align=PP_ALIGN.CENTER)], anchor=MSO_ANCHOR.MIDDLE, margin=0.01)
        box(s, x, y0 + 0.34, bw, 0.56, fill=PANEL, line=LINE)
        text(s, x, y0 + 0.34, bw, 0.56, [P(R(sub, 9, False, TEXT), align=PP_ALIGN.CENTER)], anchor=MSO_ANCHOR.MIDDLE)
        if i < n - 1:
            arrow(s, x + bw + 0.03, y0 + 0.51, gap - 0.06, 0.2)
    # Right: prototype screenshot
    px, pw = 9.12, 3.88
    _, _, ph = picture(s, shots / "map.png", px, 1.48, w=pw, crop=(0.0, 0.20, 0.72, 0.845))
    text(s, px, 1.48 + ph + 0.03, pw, 0.5, [P(
        R("Working prototype: ", 8.5, True, NAVY),
        R("reconstructed temperature at 100 m on 11 May 2023 (held-out year) — dark purple ≈ 17 °C to yellow ≈ 28 °C; "
          "green dots = Argo floats; white line = Cyclone Mocha track (IBTrACS)", 8.5, False, MUTED))])
    # C. Innovation & uniqueness band
    top = 4.62
    box(s, 0.3, top, 12.73, 2.26, fill=TEAL_LIGHT, shape=MSO_SHAPE.ROUNDED_RECTANGLE, radius=0.05)
    text(s, 0.5, top + 0.06, 12.3, 0.34, [P(
        R("INNOVATION AND UNIQUENESS OF THE SOLUTION", 12.5, True, NAVY),
        R("   —   why OceanBed is different", 11, False, TEAL))], anchor=MSO_ANCHOR.MIDDLE)
    cards = [
        ("01", "Validated beyond training data",
         "Scored against real Argo floats from a year it never saw — next to the training product's own error ceiling "
         "and an independent EN4 cross-check.",
         "2,639", "held-out Argo profiles (2023)"),
        ("02", "Calibrated to the real ocean",
         "Every profile carries an error bar calibrated on 2022 floats that holds on 2023 — analysts can see when not to trust a value.",
         "70%", "of Argo values within ±1σ (ideal 68%)"),
        ("03", "Reconstruction → decisions",
         "Daily cyclone heat potential, mixed-layer and isotherm depths at 0.25°, replayed on real IBTrACS cyclone tracks.",
         "TCHP · MLD", "D20 · D26 — every day, 2019–2023"),
    ]
    cw, cg, cy, ch = 3.99, 0.18, top + 0.46, 1.38
    for i, (num, title, body, metric, mlabel) in enumerate(cards):
        x = 0.5 + i * (cw + cg)
        box(s, x, cy, cw, ch, fill=WHITE, line=LINE, shape=MSO_SHAPE.ROUNDED_RECTANGLE, radius=0.06)
        box(s, x, cy + 0.1, 0.07, ch - 0.2, fill=TEAL)
        text(s, x + 0.15, cy + 0.06, cw - 0.25, 0.38, [P(R(f"USP {num}  ", 10, True, TEAL), R(title, 12, True, NAVY))],
             anchor=MSO_ANCHOR.MIDDLE)
        text(s, x + 0.15, cy + 0.44, cw - 0.25, 0.58, [P(R(body, 9.5, False, TEXT), line_spacing=1.02)])
        text(s, x + 0.15, cy + 1.0, cw - 0.25, 0.34, [P(R(metric + "  ", 15, True, TEAL), R(mlabel, 9, False, MUTED))],
             anchor=MSO_ANCHOR.MIDDLE)
    text(s, 0.5, top + 1.88, 12.3, 0.34, [P(
        R("Satellite surface fields  →  validated, uncertainty-aware 3-D ocean temperature  →  INCOIS decision products", 11, True, NAVY, italic=True),
        align=PP_ALIGN.CENTER)], anchor=MSO_ANCHOR.MIDDLE)


def slide3(s):
    clear_content_boxes(s)
    # Left: technologies
    LX, LW = 0.35, 4.3
    section_label(s, LX, 1.30, LW, "Technologies to be used")
    rows = [
        ("Satellite data", "NOAA OISST (SST) · SMAP + SMOS (SSS) · NOAA altimetry (SLA, currents) · NCEI Seawinds"),
        ("Target & validation", "HYCOM 1/12° analysis (GLORYS adapter built) · Argo via argopy · Met Office EN4"),
        ("ML / AI", "PyTorch U-Net (satellite embedding) · LightGBM baseline"),
        ("Data engineering", "Python · xarray · Zarr (daily cubes) · NumPy regridding"),
        ("Geospatial / DB", "PostgreSQL + PostGIS (spatial indexes, nearest-float queries)"),
        ("Backend", "FastAPI — typed REST API, PDF/CSV reports"),
        ("Frontend / GIS", "Next.js · MapLibre GL · deck.gl · Recharts"),
        ("Engineering", "Docker · GitHub Actions CI · 44 automated tests · CPU-only"),
    ]
    y = 1.68
    rh = 0.6
    for cat, tools in rows:
        box(s, LX, y, 1.35, rh - 0.08, fill=NAVY, shape=MSO_SHAPE.ROUNDED_RECTANGLE, radius=0.12)
        text(s, LX, y, 1.35, rh - 0.08, [P(R(cat, 9, True, WHITE), align=PP_ALIGN.CENTER)], anchor=MSO_ANCHOR.MIDDLE)
        text(s, LX + 1.43, y, LW - 1.43, rh - 0.08, [P(R(tools, 9.3, False, TEXT))], anchor=MSO_ANCHOR.MIDDLE)
        y += rh
    # Right: methodology
    RX, RW = 4.95, 8.05
    section_label(s, RX, 1.30, RW, "Methodology and process for implementation")
    stages = [
        ("Satellite data", "5 fields · 1,826 days\n(2019–2023)"),
        ("Harmonise", "QC · gap-fill ·\nregrid to 0.25°"),
        ("Features", "7 channels + lat/lon\n+ season"),
        ("U-Net model", "embedding → 15 depths\n+ uncertainty (σ)"),
        ("Validate", "held-out Argo · EN4\n· σ calibration"),
        ("Serve", "Zarr + PostGIS +\nFastAPI → GIS app"),
    ]
    n, gap = len(stages), 0.18
    bw = (RW - gap * (n - 1)) / n
    y0 = 1.72
    for i, (t, sub) in enumerate(stages):
        x = RX + i * (bw + gap)
        box(s, x, y0, bw, 0.34, fill=TEAL if i == 3 else NAVY)
        text(s, x, y0, bw, 0.34, [P(R(t, 9.5, True, WHITE), align=PP_ALIGN.CENTER)], anchor=MSO_ANCHOR.MIDDLE)
        box(s, x, y0 + 0.34, bw, 0.62, fill=PANEL, line=LINE)
        text(s, x, y0 + 0.34, bw, 0.62, [P(R(sub, 8.8), align=PP_ALIGN.CENTER)], anchor=MSO_ANCHOR.MIDDLE)
        if i < n - 1:
            arrow(s, x + bw + 0.02, y0 + 0.55, gap - 0.04, 0.2)
    # Year split timeline
    ty = 2.98
    text(s, RX, ty, RW, 0.3, [P(R("Honest evaluation — split by whole years, never random days", 10.5, True, NAVY))])
    segs = [("2019", NAVY), ("2020", NAVY), ("2021", NAVY), ("2022", TEAL), ("2023", AMBER)]
    sw = (RW - 0.1 * 4) / 5
    for i, (yr, col) in enumerate(segs):
        x = RX + i * (sw + 0.1)
        box(s, x, ty + 0.34, sw, 0.36, fill=col)
        text(s, x, ty + 0.34, sw, 0.36, [P(R(yr, 10.5, True, WHITE), align=PP_ALIGN.CENTER)], anchor=MSO_ANCHOR.MIDDLE)
    text(s, RX, ty + 0.72, 3 * sw + 0.2, 0.28, [P(R("TRAIN — model fitting, normalisation, climatology", 9, True, NAVY), align=PP_ALIGN.CENTER)])
    text(s, RX + 3 * (sw + 0.1), ty + 0.72, sw, 0.28, [P(R("VALIDATE — early stop", 9, True, TEAL), align=PP_ALIGN.CENTER)])
    text(s, RX + 4 * (sw + 0.1), ty + 0.72, sw, 0.28, [P(R("TEST — fully held out", 9, True, AMBER), align=PP_ALIGN.CENTER)])
    # Model ladder
    my = 4.12
    text(s, RX, my, RW, 0.3, [P(R("Models, compared side by side — the deep model has to earn its place", 10.5, True, NAVY))])
    models = [
        ("Seasonal climatology", "harmonic fit per cell & depth — the floor to beat"),
        ("LightGBM", "one model per depth — fast, interpretable baseline"),
        ("U-Net encoder–decoder", "bottleneck = satellite embedding; 1.09 M parameters; mean + σ per depth"),
    ]
    mw = (RW - 2 * 0.3) / 3
    for i, (t, sub) in enumerate(models):
        x = RX + i * (mw + 0.3)
        box(s, x, my + 0.34, mw, 0.88, fill=WHITE, line=TEAL if i == 2 else LINE,
            shape=MSO_SHAPE.ROUNDED_RECTANGLE, radius=0.1, line_w=1.5 if i == 2 else 0.75)
        text(s, x + 0.08, my + 0.38, mw - 0.16, 0.82, [P(R(t, 10.5, True, TEAL if i == 2 else NAVY)), P(R(sub, 9, False, TEXT))],
             anchor=MSO_ANCHOR.MIDDLE)
        if i < 2:
            arrow(s, x + mw + 0.06, my + 0.68, 0.18, 0.2)
    # Validation protocol strip
    vy = 5.5
    box(s, RX, vy, RW, 1.3, fill=PANEL, line=LINE, shape=MSO_SHAPE.ROUNDED_RECTANGLE, radius=0.06)
    text(s, RX + 0.15, vy + 0.05, RW - 0.3, 0.32, [P(R("VALIDATION — against the real ocean, not just the training data", 10.5, True, NAVY))],
         anchor=MSO_ANCHOR.MIDDLE)
    facts = [("15,018", "Argo profiles, QC flags 1/2"), ("2,639", "in the held-out 2023 test"),
             ("per depth", "RMSE · bias · r · skill vs climatology"), ("EN4", "independent Met Office cross-check")]
    fw = (RW - 0.3) / 4
    for i, (big, small) in enumerate(facts):
        x = RX + 0.15 + i * fw
        text(s, x, vy + 0.42, fw - 0.1, 0.8, [P(R(big, 15, True, TEAL)), P(R(small, 9, False, TEXT))], anchor=MSO_ANCHOR.TOP)


def slide4(s):
    clear_content_boxes(s)
    X, W = 0.35, 12.65
    section_label(s, X, 1.30, W, "Analysis of the feasibility of the idea",
                  "working prototype, validated on the held-out year 2023")
    cards = [
        ("2,639", "independent Argo profiles from 2023 — a year the model never trained on"),
        ("0.89 °C", "mean temperature error (RMSE, 15 depths) vs 1.10 °C for climatology"),
        ("1.31 °C", "error at 100 m (thermocline) vs 1.80 °C for climatology"),
        ("70%", "of Argo values within ±1σ after calibration (ideal 68%; raw 41%)"),
    ]
    cw, cg = (W - 3 * 0.2) / 4, 0.2
    for i, (big, lab) in enumerate(cards):
        x = X + i * (cw + cg)
        box(s, x, 1.66, cw, 0.98, fill=NAVY, shape=MSO_SHAPE.ROUNDED_RECTANGLE, radius=0.08)
        text(s, x + 0.12, 1.66, 1.3, 0.98, [P(R(big, 20, True, WHITE))], anchor=MSO_ANCHOR.MIDDLE)
        text(s, x + 1.38, 1.66, cw - 1.46, 0.98, [P(R(lab, 9.3, False, WHITE))], anchor=MSO_ANCHOR.MIDDLE)
    # Left column: feasible because
    top = 2.86
    LW = 3.85
    text(s, X, top, LW, 0.3, [P(R("FEASIBLE BECAUSE", 11, True, TEAL))], anchor=MSO_ANCHOR.MIDDLE)
    feas = [
        ("Data", "HIGH", "Every input, target and validation source used is open; Copernicus/ERA5 need only free sign-up"),
        ("Technical", "HIGH", "Built and running end to end: ingestion → models → API → dashboard"),
        ("Compute", "HIGH", "U-Net (1.09 M params) trained on a laptop CPU — no GPU"),
        ("Cost", "₹0", "No paid data or services used"),
    ]
    y = top + 0.36
    for name, rating, why in feas:
        box(s, X, y, LW, 0.66, fill=PANEL, line=LINE)
        text(s, X + 0.1, y, 1.05, 0.66, [P(R(name, 10, True, NAVY)), P(R(rating, 10, True, GREEN))], anchor=MSO_ANCHOR.MIDDLE)
        text(s, X + 1.12, y, LW - 1.18, 0.66, [P(R(why, 9, False, TEXT))], anchor=MSO_ANCHOR.MIDDLE)
        y += 0.72
    text(s, X, y + 0.02, LW, 0.66, [
        P(R("IMPLEMENTED  ", 8.5, True, GREEN), R("pipeline · models · validation · API · dashboard · Docker", 8.5)),
        P(R("PLANNED  ", 8.5, True, AMBER), R("hosted deployment · re-run on Copernicus/GLORYS with credentials", 8.5))])
    # Right: challenges -> strategies
    CX = X + LW + 0.3
    CW = 3.55
    SX = CX + CW + 0.42
    SW = X + W - SX
    text(s, CX, top, CW, 0.3, [P(R("Potential challenges and risks", 11, True, AMBER))], anchor=MSO_ANCHOR.MIDDLE)
    text(s, SX, top, SW, 0.3, [P(R("Strategies for overcoming these challenges", 11, True, TEAL))], anchor=MSO_ANCHOR.MIDDLE)
    pairs = [
        ("Training target (a reanalysis) assimilates Argo → validation not fully independent",
         "Hold out a whole year; show the target product's own error as the ceiling (0.79 °C); cross-check against EN4"),
        ("Raw model uncertainty was over-confident (41% of values within ±1σ)",
         "Per-depth calibration fitted on 2022 floats, verified on 2023 → 70% within ±1σ, 94% within ±2σ"),
        ("Satellite salinity is gappy; removing it showed no measurable change in skill",
         "Merged SMAP + bias-corrected SMOS (absent days 209 → 1); re-test with Copernicus SSS"),
        ("GLORYS / Copernicus data need an account",
         "Credentialed adapters already built — switching source is a config change, no code change"),
        ("Thermocline (20–150 m) is the hardest layer to reconstruct",
         "Report error per depth, never one number; the uncertainty band widens where skill drops"),
    ]
    y = top + 0.36
    rh = 0.66
    for ch, st in pairs:
        box(s, CX, y, CW, rh - 0.08, fill=WHITE, line=LINE)
        box(s, CX, y, 0.06, rh - 0.08, fill=AMBER)
        text(s, CX + 0.12, y, CW - 0.16, rh - 0.08, [P(R(ch, 9, False, TEXT))], anchor=MSO_ANCHOR.MIDDLE)
        arrow(s, CX + CW + 0.08, y + (rh - 0.08) / 2 - 0.1, 0.26, 0.2)
        box(s, SX, y, SW, rh - 0.08, fill=TEAL_LIGHT)
        box(s, SX, y, 0.06, rh - 0.08, fill=TEAL)
        text(s, SX + 0.12, y, SW - 0.16, rh - 0.08, [P(R(st, 9, False, TEXT))], anchor=MSO_ANCHOR.MIDDLE)
        y += rh


def slide5(s, shots):
    clear_content_boxes(s)
    X, LW = 0.35, 6.75
    section_label(s, X, 1.30, LW, "Potential impact on the target audience")
    users = [("Ocean analysts &\nforecasters", "INCOIS-style"), ("Cyclone\nforecasters", "heat available to storms"),
             ("Fisheries-advisory\nanalysts", "mixed layer & thermocline"), ("Ocean\nresearchers", "daily 3-D record")]
    uw = (LW - 3 * 0.15) / 4
    for i, (u, sub) in enumerate(users):
        x = X + i * (uw + 0.15)
        box(s, x, 1.68, uw, 0.9, fill=NAVY, shape=MSO_SHAPE.ROUNDED_RECTANGLE, radius=0.1)
        text(s, x, 1.68, uw, 0.9, [P(R(u, 10, True, WHITE), align=PP_ALIGN.CENTER),
                                   P(R(sub, 8.5, False, RGBColor(0xBF, 0xE3, 0xEA)), align=PP_ALIGN.CENTER)],
             anchor=MSO_ANCHOR.MIDDLE)
    text(s, X, 2.62, LW, 0.28, [P(R("Decision support — not a replacement for operational ocean models", 9.5, True, TEAL, italic=True))])
    section_label(s, X, 3.02, LW, "Benefits of the solution", "social · economic · environmental · operational")
    tiles = [
        ("SOCIAL", "Basin-wide cyclone heat potential (TCHP) and mixed-layer maps for every day and every 0.25° cell of the domain."),
        ("ECONOMIC", "Built only on free satellite data; the model trains on a CPU; products are precomputed, so viewing needs no heavy compute."),
        ("ENVIRONMENTAL / CLIMATE", "A continuous daily record of upper-ocean heat and stratification for the North Indian Ocean (2019–2023)."),
        ("OPERATIONAL", "Each profile ships with a calibrated error bar and the nearest independent Argo float — trust is visible, not assumed."),
    ]
    tw, th = (LW - 0.15) / 2, 1.2
    for i, (t, body) in enumerate(tiles):
        x = X + (i % 2) * (tw + 0.15)
        y = 3.4 + (i // 2) * (th + 0.12)
        box(s, x, y, tw, th, fill=PANEL, line=LINE, shape=MSO_SHAPE.ROUNDED_RECTANGLE, radius=0.06)
        box(s, x, y + 0.1, 0.06, th - 0.2, fill=TEAL)
        text(s, x + 0.14, y + 0.06, tw - 0.22, th - 0.1, [P(R(t, 10, True, NAVY), space_after=2), P(R(body, 9.3))])
    # Key outcome bar
    box(s, X, 6.1, LW, 0.66, fill=NAVY, shape=MSO_SHAPE.ROUNDED_RECTANGLE, radius=0.1)
    text(s, X, 6.1, LW, 0.66, [P(R("KEY OUTCOME   ", 10, True, RGBColor(0x7F, 0xD3, 0xE0)),
                                 R("full-basin subsurface view · daily · 0–1000 m · with measured confidence", 11, True, WHITE),
                                 align=PP_ALIGN.CENTER)], anchor=MSO_ANCHOR.MIDDLE)
    # Right: prototype screenshot (cyclone fuel gauge)
    PX, PW = 7.4, 5.6
    section_label(s, PX, 1.30, PW, "Working prototype", "real event, held-out year")
    half = (PW - 0.12) / 2
    _, _, ha = picture(s, shots / "fuel.png", PX, 1.68, w=half, crop=(0.40, 0.30, 0.67, 0.79))
    _, _, hb = picture(s, shots / "fuel.png", PX + half + 0.12, 1.68, w=half, crop=(0.68, 0.065, 1.0, 0.67))
    ph = max(ha, hb)
    text(s, PX, 1.68 + ph + 0.06, PW, 0.9, [P(
        R("Cyclone Fuel Gauge — ", 9.5, True, NAVY),
        R("reconstructed TCHP along Cyclone Mocha's real IBTrACS track (May 2023, ocean state 2 days before passage): "
          "52.7–102 kJ/cm² over the ocean, above the 50 kJ/cm² level commonly linked to intensification. "
          "Prototype output, not an operational forecast.", 9.5, False, MUTED))])
    chips = [("Click any cell", "full 0–1000 m profile + σ"), ("Argo overlay", "nearest independent float"),
             ("Export", "PDF / CSV report per point")]
    cw = (PW - 2 * 0.12) / 3
    for i, (t, sub) in enumerate(chips):
        x = PX + i * (cw + 0.12)
        box(s, x, 6.1, cw, 0.66, fill=WHITE, line=TEAL, shape=MSO_SHAPE.ROUNDED_RECTANGLE, radius=0.12, line_w=1.25)
        text(s, x, 6.1, cw, 0.66, [P(R(t, 10, True, TEAL), align=PP_ALIGN.CENTER), P(R(sub, 8.8, False, TEXT), align=PP_ALIGN.CENTER)],
             anchor=MSO_ANCHOR.MIDDLE)


def slide6(s):
    clear_content_boxes(s)
    X, W = 0.35, 12.65
    section_label(s, X, 1.30, W, "Details / Links of the reference and research work")
    refs = [
        ("SIH26066 OceanEmbed problem statement", "SIH · MoES / INCOIS", "Scope, domain, 15 standard depths", "sih.gov.in"),
        ("INCOIS Tropical Cyclone Heat Potential service", "INCOIS", "Operational relevance of TCHP", "incois.gov.in/site/services/tchp.jsp"),
        ("GLORYS12V1 global ocean reanalysis (PS-named target)", "Copernicus Marine", "Training-target specification", "doi.org/10.48670/moi-00021"),
        ("Argo float profiles via argopy", "Argo programme · Euro-Argo", "Independent validation", "argopy.readthedocs.io"),
        ("NOAA OISST v2.1 · NCEI Blended Seawinds", "NOAA NCEI", "Satellite inputs used", "ncei.noaa.gov"),
        ("EN4 quality-controlled ocean analysis", "UK Met Office Hadley Centre", "Independent cross-check", "metoffice.gov.uk/hadobs/en4"),
        ("Bay of Bengal barrier layer (Vinayachandran et al., 2002)", "JGR Oceans · AGU", "Why salinity is an input", "doi.org/10.1029/2001JC000831"),
        ("Subsurface temperature reconstruction, ConvLSTM vs LightGBM (2022)", "MDPI Remote Sensing", "Model choice; thermocline is hardest", "doi.org/10.3390/rs14133198"),
        ("IBTrACS v04r01 best-track archive", "NOAA NCEI", "Real cyclone tracks", "ncei.noaa.gov/products/international-best-track-archive"),
    ]
    rows, cols = len(refs) + 1, 5
    tbl = s.shapes.add_table(rows, cols, Inches(X), Inches(1.7), Inches(W), Inches(0.42 * rows)).table
    widths = [0.45, 4.6, 2.55, 2.4, 2.65]
    for i, w in enumerate(widths):
        tbl.columns[i].width = Inches(w)
    head = ["#", "Reference", "Organisation", "What it supports", "Link"]

    def cell(r, c, t, size=10, bold=False, color=TEXT, fill=None):
        ce = tbl.cell(r, c)
        ce.text = ""
        tf = ce.text_frame
        tf.word_wrap = True
        ce.margin_left = ce.margin_right = Inches(0.06)
        ce.margin_top = ce.margin_bottom = Inches(0.03)
        ce.vertical_anchor = MSO_ANCHOR.MIDDLE
        run = tf.paragraphs[0].add_run()
        run.text = t
        run.font.size = Pt(size); run.font.bold = bold; run.font.color.rgb = color; set_font(run)
        if fill is not None:
            ce.fill.solid(); ce.fill.fore_color.rgb = fill
    for c, h in enumerate(head):
        cell(0, c, h, 10.5, True, WHITE, NAVY)
    for r, ref in enumerate(refs, start=1):
        fill = WHITE if r % 2 else PANEL
        cell(r, 0, str(r), 10, True, TEAL, fill)
        cell(r, 1, ref[0], 10, True, NAVY, fill)
        cell(r, 2, ref[1], 9.5, False, TEXT, fill)
        cell(r, 3, ref[2], 9.5, False, TEXT, fill)
        cell(r, 4, ref[3], 9, False, BLUE, fill)
    for r in range(rows):
        tbl.rows[r].height = Inches(0.42)
    # prototype link strip
    box(s, X, 6.12, W, 0.62, fill=TEAL_LIGHT, shape=MSO_SHAPE.ROUNDED_RECTANGLE, radius=0.1)
    text(s, X + 0.2, 6.12, W - 0.4, 0.62, [P(
        R("Prototype source code & full research artifact:  ", 11, True, NAVY),
        R("github.com/saad-46/oceanembed", 12, True, BLUE),
        R("   ·   all reported metrics are generated by the pipeline (docs/RESULTS.md)", 10, False, MUTED))],
        anchor=MSO_ANCHOR.MIDDLE)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--template", required=True)
    ap.add_argument("--shots", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    shots = Path(a.shots)
    prs = Presentation(a.template)
    s = list(prs.slides)
    slide1(s[0])
    slide2(s[1], shots)
    slide3(s[2])
    slide4(s[3])
    slide5(s[4], shots)
    slide6(s[5])
    delete_slide(prs, 6)  # "IMPORTANT INSTRUCTIONS" — must not be uploaded
    prs.save(a.out)
    print("saved", a.out, "slides:", len(prs.slides))


if __name__ == "__main__":
    main()
