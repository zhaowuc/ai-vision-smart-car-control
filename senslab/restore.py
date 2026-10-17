"""Restore the complete, editable, offline HTML from transport pieces."""
from pathlib import Path
import gzip
import hashlib

root = Path(__file__).resolve().parent
expected = '052589b7c129e767245e6849d12f18345b21b6eb94f3279836f304f6aa75e6c2'
try:
    packed = b''.join((root / f'app-{i:02}.bin').read_bytes() for i in range(1, 9))
    html = gzip.decompress(packed)
    if hashlib.sha256(html).hexdigest() != expected:
        raise ValueError('Integrity check failed; refusing to write the application.')
    output = root / 'SensLab-Personal.html'
    if output.exists():
        raise FileExistsError('SensLab-Personal.html already exists; move it before restoring.')
    output.write_bytes(html)
    print(f'Restored and verified {output.name}: {len(html)} bytes.')
except (OSError, ValueError, EOFError) as exc:
    raise SystemExit(f'Restore failed: {exc}')
