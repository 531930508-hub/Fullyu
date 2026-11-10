/* Build a dependency-free, local-only review artifact. */
const fs=require('node:fs/promises');
const path=require('node:path');
const root=__dirname;
async function build(){
 let html=await fs.readFile(path.join(root,'index.html'),'utf8');
 const css=await fs.readFile(path.join(root,'styles.css'),'utf8');
 html=html.replace('<link rel="stylesheet" href="styles.css">',`<style>${css}</style>`);
 for(const name of ['core','ui','customer','ops','admin','app','v2']){
  const js=await fs.readFile(path.join(root,name+'.js'),'utf8');
  html=html.replace(`<script src="${name}.js"></script>`,()=>`<script>${js.replace(/<\/script/gi,'<\\/script')}</script>`);
 }
 for(const name of ['tea','celebration']){
  const data=await fs.readFile(path.join(root,'assets',name+'.jpg'));
  html=html.replaceAll(`assets/${name}.jpg`,'data:image/jpeg;base64,'+data.toString('base64'));
 }
 for(const name of ['logo-zh','logo-en']){
  const data=await fs.readFile(path.join(root,'assets',name+'.png'));
  html=html.replaceAll(`assets/${name}.png`,'data:image/png;base64,'+data.toString('base64'));
 }
 const out=path.resolve(root,'../Full愈时叙-双端交互Demo-V2.html');
 await fs.writeFile(out,html);
 console.log(JSON.stringify({file:out,bytes:Buffer.byteLength(html),externalDependencies:0}));
}
build().catch(e=>{console.error(e);process.exitCode=1;});
