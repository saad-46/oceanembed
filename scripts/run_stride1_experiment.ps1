<#
.SYNOPSIS
  OceanSight stride-1 target-density experiment: isolated, logged, fail-fast runner.

.DESCRIPTION
  Builds a denser (every day, 1826 days) HYCOM target set and retrains the OceanSight models
  in an ISOLATED experiment directory (ml\data\experiments\stride1). The production artifacts
  (ml\data\models, ml\data\outputs, ml\data\processed) are only ever READ (backup + seeding).

  Isolation works through OCEANEMBED_DATA_DIR, which ml\config.py uses for every data, model and
  output path. The variable is set only for the duration of this script and is restored on exit.

  Run from the repository root, with the project virtual environment active:

      powershell -ExecutionPolicy Bypass -File .\scripts\run_stride1_experiment.ps1 -DryRun
      powershell -ExecutionPolicy Bypass -File .\scripts\run_stride1_experiment.ps1
      powershell -ExecutionPolicy Bypass -File .\scripts\run_stride1_experiment.ps1 -Resume

  (-DryRun: checks only, nothing copied/downloaded/trained. No flag: the real run, many hours.
   -Resume: continue an interrupted run, explicit and manual. -ExecutionPolicy Bypass applies to this
   one process only; it is needed on Windows when script execution is restricted.)

  NEVER run the API, scripts\write_results.py or anything else with OCEANEMBED_DATA_DIR pointing
  at the experiment. This script never promotes anything to production.

.PARAMETER DryRun
  Verify paths, disk, Python/imports, credentials guard, destinations, environment handling and
  print the commands. Copies, downloads and trains nothing.

.PARAMETER Resume
  Continue an existing experiment directory. Skips stages already completed (logs\<stage>.done).
  Training stages that did not finish restart from scratch (the pipeline has no mid-training
  checkpoint). Inspect logs\stages.log before using this.

.PARAMETER Workers
  Parallel target downloads (default 6).

.PARAMETER MinFreeGB
  Stop if free disk is below this (default 40). Do not lower it for the real run.

.PARAMETER BackupRoot
  Where timestamped backups go (default ..\oceansight-backups, outside the repository).
#>
[CmdletBinding()]
param(
    [switch]$DryRun,
    [switch]$Resume,
    [int]$Workers = 6,
    [int]$MinFreeGB = 40,
    [string]$BackupRoot = '..\oceansight-backups'
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$ExperimentName = 'OceanSight stride-1 target-density experiment'
$ExpectedDays   = 1826          # every day 2019-01-01 .. 2023-12-31 (ml.pipeline.target_days.target_days(1))
$TargetDatasetId = 'GLBy0.08_expt_93.0_ts3z'

# ---------------------------------------------------------------------------------------------
# platform helpers (the script targets Windows PowerShell 5.1 / PowerShell 7 on Windows)
# ---------------------------------------------------------------------------------------------
$IsWinVar = Get-Variable -Name IsWindows -ErrorAction SilentlyContinue
$script:IsWin = if ($IsWinVar) { [bool]$IsWinVar.Value } else { $true }

$script:State = [ordered]@{ Stage = '(none - preflight)'; Log = '(none)'; ExitCode = '(n/a)'; ExpDir = '(not created)'; BackupDir = '(not created)' }
$script:MasterLog = $null
$script:StageRecords = New-Object System.Collections.Generic.List[object]
$OriginalDataDirSet = Test-Path Env:\OCEANEMBED_DATA_DIR
$OriginalDataDir = if ($OriginalDataDirSet) { $env:OCEANEMBED_DATA_DIR } else { $null }
$OriginalUnbuffered = if (Test-Path Env:\PYTHONUNBUFFERED) { $env:PYTHONUNBUFFERED } else { $null }
$RunStart = Get-Date

function Get-Stamp { (Get-Date).ToString('yyyy-MM-ddTHH:mm:ss') }

function Write-Log([string]$Message, [string]$Level = 'INFO') {
    $line = '[{0}] {1} {2}' -f (Get-Stamp), $Level, $Message
    Write-Host $line
    if ($script:MasterLog) {
        [System.IO.File]::AppendAllText($script:MasterLog, $line + [Environment]::NewLine)
    }
}

class StopRun : System.Exception {
    StopRun([string]$m) : base($m) {}
}
function Stop-Run([string]$Reason) { throw [StopRun]::new($Reason) }

function Get-FreeGB([string]$Path) {
    $full = [System.IO.Path]::GetFullPath($Path)
    $best = $null
    foreach ($d in [System.IO.DriveInfo]::GetDrives()) {
        if (-not $d.IsReady) { continue }
        $root = $d.RootDirectory.FullName
        if ($full.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
            if ($null -eq $best -or $root.Length -gt $best.RootDirectory.FullName.Length) { $best = $d }
        }
    }
    if ($null -eq $best) { Stop-Run "cannot determine free disk space for $full" }
    return [math]::Round($best.AvailableFreeSpace / 1GB, 2)
}

function Get-DirStat([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { return [pscustomobject]@{ Files = 0; Bytes = [long]0 } }
    $m = Get-ChildItem -LiteralPath $Path -Recurse -File -Force -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum
    $b = if ($null -eq $m.Sum) { [long]0 } else { [long]$m.Sum }
    return [pscustomobject]@{ Files = [int]$m.Count; Bytes = $b }
}

function Format-GB([long]$Bytes) { '{0:N2} GB' -f ($Bytes / 1GB) }

function Get-MemoryInfo {
    try {
        if ($script:IsWin) {
            $os = Get-CimInstance -ClassName Win32_OperatingSystem
            return ('total {0:N1} GB, free {1:N1} GB' -f ($os.TotalVisibleMemorySize / 1MB), ($os.FreePhysicalMemory / 1MB))
        }
        $mi = Get-Content /proc/meminfo
        $tot = [double](($mi | Where-Object { $_ -match '^MemTotal' }) -replace '[^0-9]', '')
        $av  = [double](($mi | Where-Object { $_ -match '^MemAvailable' }) -replace '[^0-9]', '')
        return ('total {0:N1} GB, available {1:N1} GB' -f ($tot / 1MB), ($av / 1MB))
    } catch {
        return 'unavailable'
    }
}

# Run a command line through the shell with stderr merged in (so PowerShell never turns Python's
# stderr logging into errors), stream it to the console, append it to a UTF-8 log, return exit code.
function Invoke-Shell([string]$CmdLine, [string]$LogFile = $null, [switch]$Echo) {
    $old = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $sw = $null
    try {
        if ($LogFile) {
            $sw = New-Object System.IO.StreamWriter($LogFile, $true, (New-Object System.Text.UTF8Encoding($false)))
            $sw.AutoFlush = $true
        }
        $sink = {
            $s = [string]$_
            if ($sw) { $sw.WriteLine($s) }
            if ($Echo) { Write-Host $s }
        }
        if ($script:IsWin) { & cmd.exe /d /c "$CmdLine 2>&1" | ForEach-Object -Process $sink }
        else               { & bash -c "$CmdLine 2>&1" | ForEach-Object -Process $sink }
        return [int]$LASTEXITCODE
    } finally {
        if ($sw) { $sw.Dispose() }
        $ErrorActionPreference = $old
    }
}

function Get-PyOutput([string[]]$PyArgs) {
    $old = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $out = & python @PyArgs 2>&1 | ForEach-Object { [string]$_ }
        return [pscustomobject]@{ Code = [int]$LASTEXITCODE; Lines = @($out) }
    } finally { $ErrorActionPreference = $old }
}

function Normalize-Path([string]$p) { [System.IO.Path]::GetFullPath($p).TrimEnd('\', '/').ToLowerInvariant() }

# Join a base path and a relative path written with backslashes (works on Windows and, for testing, on Linux).
function J([string]$Base, [string]$Rel) { Join-Path $Base ($Rel -replace '\\', [string][System.IO.Path]::DirectorySeparatorChar) }

function Format-Span([TimeSpan]$t) { '{0}:{1:D2}:{2:D2}' -f [int][math]::Floor($t.TotalHours), $t.Minutes, $t.Seconds }

# Runs the exact verification the real run relies on: ml.config.DATA_DIR must equal the experiment directory.
function Test-ConfigDataDir([string]$Expected) {
    $chk = Get-PyOutput @('-c', 'from ml.config import DATA_DIR; print(DATA_DIR)')
    $seen = @($chk.Lines | Where-Object { $_.Trim() -ne '' } | Select-Object -Last 1)[0]
    if ($chk.Code -ne 0 -or [string]::IsNullOrWhiteSpace($seen)) { Stop-Run ("could not import ml.config: " + ($chk.Lines -join ' | ')) }
    if ((Normalize-Path $seen) -ne (Normalize-Path $Expected)) { Stop-Run "ml.config.DATA_DIR resolved to '$seen', expected '$Expected'" }
    return $seen
}

function Write-FailureBlock([string]$Reason) {
    $lines = @(
        '',
        '================================================================',
        'EXPERIMENT STOPPED - FAILURE',
        '================================================================',
        "REASON:               $Reason",
        "FAILED STAGE:         $($script:State.Stage)",
        "LOG FILE:             $($script:State.Log)",
        "EXIT CODE:            $($script:State.ExitCode)",
        "EXPERIMENT DIRECTORY: $($script:State.ExpDir)",
        "BACKUP DIRECTORY:     $($script:State.BackupDir)",
        '',
        'Nothing was retried. Do NOT restart blindly: read stages.log and the stage log first.',
        'Production artifacts were not modified by this script.',
        '================================================================'
    )
    foreach ($l in $lines) { Write-Host $l -ForegroundColor Red }
    if ($script:MasterLog) {
        [System.IO.File]::AppendAllText($script:MasterLog, (($lines -join [Environment]::NewLine) + [Environment]::NewLine))
    }
}

function Read-Json([string]$Path) { Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json }

# Safe property read (StrictMode throws on a missing property).
function Get-Prop($Obj, [string]$Name, $Default = 'n/a') {
    if ($null -ne $Obj -and ($Obj.PSObject.Properties.Name -contains $Name)) { return $Obj.$Name }
    return $Default
}

function Write-HelperFiles([string]$Dir) {
    New-Item -ItemType Directory -Force -Path $Dir | Out-Null
    $utf8 = New-Object System.Text.UTF8Encoding($false)

    $checkModel = @'
import sys
import torch
ck = torch.load(sys.argv[1], map_location='cpu', weights_only=False)
missing = [k for k in ('config', 'state_dict') if k not in ck]
if missing:
    sys.exit('checkpoint is missing keys: %s' % missing)
n = sum(int(v.numel()) for v in ck['state_dict'].values())
print('model.pt loaded: %d tensors, %d parameters' % (len(ck['state_dict']), n))
'@
    [System.IO.File]::WriteAllText((Join-Path $Dir 'check_model.py'), $checkModel, $utf8)

    $gateTarget = @'
import os
import sys
sys.path.insert(0, os.getcwd())   # run from the repository root: make the 'ml' package importable
from datetime import date, timedelta
import xarray as xr
from ml.config import RAW_DIR, STUDY_START, STUDY_END
from ml.pipeline.target_days import target_days

expected = int(sys.argv[1])
days = target_days(1)
if len(days) != expected:
    sys.exit('GATE FAIL: target_days(1) has %d days but the script expects %d - inspect ml/pipeline/target_days.py and ml/config.py before continuing' % (len(days), expected))
root = RAW_DIR / 'target'
dirs = sorted(p.name for p in root.iterdir() if p.is_dir())
want = sys.argv[2]
if dirs != [want]:
    sys.exit('GATE FAIL: target cache datasets are %s, expected exactly [%r] (mixed/other target source?)' % (dirs, want))
std = root / want / 'std'
missing, bad, wrong_src = [], [], []
for d in days:
    p = std / ('%s.nc' % d.isoformat())
    if not p.exists() or p.stat().st_size == 0:
        missing.append(d.isoformat()); continue
    try:
        with xr.open_dataset(p) as ds:
            if tuple(ds['temp'].shape) != (1, 15, 100, 240):
                bad.append('%s shape %s' % (d, tuple(ds['temp'].shape)))
            if ds.attrs.get('prov_dataset_id') != want:
                wrong_src.append('%s src %s' % (d, ds.attrs.get('prov_dataset_id')))
    except Exception as e:
        bad.append('%s unreadable: %s' % (d, e))
print('target days expected=%d present=%d missing=%d unreadable_or_bad=%d wrong_source=%d' % (len(days), len(days) - len(missing), len(missing), len(bad), len(wrong_src)))
if missing: print('first missing:', missing[:10])
if bad: print('first bad:', bad[:10])
if wrong_src: print('first wrong source:', wrong_src[:10])
sys.exit(0 if not (missing or bad or wrong_src) else 1)
'@
    [System.IO.File]::WriteAllText((Join-Path $Dir 'gate_target.py'), $gateTarget, $utf8)

    $imports = @'
import importlib
mods = ['numpy', 'pandas', 'xarray', 'zarr', 'sklearn', 'torch', 'lightgbm', 'pyarrow']
out = []
for m in mods:
    mod = importlib.import_module(m)
    out.append('%s %s' % (m, getattr(mod, '__version__', '?')))
import sys
print('python', sys.version.split()[0], '|', ', '.join(out))
'@
    [System.IO.File]::WriteAllText((Join-Path $Dir 'check_imports.py'), $imports, $utf8)
}

# ---------------------------------------------------------------------------------------------
# main (try/finally: the environment variable is always restored)
# ---------------------------------------------------------------------------------------------
try {
    $mode = if ($DryRun) { 'DRY RUN' } elseif ($Resume) { 'RESUME' } else { 'FULL RUN' }
    Write-Host ''
    Write-Host "$ExperimentName  [$mode]" -ForegroundColor Cyan
    Write-Host ('started ' + (Get-Stamp))

    # ---- 1. repository root ------------------------------------------------------------------
    $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
    $Cwd = (Get-Location).Path
    if ((Normalize-Path $Cwd) -ne (Normalize-Path $RepoRoot)) {
        Stop-Run "run this from the repository root. Current directory: $Cwd ; repository root: $RepoRoot (cd there first)"
    }
    foreach ($marker in 'ml\config.py', 'ml\pipeline\build_dataset.py', 'ml\models\train.py', 'scripts\run_ml.sh', 'scripts\compare_stride1_experiment.py', 'backend\app\main.py') {
        if (-not (Test-Path -LiteralPath (J $RepoRoot $marker))) { Stop-Run "not the OceanSight repository root: missing $marker" }
    }

    # ---- 2. production data directories ------------------------------------------------------
    $DataDir = J $RepoRoot 'ml\data'
    foreach ($d in 'ml\data', 'ml\data\models', 'ml\data\outputs', 'ml\data\processed', 'ml\data\raw') {
        if (-not (Test-Path -LiteralPath (J $RepoRoot $d) -PathType Container)) { Stop-Run "required production directory is missing: $d" }
    }
    $ProdModels = Join-Path $DataDir 'models'; $ProdOutputs = Join-Path $DataDir 'outputs'
    $ProdProcessed = Join-Path $DataDir 'processed'; $ProdRaw = Join-Path $DataDir 'raw'
    $ExpDir = J $DataDir 'experiments\stride1'
    $script:State.ExpDir = if (Test-Path -LiteralPath $ExpDir) { $ExpDir } else { "$ExpDir (not created yet)" }

    # production inputs the experiment needs
    $needProd = @(
        'models\cnn-unet-v1\model.pt', 'models\cnn-unet-nosss-v1\model.pt', 'models\baseline-lightgbm-v1\depth_0.txt',
        'outputs\model_registry.json', 'outputs\metrics_grid.json', 'outputs\metrics_argo.json',
        'processed\inputs.zarr', 'processed\argo_profiles.parquet', 'processed\target.zarr',
        'processed\norm_stats.json', 'raw\en4\EN.4.2.2.analyses.g10.2022.zip', 'raw\en4\EN.4.2.2.analyses.g10.2023.zip'
    )
    foreach ($r in $needProd) {
        if (-not (Test-Path -LiteralPath (J $DataDir $r))) { Stop-Run "expected production artifact/input not found: ml\data\$r" }
    }
    $TargetStd = J $ProdRaw "target\$TargetDatasetId\std"
    if (-not (Test-Path -LiteralPath $TargetStd)) { Stop-Run "production target cache not found: $TargetStd" }

    # ---- 3. environment report ---------------------------------------------------------------
    $pyCmd = Get-Command python -ErrorAction SilentlyContinue
    if (-not $pyCmd) { Stop-Run 'python is not on PATH (activate the project virtual environment first)' }
    $pyVer = (Get-PyOutput @('--version')).Lines -join ' '
    Write-Host ''
    Write-Host '--- environment ---'
    Write-Host ('working directory : ' + $Cwd)
    Write-Host ('python            : ' + $pyVer + '  (' + $pyCmd.Source + ')')
    if ($pyCmd.Source -notlike (Join-Path $RepoRoot '.venv*')) { Write-Host '  WARNING: python is not the repository .venv interpreter' -ForegroundColor Yellow }
    $freeGB = Get-FreeGB $RepoRoot
    Write-Host ('free disk (drive {0}) : {1:N1} GB   (minimum required {2} GB)' -f [System.IO.Path]::GetPathRoot($RepoRoot), $freeGB, $MinFreeGB)
    Write-Host ('memory            : ' + (Get-MemoryInfo))
    Write-Host '  (peak RAM for assemble/training at stride 1 is estimated above 10 GB; close other heavy programs)'
    Write-Host 'measuring production data sizes (this can take a minute)...'
    $sModels = Get-DirStat $ProdModels; $sOutputs = Get-DirStat $ProdOutputs
    $sProcessed = Get-DirStat $ProdProcessed; $sRaw = Get-DirStat $ProdRaw
    $sTotalFiles = 0; [long]$sTotalBytes = 0
    foreach ($item in (Get-ChildItem -LiteralPath $DataDir -Force)) {
        if ($item.Name -eq 'experiments') { continue }
        if ($item.PSIsContainer) { $st = Get-DirStat $item.FullName; $sTotalFiles += $st.Files; $sTotalBytes += $st.Bytes }
        else { $sTotalFiles += 1; $sTotalBytes += $item.Length }
    }
    Write-Host ('ml\data total     : {0}  ({1} files, excluding experiments)' -f (Format-GB $sTotalBytes), $sTotalFiles)
    Write-Host ('  models          : {0}  ({1} files)' -f (Format-GB $sModels.Bytes), $sModels.Files)
    Write-Host ('  outputs         : {0}  ({1} files)' -f (Format-GB $sOutputs.Bytes), $sOutputs.Files)
    Write-Host ('  processed       : {0}  ({1} files)' -f (Format-GB $sProcessed.Bytes), $sProcessed.Files)
    Write-Host ('  raw             : {0}  ({1} files)' -f (Format-GB $sRaw.Bytes), $sRaw.Files)
    $cachedTarget = (Get-ChildItem -LiteralPath $TargetStd -Filter *.nc -File).Count
    Write-Host ('production target days already cached: {0} of {1}' -f $cachedTarget, $ExpectedDays)
    if ($MinFreeGB -lt 40) { Write-Host "  WARNING: -MinFreeGB lowered to $MinFreeGB (default 40). Do not do this for the real run." -ForegroundColor Yellow }

    # ---- 4. stop conditions ------------------------------------------------------------------
    if ($freeGB -lt $MinFreeGB) { Stop-Run ('free disk space {0:N1} GB is below the required {1} GB' -f $freeGB, $MinFreeGB) }

    # imports (catches the torch / VC++ runtime problems now, not hours in)
    Write-HelperFiles (Join-Path ([System.IO.Path]::GetTempPath()) 'oceansight_stride1_helpers')
    $Helpers = Join-Path ([System.IO.Path]::GetTempPath()) 'oceansight_stride1_helpers'
    $imp = Get-PyOutput @((Join-Path $Helpers 'check_imports.py'))
    if ($imp.Code -ne 0) { Stop-Run ("required Python packages failed to import (torch/VC++ runtime?): " + ($imp.Lines -join ' | ')) }
    Write-Host ('imports           : ' + ($imp.Lines -join ' '))

    # the target source must stay HYCOM: credentials would silently switch ml.ingestion.fetch_glorys to GLORYS
    foreach ($v in 'COPERNICUSMARINE_SERVICE_USERNAME', 'COPERNICUSMARINE_SERVICE_PASSWORD', 'COPERNICUS_MARINE_USERNAME', 'COPERNICUS_MARINE_PASSWORD') {
        if (Test-Path "Env:\$v") {
            if ([string](Get-Item "Env:\$v").Value -ne '') { Stop-Run "environment variable $v is set: the target would switch from HYCOM to GLORYS and mix sources. Clear it in this session first." }
        }
    }

    # network reachability is a warning only (nothing is downloaded by the check)
    try {
        $null = Invoke-WebRequest -Uri 'https://ncss.hycom.org/thredds/ncss/GLBy0.08/expt_93.0/ts3z/dataset.html' -Method Head -TimeoutSec 20 -UseBasicParsing
        Write-Host 'HYCOM NCSS server : reachable'
    } catch {
        Write-Host 'HYCOM NCSS server : NOT reachable right now (the target stage will fail if it stays unreachable)' -ForegroundColor Yellow
    }

    # ---- 5. destinations ---------------------------------------------------------------------
    $Timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $BackupRootFull = [System.IO.Path]::GetFullPath((J $RepoRoot $BackupRoot))
    if ((Normalize-Path $BackupRootFull).StartsWith((Normalize-Path $DataDir))) { Stop-Run "backup root must be outside ml\data: $BackupRootFull" }
    $BackupDir = Join-Path $BackupRootFull $Timestamp
    if ($Resume) {
        if (-not (Test-Path -LiteralPath $ExpDir)) { Stop-Run "-Resume given but no experiment directory exists: $ExpDir" }
        $bp = J $ExpDir 'logs\backup_dir.txt'
        if (-not (Test-Path -LiteralPath $bp)) { Stop-Run "cannot resume: $bp not found (the original run did not get past the backup)" }
        $BackupDir = (Get-Content -LiteralPath $bp -Raw).Trim()
        if (-not (Test-Path -LiteralPath (Join-Path $BackupDir 'backup_manifest.json'))) { Stop-Run "cannot resume: backup manifest not found in $BackupDir" }
        if (Test-Path -LiteralPath (Join-Path $ExpDir 'EXPERIMENT_COMPLETE.txt')) { Stop-Run 'this experiment is already complete (EXPERIMENT_COMPLETE.txt exists)' }
    } else {
        if (Test-Path -LiteralPath $ExpDir) { Stop-Run "experiment directory already exists: $ExpDir . Inspect it; use -Resume to continue it, or move/rename it deliberately." }
    }
    $script:State.BackupDir = $BackupDir
    $LogDir = Join-Path $ExpDir 'logs'
    $ExpRaw = Join-Path $ExpDir 'raw'; $ExpProcessed = Join-Path $ExpDir 'processed'
    $ComparePy = J $RepoRoot 'scripts\compare_stride1_experiment.py'

    $Stages = @(
        @{ Name = 'target';   Cmd = "python -m ml.pipeline.build_dataset target --stride 1 --workers $Workers" },
        @{ Name = 'assemble'; Cmd = 'python -m ml.pipeline.build_dataset assemble' },
        @{ Name = 'lgbm';     Cmd = 'python -m ml.models.train lightgbm' },
        @{ Name = 'unet';     Cmd = 'python -m ml.models.train unet --epochs 35' },
        @{ Name = 'nosss';    Cmd = 'python -m ml.models.train unet --epochs 25 --no-sss' },
        @{ Name = 'evaluate'; Cmd = 'python -m ml.models.train evaluate' },
        @{ Name = 'precomp';  Cmd = 'python -m ml.inference.precompute' },
        @{ Name = 'argo';     Cmd = 'python -m ml.evaluation.argo_validation' },
        @{ Name = 'calib';    Cmd = 'python -m ml.evaluation.calibrate_uncertainty' },
        @{ Name = 'en4';      Cmd = 'python -m ml.evaluation.en4_crosscheck' }
    )

    Write-Host ''
    Write-Host '--- plan ---'
    Write-Host ('production artifacts (read-only): ' + $DataDir)
    Write-Host ('    models    ' + $ProdModels); Write-Host ('    outputs   ' + $ProdOutputs); Write-Host ('    processed ' + $ProdProcessed)
    Write-Host ('backup destination              : ' + $BackupDir)
    Write-Host ('experiment destination          : ' + $ExpDir + '  (raw, processed, logs; models/outputs are created by training)')
    Write-Host ('OCEANEMBED_DATA_DIR will be set to: ' + $ExpDir)
    Write-Host 'commands, in order:'
    $i = 0
    foreach ($s in $Stages) { $i++; Write-Host ('  {0,2}. {1,-9} {2}' -f $i, $s.Name, $s.Cmd) }
    Write-Host ('  post: python scripts\compare_stride1_experiment.py --production-dir <ml\data> --experiment-dir <experiment>   (read-only)')

    # ---- DRY RUN ends here ------------------------------------------------------------------
    if ($DryRun) {
        if (-not (Get-Command robocopy -ErrorAction SilentlyContinue)) { Stop-Run 'robocopy not found on PATH' }
        $cmp = Get-PyOutput @($ComparePy, '--help')
        if ($cmp.Code -ne 0) { Stop-Run ("compare script failed to start: " + ($cmp.Lines -join ' | ')) }
        # exercise the environment-variable isolation exactly as the real run will, without creating anything
        $env:OCEANEMBED_DATA_DIR = $ExpDir
        $seen = Test-ConfigDataDir $ExpDir
        Write-Host ('ml.config.DATA_DIR under the experiment variable: ' + $seen + '   OK')
        Write-Host ''
        Write-Host 'DRY RUN OK - nothing was copied, downloaded, trained or written to ml\data.' -ForegroundColor Green
        Write-Host 'Start the real experiment with:   .\scripts\run_stride1_experiment.ps1' -ForegroundColor Green
        return
    }

    # ---- 6. production fingerprints, backup, verification ----------------------------------
    $prodFiles = @('models\cnn-unet-v1\model.pt', 'models\cnn-unet-nosss-v1\model.pt', 'outputs\model_registry.json')
    $prodHashBefore = @{}
    foreach ($f in $prodFiles) { $prodHashBefore[$f] = (Get-FileHash -LiteralPath (J $DataDir $f) -Algorithm SHA256).Hash }

    if (-not $Resume) {
        $script:State.Stage = 'backup'
        Write-Host ''; Write-Host "--- backup -> $BackupDir ---"
        New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
        foreach ($d in 'models', 'outputs', 'processed') {
            $src = Join-Path $DataDir $d; $dst = Join-Path $BackupDir $d
            $script:State.Log = Join-Path $BackupDir "robocopy_$d.log"
            Write-Host "copying $d ..."
            & robocopy $src $dst /E /COPY:DAT /DCOPY:DAT /R:1 /W:1 /NFL /NDL /NP "/LOG:$($script:State.Log)" | Out-Null
            $rc = [int]$LASTEXITCODE; $script:State.ExitCode = $rc
            if ($rc -ge 8) { Stop-Run "robocopy failed for $d (exit code $rc, codes 0-7 are success)" }
        }
        # verify: counts, bytes, hashes, loadable model
        $expect = @{ models = $sModels; outputs = $sOutputs; processed = $sProcessed }
        $manifest = [ordered]@{ created = (Get-Stamp); source = $DataDir; experiment = $ExpDir; dirs = [ordered]@{}; sha256 = [ordered]@{} }
        foreach ($d in 'models', 'outputs', 'processed') {
            $b = Get-DirStat (Join-Path $BackupDir $d)
            Write-Host ('backup {0,-9}: {1} files, {2}  (production: {3} files, {4})' -f $d, $b.Files, (Format-GB $b.Bytes), $expect[$d].Files, (Format-GB $expect[$d].Bytes))
            if ($b.Files -ne $expect[$d].Files -or $b.Bytes -ne $expect[$d].Bytes) { Stop-Run "backup verification failed for $d (file count or byte size differs from production)" }
            $manifest.dirs[$d] = [ordered]@{ files = $b.Files; bytes = $b.Bytes }
        }
        foreach ($f in $prodFiles) {
            $h = (Get-FileHash -LiteralPath (J $BackupDir $f) -Algorithm SHA256).Hash
            if ($h -ne $prodHashBefore[$f]) { Stop-Run "backup hash mismatch for $f" }
            $manifest.sha256[$f] = $h
        }
        Write-Host ('cnn-unet-v1/model.pt sha256 matches: ' + $prodHashBefore['models\cnn-unet-v1\model.pt'])
        $lm = Get-PyOutput @((Join-Path $Helpers 'check_model.py'), (J $BackupDir 'models\cnn-unet-v1\model.pt'))
        if ($lm.Code -ne 0) { Stop-Run ("the backed-up model could not be loaded by PyTorch: " + ($lm.Lines -join ' | ')) }
        Write-Host ('backed-up model   : ' + ($lm.Lines -join ' '))
        [System.IO.File]::WriteAllText((Join-Path $BackupDir 'backup_manifest.json'), ($manifest | ConvertTo-Json -Depth 5), (New-Object System.Text.UTF8Encoding($false)))

        # ---- 7/8. experiment directory, seeded with raw + processed only --------------------
        $script:State.Stage = 'seed experiment'
        Write-Host ''; Write-Host "--- experiment directory -> $ExpDir ---"
        New-Item -ItemType Directory -Force -Path $ExpRaw, $ExpProcessed, $LogDir | Out-Null
        $script:State.ExpDir = $ExpDir
        [System.IO.File]::WriteAllText((Join-Path $LogDir 'backup_dir.txt'), $BackupDir, (New-Object System.Text.UTF8Encoding($false)))
        $script:MasterLog = Join-Path $LogDir 'stages.log'
        Write-Log "$ExperimentName started; backup=$BackupDir"
        foreach ($pair in @(@('raw', $ProdRaw, $ExpRaw, $sRaw), @('processed', $ProdProcessed, $ExpProcessed, $sProcessed))) {
            $script:State.Log = Join-Path $LogDir ("seed_{0}.log" -f $pair[0])
            Write-Host ("seeding {0} ..." -f $pair[0])
            & robocopy $pair[1] $pair[2] /E /COPY:DAT /DCOPY:DAT /R:1 /W:1 /NFL /NDL /NP "/LOG:$($script:State.Log)" | Out-Null
            $rc = [int]$LASTEXITCODE; $script:State.ExitCode = $rc
            if ($rc -ge 8) { Stop-Run "robocopy failed while seeding $($pair[0]) (exit code $rc)" }
            $c = Get-DirStat $pair[2]
            if ($c.Files -ne $pair[3].Files -or $c.Bytes -ne $pair[3].Bytes) { Stop-Run "seeded $($pair[0]) does not match production (file count or bytes)" }
            Write-Log ("seeded {0}: {1} files, {2}" -f $pair[0], $c.Files, (Format-GB $c.Bytes))
        }
        # derived files of the OLD (stride-3) dataset must be regenerated, never reused
        foreach ($stale in 'target.zarr', 'static.zarr', 'climatology.zarr', 'norm_stats.json', 'assemble_summary.json') {
            $p = Join-Path $ExpProcessed $stale
            if (Test-Path -LiteralPath $p) {
                if (-not ((Normalize-Path $p).StartsWith((Normalize-Path $ExpDir)))) { Stop-Run "refusing to delete outside the experiment directory: $p" }
                Remove-Item -LiteralPath $p -Recurse -Force
            }
        }
        Write-Log 'removed stride-3 derived files from the EXPERIMENT copy so assemble must regenerate them'
        # production fingerprints for the end-of-run integrity check
        $fp = [ordered]@{ created = (Get-Stamp); sha256 = $prodHashBefore; dirs = [ordered]@{ models = $sModels; outputs = $sOutputs; processed = $sProcessed } }
        [System.IO.File]::WriteAllText((Join-Path $LogDir 'production_fingerprint.json'), ($fp | ConvertTo-Json -Depth 5), (New-Object System.Text.UTF8Encoding($false)))
    } else {
        $script:State.ExpDir = $ExpDir
        $script:MasterLog = Join-Path $LogDir 'stages.log'
        Write-Log "RESUME requested; backup=$BackupDir"
        $fpj = Read-Json (Join-Path $LogDir 'production_fingerprint.json')
        foreach ($f in $prodFiles) {
            if ($fpj.sha256.$f -ne $prodHashBefore[$f]) { Stop-Run "production file changed since the original run started: $f" }
        }
    }

    # ---- 9/10. point the whole pipeline at the experiment ------------------------------------
    $env:OCEANEMBED_DATA_DIR = $ExpDir
    $env:PYTHONUNBUFFERED = '1'
    $seen = Test-ConfigDataDir $ExpDir
    Write-Log "ml.config.DATA_DIR = $seen (verified to be the experiment directory)"

    function Assert-Isolation {
        if (-not (Test-Path Env:\OCEANEMBED_DATA_DIR) -or (Normalize-Path $env:OCEANEMBED_DATA_DIR) -ne (Normalize-Path $ExpDir)) {
            Stop-Run 'OCEANEMBED_DATA_DIR no longer points to the experiment directory'
        }
        $free = Get-FreeGB $ExpDir
        if ($free -lt $MinFreeGB) { Stop-Run ('free disk space {0:N1} GB is below the required {1} GB' -f $free, $MinFreeGB) }
        return $free
    }

    function Test-Rel([string]$Rel) {
        $p = J $ExpDir $Rel
        if ($Rel -match '[*?]') { return [bool](Get-ChildItem -Path $p -ErrorAction SilentlyContinue) }
        return (Test-Path -LiteralPath $p)
    }

    $AssembleProducts = @('processed\target.zarr', 'processed\static.zarr', 'processed\climatology.zarr', 'processed\norm_stats.json', 'processed\assemble_summary.json', 'processed\inputs.zarr')
    $ThreeModels = @('models\baseline-lightgbm-v1\depth_0.txt', 'models\cnn-unet-v1\model.pt', 'models\cnn-unet-nosss-v1\model.pt')
    $Predictions = @('outputs\predictions\cnn-unet-v1.zarr', 'outputs\predictions\cnn-unet-nosss-v1.zarr', 'outputs\predictions\baseline-lightgbm-v1.zarr')

    $Spec = @{
        target   = @{ Requires = @('processed\inputs.zarr', 'raw\target'); Produces = @() }
        assemble = @{ Requires = @('processed\inputs.zarr', 'raw\target'); Produces = @('processed\target.zarr', 'processed\static.zarr', 'processed\climatology.zarr', 'processed\norm_stats.json', 'processed\assemble_summary.json') }
        lgbm     = @{ Requires = $AssembleProducts; Produces = @('models\baseline-lightgbm-v1\depth_1000.txt', 'outputs\model_registry.json') }
        unet     = @{ Requires = $AssembleProducts; Produces = @('models\cnn-unet-v1\model.pt') }
        nosss    = @{ Requires = $AssembleProducts; Produces = @('models\cnn-unet-nosss-v1\model.pt') }
        evaluate = @{ Requires = ($AssembleProducts + $ThreeModels); Produces = @('outputs\metrics_grid.json') }
        precomp  = @{ Requires = ($AssembleProducts + $ThreeModels); Produces = ($Predictions + @('outputs\products\cnn-unet-v1.zarr', 'outputs\embeddings.json', 'outputs\region_timeseries.json')) }
        argo     = @{ Requires = ($Predictions + @('processed\argo_profiles.parquet', 'processed\static.zarr', 'processed\climatology.zarr', 'processed\target.zarr')); Produces = @('outputs\metrics_argo.json', 'outputs\argo_predictions.parquet') }
        calib    = @{ Requires = @('outputs\argo_predictions.parquet', 'outputs\metrics_argo.json', 'processed\argo_profiles.parquet'); Produces = @('outputs\uncertainty_calibration.json') }
        en4      = @{ Requires = ($Predictions + @('raw\en4\EN.4.2.2.analyses.g10.2022.zip', 'raw\en4\EN.4.2.2.analyses.g10.2023.zip', 'processed\climatology.zarr', 'processed\static.zarr')); Produces = @('outputs\metrics_en4.json') }
    }

    # stage-specific gates, run after the command succeeded and before the stage counts as done
    $Gates = @{
        target = {
            $tl = Join-Path $LogDir 'target.log'
            $line = Select-String -LiteralPath $tl -Pattern 'target done: (\d+)/(\d+) days cached' | Select-Object -Last 1
            if (-not $line) { Stop-Run 'GATE: target log has no "target done: X/Y days cached" line - the download did not finish cleanly' }
            $x = [int]$line.Matches[0].Groups[1].Value; $y = [int]$line.Matches[0].Groups[2].Value
            Write-Log "GATE target: pipeline reports $x/$y days cached (script expects $ExpectedDays)"
            if ($x -ne $ExpectedDays -or $y -ne $ExpectedDays) { Stop-Run "GATE: target download incomplete or expected-day count differs ($x/$y vs $ExpectedDays). Inspect target.log; do not continue." }
            $gl = Join-Path $LogDir 'gate_target.log'
            $g = Get-PyOutput @((Join-Path $Helpers 'gate_target.py'), [string]$ExpectedDays, $TargetDatasetId)
            Set-Content -LiteralPath $gl -Value $g.Lines
            foreach ($l in $g.Lines) { Write-Log ("GATE target: " + $l) }
            if ($g.Code -ne 0) { Stop-Run "GATE: on-disk target verification failed (see $gl)" }
        }
        assemble = {
            $sum = Read-Json (Join-Path $ExpProcessed 'assemble_summary.json')
            Write-Log ("GATE assemble: target_days={0}; split_counts={1}" -f $sum.target_days, ($sum.split_counts | ConvertTo-Json -Compress))
            if ([int]$sum.target_days -ne $ExpectedDays) { Stop-Run "GATE: assemble used $($sum.target_days) target days, expected $ExpectedDays (inputs missing some days?). Inspect; do not continue." }
        }
        en4 = {
            $j = Read-Json (J $ExpDir 'outputs\metrics_en4.json')
            $names = @($j.splits.PSObject.Properties | ForEach-Object { $_.Name })
            if (($names -notcontains 'val') -or ($names -notcontains 'test')) { Stop-Run "GATE: metrics_en4.json lacks val/test splits (EN4 files missing or unreadable): $($names -join ',')" }
        }
    }

    # ---- 11/12. stage runner -----------------------------------------------------------------
    $StageNames = @($Stages | ForEach-Object { $_.Name })
    function Invoke-Stage([hashtable]$Def, [int]$Index) {
        $name = $Def.Name
        $done = Join-Path $LogDir "$name.done"
        $script:State.Stage = $name
        $script:State.Log = Join-Path $LogDir "$name.log"
        $script:State.ExitCode = '(not started)'
        if ($Resume -and (Test-Path -LiteralPath $done)) { Write-Log ("SKIP {0} (already complete: {1})" -f $name, (Get-Content -LiteralPath $done -Raw).Trim()); return }
        if ($Index -gt 0) {
            $prev = $StageNames[$Index - 1]
            if (-not (Test-Path -LiteralPath (Join-Path $LogDir "$prev.done"))) { Stop-Run "previous stage '$prev' has not completed successfully" }
        }
        $free = Assert-Isolation
        foreach ($r in $Spec[$name].Requires) {
            if (-not (Test-Rel $r)) { Stop-Run "stage '$name' requires '$r' but it does not exist in the experiment directory" }
        }
        $t0 = Get-Date
        Write-Log ("START {0}  free_disk={1:N1}GB  cmd: {2}" -f $name, $free, $Def.Cmd)
        $rc = Invoke-Shell $Def.Cmd $script:State.Log -Echo
        $script:State.ExitCode = $rc
        $elapsed = (Get-Date) - $t0
        Write-Log ("END   {0}  exit_code={1}  elapsed={2}" -f $name, $rc, (Format-Span $elapsed))
        if ($rc -ne 0) { Stop-Run "stage '$name' exited with code $rc" }
        foreach ($p in $Spec[$name].Produces) {
            if (-not (Test-Rel $p)) { Stop-Run "stage '$name' finished but the expected output '$p' is missing" }
        }
        if ($Gates.ContainsKey($name)) { & $Gates[$name] }
        [System.IO.File]::WriteAllText($done, ("{0} exit=0 elapsed={1}" -f (Get-Stamp), (Format-Span $elapsed)))
        $script:StageRecords.Add([pscustomobject]@{ Stage = $name; Command = $Def.Cmd; Start = $t0; End = (Get-Date); Elapsed = $elapsed; ExitCode = $rc })
    }

    Write-Host ''; Write-Host '--- running stages ---'
    for ($k = 0; $k -lt $Stages.Count; $k++) { Invoke-Stage $Stages[$k] $k }

    # ---- completion: integrity check, reports ------------------------------------------------
    $script:State.Stage = 'completion'
    Write-Log 'all stages finished; verifying production artifacts are unchanged'
    $prodChanged = @()
    foreach ($f in $prodFiles) {
        $h = (Get-FileHash -LiteralPath (J $DataDir $f) -Algorithm SHA256).Hash
        if ($h -ne $prodHashBefore[$f]) { $prodChanged += $f }
    }
    foreach ($pair in @(@('models', $sModels), @('outputs', $sOutputs), @('processed', $sProcessed))) {
        $c = Get-DirStat (Join-Path $DataDir $pair[0])
        if ($c.Files -ne $pair[1].Files -or $c.Bytes -ne $pair[1].Bytes) { $prodChanged += ("ml\data\{0} (files/bytes differ)" -f $pair[0]) }
    }
    $integrity = if ($prodChanged.Count -eq 0) { 'production artifacts UNCHANGED (hashes, file counts and sizes match the pre-run fingerprint)' } else { 'PRODUCTION CHANGED DURING THE RUN: ' + ($prodChanged -join '; ') }
    Write-Log $integrity

    try {
        $pyVerNow = (Get-PyOutput @('--version')).Lines -join ' '
    # stage table from the completion markers, so a resumed run still reports every stage
    $StageRows = @()
    foreach ($st in $Stages) {
        $mk = Join-Path $LogDir ($st.Name + '.done')
        $txt = if (Test-Path -LiteralPath $mk) { (Get-Content -LiteralPath $mk -Raw).Trim() } else { 'not completed' }
        $fin = if ($txt -match '^(\S+)') { $Matches[1] } else { 'n/a' }
        $ela = if ($txt -match 'elapsed=(\S+)') { $Matches[1] } else { 'n/a' }
        $StageRows += [pscustomobject]@{ Stage = $st.Name; Command = $st.Cmd; Finished = $fin; Elapsed = $ela }
    }
    $firstLine = Get-Content -LiteralPath $script:MasterLog -TotalCount 1
    $ExpStart = if ($firstLine -match '^\[([^\]]+)\]') { $Matches[1] } else { $RunStart.ToString('yyyy-MM-ddTHH:mm:ss') }
        $sum = Read-Json (Join-Path $ExpProcessed 'assemble_summary.json')
        $norm = Read-Json (Join-Path $ExpProcessed 'norm_stats.json')
        $reg = Read-Json (J $ExpDir 'outputs\model_registry.json')
        $runEnd = Get-Date
        $utf8 = New-Object System.Text.UTF8Encoding($false)

        $complete = New-Object System.Collections.Generic.List[string]
        $complete.Add("$ExperimentName - COMPLETE")
        $complete.Add("started : $ExpStart  (first entry of logs\stages.log)")
        $complete.Add("finished: " + $runEnd.ToString('yyyy-MM-ddTHH:mm:ss'))
        $complete.Add("python  : $pyVerNow")
        $complete.Add('')
        $complete.Add('experiment location      : ' + $ExpDir)
        $complete.Add('production artifacts     : ' + $DataDir + '  (models, outputs, processed - read-only for this run)')
        $complete.Add('backup of production     : ' + $BackupDir)
        $complete.Add('integrity                : ' + $integrity)
        $complete.Add('')
        $complete.Add('commands and timings:')
        foreach ($r in $StageRows) { $complete.Add(('  {0,-9} {1}   finished {2}  elapsed {3}  exit 0' -f $r.Stage, $r.Command, $r.Finished, $r.Elapsed)) }
        $complete.Add('')
        $complete.Add('dataset:')
        $complete.Add('  target source       : ' + (Get-Prop $sum 'target_source'))
        $complete.Add('  target days         : ' + (Get-Prop $sum 'target_days'))
        $complete.Add('  split counts        : ' + ((Get-Prop $sum 'split_counts' $null) | ConvertTo-Json -Compress))
        $complete.Add('  training days (norm): ' + (Get-Prop $norm 'train_days'))
        $complete.Add('  ocean cells surface : ' + (Get-Prop $sum 'ocean_cells_surface') + ' ; at 1000 m: ' + (Get-Prop $sum 'ocean_cells_1000m'))
        $complete.Add('models (experiment registry):')
        foreach ($m in $reg) {
            $e = Get-Prop $m 'epochs'
            $v = Get-Prop $m 'best_val_rmse_c'
            $complete.Add(('  {0}  {1}  epochs={2}  best_val_rmse_c={3}  created={4}' -f (Get-Prop $m 'name'), (Get-Prop $m 'architecture'), $e, $v, (Get-Prop $m 'created_at')))
        }
        [System.IO.File]::WriteAllText((Join-Path $ExpDir 'EXPERIMENT_COMPLETE.txt'), (($complete -join [Environment]::NewLine) + [Environment]::NewLine), $utf8)

        $md = New-Object System.Collections.Generic.List[string]
        $md.Add("# $ExperimentName")
        $md.Add('')
        $md.Add('**Status:** run finished. This file records facts only; it makes no judgement about whether the new model is better.')
        $md.Add('')
        $md.Add(('- Started `{0}` (first entry of logs/stages.log), finished `{1}`' -f $ExpStart, $runEnd.ToString('yyyy-MM-dd HH:mm:ss')))
        $md.Add('- Experiment directory: `' + $ExpDir + '`')
        $md.Add('- Production artifacts (untouched): `' + $DataDir + '`; backup: `' + $BackupDir + '`')
        $md.Add('- Integrity: ' + $integrity)
        $md.Add('- Python: ' + $pyVerNow)
        $md.Add('')
        $md.Add('## Design')
        $md.Add('Same sources, split (train 2019-21 / validate 2022 / test 2023), architectures, hyperparameters and seeds as production. Only the density of the HYCOM target changes: every day (1826) instead of every 3rd day plus May-June 2023 (637).')
        $md.Add('')
        $md.Add('## Dataset')
        $md.Add('| item | value |'); $md.Add('|---|---|')
        $md.Add('| target source | ' + (Get-Prop $sum 'target_source') + ' |')
        $md.Add('| target days | ' + (Get-Prop $sum 'target_days') + ' |')
        $md.Add('| split counts | ' + ((Get-Prop $sum 'split_counts' $null) | ConvertTo-Json -Compress) + ' |')
        $md.Add('| training days used for normalisation/climatology | ' + (Get-Prop $norm 'train_days') + ' |')
        $md.Add('')
        $md.Add('## Stages')
        $md.Add('| stage | command | finished | elapsed |'); $md.Add('|---|---|---|---|')
        foreach ($r in $StageRows) { $md.Add(('| {0} | `{1}` | {2} | {3} |' -f $r.Stage, $r.Command, $r.Finished, $r.Elapsed)) }
        $md.Add('')
        $md.Add('## Models trained (experiment registry)')
        $md.Add('| model | epochs | best validation RMSE (deg C, mean over depths, vs HYCOM target, experiment validation days) |'); $md.Add('|---|---|---|')
        foreach ($m in $reg) {
            $e = Get-Prop $m 'epochs'
            $v = Get-Prop $m 'best_val_rmse_c'
            if ($v -ne 'n/a') { $v = '{0:N4}' -f [double]$v }
            $md.Add("| $(Get-Prop $m 'name') | $e | $v |")
        }
        $md.Add('')
        $md.Add('Validation RMSE above is computed on a different set of validation days than production (stride 1 has more), so it is not directly comparable with production figures.')
        $md.Add('')
        $md.Add('## Artifacts')
        foreach ($f in 'outputs\metrics_grid.json', 'outputs\metrics_argo.json', 'outputs\metrics_en4.json', 'outputs\uncertainty_calibration.json', 'outputs\model_registry.json') {
            $fi = Get-Item -LiteralPath (J $ExpDir $f) -ErrorAction SilentlyContinue
            $md.Add('- `' + $f + '`' + $(if ($fi) { ' (' + [math]::Round($fi.Length / 1KB, 1) + ' KB)' } else { ' (missing)' }))
        }
        $md.Add('')
        $md.Add('## Next')
        $md.Add('`stride1_vs_production.md` and `PROMOTION_RECOMMENDATION.md` (evidence only) are produced by `scripts/compare_stride1_experiment.py`. Production promotion requires explicit approval.')
        [System.IO.File]::WriteAllText((Join-Path $ExpDir 'EXPERIMENT_SUMMARY.md'), (($md -join [Environment]::NewLine) + [Environment]::NewLine), $utf8)
        Write-Log 'wrote EXPERIMENT_COMPLETE.txt and EXPERIMENT_SUMMARY.md'
    } catch {
        Write-Log ('could not write the completion reports: ' + $_.Exception.Message + ' - the experiment itself finished; stage markers are in logs\') 'WARN'
    }

    # ---- post step: read-only comparison (non-fatal; the variable is cleared so it cannot be used) ----
    if ($OriginalDataDirSet) { $env:OCEANEMBED_DATA_DIR = $OriginalDataDir } else { Remove-Item Env:\OCEANEMBED_DATA_DIR -ErrorAction SilentlyContinue }
    $cmpLog = Join-Path $LogDir 'compare.log'
    Write-Log 'running scripts\compare_stride1_experiment.py (read-only) ...'
    $cmpRun = Get-PyOutput @($ComparePy, '--production-dir', $DataDir, '--experiment-dir', $ExpDir)
    Set-Content -LiteralPath $cmpLog -Value $cmpRun.Lines
    foreach ($l in $cmpRun.Lines) { Write-Host $l }
    if ($cmpRun.Code -ne 0) { Write-Log "comparison script exited with code $($cmpRun.Code) (see $cmpLog). The experiment itself is complete; re-run the comparison manually." 'WARN' }
    else { Write-Log 'wrote stride1_vs_production.md and PROMOTION_RECOMMENDATION.md' }

    Write-Host ''
    Write-Host ('EXPERIMENT COMPLETE. Nothing was promoted.') -ForegroundColor Green
    Write-Host ('  results : ' + $ExpDir)
    Write-Host '  review  : stride1_vs_production.md, PROMOTION_RECOMMENDATION.md'
    Write-Host '  Production promotion requires explicit approval.'
    if ($prodChanged.Count -gt 0) { Write-Host ('WARNING: ' + $integrity) -ForegroundColor Red; exit 3 }
}
catch [StopRun] {
    Write-FailureBlock $_.Exception.Message
    exit 1
}
catch {
    Write-FailureBlock ("unexpected error: " + $_.Exception.Message + ' at ' + $_.InvocationInfo.PositionMessage)
    exit 1
}
finally {
    # the variable must never stay pointed at the experiment after this script ends
    if ($OriginalDataDirSet) { $env:OCEANEMBED_DATA_DIR = $OriginalDataDir }
    else { Remove-Item Env:\OCEANEMBED_DATA_DIR -ErrorAction SilentlyContinue }
    if ($null -ne $OriginalUnbuffered) { $env:PYTHONUNBUFFERED = $OriginalUnbuffered }
    else { Remove-Item Env:\PYTHONUNBUFFERED -ErrorAction SilentlyContinue }
}
