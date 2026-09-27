# 21 · Risks, Failure Modes & Claim Discipline

## 1. Risk register

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| INCOIS LAS gridded-Argo access never confirmed | High | Low (substitute exists) | Use standard Argo GDAC via `argopy`; state the substitution explicitly (`04_DATASETS_AND_APIS.md`) |
| GLORYS-assimilated-Argo leakage undermines "independence" claim | Medium | Medium (credibility, not functionality) | Hold out entire recent years; add ARMOR3D/EN4 cross-checks; state the caveat proactively (`10_ML_AI_STRATEGY.md` §3) |
| CNN/ViT fails to converge in available time on ~13–15 years of daily data | Medium | Medium | LightGBM baseline is the fallback headline model if the CNN underperforms; always have a working, validated result even if the "fancier" model disappoints |
| Copernicus/CDS account approval or download throttling delays data access | Low–Medium | High if it happens early | Start Phase 0 account signups on day 1, before any code; download smallest subset first to validate the pipeline before pulling the full history |
| Team over-invests in UI polish before the core model is validated | Medium | High | Roadmap and feature priority (`07`, `19`) explicitly sequence ML/validation before frontend polish |
| Deadline conflict (20 Sep vs. other reported dates) causes a missed submission | Unknown (unresolved) | Critical | **Confirm directly with SPOC/sih.gov.in today** — see `01_OFFICIAL_PROBLEM_STATEMENT.md` |
| Live demo depends on a flaky external API/wifi | Medium | High (demo-day only) | All demo data precomputed and cached; full offline rehearsal (`15_DEMO_FLOW.md`, `16_SECURITY_AND_PRODUCTION.md`) |
| Judges perceive the project as "one of many identical OceanEmbed repos" | High | Medium | Explicit differentiation strategy (`03_EXISTING_SOLUTIONS.md` §3, `20_JUDGE_QA.md` #17) |

## 2. Failure modes

| Failure | Detection | Fallback | User experience |
|---|---|---|---|
| Requested dataset/date unavailable | API catches missing-file lookup | Serve nearest available date, flagged | Calm banner: "data unavailable for this date — showing nearest available day" |
| API unavailable (backend down) | Frontend request timeout/5xx | Static cached JSON bundled with the frontend for the exact demo date range as a last-resort local fallback | Frontend silently serves the bundled fallback for demo dates; genuine error banner only for non-demo dates |
| Map tiles unavailable | Tile load error event | Bundled static basemap image | Map still shows data layers over a simplified basemap |
| ML model fails at inference time | Try/except around inference call | For demo dates, this never happens (precomputed); for a live-inference mode, return a typed error, not a crash | "Live reconstruction temporarily unavailable — showing the nearest cached day" |
| Database unavailable | Connection pool error | API returns 503 with a typed body; frontend shows the calm error state | Judge sees a clear, non-technical error, not a stack trace |
| Internet disconnects mid-demo | N/A — nothing during the demo requires internet | N/A | No visible impact (by design) |
| Invalid coordinates (land pixel, out-of-domain) clicked | Bounds/mask check in API | Typed `out_of_domain` error | "This point is on land / outside the study domain" |
| Missing data in a source file (NaN gaps) | Data validation tests (`17_TESTING_STRATEGY.md`) at ingestion time | Gap-filled via the product's own L4 gap-filled version, or nearest-day interpolation, logged | Not user-visible if caught at ingestion; if it reaches serving, shown as a lower-confidence flag |
| Large dataset causes a timeout (e.g. a huge region-stats query) | Server-side timeout guard | Typed error suggesting a smaller region | "Region too large — try a smaller area" |

## 3. Claims we can safely make

- "Our reconstruction is validated against independent Argo float profiles held out from training, with the stated GLORYS-assimilation caveat disclosed."
- "All required input datasets are freely and legally accessible; no paid or restricted data is used."
- "We compare our model honestly against a climatology baseline and against ARMOR3D, a real operational reconstruction product."
- "This is a proof-of-concept over a defined historical study period, not an operational real-time system."
- "[Your actual measured RMSE/bias/correlation numbers, per depth, exactly as computed]."

## 4. Claims we must NOT make

- ❌ "Our model beats state-of-the-art" (unless independently verified against the specific literature benchmark, same region, same metric, same evaluation protocol — none of which we've established here).
- ❌ "This is production-ready" or "ready for INCOIS to deploy" (it is a validated PoC; `16_SECURITY_AND_PRODUCTION.md` lists exactly what's missing).
- ❌ "Fully independent validation" without the assimilation caveat (`10_ML_AI_STRATEGY.md` §3) attached every time.
- ❌ Any specific accuracy number not actually measured and reproducible from the codebase.
- ❌ "INCOIS has adopted / endorsed / reviewed this" (no such relationship exists unless your team has genuinely obtained one).
- ❌ Claiming the INCOIS LAS gridded-Argo dataset was used, when in fact the standard Argo GDAC was substituted — always name the actual source used.
- ❌ "Guaranteed" language of any kind about winning, accuracy, or adoption — per SIH judging norms, prefer "this appears technically sound based on our evaluation" over any guarantee framing.
