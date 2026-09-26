// Build-time only: esbuild this to test-results/model-renderer.js.
import * as THREE from 'three';
import {FBXLoader} from 'three/examples/jsm/loaders/FBXLoader.js';
window.renderModel=async function(path,textures){
 const manager=new THREE.LoadingManager();
 const used=new Set();
 manager.setURLModifier(url=>{
  if(url.startsWith('blob:')||url.startsWith('data:'))return url;
  const name=decodeURIComponent(url).replaceAll('\\','/').split('/').pop().toLowerCase();
  const match=textures.find(p=>p.split('/').pop().toLowerCase()===name);
  if(match){used.add(match);return '/assets/'+match.split('/').map(encodeURIComponent).join('/');}
  return url;
 });
 const object=await new FBXLoader(manager).loadAsync('/assets/'+path.split('/').map(encodeURIComponent).join('/'));
 await new Promise(resolve=>{if(!manager.isLoading)resolve();else{manager.onLoad=resolve;setTimeout(resolve,2500);}});
 const select=path.includes('/GB/')?'GoldenBoy.png':path.includes('/John Dick/')?'JohnDickBase.png':path.includes('/Mr. Virtual/')?'MrVTex.png':path.includes('/OGN Mario')?'OGNMarioTex.png':path.includes('/OGN-IHY')?(path.includes('/IHY_')?'IHYLuigi_Tex.png':'IHYLuigi_Tex.png'):path.includes('/Super Horror Peach')?'HorrorPeachTex.png':path.includes('/Starman')?'StarmanHorrorMTex.png':'MarioEXEv2Tex.png';
 const selected=textures.find(p=>p.split('/').pop()===select);
 const tex=selected?await new THREE.TextureLoader(manager).loadAsync('/assets/'+selected.split('/').map(encodeURIComponent).join('/')):null;
 if(tex){tex.colorSpace=THREE.SRGBColorSpace;tex.minFilter=THREE.LinearFilter;used.add(selected);}
 const scene=new THREE.Scene();scene.add(new THREE.HemisphereLight(0xffffff,0x8192a9,2.5));
 const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(2,4,5);scene.add(light);
 scene.add(object);
 object.traverse(o=>{if(o.isMesh){
  o.frustumCulled=false;
  if(/outline/i.test(o.name)){o.visible=false;return;}
  o.material=(Array.isArray(o.material)?o.material:[o.material]).map(m=>new THREE.MeshBasicMaterial({map:tex||m.map,color:0xffffff,side:THREE.DoubleSide,transparent:true,alphaTest:.3}));
 }});
 object.updateMatrixWorld(true);
 const box=new THREE.Box3().setFromObject(object),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
 object.position.sub(center);object.updateMatrixWorld(true);
 const radius=Math.max(size.x,size.y,size.z)*.62;
 const camera=new THREE.OrthographicCamera(-radius,radius,radius,-radius,.01,Math.max(100000,radius*20));camera.position.set(radius*.25,radius*.1,radius*3);camera.lookAt(0,0,0);
 const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});renderer.setSize(256,256);renderer.setClearColor(0x000000,0);
 const sheet=document.createElement('canvas');sheet.width=256*4;sheet.height=256;const ctx=sheet.getContext('2d');
 for(let i=0;i<4;i++){object.rotation.y=(i-1.5)*.16;renderer.render(scene,camera);ctx.drawImage(renderer.domElement,i*256,0);}
 const result={image:sheet.toDataURL('image/png'),textures:[...used],animations:object.animations.length};
 renderer.dispose();object.traverse(o=>{if(o.isMesh){o.geometry.dispose();for(const m of (Array.isArray(o.material)?o.material:[o.material]))m.dispose();}});
 return result;
};
