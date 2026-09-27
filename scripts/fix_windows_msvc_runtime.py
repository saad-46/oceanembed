"""Venv-local workaround for WinError 1114 / missing-DLL errors when importing torch or
lightgbm on Windows machines whose system Visual C++ runtime predates VS2017.

The proper fix is installing the current "Microsoft Visual C++ Redistributable (x64)".
Without admin rights, this copies newer runtime DLLs that are *already present* locally
(CPython's bundled vcruntime, scikit-learn's vendored msvcp140/vcomp140) next to the
torch and lightgbm binaries. It touches only the virtualenv. Idempotent.
"""
import shutil
import sys
import sysconfig
from pathlib import Path

site = Path(sysconfig.get_paths()["purelib"])
base = Path(sys.base_prefix)
sources = {
    "vcruntime140.dll": base / "vcruntime140.dll",
    "vcruntime140_1.dll": base / "vcruntime140_1.dll",
    "msvcp140.dll": site / "sklearn" / ".libs" / "msvcp140.dll",
    "vcomp140.dll": site / "sklearn" / ".libs" / "vcomp140.dll",
}
targets = [site / "torch" / "lib", site / "lightgbm" / "bin"]
for t in targets:
    if not t.exists():
        continue
    for name, src in sources.items():
        if src.exists() and not (t / name).exists():
            shutil.copy2(src, t / name)
            print(f"copied {name} -> {t}")
print("done")

# torch_cpu.dll (>= 2.6) imports VCRUNTIME140_THREADS.dll (VS2022 17.x runtime). If the system
# lacks it, copy a Microsoft-signed copy found locally (e.g. Office ClickToRun) - verified signed.
threads = "vcruntime140_threads.dll"
torch_lib = site / "torch" / "lib"
if torch_lib.exists() and not (torch_lib / threads).exists():
    for cand in (Path(r"C:\Program Files\Common Files\microsoft shared\ClickToRun") / threads,
                 Path(r"C:\Program Files\Microsoft Office\root\Office16") / threads):
        if cand.exists():
            shutil.copy2(cand, torch_lib / threads)
            print(f"copied {cand} -> {torch_lib}")
            break
    else:
        print("WARNING: vcruntime140_threads.dll not found; install the VC++ Redistributable (x64)")

# venvs created by the Windows Python install manager don't put python312.dll on the DLL
# search path of extension modules that import it (torch_python.dll). Register it at startup.
pth = site / "zz_oceanembed_dll_path.pth"
pth.write_text("import os, sys; hasattr(os, 'add_dll_directory') and os.add_dll_directory(sys.base_prefix)\n")
print(f"wrote {pth}")
