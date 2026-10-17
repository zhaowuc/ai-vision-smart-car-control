"""Read-only integrity tests. Run after build.py; Python 3.10+ standard library."""
from html.parser import HTMLParser
from pathlib import Path
import gzip
import hashlib
import json
import re
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ['onboarding.js', 'core.js', 'session-core.js', 'session-ui.js', 'app.js']
CHUNKS = [f'app-{i:02}.bin' for i in range(1, 9)]


def digest(data):
    return hashlib.sha256(data).hexdigest()


class Resources(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.scripts, self.styles, self.current = [], [], None

    def handle_starttag(self, tag, attrs):
        if tag == 'script':
            self.current = {'attrs': dict(attrs), 'text': ''}
            self.scripts.append(self.current)
        elif tag == 'style':
            self.current = {'attrs': dict(attrs), 'text': ''}
            self.styles.append(self.current)

    def handle_endtag(self, tag):
        if tag in ('script', 'style'):
            self.current = None

    def handle_data(self, data):
        if self.current is not None:
            self.current['text'] += data


class PackageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.raw = (ROOT / 'SensLab-Personal.html').read_bytes()
        cls.packed = (ROOT / 'app.html.gz').read_bytes()
        cls.parts = [(ROOT / name).read_bytes() for name in CHUNKS]
        cls.loader = (ROOT / 'index.html').read_text(encoding='utf-8')
        cls.restore = (ROOT / 'restore.py').read_text(encoding='utf-8')

    def test_source_inline_matches_complete_html(self):
        html = (ROOT / 'src/index.html').read_text(encoding='utf-8')
        tag = '<link rel="stylesheet" href="styles.css">'
        self.assertEqual(html.count(tag), 1)
        html = html.replace(tag, '<style>\n' + (ROOT / 'src/styles.css').read_text(encoding='utf-8') + '\n</style>')
        for name in SCRIPTS:
            tag = f'<script src="{name}"></script>'
            self.assertEqual(html.count(tag), 1, name)
            html = html.replace(tag, '<script>\n' + (ROOT / 'src' / name).read_text(encoding='utf-8') + '\n</script>')
        self.assertEqual(html.encode('utf-8'), self.raw, 'Standalone HTML is stale; rebuild from current src/')

    def test_transport_is_exact_offline_application(self):
        self.assertEqual(b''.join(self.parts), self.packed)
        self.assertEqual(gzip.decompress(self.packed), self.raw)

    def test_every_online_offline_script_matches_source_bytes_and_order(self):
        offline, online = Resources(), Resources()
        offline.feed(self.raw.decode('utf-8'))
        online.feed(gzip.decompress(b''.join(self.parts)).decode('utf-8'))
        self.assertEqual(online.scripts, offline.scripts)
        self.assertEqual(online.styles, offline.styles)
        self.assertEqual(len(offline.scripts), len(SCRIPTS))
        self.assertEqual(len(offline.styles), 1)
        for block, name in zip(offline.scripts, SCRIPTS):
            with self.subTest(script=name):
                self.assertNotIn('src', block['attrs'])
                self.assertEqual(block['text'], '\n' + (ROOT / 'src' / name).read_text(encoding='utf-8') + '\n')
        self.assertEqual(offline.styles[0]['text'], '\n' + (ROOT / 'src/styles.css').read_text(encoding='utf-8') + '\n')

    def test_loader_and_restore_pin_final_html_hash(self):
        self.assertEqual(re.findall(r"const expected='([0-9a-f]{64})'", self.loader), [digest(self.raw)])
        self.assertEqual(re.findall(r"EXPECTED_HTML_SHA256 = '([0-9a-f]{64})'", self.restore), [digest(self.raw)])
        self.assertNotRegex(self.loader, r'<script\b[^>]*\bsrc\s*=')
        for historical in ('SensLabUpgradeV102', 'upgrade-v102.js', 'ux.js'):
            self.assertNotIn(historical, self.loader)

    def test_manifest_matches_all_chunks(self):
        manifest = json.loads((ROOT / 'transport-manifest.json').read_text(encoding='utf-8'))
        self.assertEqual([entry['file'] for entry in manifest], CHUNKS)
        for entry, part in zip(manifest, self.parts):
            with self.subTest(file=entry['file']):
                self.assertEqual(entry['bytes'], len(part))
                self.assertEqual(entry['sha256'], digest(part))
                blob = hashlib.sha1(f'blob {len(part)}\0'.encode('ascii') + part).hexdigest()
                self.assertEqual(entry.get('git_blob_sha', entry.get('sha')), blob)

    def test_sha256sums_cover_all_generated_artifacts(self):
        entries = [line.split() for line in (ROOT / 'SHA256SUMS.txt').read_text(encoding='ascii').splitlines() if line.strip()]
        expected = set(CHUNKS + ['SensLab-Personal.html', 'app.html.gz', 'index.html', 'restore.py', 'deployment.json', 'transport-manifest.json'])
        self.assertEqual(len(entries), len(expected))
        self.assertEqual({name for _, name in entries}, expected)
        for checksum, name in entries:
            with self.subTest(file=name):
                self.assertEqual(checksum, digest((ROOT / name).read_bytes()))

    def test_deployment_is_current_and_explicitly_local(self):
        data = json.loads((ROOT / 'deployment.json').read_text(encoding='utf-8'))
        self.assertEqual(data['version'], '1.1.0')
        self.assertEqual(data['html_sha256'], digest(self.raw))
        self.assertEqual(data['gzip_sha256'], digest(self.packed))
        self.assertEqual(data['build_status'], 'local-only')
        self.assertEqual(data['publication_status'], 'not published by this build')

    def test_restore_writes_same_final_html(self):
        with tempfile.TemporaryDirectory(prefix='senslab-restore-') as folder:
            output = Path(folder) / 'restored.html'
            run = subprocess.run([sys.executable, str(ROOT / 'restore.py'), '--output', str(output)], capture_output=True, text=True, encoding='utf-8')
            self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
            self.assertEqual(output.read_bytes(), self.raw)

    def test_restore_rejects_tampered_valid_gzip_without_writing(self):
        with tempfile.TemporaryDirectory(prefix='senslab-tamper-') as folder:
            target = Path(folder)
            (target / 'restore.py').write_text(self.restore, encoding='utf-8')
            altered = gzip.compress(self.raw + b'\n<!-- tampered -->', mtime=0)
            for i, name in enumerate(CHUNKS):
                (target / name).write_bytes(altered[len(altered)*i//8:len(altered)*(i+1)//8])
            output = target / 'restored.html'
            run = subprocess.run([sys.executable, str(target / 'restore.py'), '--output', str(output)], capture_output=True, text=True, encoding='utf-8')
            self.assertNotEqual(run.returncode, 0)
            self.assertIn('Integrity check failed', run.stderr)
            self.assertFalse(output.exists())


if __name__ == '__main__':
    unittest.main(verbosity=2)
