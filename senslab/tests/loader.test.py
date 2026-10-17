"""Real localhost loader checks with native fetch/gzip/WebCrypto, no mouse claims.

Requires Playwright and its Chromium. CHROMIUM_EXECUTABLE_PATH can select an
installed Chromium browser. Browser storage is isolated from the user's profile.
"""
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from urllib.parse import urlsplit
import gzip
import os
import re
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
RAW = (ROOT / 'SensLab-Personal.html').read_bytes()
LOADER = (ROOT / 'index.html').read_bytes()
SCRIPTS = re.findall(r'<script>([\s\S]*?)</script>', RAW.decode('utf-8'), re.I)


@contextmanager
def server():
    files = {'/index.html': LOADER, '/SensLab-Personal.html': RAW}
    files.update({f'/app-{i:02}.bin': (ROOT / f'app-{i:02}.bin').read_bytes() for i in range(1, 9)})
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            name = urlsplit(self.path).path
            content = files.get(name)
            self.send_response(200 if content is not None else 404)
            self.send_header('Content-Type', 'text/html; charset=utf-8' if name.endswith('.html') else 'application/octet-stream')
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            if content is not None:
                self.wfile.write(content)

        def log_message(self, *_args):
            pass

    httpd = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    thread = Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    try:
        yield f'http://127.0.0.1:{httpd.server_address[1]}', files
    finally:
        httpd.shutdown()
        httpd.server_close()
        thread.join(timeout=5)


with server() as (base, files), sync_playwright() as playwright:
    options = {'headless': True}
    if os.environ.get('CHROMIUM_EXECUTABLE_PATH'):
        options['executable_path'] = str(Path(os.environ['CHROMIUM_EXECUTABLE_PATH']).expanduser())
    browser = playwright.chromium.launch(**options)
    context = browser.new_context(viewport={'width': 1440, 'height': 1000})
    errors, requested = [], []
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('request', lambda request: requested.append(urlsplit(request.url).path))
    page.goto(base + '/index.html')
    page.wait_for_function('expected => document.scripts.length === expected && Array.from(document.scripts).every(s => !s.src)', arg=len(SCRIPTS))
    assert page.evaluate('Array.from(document.scripts,s=>s.textContent)') == SCRIPTS
    assert not errors, errors
    online_title = page.title()
    assert all('/app-' + str(i).zfill(2) + '.bin' in requested for i in range(1, 9))
    assert not any(path.endswith(('ux.js', 'upgrade-v102.js')) for path in requested)
    print('PASS localhost native fetch, gzip and SHA-256 load the final application without runtime patch requests.')

    page.goto(base + '/SensLab-Personal.html')
    assert page.evaluate('Array.from(document.scripts,s=>s.textContent)') == SCRIPTS
    assert page.title() == online_title
    assert not errors, errors
    print('PASS online and standalone routes execute exactly the same ordered script bytes.')

    saved = files.pop('/app-04.bin')
    page.goto(base + '/index.html')
    page.locator('#retry').wait_for(state='visible')
    assert 'HTTP 404' in page.locator('#error').inner_text()
    assert page.evaluate('document.scripts.length') == 1
    files['/app-04.bin'] = saved
    print('PASS a missing fragment fails closed without executing application scripts.')

    altered = gzip.compress(RAW + b'\n<!-- deliberate test-only alteration -->', mtime=0)
    for i in range(8):
        files[f'/app-{i+1:02}.bin'] = altered[len(altered)*i//8:len(altered)*(i+1)//8]
    page.goto(base + '/index.html')
    page.locator('#retry').wait_for(state='visible')
    assert 'SHA-256' in page.locator('#error').inner_text()
    assert page.evaluate('document.scripts.length') == 1
    print('PASS altered but valid gzip fails the final HTML hash check and does not execute.')
    context.close()
    browser.close()
    print('These are automated loading checks, not real mouse, calibration or game-performance measurements.')
