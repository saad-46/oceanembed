"""Optional NL region-summary assistant (docs/10 section 5, docs/07 #20).

The numbers are always computed deterministically first (profile + derived products);
the LLM only phrases them. If no key is configured, the SDK is missing, the call fails,
or the model declines (``stop_reason == "refusal"``), a templated sentence built from the
same numbers is returned - the core product never depends on the LLM.
"""
from __future__ import annotations

import json
import logging

from app.config import get_settings

log = logging.getLogger("oceanembed.assistant")

SYSTEM = (
    "You are an ocean-analysis assistant for oceanographers and marine analysts. Summarise the supplied, "
    "already-computed subsurface temperature diagnostics in at most two plain sentences. Use only the "
    "numbers given; do not invent values, forecasts or causes that are not supported by them. Mention "
    "that values are a satellite-based reconstruction."
)


def _season(month: int) -> str:
    return ("northeast-monsoon" if month in (12, 1, 2) else "pre-monsoon" if month in (3, 4, 5)
            else "southwest-monsoon" if month in (6, 7, 8, 9) else "post-monsoon")


def template_summary(p: dict) -> str:
    d = p["derived"]
    t = p["temperature_c"]
    parts = [f"Reconstructed surface temperature is {t[0]:.1f}°C" if t[0] is not None else "Surface temperature unavailable"]
    if d.get("mld_m") is not None:
        parts.append(f"with a mixed layer to about {d['mld_m']:.0f} m")
    s = " ".join(parts) + "."
    therm = []
    if d.get("d26_m") is not None:
        therm.append(f"the 26°C isotherm sits near {d['d26_m']:.0f} m")
    if d.get("d20_m") is not None:
        therm.append(f"the 20°C isotherm (thermocline proxy) near {d['d20_m']:.0f} m")
    tchp = d.get("tchp_kj_cm2")
    level = None if tchp is None else ("low" if tchp < 40 else "moderate" if tchp < 80 else "high")
    s2 = ""
    if therm:
        s2 = therm[0][0].upper() + ", ".join(therm)[1:]
    if tchp is not None:
        s2 += (", giving " if s2 else "Cyclone heat potential is ") + f"{level} cyclone heat potential ({tchp:.0f} kJ/cm²)"
    month = int(p["date"][5:7])
    out = f"{s} {s2}." if s2 else s
    clim = (p.get("baseline_climatology_c") or [None])[0]
    if t[0] is not None and clim is not None:
        # compare with the seasonal climatology for the same date and cell (computed, not assumed)
        diff = t[0] - clim
        rel = "close to" if abs(diff) < 0.3 else f"{abs(diff):.1f}°C {'warmer' if diff > 0 else 'colder'} than"
        out += f" The surface is {rel} the {_season(month)} seasonal climatology for this date."
    return out


def llm_summary(p: dict) -> str | None:
    s = get_settings()
    if not s.llm_api_key:
        return None
    try:
        import anthropic
    except ImportError:
        log.info("anthropic SDK not installed; using template")
        return None
    facts = {k: p[k] for k in ("date", "lat", "lon", "depths_m", "temperature_c", "uncertainty_c", "derived")}
    try:
        client = anthropic.Anthropic(api_key=s.llm_api_key, timeout=20.0, max_retries=1)
        resp = client.messages.create(
            model=s.llm_model, max_tokens=2048, system=SYSTEM,
            output_config={"effort": "low"},
            messages=[{"role": "user", "content": "Diagnostics (JSON):\n" + json.dumps(facts)}],
        )
    except anthropic.APIConnectionError:
        log.warning("assistant: network error; using template")
        return None
    except anthropic.APIStatusError as e:
        log.warning("assistant: API error %s; using template", e.status_code)
        return None
    if resp.stop_reason == "refusal":
        return None
    text = "".join(b.text for b in resp.content if b.type == "text").strip()
    return text or None


def summarise(p: dict) -> dict:
    text = llm_summary(p)
    if text:
        return {"summary": text, "source": "llm", "model": get_settings().llm_model}
    return {"summary": template_summary(p), "source": "template_fallback", "model": None}
