"""Build one verified application for online and offline delivery; never publish."""
from pathlib import Path
import gzip
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parent
SRC = ROOT / 'src'
VERSION = '1.2.0'
REQUIRED_SCRIPTS = ['onboarding.js', 'core.js', 'session-core.js', 'session-ui.js', 'app.js']
CHUNK_NAMES = [f'app-{i:02}.bin' for i in range(1, 9)]


def read_resource(name):
    if not name or '?' in name or '#' in name or ':' in name:
        raise ValueError(f'Only plain relative source paths are supported: {name!r}')
    path = (SRC / name).resolve()
    if not path.is_relative_to(SRC.resolve()):
        raise ValueError(f'Source path escapes src/: {name!r}')
    return path.read_text(encoding='utf-8')


def build_html():
    html = (SRC / 'index.html').read_text(encoding='utf-8')
    css_files, scripts = [], []

    def inline_style(match):
        tag = match.group(0)
        href = re.search(r'\bhref\s*=\s*[\'"]([^\'"]+)[\'"]', tag, re.I)
        if not href:
            raise ValueError('Stylesheet link is missing its href')
        name = href.group(1)
        css = read_resource(name)
        if '</style' in css.lower():
            raise ValueError(f'Unsafe style terminator in {name}')
        css_files.append(name)
        return '<style>\n' + css + '\n</style>'

    def inline_script(match):
        attrs = match.group(1)
        src = re.search(r'\bsrc\s*=\s*[\'"]([^\'"]+)[\'"]', attrs, re.I)
        if not src:
            return match.group(0)
        name = src.group(1)
        if re.search(r'\b(?:async|defer|type)\b', attrs, re.I):
            raise ValueError(f'External script execution attributes require review: {name}')
        code = read_resource(name)
        if '</script' in code.lower():
            raise ValueError(f'Unsafe script terminator in {name}')
        scripts.append(name)
        return '<script>\n' + code + '\n</script>'

    html = re.sub(r'<link\b(?=[^>]*\brel\s*=\s*[\'"]stylesheet[\'"])[^>]*>', inline_style, html, flags=re.I)
    html = re.sub(r'<script\b([^>]*)>\s*</script\s*>', inline_script, html, flags=re.I)
    if css_files != ['styles.css']:
        raise ValueError(f'Expected exactly styles.css; found {css_files!r}')
    if scripts != REQUIRED_SCRIPTS:
        raise ValueError(f'Unexpected source script order: {scripts!r}')
    if re.search(r'<script\b[^>]*\bsrc\s*=', html, re.I):
        raise ValueError('Unresolved external script in standalone HTML')
    return html.encode('utf-8')


def main():
    raw = build_html()
    packed = gzip.compress(raw, compresslevel=9, mtime=0)
    digest = hashlib.sha256(raw).hexdigest()
    packed_blob = hashlib.sha1(f'blob {len(packed)}\0'.encode('ascii') + packed).hexdigest()
    loader = (ROOT / 'index.html').read_text(encoding='utf-8')
    loader = re.sub(r'<title>SensLab Personal[^<]*</title>', f'<title>SensLab Personal {VERSION} · 120分钟深度实验</title>', loader)
    loader = re.sub(r'PERSONAL AIM RESEARCH / [0-9.]+', f'PERSONAL AIM RESEARCH / {VERSION}', loader)
    loader, count = re.subn(r"const expected='[0-9a-f]{64}'", f"const expected='{digest}'", loader)
    if count != 1:
        raise ValueError('Expected one integrity hash in index.html')
    loader, count = re.subn(r"const packedBlob='[0-9a-f]{40}'", f"const packedBlob='{packed_blob}'", loader)
    if count != 1:
        raise ValueError('Expected one packed Git blob hash in index.html')
    if 'upgrade-v102.js' in loader or 'ux.js' in loader or 'SensLabUpgradeV102' in loader:
        raise ValueError('Loader must not apply historical runtime patches')
    restore = (ROOT / 'restore.py').read_text(encoding='utf-8')
    restore, count = re.subn(r"EXPECTED_HTML_SHA256 = '[0-9a-f]{64}'", f"EXPECTED_HTML_SHA256 = '{digest}'", restore)
    if count != 1:
        raise ValueError('Expected one integrity hash in restore.py')
    artifacts = {'SensLab-Personal.html': raw, 'app.html.gz': packed,
                 'index.html': loader.encode('utf-8'), 'restore.py': restore.encode('utf-8')}
    manifest = []
    for i, name in enumerate(CHUNK_NAMES):
        chunk = packed[len(packed) * i // 8:len(packed) * (i + 1) // 8]
        artifacts[name] = chunk
        manifest.append({'file': name, 'bytes': len(chunk),
                         'sha256': hashlib.sha256(chunk).hexdigest(),
                         'git_blob_sha': hashlib.sha1(f'blob {len(chunk)}\0'.encode('ascii') + chunk).hexdigest()})
    artifacts['transport-manifest.json'] = (json.dumps({'version': VERSION, 'html_sha256': digest,
        'gzip_git_blob_sha': packed_blob, 'chunks': manifest}, indent=2) + '\n').encode('utf-8')
    deployment = {
        'version': VERSION, 'build_status': 'local-only',
        'publication_status': 'not published by this build',
        'online_verification': 'not verified by build; no public deployment claimed',
        'html_sha256': digest, 'gzip_sha256': hashlib.sha256(packed).hexdigest(),
        'gzip_git_blob_sha': packed_blob,
        'source': {'repo': 'zhaowuc/ai-vision-smart-car-control',
                   'branch': 'senslab-personal-20261017',
                   'base_commit': '86f29a743e5656c4e4c1d437e26d115b635da4d3',
                   'note': 'Original repository state; local changes are not represented by this commit.'},
    }
    artifacts['deployment.json'] = (json.dumps(deployment, indent=2) + '\n').encode('utf-8')
    sums = ''.join(f'{hashlib.sha256(content).hexdigest()}  {name}\n' for name, content in sorted(artifacts.items()))
    artifacts['SHA256SUMS.txt'] = sums.encode('ascii')
    for name, content in artifacts.items():
        (ROOT / name).write_bytes(content)
    print(f'Built SensLab Personal {VERSION} locally: {len(raw):,} HTML bytes, {len(packed):,} gzip bytes, 8 pieces.')
    print(f'HTML SHA-256: {digest}')
    print('No repository push or website publication was performed.')


if __name__ == '__main__':
    main()
