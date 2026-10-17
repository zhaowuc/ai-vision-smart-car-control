"""Real localhost loader checks with native fetch/gzip/WebCrypto, no mouse claims.

Requires Playwright and its Chromium. CHROMIUM_EXECUTABLE_PATH can select an
installed Chromium browser. Browser storage is isolated from the user's profile.
"""
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from urllib.parse import parse_qs, urlsplit
import base64
import hashlib
import gzip
import os
import re
import json
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
RAW = (ROOT / 'SensLab-Personal.html').read_bytes()
LOADER = (ROOT / 'index.html').read_bytes()
PACKED = (ROOT / 'app.html.gz').read_bytes()
PACKED_BLOB = hashlib.sha1(f'blob {len(PACKED)}\0'.encode('ascii') + PACKED).hexdigest()
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
    api_calls = []
    api_reply = {'status': 503, 'body': json.dumps({'message': 'TEST ONLY unavailable API'})}
    def official_api(route):
        api_calls.append(route.request.url)
        route.fulfill(status=api_reply['status'], body=api_reply['body'],
                      headers={'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'})
    context.route('https://api.github.com/repos/zhaowuc/ai-vision-smart-car-control/git/blobs/*', official_api)
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('request', lambda request: requested.append(urlsplit(request.url)))
    page.goto(base + '/index.html')
    page.wait_for_function('expected => document.scripts.length === expected && Array.from(document.scripts).every(s => !s.src)', arg=len(SCRIPTS))
    assert page.evaluate('Array.from(document.scripts,s=>s.textContent)') == SCRIPTS
    assert not errors, errors
    online_title = page.title()
    assert all(any(request.path == '/app-' + str(i).zfill(2) + '.bin' for request in requested) for i in range(1, 9))
    assert all(parse_qs(request.query) == {'v': [hashlib.sha256(RAW).hexdigest()]} for request in requested if request.path.endswith('.bin'))
    assert not any(request.path.endswith(('ux.js', 'upgrade-v102.js')) for request in requested)
    assert not api_calls, 'Normal fragment delivery must not contact the fallback API'
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
    assert 'HTTP 503' in page.locator('#error').inner_text()
    assert page.evaluate('document.scripts.length') == 1
    assert api_calls == ['https://api.github.com/repos/zhaowuc/ai-vision-smart-car-control/git/blobs/' + PACKED_BLOB]
    files['/app-04.bin'] = saved
    print('PASS a missing fragment fails closed without executing application scripts.')

    altered = gzip.compress(RAW + b'\n<!-- deliberate test-only alteration -->', mtime=0)
    calls_before = len(api_calls)
    for i in range(8):
        files[f'/app-{i+1:02}.bin'] = altered[len(altered)*i//8:len(altered)*(i+1)//8]
    page.goto(base + '/index.html')
    page.locator('#retry').wait_for(state='visible')
    assert 'SHA-256' in page.locator('#error').inner_text()
    assert page.evaluate('document.scripts.length') == 1
    assert len(api_calls) == calls_before, 'Integrity failure must not switch to another source'
    print('PASS altered but valid gzip fails the final HTML hash check and does not execute.')

    # Route only the public API response: localhost delivery, native browser
    # fetch/base64/gzip/WebCrypto remain real. This is not an availability claim
    # about GitHub or a public hosting provider.
    files.pop('/app-04.bin')
    good_api = {'sha': PACKED_BLOB, 'encoding': 'base64', 'size': len(PACKED),
                'content': base64.encodebytes(PACKED).decode('ascii')}
    api_reply.update(status=200, body=json.dumps(good_api))
    page.goto(base + '/index.html')
    page.wait_for_function('expected => document.scripts.length === expected && Array.from(document.scripts).every(s => !s.src)', arg=len(SCRIPTS))
    assert page.evaluate('Array.from(document.scripts,s=>s.textContent)') == SCRIPTS
    assert not errors, errors
    print('PASS unavailable fragments use the pinned official GitHub blob API response, then verify identical final HTML.')

    api_reply['body'] = json.dumps({**good_api, 'content': 'not!base64'})
    page.goto(base + '/index.html')
    page.locator('#retry').wait_for(state='visible')
    assert 'base64' in page.locator('#error').inner_text()
    assert page.evaluate('document.scripts.length') == 1
    print('PASS malformed official API base64 fails closed without application execution.')

    altered_blob = hashlib.sha1(f'blob {len(altered)}\0'.encode('ascii') + altered).hexdigest()
    api_reply['body'] = json.dumps({**good_api, 'size': len(altered), 'content': base64.encodebytes(altered).decode('ascii')})
    page.goto(base + '/index.html')
    page.locator('#retry').wait_for(state='visible')
    assert 'Git blob' in page.locator('#error').inner_text()
    assert page.evaluate('document.scripts.length') == 1
    print('PASS altered API bytes fail the immutable Git blob hash check.')

    files['/index.html'] = LOADER.replace(PACKED_BLOB.encode('ascii'), altered_blob.encode('ascii'))
    api_reply['body'] = json.dumps({**good_api, 'sha': altered_blob, 'size': len(altered), 'content': base64.encodebytes(altered).decode('ascii')})
    page.goto(base + '/index.html')
    page.locator('#retry').wait_for(state='visible')
    assert 'SHA-256' in page.locator('#error').inner_text()
    assert page.evaluate('document.scripts.length') == 1
    print('PASS even a valid API Git blob cannot bypass the final HTML SHA-256 check.')
    context.close()
    browser.close()
    print('These are automated loading checks, not real mouse, calibration or game-performance measurements.')
