"""Compile measurable sprite/terrain metadata. Requires Pillow; never modifies original art.
Run: .venv/bin/python scripts/compile-super.py
Source files and unknown layouts are explicitly reported, never called runtime art.
"""
from pathlib import Path
from collections import defaultdict, Counter
from PIL import Image, ImageFilter
import json, re, hashlib
ROOT=Path(__file__).resolve().parents[1]; ASSETS=ROOT/'assets'; BASE=ASSETS/'super'
files=sorted(p for p in BASE.rglob('*') if p.is_file())
used=defaultdict(set); actors=[]; effects=[]; backgrounds=[]; terrain=[]; props=[]; relics=[]; ambient=[]; portraits=[]; hud=[]
def rel(p):return p.relative_to(ASSETS).as_posix()
def tag(p,role):used[rel(p)].add(role)
def natural(p):return [int(x) if x.isdigit() else x.lower() for x in re.split(r'(\d+)',str(p))]
def ident(s):return hashlib.sha256(s.encode()).hexdigest()[:12]
def clip(paths,label):
 paths=sorted(paths,key=natural);frames=[]
 for p in paths:
  im=Image.open(p).convert('RGBA'); b=im.getbbox()
  if b:frames.append({'path':rel(p),'rect':[0,0,*im.size],'bounds':list(b)})
 if not frames:return None
 # Union all frame bounds to avoid horizontal jitter between equal-sized frames.
 bounds=[min(f['bounds'][0] for f in frames),min(f['bounds'][1] for f in frames),max(f['bounds'][2] for f in frames),max(f['bounds'][3] for f in frames)]
 for f in frames:f.pop('bounds')
 return {'name':label,'frames':frames,'bounds':bounds,'fps':10}
def sheet(p,fw,label):
 im=Image.open(p).convert('RGBA');w,h=im.size
 if w%fw:return None
 frames=[];bbs=[]
 for x in range(0,w,fw):
  b=im.crop((x,0,x+fw,h)).getbbox()
  if b:bbs.append(b)
  frames.append({'path':rel(p),'rect':[x,0,fw,h]})
 if not bbs:return None
 return {'name':label,'frames':frames,'bounds':[min(b[0] for b in bbs),min(b[1] for b in bbs),max(b[2] for b in bbs),max(b[3] for b in bbs)],'fps':10}
def add_actor(pack,clips):
 clips=[c for c in clips if c]
 if not clips:return
 name=pack.name; s=rel(pack)
 role='enemy'
 if any(t in s.lower() for t in ['bridge heroine','terrible knight','cyberpunk-detective','space-marine','/character']):
  # '/Characters/' is deliberately NOT the singular '/Character/' selector.
  if any(t in s.lower() for t in ['bridge heroine','terrible knight','cyberpunk-detective','space-marine']) or '/Character'==s[-10:]:role='hero'
 if any(t in s.lower() for t in ['sunny-','/crow','flying-bird']):role='pet'
 if 'Dancing Girl' in s:role='npc'
 a={'id':ident(s),'name':name.replace('-Files','').replace(' Files','').replace('-',' ').title(),'role':role,'clips':clips}
 actors.append(a)
 for c in clips:
  for f in c['frames']:used[f['path']].add('actor:'+a['id'])
# Frame directories are unambiguous; sheets, previews and atlas copies are not guessed.
base=BASE/'Legacy Collection/Assets'
for category in ['Gothicvania/Characters','Warped/Characters','Misc/Characters','TinyRPG/Characters']:
 for pack in sorted((base/category).iterdir()):
  if not pack.is_dir():continue
  packs=[pack]
  if pack.name=='Battle Sprites':packs=[p for p in (pack/'Living Pack 1').iterdir() if p.is_dir()]+[p for p in (pack/'Monster Pack Files/Sprites').iterdir() if p.is_dir()]
  for pa in packs:
   groups=defaultdict(list)
   for p in pa.rglob('*.png'):
    if any(x.lower()=='sprites' for x in p.relative_to(base).parts[:-1]):groups[p.parent].append(p)
   clips=[]
   for directory,ps in sorted(groups.items()):
    label=str(directory.relative_to(pa)).replace('/',' ').lower().replace('sprites','').strip() or pa.name
    clips.append(clip(ps,label))
   add_actor(pa,clips)
# Static mech enemies have no supplied animation. They intentionally float as sentries.
for p in sorted((base/'TinyRPG/Characters/Battle Sprites/Mechanic').glob('*.png')):
 c=clip([p],'idle');add_actor(p,[c]);actors[-1]['name']=p.stem.replace('-',' ')
# High Forest has documented horizontal cell widths, including all colour variants.
forest=BASE/'Legacy-Fantasy - High Forest 2.3'
for pack,fw in [(forest/'Character',64),(forest/'Mob/Boar',48),(forest/'Mob/Small Bee',64),(forest/'Mob/Snail',64)]:
 clips=[]
 for p in sorted(pack.rglob('*.png')):
  if p.name=='all.png':continue
  clips.append(sheet(p,fw,p.stem.lower().replace('-sheet','')))
 add_actor(pack,clips)
# Effects use individual frames; runtime plays each full sequence, not contact sheets.
fx=base/'Explosions and Magic'
groups=defaultdict(list)
for p in fx.rglob('*.png'):
 parts=[x.lower() for x in p.relative_to(fx).parts[:-1]]
 if any(x in ['sprites','spritesheet'] for x in parts) and 'spritesheet' not in parts:groups[p.parent].append(p)
for directory,ps in sorted(groups.items()):
 c=clip(ps,directory.parent.name+' '+directory.name)
 if c:
  effects.append(c)
  for p in ps:tag(p,'combat-effect')
# Sequences with several prefixes in the same folder must remain separate.
# Re-group flat FX folders by filename prefix rather than concatenating unrelated effects.
for directory in sorted(set(p.parent for p in fx.rglob('*.png'))):
 if any(rel(p) in used for p in directory.glob('*.png')):continue
 ps=[p for p in directory.glob('*.png') if re.search(r'\d+\.png$',p.name) and 'sheet' not in p.name.lower()]
 by=defaultdict(list)
 for p in ps:by[re.sub(r'[-_]?\d+$','',p.stem)].append(p)
 for key,ls in by.items():
  if len(ls)>1:
   c=clip(ls,key)
   if c:
    effects.append(c)
    for p in ls:tag(p,'combat-effect')
# Environment art: select backgrounds by semantic name, not previews or atlases.
for p in files:
 if p.suffix.lower()!='.png' or rel(p) in used:continue
 s=rel(p).lower(); name=p.stem.lower(); im=Image.open(p).convert('RGBA'); w,h=im.size
 environment=('debug map/assets' in s or 'colorful-tileset' in s or 'rocks-textures' in s or '/environments/' in s or 'background' in s or 'free platformer assets' in s or '/trees/' in s or '/assets/' in s and 'high forest' in s)
 if not environment or any(x in s for x in ['preview','mockup','/materials/','/textures/']):continue
 if any(x in name for x in ['tiles','tileset']) or any(x in s for x in ['debug map/assets','colorful-tileset','rocks-textures']):
  cells=[]
  for y in range(0,h-15,16):
   for x in range(0,w-15,16):
    tile=im.crop((x,y,x+16,y+16));a=tile.getchannel('A')
    if a.getextrema()[0]>150:cells.append([x,y,16,16])
  if cells:terrain.append({'path':rel(p),'cells':cells});tag(p,'terrain-tiles')
 elif w>=128 and h>=80 and any(x in name for x in ['background','back','sky','cloud','mountain','middle','near','layer','town','forest','trees','sea','space','landscape','wall']):
  backgrounds.append({'path':rel(p),'w':w,'h':h});tag(p,'parallax-background')
 elif w<1024 and h<1024 and name!='all' and not any(x in name for x in ['sheet','decor','props','tiles','items','objects']):
  b=im.getbbox()
  if b:props.append({'path':rel(p),'rect':list(b)});tag(p,'world-prop')
# Forest tree atlas: 112x400 cells; only complete trees, not loose branches.
for p in sorted((forest/'Trees').glob('*-Tree.png')):
 for y in [0,400,800]:
  for x in [0,112,672,784]:props.append({'path':rel(p),'rect':[x,y,x+112,y+400]})
 tag(p,'world-tree-atlas')
# Ten standalone fantasy weapons become selectable relics with combat magic.
for p in sorted((base/'Gothicvania/Misc/fantasy weapons set/PNG').glob('*.png'),key=natural):
 im=Image.open(p);relics.append({'id':ident(rel(p)),'name':'Legacy Relic '+p.stem,'path':rel(p),'width':im.width,'height':im.height,'level':1+len(relics)})
 tag(p,'equippable-relic')
# Rendered FBX geometry is used as hovering guardian enemies, not claimed rigged animation.
model_file=ASSETS/'super-derived/models.json'
if model_file.exists():
 for m in json.loads(model_file.read_text()):
  actor={'id':m['id'],'name':m['name']+' Guardian','role':'guardian','clips':[sheet(ASSETS/m['path'],256,'idle')]}
  actors.append(actor);used[m['source']].add('rendered-guardian:'+m['id'])
  for texture in m['textures']:used[texture].add('guardian-texture')
# Remaining hand-authored utility exports have explicit in-game roles.
platformer=BASE/'GandalfHardcore FREE Platformer Assets'
def grid_clip(p,fw,fh,indices,label):
 im=Image.open(p);cols=im.width//fw
 return {'name':label,'frames':[{'path':rel(p),'rect':[(i%cols)*fw,(i//cols)*fh,fw,fh]} for i in indices],'bounds':[0,0,fw,fh],'fps':10}
for name in ['Campfire sheet.png','Campfire with food sheet.png']:
 p=platformer/'Animated Sprites'/name
 for row in range(8):ambient.append(grid_clip(p,32,32,range(row*5,row*5+5),'campfire'))
 tag(p,'animated-campfire')
p=platformer/'Animated Sprites/GandalfHardcore Portal sheet.png';ambient.append(grid_clip(p,64,64,range(10),'portal'));tag(p,'extraction-portal')
p=platformer/'Snow blizzard sheet frame size 484x274.png';ambient.append(grid_clip(p,484,274,range(30),'snow'));tag(p,'snow-weather')
# Small top-down characters act as relay helpers; use their side-facing row.
for p in (base/'TinyRPG/Characters/Top-Down-16-bit-fantasy').rglob('*.png'):
 if Image.open(p).size==(128,96):
  add_actor(p,[grid_clip(p,32,32,range(4,8),'walk')]);actors[-1]['name']=p.parent.name;actors[-1]['role']='npc'
 elif 'profile' in p.name:portraits.append(rel(p));tag(p,'relay-portrait')
for p in (base/'Warped/Misc/Warped Portraits Files').rglob('*.png'):portraits.append(rel(p));tag(p,'relay-portrait')
# Utility effects and spaceship thrusters use the source frame sequences.
for directory in [base/'Gothicvania/Misc/EnemyProjectile/Sprites',*list((base/'Warped/Characters/Warped Vehicles Files').glob('*/thrust'))]:
 ps=list(directory.glob('*.png'));c=clip(ps,directory.name)
 if c:
  effects.append(c)
  for p in ps:tag(p,'combat-effect')
for p in (base/'Gothicvania/Misc/Dagger').glob('*.png'):
 im=Image.open(p);relics.append({'id':ident(rel(p)),'name':'Spectral Dagger','path':rel(p),'width':im.width,'height':im.height,'level':11});tag(p,'equippable-relic')
p=base/'Gothicvania/Characters/Terrible Knight/Projectiles/dagger.png'
im=Image.open(p);relics.append({'id':ident(rel(p)),'name':'Knight Dagger','path':rel(p),'width':im.width,'height':im.height,'level':12});tag(p,'equippable-relic')
for p in (base/'Warped/Misc/asteroid-fighter Pack/PNG/asteroids').glob('*.png'):
 add_actor(p,[clip([p],'idle')]);actors[-1]['name']=p.stem+' Sentinel'
ship=base/'Warped/Misc/asteroid-fighter Pack/PNG/ship sprites';add_actor(ship,[clip(list(ship.glob('*.png')),'fly')]);actors[-1]['name']='Asteroid Interceptor'
p=base/'Warped/Misc/asteroid-fighter Pack/PNG/planet.png';im=Image.open(p);backgrounds.append({'path':rel(p),'w':im.width,'h':im.height});tag(p,'parallax-background')
# Extract bounded islands from transparent prop atlases, never stretch an atlas into scenery.
prop_atlases=[platformer/n for n in ['Alchemy Decor.png','Decor.png','Garden Decorations.png']]+[base/'Gothicvania/Environments/HauntedForest/Layers/props.png',base/'TinyRPG/Environments/single-dungeon-crawler-objects/PNG/dungeon-crawler-objects-transparent.png',forest/'Assets/Props-Rocks.png']
for p in prop_atlases:
 im=Image.open(p).convert('RGBA');mask=im.getchannel('A').point(lambda v:255 if v>80 else 0).filter(ImageFilter.MaxFilter(5));w,h=mask.size;data=bytearray(mask.tobytes());found=[]
 for start in range(w*h):
  if not data[start]:continue
  data[start]=0;stack=[start];left=right=start%w;top=bottom=start//w;area=0
  while stack:
   i=stack.pop();x=i%w;y=i//w;left=min(left,x);right=max(right,x);top=min(top,y);bottom=max(bottom,y);area+=1
   for j in ([i-1] if x else [])+([i+1] if x<w-1 else [])+([i-w] if y else [])+([i+w] if y<h-1 else []):
    if data[j]:data[j]=0;stack.append(j)
  if area>50 and right-left>=6 and bottom-top>=6:found.append([left,top,right+1,bottom+1])
 if found:
  for rect in found:props.append({'path':rel(p),'rect':rect})
  tag(p,'segmented-prop-atlas')
for p in (BASE/'GandalfHardcore Hp bar').glob('*.png'):
 if 'preview' not in p.name.lower():hud.append(rel(p));tag(p,'pixel-hud')
p=forest/'HUD/Base-01.png';hud.append(rel(p));tag(p,'pixel-hud')
# Exact-layer mappings are already rendered by the layered hero pipeline.
for p in files:
 if p.suffix.lower()=='.png' and 'GandalfHardcore Character Asset Pack' in rel(p):tag(p,'layered-hero')
# Parked vehicles are world props in addition to the moving vehicle enemies.
for p in (base/'Warped/Characters/Warped Vehicles Files').glob('*/vehicle-*.png'):
 im=Image.open(p).convert('RGBA');b=im.getbbox()
 if b:props.append({'path':rel(p),'rect':list(b)});tag(p,'parked-vehicle')
p=base/'TinyRPG/Environments/single-dungeon-crawler-objects/PNG/dungeon-crawler-objects.png'
terrain.append({'path':rel(p),'cells':[[16,0,16,16],[32,0,16,16],[48,0,16,16]]});tag(p,'dungeon-brick-terrain')
# Alternate sprite-sheet exports are genuinely rendered too when their cells
# exactly match known frames. This is pixel verification, not a filename guess.
frame_index=defaultdict(list);dims=set()
all_clips=[c for a in actors for c in a['clips']]+effects+ambient
image_cache={}
for c in all_clips:
 for f in c['frames']:
  path=f['path'];im=image_cache.setdefault(path,Image.open(ASSETS/path).convert('RGBA'))
  x,y,w,h=f['rect'];cell=im.crop((x,y,x+w,y+h));key=(w,h,hashlib.sha256(cell.tobytes()).digest());frame_index[key].append(f);dims.add((w,h))
for p in files:
 if p.suffix.lower()!='.png' or rel(p) in used or any(t in rel(p).lower() for t in ['preview','mockup','materials','textures']):continue
 im=Image.open(p).convert('RGBA');w,h=im.size;matches=0
 for fw,fh in dims:
  if w%fw or h%fh or (w//fw)*(h//fh)>120:continue
  for y in range(0,h,fh):
   for x in range(0,w,fw):
    key=(fw,fh,hashlib.sha256(im.crop((x,y,x+fw,y+fh)).tobytes()).digest())
    if key in frame_index:
     for f in frame_index[key]:f.setdefault('alternates',[]).append({'path':rel(p),'rect':[x,y,fw,fh]})
     matches+=1
 if matches:tag(p,'pixel-verified-frame-alias')
manifest={'actors':actors,'effects':effects,'backgrounds':backgrounds,'terrain':terrain,'props':props,'relics':relics,'ambient':ambient,'portraits':portraits,'hud':hud}
(ROOT/'js/super-content.js').write_text('/* Generated by scripts/compile-super.py. Do not edit by hand. */\nNR.superContent = '+json.dumps(manifest,separators=(',',':'))+';\n')
audit=[]
for p in files:
 roles=sorted(used.get(rel(p),[]));suffix=p.suffix.lower()
 if roles:status='runtime-mapped'
 elif suffix in ['.psd','.ase','.aseprite','.blend','.blend1','.fbx','.zip']:status='source-needs-conversion' if suffix in ['.blend','.blend1','.fbx'] else 'source-or-alternate-export'
 elif suffix in ['.txt','.pdf','.json'] or p.name in ['.DS_Store','new']:status='documentation-or-metadata'
 elif suffix=='.gif' or 'preview' in rel(p).lower() or 'mockup' in rel(p).lower():status='reference-preview'
 elif suffix=='.png' and any(x in rel(p).lower() for x in ['/materials/','/textures/']):status='unadapted-material-variant'
 elif suffix=='.png' and any(x in rel(p).lower() for x in ['spritesheet','-sheet','/atlas.png','/static/']):status='alternate-sheet-layout'
 else:status='unadapted-raster'
 audit.append({'path':rel(p),'status':status,'roles':roles})
(ROOT/'assets/super-coverage.json').write_text(json.dumps(audit,indent=2)+'\n')
manifest['coverage']={r['path']:r['status'] for r in audit}
(ROOT/'js/super-content.js').write_text('/* Generated by scripts/compile-super.py. */\nNR.superContent = '+json.dumps(manifest,separators=(',',':'))+';\n')
print(len(actors),'actors,',len(effects),'FX sequences,',len(backgrounds),'backgrounds,',len(terrain),'tilesets,',len(props),'props')
print(Counter(x['status'] for x in audit))

layer_rows=[]
for p in sorted((BASE/'GandalfHardcore Character Asset Pack').rglob('*.png')):
 name=p.stem;folder=p.parent.name;g='f' if 'Female' in name or 'Female' in folder else 'm'
 cat='skin' if folder=='Character skin colors' else 'hair' if 'Hair' in folder else 'weapon' if 'Hand' in folder else 'shoes' if any(s in name.lower() for s in ['boot','sock']) else 'underwear' if any(s in name.lower() for s in ['underwear','panties','bra']) else 'bottom' if any(s in name.lower() for s in ['pant','skirt']) else 'top'
 layer_rows.append({'id':'super-'+g+'-'+name,'name':name+' · Super','path':rel(p),'g':g,'cat':cat})
(ROOT/'js/super-layers.js').write_text('/* Generated complete 800x448 layered-character pack. */\n(function(){const layers='+json.dumps(layer_rows)+';\nfor(const o of layers){const list=NR.catalog[o.cat];const equivalent=list.find(v=>v.path===o.path || "super/"+v.path===o.path);if(equivalent)equivalent.path=o.path;else {const {cat,...item}=o;list.push(item);}}})();\n')
