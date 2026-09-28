#!/usr/bin/env python3
"""One-shot repo slimming: drop every asset the game never loads.

1. Rewrite js/super-content.js so animation frames point straight at their
   spritesheet cells (the individual frame PNGs are then redundant).
2. Build the keep-set from every real reference (code literals, evaluated
   catalog/sheets/textures, audio map, transformed content, license files).
3. Delete assets outside the keep-set and regenerate js/super-manifest.js.
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)

# ---------------------------------------------------------------- 1) content
src = open('js/super-content.js', encoding='utf-8').read()
m = re.search(r'NR\.superContent = (\{.*\});?\s*$', src, re.S)
assert m, 'super-content parse failed'
data = json.loads(m.group(1).rstrip().rstrip(';'))

disk = set()
for dp, dn, fs in os.walk('assets'):
    for f in fs:
        disk.add((os.path.join(dp, f).replace('\\', '/'))[len('assets/'):])

transformed = 0
def fix_frames(o):
    global transformed
    if isinstance(o, dict):
        if isinstance(o.get('path'), str) and 'rect' in o and isinstance(o.get('alternates'), list):
            alts = [a for a in o['alternates']
                    if isinstance(a, dict) and isinstance(a.get('path'), str) and a['path'] in disk]
            if alts and all(a['path'] in disk for a in o['alternates']) and len(o['alternates']) > 0:
                # every alternate exists: the sheet cell IS the frame now
                o['path'], o['rect'] = alts[0]['path'], alts[0]['rect']
                transformed += 1
            elif alts:
                o['alternates'] = alts   # keep only alternates that exist
            else:
                del o['alternates']      # sheet gone — the frame PNG stays
        for v in o.values():
            fix_frames(v)
    elif isinstance(o, list):
        for v in o:
            fix_frames(v)

fix_frames({k: v for k, v in data.items() if k != 'coverage'})
print('frames rewired to spritesheet cells:', transformed)

# keep coverage only for files that survive
# (computed after deletions below — placeholder here)

# ---------------------------------------------------------------- 2) refs
exts = r'(?:png|jpg|jpeg|webp|gif|svg|wav|mp3|ogg|woff2?|ttf|otf|json|md|txt|html|css|js|fbx|obj|blend|pdf)'
refs = set()
scan = []
for d in ('js', 'css', 'tests', 'scripts'):
    for dp, dn, fs in os.walk(d):
        for f in fs:
            scan.append(os.path.join(dp, f))
scan += ['index.html']
for fp in scan:
    t = open(fp, encoding='utf-8', errors='ignore').read()
    for r in re.findall(r'["\'`]([^"\'`\n]{3,240}?\.' + exts + r')["\'`]', t, re.I):
        if not r.startswith(('http', '//', 'node_modules')):
            refs.add(r)
# drop globs/placeholders that can't map to a file
refs = {r for r in refs if '$' not in r and '*' not in r and '{' not in r}

norm = set()
for r in refs:
    norm.add(r[len('assets/'):] if r.startswith('assets/') else r)

# audio map -> super/<file>
t = open('js/audiomap.js', encoding='utf-8').read()
for f in re.findall(r'\["([^"]+\.(?:wav|ogg|mp3))"', t):
    norm.add('super/' + f)

# fonts.css
t = open('css/fonts.css', encoding='utf-8').read()
for u in re.findall(r'url\("?\.\./assets/([^")]+)"?\)', t):
    norm.add(u)

# evaluated catalog / sheets / textures / wardrobe (node shim)
import subprocess
node_shim = r'''
global.window = {};
global.document = {getElementById:()=>null, createElement:()=>({getContext:()=>null,style:{}}), addEventListener:()=>{}, body:{classList:{add(){},remove(){},toggle(){}}}};
global.NR = {}; global.navigator={userAgent:'x'}; global.performance={now:()=>0};
global.localStorage={getItem:()=>null,setItem(){}};
const fs=require('fs');
function load(p){ try{ new Function(fs.readFileSync(p,'utf8'))(); }catch(e){ console.error('ERR',p,e.message); process.exit(1);} }
load('js/utils.js'); load('js/assetlib.js');
const out=[];
const A=global.NR.assets;
if (A && A.allLayerPaths) out.push(...A.allLayerPaths());
const c=global.NR.catalog;
if (c) for (const k of Object.keys(c)) for (const o of c[k]) out.push(o.path);
const tex=global.NR.textures; if (tex) for (const k of Object.keys(tex)) out.push(...tex[k]);
const w=global.NR.petWardrobe; if (w) for (const k of Object.keys(w)) out.push(w[k]);
console.log(JSON.stringify(out));
'''
res = subprocess.run(['node', '-e', node_shim], capture_output=True, text=True)
assert res.returncode == 0, res.stderr
for p in json.loads(res.stdout.strip().split('\n')[-1]):
    norm.add(p)

# super-content paths AFTER the transform
def collect(o, out):
    if isinstance(o, dict):
        p = o.get('path')
        if isinstance(p, str) and p:
            out.add(p)
        for a in o.get('alternates') or []:
            if isinstance(a, dict) and isinstance(a.get('path'), str):
                out.add(a['path'])
        for v in o.values():
            collect(v, out)
    elif isinstance(o, list):
        if o and all(isinstance(x, str) for x in o):   # hud/portraits arrays
            out.update(x for x in o if isinstance(x, str))
        else:
            for v in o:
                collect(v, out)
collect({k: v for k, v in data.items() if k != 'coverage'}, norm)

# explicit always-keep rules
def must_keep(rel):
    base = os.path.basename(rel).lower()
    if rel.startswith('operators/'): return True                 # dynamic ${c.id}.svg
    if rel.startswith('kenney/'): return True                    # required by tests + CC0 notice
    if rel.startswith('fonts/'): return True                     # font license files ride along
    if any(k in base for k in ('license', 'attribution', 'readme', 'links')): return True
    if base.endswith(('.txt', '.pdf')): return True              # pack terms / license docs
    if rel.startswith('vendor/'): return True                    # peerjs bundle + its license
    return False

# ---------------------------------------------------------------- 3) delete
keep, drop = set(), set()
for f in sorted(disk):
    rel = f
    hit = must_keep(rel) or rel in norm
    if not hit:
        for r in norm:
            if r.endswith('/' + rel) or rel.endswith('/' + r):
                hit = True
                break
    (keep if hit else drop).add(rel)

print('disk files: %d -> keep %d, delete %d' % (len(disk), len(keep), len(drop)))

from collections import Counter
c = Counter('/'.join(f.split('/')[:2]) for f in drop)
for k, v in sorted(c.items(), key=lambda x: -x[1])[:20]:
    print('  -%4d  %s' % (v, k))

for f in drop:
    try:
        os.remove(os.path.join('assets', f))
    except FileNotFoundError:
        pass
# prune empty dirs
for dp, dn, fs in os.walk('assets', topdown=False):
    if dp != 'assets' and not os.listdir(dp):
        os.rmdir(dp)

# prune coverage + rewrite super-content
cov = data.get('coverage', {})
data['coverage'] = {k: v for k, v in cov.items() if k in keep}
out = '/* Generated by scripts/compile-super.py; includes source files, not just sprites. */\n'
body = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
open('js/super-content.js', 'w', encoding='utf-8').write(
    '/* Generated by scripts/compile-super.py. */\nNR.superContent = ' + body + ';\n')

# regenerate super-manifest.js from what is on disk now
files = sorted(p[len('assets/'):] for p in disk if os.path.exists(os.path.join('assets', p)) and (os.path.join('assets', p)) and not os.path.isdir(os.path.join('assets', p)) and p.startswith('super/'))
files = [f for f in files if os.path.exists(os.path.join('assets', f))]
open('js/super-manifest.js', 'w', encoding='utf-8').write(
    '/* Generated by scripts/index-super.py; includes source files, not just sprites. */\n'
    'NR.superManifest = ' + json.dumps(files, ensure_ascii=False) + ';\n')
print('super manifest entries:', len(files))

# final counts
total = 0
for dp, dn, fs in os.walk('.'):
    if any(part in dp for part in ('/.git', 'node_modules', 'test-results')):
        continue
    if '/.git' in dp or 'node_modules' in dp or 'test-results' in dp:
        continue
    total += len(fs)
print('REPO FILES (excl. .git/node_modules/test-results):', total)
