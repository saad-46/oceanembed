"""Deterministic oceanographic diagnostics served by the API (no ML, no I/O).

Like ``ml.evaluation.derived_products`` these modules depend only on numpy (and ``gsw``
for TEOS-10 seawater properties), so the backend can import them without the ML stack.

* ``stratification`` - thermocline / halocline from vertical gradients, with quality flags
* ``seawater``       - TEOS-10 potential temperature, density, density-based mixed layer
* ``forecast``       - short-horizon persistence / trend estimate with hindcast error
* ``volume``         - server-side downsampling of a 3-D field for the 3-D view
"""
