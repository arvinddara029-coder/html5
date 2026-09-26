/* Build-time tool: requires three, esbuild, playwright and a working Chromium.
   Start npm start, then bundle render-model-browser.js and run this script.
   Renders supplied FBX exports into four-angle guardian sprites; no invented rig animation. */
import {chromium} from 'playwright';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
async function walk(path){const files=[];for(const e of await readdir(path,{withFileTypes:true})){if(e.isDirectory())files.push(...await walk(path+'/'+e.name));else files.push(path+'/'+e.name);}return files;}
await mkdir('test-results',{recursive:true});
await mkdir('assets/super-derived',{recursive:true});
await writeFile('test-results/model-renderer.html','<!doctype html><script src="model-renderer.js"></script>');
const files=(await walk('assets/super')).map(p=>p.replace(/^assets\//,''));
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});
const result=[];
try{for(const path of files.filter(p=>p.endsWith('.fbx'))){
 const page=await browser.newPage();await page.goto('http://127.0.0.1:8080/test-results/model-renderer.html');
 const pack=path.slice(0,path.lastIndexOf('/'));
 const textures=files.filter(p=>p.startsWith(pack+'/')&&p.endsWith('.png'));
 try{
  const data=await page.evaluate(async({path,textures})=>window.renderModel(path,textures),{path,textures});
  const id=createHash('sha256').update(path).digest('hex').slice(0,12),output=`super-derived/${id}.png`;
  await writeFile('assets/'+output,Buffer.from(data.image.split(',')[1],'base64'));
  result.push({source:path,id,name:path.split('/').pop().replace('.fbx','').replaceAll('_',' '),path:output,textures:data.textures,animations:data.animations});
  console.log('RENDERED',path,data.textures.length,'textures');
 }catch(e){console.error('FAILED',path,e.message);process.exitCode=1;}
 await page.close();
}}finally{await browser.close();}
await writeFile('assets/super-derived/models.json',JSON.stringify(result,null,2)+'\n');
