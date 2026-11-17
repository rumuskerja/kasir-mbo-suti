#!/usr/bin/env python3
"""Bangun versi demo (tanpa Google Sheet) dari app/ ke demo/.
Pakai: python3 dev/build-demo.py"""
import json, os, re, shutil
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP, OUT = os.path.join(ROOT, 'app'), os.path.join(ROOT, 'demo')
os.makedirs(os.path.join(OUT, 'icons'), exist_ok=True)
for f in ['styles.css', 'app.js', 'printer.js', 'icons/logo.png', 'icons/icon-192.png', 'icons/apple-touch-icon.png']:
    shutil.copyfile(os.path.join(APP, f), os.path.join(OUT, f))
code = open(os.path.join(ROOT, 'apps-script', 'Code.gs')).read()
src = open(os.path.join(ROOT, 'dev', 'demo-backend.src.js')).read().replace('__CODE__', json.dumps(code))
open(os.path.join(OUT, 'demo-backend.js'), 'w').write(src)

html = open(os.path.join(APP, 'index.html')).read()
head_extra = re.search(r'<head>(.*?)</head>', html, re.S).group(1)
body = re.search(r'<body>(.*?)</body>', html, re.S).group(1)
head_extra = re.sub(r'<meta charset[^>]*>\s*|<meta name="viewport"[^>]*>\s*|<link rel="manifest"[^>]*>\s*', '', head_extra)
body = body.replace('<script src="vendor/xlsx.full.min.js" defer></script>\n', '')  # unduhan dinonaktifkan di demo
head_extra = head_extra.replace('<title>Kasir Mbo Suti</title>', '<title>Demo Kasir Mbo Suti</title>')
body = body.replace('<script src="config.js"></script>',
  '<script>window.KASIR_CONFIG={API_URL:"demo://api",POLL_DETIK:5};window.KASIR_DEMO={noDownload:true};</script>\n<script src="demo-backend.js"></script>')
demo_ui = '''
<style>
#demo-bar{position:fixed;left:max(12px,env(safe-area-inset-left,0px));bottom:max(12px,env(safe-area-inset-bottom,0px));z-index:40;display:flex;gap:6px;align-items:center;background:var(--kunyit);color:var(--olive);font-weight:800;font-size:11.5px;padding:6px 6px 6px 12px;border-radius:999px;box-shadow:var(--shadow)}
#demo-bar button{border:0;background:var(--olive);color:#fff;font-weight:700;font-size:11px;border-radius:999px;padding:4px 10px}
@media(max-width:959px){#app:not(.hidden) ~ #demo-bar{bottom:auto;top:calc(110px + env(safe-area-inset-top,0px));left:auto;right:12px}}
#demo-cred{margin-top:14px;font-size:12.5px;line-height:1.6;background:var(--kunyit-tint);border:1px dashed #E3D46A;border-radius:11px;padding:10px 12px;text-align:left}
#demo-cred code{background:#fff;padding:1px 6px;border-radius:5px;font-weight:700;color:var(--leaf-2)}
</style>
<div id="demo-bar">DEMO · data contoh<button type="button" onclick="KASIR_DEMO.reset()">Reset</button></div>
<script>
document.querySelector('#login .login-card').insertAdjacentHTML('beforeend','<div id="demo-cred"><b>Akun demo</b><br>Kasir: pilih <code>Shely</code> atau <code>Rina</code>, PIN <code>123456</code><br>Admin: <code>admin@mbosuti.id</code>, sandi <code>mbosuti123</code><br><span class="muted">Coba buka di 2 tab (satu Kasir, satu Admin): stok yang diubah Admin ikut berubah di Kasir.</span></div>');
</script>
'''
page = head_extra.strip() + '\n' + body.strip() + '\n' + demo_ui
open(os.path.join(OUT, 'index.html'), 'w').write(page)
print('demo ->', OUT)
