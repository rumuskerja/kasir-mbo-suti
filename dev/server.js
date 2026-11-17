// Server lokal untuk uji coba: melayani ../app dan meneruskan POST /api ke simulasi Apps Script.
const http=require('http'),fs=require('fs'),path=require('path');
const sim=require('./gas-sim')(__dirname+'/../apps-script/Code.gs',{quiet:true});sim.setup();
const ROOT=path.join(__dirname,'../app');const T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webmanifest':'application/manifest+json'};
const PORT=+process.argv[2]||8787;
http.createServer((req,res)=>{
  if(req.method==='POST'&&req.url.startsWith('/api')){let b='';req.on('data',c=>b+=c);req.on('end',()=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(sim.post(b)));});return;}
  let p=decodeURIComponent(req.url.split('?')[0]);if(p==='/')p='/index.html';
  if(p==='/config.js'){res.writeHead(200,{'Content-Type':'text/javascript'});return res.end(`window.KASIR_CONFIG={API_URL:"http://localhost:${PORT}/api",POLL_DETIK:3};`);}
  fs.readFile(path.join(ROOT,p),(e,d)=>{if(e){res.writeHead(404);return res.end();}res.writeHead(200,{'Content-Type':T[path.extname(p)]||'application/octet-stream'});res.end(d);});
}).listen(PORT,()=>console.log('http://localhost:'+PORT));
