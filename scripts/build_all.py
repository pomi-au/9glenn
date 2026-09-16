"""Rebuild both renderers and delivered artifacts from the shared authoring data."""
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
commands = [
    [sys.executable, 'scripts/build_drawings.py'],
    ['npm', 'run', 'build:3d'],
    ['node', 'scripts/check_roof_assembly.mjs'],
    ['node', 'scripts/check_cornices.mjs'],
    [sys.executable, 'scripts/validate.py'],
    [sys.executable, 'scripts/check_doors.py'],
    [sys.executable, 'scripts/build_comparison.py'],
    [sys.executable, 'scripts/build_door_audit.py'],
    [sys.executable, 'scripts/build_roof_audit.py'],
    [sys.executable, 'audit/service-walls/build_report.py'],
    [sys.executable, 'scripts/package.py'],
]
for command in commands:
    subprocess.run(command, cwd=ROOT, check=True)
