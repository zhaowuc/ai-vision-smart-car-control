"""Restore the complete final application, refusing any failed integrity check."""
from pathlib import Path
import argparse
import gzip
import hashlib

ROOT = Path(__file__).resolve().parent
EXPECTED_HTML_SHA256 = '2cbe8af95ea48272fd66bc7b790fc61a7a39a8223b7c9e62b2aa941ca75d5d55'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'SensLab-Personal.html')
    args = parser.parse_args()
    try:
        packed = b''.join((ROOT / f'app-{i:02}.bin').read_bytes() for i in range(1, 9))
        html = gzip.decompress(packed)
        if hashlib.sha256(html).hexdigest() != EXPECTED_HTML_SHA256:
            raise ValueError('Integrity check failed; refusing to write the application.')
        html.decode('utf-8', errors='strict')
        output = args.output.resolve()
        if output.exists():
            if output.read_bytes() == html:
                print(f'Existing {output.name} is already the verified final application.')
                return
            raise FileExistsError('Output exists with different content; choose another --output path.')
        output.write_bytes(html)
        print(f'Restored and verified {output}: {len(html):,} bytes.')
        print('No runtime patch scripts are needed.')
    except (OSError, ValueError, EOFError) as exc:
        raise SystemExit(f'Restore failed: {exc}')


if __name__ == '__main__':
    main()
