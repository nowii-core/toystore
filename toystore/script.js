'use strict';
(()=>{
/* =====================================================================
   TOY TOWN — TIDY-UP · zero-dependency first-person WebGL2 game
   ===================================================================== */
const $=id=>document.getElementById(id);
const canvas=$('gl');
const gl=canvas.getContext('webgl2',{antialias:true,alpha:false,powerPreference:'high-performance'});
if(!gl){$('loading').textContent='This game needs WebGL2. Please use a recent Chrome, Edge, Firefox or Safari.';return;}
const touch=('ontouchstart' in window)||navigator.maxTouchPoints>0&&matchMedia('(pointer:coarse)').matches;
if(touch)document.body.classList.add('touch');
const DEBUG=new URLSearchParams(location.search).has('debug');

/* ------------------------------ math ------------------------------ */
const TAU=Math.PI*2,clamp=(v,a,b)=>v<a?a:v>b?b:v,lerp=(a,b,t)=>a+(b-a)*t;
const M={
  id(){return new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);},
  persp(f,a,n,fa){const t=1/Math.tan(f/2),o=new Float32Array(16);o[0]=t/a;o[5]=t;o[10]=(fa+n)/(n-fa);o[11]=-1;o[14]=2*fa*n/(n-fa);return o;},
  mul(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++){let s=0;for(let k=0;k<4;k++)s+=a[k*4+r]*b[c*4+k];o[c*4+r]=s;}return o;},
  basis(r,u,z,p){return new Float32Array([r[0],r[1],r[2],0,u[0],u[1],u[2],0,z[0],z[1],z[2],0,p[0],p[1],p[2],1]);},
  view(r,u,f,p){const d=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
    return new Float32Array([r[0],u[0],-f[0],0,r[1],u[1],-f[1],0,r[2],u[2],-f[2],0,-d(r,p),-d(u,p),d(f,p),1]);},
  rotX(a){const c=Math.cos(a),s=Math.sin(a);return new Float32Array([1,0,0,0,0,c,s,0,0,-s,c,0,0,0,0,1]);},
  rotY(a){const c=Math.cos(a),s=Math.sin(a);return new Float32Array([c,0,-s,0,0,1,0,0,s,0,c,0,0,0,0,1]);},
  rotZ(a){const c=Math.cos(a),s=Math.sin(a);return new Float32Array([c,s,0,0,-s,c,0,0,0,0,1,0,0,0,0,1]);},
  trans(x,y,z){const m=M.id();m[12]=x;m[13]=y;m[14]=z;return m;},
  scale(s){const m=M.id();m[0]=m[5]=m[10]=s;return m;}
};
const v3={add:(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]],sub:(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],mul:(a,s)=>[a[0]*s,a[1]*s,a[2]*s],
  dot:(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],cross:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],
  len:a=>Math.hypot(a[0],a[1],a[2]),norm:a=>{const l=Math.hypot(a[0],a[1],a[2])||1;return[a[0]/l,a[1]/l,a[2]/l];}};
let _s=20261101;function rnd(){_s^=_s<<13;_s^=_s>>>17;_s^=_s<<5;return(_s>>>0)/4294967296;}
function qmul(a,b){return[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];}
function qeul(yaw,tx,tz){const qy=[0,Math.sin(yaw/2),0,Math.cos(yaw/2)],qx=[Math.sin(tx/2),0,0,Math.cos(tx/2)],qz=[0,0,Math.sin(tz/2),Math.cos(tz/2)];return qmul(qy,qmul(qx,qz));}
const fmt=n=>Math.floor(n).toLocaleString('en-US');

/* ------------------------------ GL helpers ------------------------------ */
function compile(type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);
  if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const log=gl.getShaderInfoLog(s);console.error(log+'\n'+src.split('\n').map((l,i)=>(i+1)+': '+l).join('\n'));throw new Error('Shader error: '+log);}return s;}
function program(vs,fs){const p=gl.createProgram();gl.attachShader(p,compile(gl.VERTEX_SHADER,vs));gl.attachShader(p,compile(gl.FRAGMENT_SHADER,fs));gl.linkProgram(p);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error('Link error: '+gl.getProgramInfoLog(p));
  const u={},n=gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);
  for(let i=0;i<n;i++){const inf=gl.getActiveUniform(p,i);u[inf.name.replace(/\[0\]$/,'')]=gl.getUniformLocation(p,inf.name);}
  return{p,u};}

/* ------------------------------ world data ------------------------------ */
const HX=28,HZ=20,HH=5,D=.8;           // half-size x, half-size z, ceiling, shelf depth
const NT=8,NV=3,PER=13000,N=NT*NV*PER; // 312,000 toys
const CAT=[
 {n:'TEDDY BEARS',hc:[.62,.36,.2],pay:1,sc:.40,vars:[['Barnaby',[.62,.38,.2]],['Honey',[.96,.76,.34]],['Cocoa',[.42,.26,.17]]]},
 {n:'RUBBER DUCKS',hc:[.98,.78,.1],pay:1,sc:.32,vars:[['Sunny',[1,.86,.1]],['Captain Quack',[.2,.5,.92]],['Daisy',[1,.56,.76]]]},
 {n:'TOY CARS',hc:[.9,.15,.12],pay:1,sc:.34,vars:[['Speedy',[.94,.14,.12]],['Taxi Tom',[1,.76,.05]],['Blue Racer',[.15,.42,.96]]]},
 {n:'BUILDING BLOCKS',hc:[.1,.5,.95],pay:1,sc:.3,vars:[['Classic Red',[.9,.12,.1]],['Ocean Blue',[.1,.45,.95]],['Lime Brick',[.45,.85,.15]]]},
 {n:'BOUNCY BALLS',hc:[.85,.2,.6],pay:1,sc:.34,vars:[['Sunburst',[1,.72,.1]],['Berry Pop',[.88,.16,.55]],['Minty',[.2,.85,.65]]]},
 {n:'ROBOTS',hc:[.35,.4,.55],pay:1,sc:.36,vars:[['Bolt',[.96,.46,.1]],['Gizmo',[.72,.74,.8]],['Max',[.25,.76,.36]]]},
 {n:'DINOSAURS',hc:[.25,.65,.3],pay:1,sc:.38,vars:[['Rexy',[.3,.72,.26]],['Spike',[.62,.36,.86]],['Stego',[.96,.5,.2]]]},
 {n:'BUNNIES',hc:[.7,.5,.85],pay:1,sc:.38,vars:[['Snowball',[.96,.96,.98]],['Peanut',[.82,.62,.42]],['Lilac',[.76,.6,.95]]]}
];
const UNITX=[-21,-7,7,21],BOARDY=[.5,1.15,1.8],SLOTS=48,SLOTX=.45;
const UNITS=[];for(let u=0;u<8;u++){const south=u>=4;UNITS.push({t:u,cx:UNITX[u%4],south,wallZ:south?HZ:-HZ,dz:south?-1:1,frontZ:south?HZ-D:-HZ+D});}
const BLOCKS=[]; // collision boxes
for(const u of UNITS)BLOCKS.push(u.south?{x0:u.cx-5.8,x1:u.cx+5.8,z0:u.frontZ-.25,z1:HZ}:{x0:u.cx-5.8,x1:u.cx+5.8,z0:-HZ,z1:u.frontZ+.25});
BLOCKS.push({x0:21.4,x1:23.8,z0:-2.2,z1:2.2},{x0:-14.4,x1:-13.6,z0:-.4,z1:.4},{x0:13.6,x1:14.4,z0:-.4,z1:.4});
const blocked=(x,z,m=0)=>{for(const b of BLOCKS)if(x>b.x0-m&&x<b.x1+m&&z>b.z0-m&&z<b.z1+m)return true;return false;};
const CELL=.5,GW=Math.ceil(HX*2/CELL),GH=Math.ceil(HZ*2/CELL);
const cellOf=(x,z)=>{const i=Math.floor((x+HX)/CELL),j=Math.floor((z+HZ)/CELL);return(i<0||j<0||i>=GW||j>=GH)?-1:j*GW+i;};
const CH=5,CW=Math.ceil(HX*2/CH),CHH=Math.ceil(HZ*2/CH),NC=CW*CHH;

/* ------------------------------ procedural textures ------------------------------ */
function mk(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return[c,c.getContext('2d')];}
function noise(g,w,h,a,rr=1){const id=g.getImageData(0,0,w,h),d=id.data;for(let i=0;i<d.length;i+=4){const n=(Math.random()-.5)*a;d[i]+=n;d[i+1]+=n;d[i+2]+=n*rr;}g.putImageData(id,0,0);}
function texFloor(){const[c,g]=mk(256,256);const cols=['#f6ecd2','#9fdad0','#f6ecd2','#9fdad0'];
  for(let i=0;i<2;i++)for(let j=0;j<2;j++){g.fillStyle=cols[i*2+j];g.fillRect(i*128,j*128,128,128);}
  for(let i=0;i<2;i++)for(let j=0;j<2;j++){const x=i*128,y=j*128;const gr=g.createLinearGradient(x,y,x+128,y+128);gr.addColorStop(0,'#fff3');gr.addColorStop(1,'#0002');g.fillStyle=gr;g.fillRect(x,y,128,128);}
  g.strokeStyle='#6d8a85';g.lineWidth=3;g.beginPath();g.moveTo(0,0);g.lineTo(256,0);g.moveTo(0,128);g.lineTo(256,128);g.moveTo(0,0);g.lineTo(0,256);g.moveTo(128,0);g.lineTo(128,256);g.stroke();
  noise(g,256,256,14);return c;}
function texWall(){const[c,g]=mk(256,256);g.fillStyle='#f4e3b0';g.fillRect(0,0,256,256);noise(g,256,256,10);return c;}
function texCeil(){const[c,g]=mk(256,256);g.fillStyle='#f3f1ec';g.fillRect(0,0,256,256);noise(g,256,256,22);g.strokeStyle='#bbb6aa';g.lineWidth=3;g.strokeRect(0,0,256,256);return c;}
function texShelf(){const[c,g]=mk(256,256);g.fillStyle='#f7f4ee';g.fillRect(0,0,256,256);noise(g,256,256,8);return c;}
function texWood(){const[c,g]=mk(256,256);g.fillStyle='#c98f55';g.fillRect(0,0,256,256);for(let i=0;i<70;i++){g.strokeStyle=`rgba(90,50,20,${.1+Math.random()*.18})`;g.lineWidth=1+Math.random()*2;g.beginPath();const y=Math.random()*256;g.moveTo(0,y);g.bezierCurveTo(80,y+(Math.random()-.5)*14,170,y+(Math.random()-.5)*14,256,y);g.stroke();}noise(g,256,256,10);return c;}
const TEXS=[texFloor,texWall,texCeil,texShelf,texWood];
const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D_ARRAY,tex);gl.texImage3D(gl.TEXTURE_2D_ARRAY,0,gl.RGBA8,256,256,TEXS.length,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
TEXS.forEach((f,i)=>gl.texSubImage3D(gl.TEXTURE_2D_ARRAY,0,0,0,i,256,256,1,gl.RGBA,gl.UNSIGNED_BYTE,f()));
gl.generateMipmap(gl.TEXTURE_2D_ARRAY);gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_WRAP_T,gl.REPEAT);
const aniso=gl.getExtension('EXT_texture_filter_anisotropic');if(aniso)gl.texParameterf(gl.TEXTURE_2D_ARRAY,aniso.TEXTURE_MAX_ANISOTROPY_EXT,8);

/* label atlas: 4 columns x 9 rows of 512x128 cells */
const AW=2048,AH=1152,CWd=512,CHd=128;
const [atC,atG]=mk(AW,AH);
const [tgC,tgG]=mk(CWd,CHd);
const css=c=>`rgb(${Math.round(c[0]*255)},${Math.round(c[1]*255)},${Math.round(c[2]*255)})`;
function drawHeader(g,t){const c=CAT[t].hc;g.fillStyle=css(c);g.fillRect(0,0,CWd,CHd);
  const gr=g.createLinearGradient(0,0,0,CHd);gr.addColorStop(0,'#fff4');gr.addColorStop(.5,'#fff0');gr.addColorStop(1,'#0003');g.fillStyle=gr;g.fillRect(0,0,CWd,CHd);
  g.strokeStyle='#fff';g.lineWidth=6;g.strokeRect(6,6,CWd-12,CHd-12);g.fillStyle='#fff';g.textAlign='center';g.textBaseline='middle';
  let fs=70;g.font=`900 ${fs}px "Arial Rounded MT Bold","Trebuchet MS",Arial`;while(g.measureText(CAT[t].n).width>CWd-50)g.font=`900 ${--fs}px "Arial Rounded MT Bold","Trebuchet MS",Arial`;
  g.shadowColor='#0007';g.shadowBlur=6;g.shadowOffsetY=3;g.fillText(CAT[t].n,CWd/2,CHd/2+4);g.shadowColor='transparent';}
function drawTag(g,t,v,n){const[name,col]=CAT[t].vars[v];g.fillStyle='#fffdf6';g.fillRect(0,0,CWd,CHd);g.fillStyle=css(col);g.fillRect(0,0,CWd,12);g.fillRect(0,CHd-12,CWd,12);
  g.beginPath();g.arc(58,CHd/2,34,0,TAU);g.fillStyle=css(col);g.fill();g.lineWidth=5;g.strokeStyle='#222';g.stroke();
  g.fillStyle='#1d1a2a';g.textAlign='left';g.textBaseline='alphabetic';g.font='900 52px "Arial Rounded MT Bold","Trebuchet MS",Arial';g.fillText(name,108,66);
  g.font='700 34px "Trebuchet MS",Arial';g.fillStyle=n>=PER?'#0f9a46':'#6a6577';g.fillText(fmt(n)+' / '+fmt(PER)+(n>=PER?'  FULL':''),108,106);}
function drawBanner(g){const gr=g.createLinearGradient(0,0,CWd,0);gr.addColorStop(0,'#ff5a7a');gr.addColorStop(.5,'#ffb21c');gr.addColorStop(1,'#33b6ff');g.fillStyle=gr;g.fillRect(0,0,CWd,CHd);
  g.strokeStyle='#fff';g.lineWidth=6;g.strokeRect(6,6,CWd-12,CHd-12);g.fillStyle='#fff';g.textAlign='center';g.textBaseline='middle';g.font='900 74px "Arial Rounded MT Bold","Trebuchet MS",Arial';g.shadowColor='#0008';g.shadowBlur=6;g.shadowOffsetY=4;g.fillText('TOY TOWN',CWd/2,CHd/2+4);}
const cellPos=k=>[(k%4)*CWd,Math.floor(k/4)*CHd];
for(let t=0;t<NT;t++){drawHeader(atG,t);const[x,y]=cellPos(t);}  // header drawn at 0,0 then relocated below
{ // redraw properly into cells
  atG.clearRect(0,0,AW,AH);
  for(let t=0;t<NT;t++){const[x,y]=cellPos(t);tgG.clearRect(0,0,CWd,CHd);drawHeader(tgG,t);atG.drawImage(tgC,x,y);}
  for(let t=0;t<NT;t++)for(let v=0;v<NV;v++){const[x,y]=cellPos(8+t*3+v);tgG.clearRect(0,0,CWd,CHd);drawTag(tgG,t,v,0);atG.drawImage(tgC,x,y);}
  {const[x,y]=cellPos(32);tgG.clearRect(0,0,CWd,CHd);drawBanner(tgG);atG.drawImage(tgC,x,y);}
}
const labTex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,labTex);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,atC);
gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);if(aniso)gl.texParameterf(gl.TEXTURE_2D,aniso.TEXTURE_MAX_ANISOTROPY_EXT,8);
const tagDirty=new Set();
function flushTags(){for(const k of tagDirty){const t=Math.floor(k/3),v=k%3;tgG.clearRect(0,0,CWd,CHd);drawTag(tgG,t,v,G.stock[k]);const[x,y]=cellPos(8+k);gl.bindTexture(gl.TEXTURE_2D,labTex);gl.texSubImage2D(gl.TEXTURE_2D,0,x,y,gl.RGBA,gl.UNSIGNED_BYTE,tgC);}
  if(tagDirty.size){gl.bindTexture(gl.TEXTURE_2D,labTex);gl.generateMipmap(gl.TEXTURE_2D);tagDirty.clear();}}

/* ------------------------------ hall mesh ------------------------------ */
class MB{constructor(){this.v=[];this.i=[];}
  vert(p,n,u,v,c,l){this.v.push(p[0],p[1],p[2],n[0],n[1],n[2],u,v,c[0],c[1],c[2],l);return this.v.length/12-1;}
  quad(a,b,c,d){this.i.push(a,b,c,a,c,d);}
  face(p0,p1,p2,p3,n,col,layer,us=1,vs=1){const w=v3.len(v3.sub(p1,p0))/us,h=v3.len(v3.sub(p3,p0))/vs;
    this.quad(this.vert(p0,n,0,0,col,layer),this.vert(p1,n,w,0,col,layer),this.vert(p2,n,w,h,col,layer),this.vert(p3,n,0,h,col,layer));}
  uvface(p0,p1,p2,p3,n,col,layer,uv){this.quad(this.vert(p0,n,uv[0],uv[1],col,layer),this.vert(p1,n,uv[2],uv[3],col,layer),this.vert(p2,n,uv[4],uv[5],col,layer),this.vert(p3,n,uv[6],uv[7],col,layer));}
  box(x0,y0,z0,x1,y1,z1,col,layer,us=1){const f=(a,b,c,d,n)=>this.face(a,b,c,d,n,col,layer,us,us);
    f([x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1],[0,0,1]);f([x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0],[0,0,-1]);
    f([x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[1,0,0]);f([x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0],[-1,0,0]);
    f([x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0],[0,1,0]);f([x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1],[0,-1,0]);}
  cyl(cx,cy,cz,r,h,seg,col,layer){for(let i=0;i<seg;i++){const a0=i/seg*TAU,a1=(i+1)/seg*TAU,c0=Math.cos(a0),s0=Math.sin(a0),c1=Math.cos(a1),s1=Math.sin(a1);
    const q=[cx+c0*r,cz+s0*r,cx+c1*r,cz+s1*r];this.quad(this.vert([q[0],cy,q[1]],[c0,0,s0],0,0,col,layer),this.vert([q[2],cy,q[3]],[c1,0,s1],0,0,col,layer),this.vert([q[2],cy+h,q[3]],[c1,0,s1],0,0,col,layer),this.vert([q[0],cy+h,q[1]],[c0,0,s0],0,0,col,layer));
    const ct=this.vert([cx,cy+h,cz],[0,1,0],0,0,col,layer),a=this.vert([q[0],cy+h,q[1]],[0,1,0],0,0,col,layer),b=this.vert([q[2],cy+h,q[3]],[0,1,0],0,0,col,layer);this.i.push(ct,b,a);}}
  build(){const vb=gl.createBuffer(),ib=gl.createBuffer(),n=this.i.length;gl.bindBuffer(gl.ARRAY_BUFFER,vb);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(this.v),gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,this.v.length/12>65535?new Uint32Array(this.i):new Uint16Array(this.i),gl.STATIC_DRAW);return{vb,ib,n,t:this.v.length/12>65535?gl.UNSIGNED_INT:gl.UNSIGNED_SHORT};}}
const EM=-2,PL=-1,L_FLOOR=0,L_WALL=1,L_CEIL=2,L_SHELF=3,L_WOOD=4,L_LAB=10;
const LIGHTS=[];for(const x of[-18,-6,6,18])for(const z of[-9,9])LIGHTS.push([x,HH-.3,z,19]);
function buildHall(){const mb=new MB(),W=[1,1,1];
  mb.face([-HX,0,HZ],[HX,0,HZ],[HX,0,-HZ],[-HX,0,-HZ],[0,1,0],W,L_FLOOR,1.6,1.6);
  mb.face([-HX,HH,-HZ],[HX,HH,-HZ],[HX,HH,HZ],[-HX,HH,HZ],[0,-1,0],W,L_CEIL,1.2,1.2);
  const wall=(a,b,n)=>{ // upper wall + coloured wainscot + trims; a,b ground points
    const up=(y)=>[a[0],y,a[1]],upb=(y)=>[b[0],y,b[1]];
    mb.face(up(1.1),upb(1.1),upb(HH),up(HH),n,W,L_WALL,2,2);
    mb.face(up(0),upb(0),upb(1.1),up(1.1),n,[.35,.72,.75],PL,1,1);
    const o=v3.mul(n,.03);mb.face(v3.add(up(1.1),o),v3.add(upb(1.1),o),v3.add(upb(1.22),o),v3.add(up(1.22),o),n,[.98,.98,.95],PL);
    mb.face(v3.add(up(HH-.25),o),v3.add(upb(HH-.25),o),v3.add(upb(HH-.1),o),v3.add(up(HH-.1),o),n,[1,.55,.35],PL);};
  wall([-HX,-HZ],[HX,-HZ],[0,0,1]);wall([HX,HZ],[-HX,HZ],[0,0,-1]);wall([-HX,HZ],[-HX,-HZ],[1,0,0]);wall([HX,-HZ],[HX,HZ],[-1,0,0]);
  // ceiling beams + fixtures
  for(const x of[-24,-12,0,12,24])mb.box(x-.15,HH-.35,-HZ,x+.15,HH,HZ,[.93,.93,.9],PL);
  for(const l of LIGHTS){mb.box(l[0]-1.4,HH-.12,l[2]-.35,l[0]+1.4,HH-.05,l[2]+.35,[1,.97,.88],EM);mb.box(l[0]-1.5,HH-.16,l[2]-.45,l[0]+1.5,HH-.1,l[2]+.45,[.85,.85,.85],PL);}
  // windows on the side walls
  for(const z of[-12,-4,4,12]){for(const sx of[-1,1]){const x=sx*(HX-.04),n=[-sx,0,0];
    mb.face([x,1.6,z-1.4],[x,1.6,z+1.4],[x,3.9,z+1.4],[x,3.9,z-1.4],n,[.78,.92,1],EM);
    const o=sx*-.05;mb.box(sx>0?HX-.14:-HX,1.5,z-1.55,sx>0?HX:-HX+.14,1.6,z+1.55,[1,1,1],PL);mb.box(sx>0?HX-.14:-HX,3.9,z-1.55,sx>0?HX:-HX+.14,4.0,z+1.55,[1,1,1],PL);
    mb.box(sx>0?HX-.14:-HX,1.5,z-1.55,sx>0?HX:-HX+.14,4,z-1.4,[1,1,1],PL);mb.box(sx>0?HX-.14:-HX,1.5,z+1.4,sx>0?HX:-HX+.14,4,z+1.55,[1,1,1],PL);mb.box(sx>0?HX-.12:-HX,2.7,z-1.4,sx>0?HX:-HX+.12,2.76,z+1.4,[1,1,1],PL);}}
  // pillars
  for(const x of[-14,14])mb.box(x-.4,0,-.4,x+.4,HH,.4,[.97,.95,.9],L_WALL,1.5);
  // east banner + counter
  {const k=32,u0=(k%4)*.25,v0=Math.floor(k/4)/9,u1=u0+.25,v1=v0+1/9,x=HX-.05;mb.uvface([x,3.2,-3],[x,3.2,3],[x,4.1,3],[x,4.1,-3],[-1,0,0],W,L_LAB,[u0,v1,u1,v1,u1,v0,u0,v0]);}
  mb.box(21.4,0,-2.2,23.8,1.05,2.2,[1,1,1],L_WOOD,1.5);mb.box(21.3,1.05,-2.3,23.9,1.12,2.3,[.95,.95,.92],PL);
  mb.box(22.2,1.12,-.5,23,1.4,.5,[.2,.22,.26],PL);mb.box(22.2,1.4,-.4,22.35,1.8,.4,[.2,.22,.26],PL);mb.face([22.34,1.45,-.35],[22.34,1.45,.35],[22.34,1.78,.35],[22.34,1.78,-.35],[-1,0,0],[.5,1,.7],EM);
  // shelving units
  for(const u of UNITS){const{cx,wallZ,dz,frontZ,south,t}=u,x0=cx-5.6,x1=cx+5.6,fz=(a,b)=>dz>0?[wallZ+a,wallZ+b]:[wallZ-b,wallZ-a];
    const[za,zb]=fz(0,D);
    mb.box(x0,0,Math.min(...fz(0,.04)),x1,2.4,Math.max(...fz(0,.04)),[.9,.88,.84],L_SHELF,1.2); // back panel
    for(let i=0;i<=4;i++){const x=lerp(x0,x1,i/4);mb.box(x-.05,0,Math.min(za,zb),x+.05,2.4,Math.max(za,zb),[.55,.6,.7],PL);}
    mb.box(x0-.05,2.35,Math.min(za,zb),x1+.05,2.45,Math.max(za,zb),[.55,.6,.7],PL);
    mb.box(x0,0,Math.min(za,zb),x1,.12,Math.max(za,zb),[.35,.38,.45],PL); // plinth
    for(let l=0;l<3;l++){const by=BOARDY[l];mb.box(x0,by-.06,Math.min(za,zb),x1,by,Math.max(za,zb),[1,1,1],L_SHELF,1.2);
      const lip=dz>0?[zb-.03,zb]:[zb,zb+.03];mb.box(x0,by-.2,Math.min(...lip),x1,by,Math.max(...lip),[CAT[t].hc[0]*.9+.1,CAT[t].hc[1]*.9+.1,CAT[t].hc[2]*.9+.1],PL);
      // tag plates
      const k=8+t*3+l,u0=(k%4)*.25,v0=Math.floor(k/4)/9,u1=u0+.25,v1=v0+1/9,zz=zb+dz*.004;
      for(const px of[x0+1.2,cx,x1-1.2]){const xa=px-.5,xb=px+.5,ya=by-.2,yb=by-.0;const L=dz>0?xa:xb,R=dz>0?xb:xa;mb.uvface([L,ya,zz],[R,ya,zz],[R,yb,zz],[L,yb,zz],[0,0,dz],W,L_LAB,[u0,v1,u1,v1,u1,v0,u0,v0]);}}
    // header sign
    {const k=t,u0=(k%4)*.25,v0=Math.floor(k/4)/9,u1=u0+.25,v1=v0+1/9,zz=wallZ+dz*.06,L=dz>0?cx-3.2:cx+3.2,R=dz>0?cx+3.2:cx-3.2;
      mb.uvface([L,2.62,zz],[R,2.62,zz],[R,3.42,zz],[L,3.42,zz],[0,0,dz],W,L_LAB,[u0,v1,u1,v1,u1,v0,u0,v0]);
      mb.box(cx-3.3,2.55,Math.min(wallZ,wallZ+dz*.06),cx+3.3,2.62,Math.max(wallZ,wallZ+dz*.06),[.3,.3,.35],PL);mb.box(cx-3.3,3.42,Math.min(wallZ,wallZ+dz*.06),cx+3.3,3.5,Math.max(wallZ,wallZ+dz*.06),[.3,.3,.35],PL);}}
  return mb.build();}
const hall=buildHall();

/* ------------------------------ toy meshes ------------------------------ */
function buildToy(t,lod){const V=[],I=[],seg=lod?5:7,rings=lod?3:4;
  const push=(p,n,c,tn)=>{V.push(p[0],p[1],p[2],n[0],n[1],n[2],c[0],c[1],c[2],tn);return V.length/10-1;};
  const ell=(cx,cy,cz,rx,ry,rz,c,tn=0,cf)=>{const b=V.length/10;for(let j=0;j<=rings;j++){const ph=Math.PI*j/rings;for(let i=0;i<=seg;i++){const th=TAU*i/seg,x=Math.sin(ph)*Math.cos(th),y=Math.cos(ph),z=Math.sin(ph)*Math.sin(th);
      const n=v3.norm([x/rx,y/ry,z/rz]);const cc=cf?cf(i,j):c;push([cx+rx*x,cy+ry*y,cz+rz*z],n,cc,tn);}}
    for(let j=0;j<rings;j++)for(let i=0;i<seg;i++){const a=b+j*(seg+1)+i,bb=a+1,cc=a+seg+1,d=cc+1;I.push(a,cc,bb,bb,cc,d);}};
  const box=(cx,cy,cz,sx,sy,sz,c,tn=0)=>{const hx=sx/2,hy=sy/2,hz=sz/2,F=(ps,n)=>{const b=V.length/10;for(const p of ps)push([cx+p[0]*hx,cy+p[1]*hy,cz+p[2]*hz],n,c,tn);I.push(b,b+1,b+2,b,b+2,b+3);};
    F([[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],[0,0,1]);F([[1,-1,-1],[-1,-1,-1],[-1,1,-1],[1,1,-1]],[0,0,-1]);F([[1,-1,1],[1,-1,-1],[1,1,-1],[1,1,1]],[1,0,0]);
    F([[-1,-1,-1],[-1,-1,1],[-1,1,1],[-1,1,-1]],[-1,0,0]);F([[-1,1,1],[1,1,1],[1,1,-1],[-1,1,-1]],[0,1,0]);F([[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1]],[0,-1,0]);};
  const cyl=(ax,cx,cy,cz,r,len,c,tn=0,sg=lod?6:8)=>{const m=(a,b,l)=>ax==='x'?[l,a,b]:ax==='y'?[a,l,b]:[a,b,l];const b0=V.length/10;
    for(let i=0;i<=sg;i++){const a=i/sg*TAU,ca=Math.cos(a),sa=Math.sin(a);for(const l of[-len/2,len/2]){const p=m(ca*r,sa*r,l),n=m(ca,sa,0);push([cx+p[0],cy+p[1],cz+p[2]],n,c,tn);}}
    for(let i=0;i<sg;i++){const a=b0+i*2;I.push(a,a+1,a+3,a,a+3,a+2);}
    for(const s of[-1,1]){const cp=m(0,0,s*len/2),ci=push([cx+cp[0],cy+cp[1],cz+cp[2]],m(0,0,s),c,tn);const ring=[];for(let i=0;i<=sg;i++){const a=i/sg*TAU,p=m(Math.cos(a)*r,Math.sin(a)*r,s*len/2);ring.push(push([cx+p[0],cy+p[1],cz+p[2]],m(0,0,s),c,tn));}
      for(let i=0;i<sg;i++)I.push(ci,ring[i],ring[i+1]);}};
  const P=(major,f)=>{if(!lod||major)f();};
  const W=[1,1,1],DK=[.08,.07,.09],CR=[1,.92,.78];
  if(t===0){P(1,()=>ell(0,-.05,0,.36,.4,.3,W,1));P(1,()=>ell(0,.46,.04,.29,.26,.26,W,1));P(0,()=>{ell(-.21,.7,0,.1,.1,.07,W,1);ell(.21,.7,0,.1,.1,.07,W,1);ell(0,.4,.28,.13,.1,.1,CR);ell(0,.45,.37,.045,.035,.03,DK);ell(-.1,.53,.27,.035,.035,.02,DK);ell(.1,.53,.27,.035,.035,.02,DK);});
    P(1,()=>{ell(-.42,.05,.08,.11,.23,.12,W,1);ell(.42,.05,.08,.11,.23,.12,W,1);});P(1,()=>{ell(-.2,-.42,.1,.15,.12,.18,W,1);ell(.2,-.42,.1,.15,.12,.18,W,1);});P(0,()=>ell(0,-.12,.27,.14,.16,.05,CR));}
  else if(t===1){P(1,()=>ell(0,-.15,0,.42,.32,.5,W,1));P(1,()=>ell(0,.3,.22,.26,.26,.26,W,1));P(1,()=>box(0,.25,.52,.2,.07,.18,[1,.55,.1]));P(0,()=>{ell(-.4,-.1,-.05,.08,.18,.3,W,1);ell(.4,-.1,-.05,.08,.18,.3,W,1);ell(0,0,-.5,.1,.12,.16,W,1);ell(-.12,.36,.42,.035,.035,.02,DK);ell(.12,.36,.42,.035,.035,.02,DK);});}
  else if(t===2){P(1,()=>box(0,-.12,0,.6,.22,1,W,1));P(1,()=>box(0,.1,-.12,.5,.24,.5,[.7,.85,.95]));P(1,()=>{for(const sx of[-1,1])for(const sz of[-1,1])cyl('x',sx*.33,-.22,sz*.32,.17,.12,DK);});
    P(0,()=>{box(-.2,-.1,.5,.14,.08,.03,[1,.95,.6]);box(.2,-.1,.5,.14,.08,.03,[1,.95,.6]);box(0,.24,-.12,.5,.03,.5,W,1);box(0,.0,-.5,.5,.1,.03,[.9,.1,.1]);for(const sx of[-1,1])for(const sz of[-1,1])cyl('x',sx*.36,-.22,sz*.32,.08,.05,[.8,.8,.85]);});}
  else if(t===3){P(1,()=>box(0,-.05,0,.9,.5,.5,W,1));P(1,()=>{for(let i=0;i<4;i++)for(let j=0;j<2;j++)cyl('y',-.33+i*.22,.28,-.13+j*.26,.085,.12,W,1,lod?5:7);});}
  else if(t===4){const bands=(i,j)=>[(i&1)?[1,1,1]:[1,1,1],0];P(1,()=>ell(0,0,0,.46,.46,.46,W,1,(i,j)=>(((i+(j>>1))&1)?[.98,.98,.98]:[1,1,1])));
    P(0,()=>{ell(0,.46,0,.1,.04,.1,[.1,.1,.12]);}); }
  else if(t===5){P(1,()=>box(0,0,0,.62,.56,.42,W,1));P(1,()=>box(0,.5,0,.44,.34,.38,W,1));P(1,()=>{box(-.16,-.46,0,.18,.34,.2,[.4,.42,.48]);box(.16,-.46,0,.18,.34,.2,[.4,.42,.48]);});
    P(0,()=>{box(-.1,.54,.2,.1,.08,.03,[.3,1,1]);box(.1,.54,.2,.1,.08,.03,[.3,1,1]);box(0,.05,.22,.3,.24,.03,[.95,.95,.9]);box(-.42,.05,0,.14,.4,.16,[.55,.57,.62]);box(.42,.05,0,.14,.4,.16,[.55,.57,.62]);cyl('y',0,.78,0,.025,.2,[.5,.5,.55]);ell(0,.9,0,.06,.06,.06,[1,.2,.2]);});}
  else if(t===6){P(1,()=>ell(0,-.1,-.02,.3,.34,.52,W,1));P(1,()=>ell(0,.3,.42,.2,.24,.22,W,1));P(1,()=>ell(0,-.14,-.62,.13,.13,.36,W,1));P(0,()=>{ell(0,.28,.6,.13,.1,.13,W,1);ell(-.1,.4,.52,.035,.035,.02,DK);ell(.1,.4,.52,.035,.035,.02,DK);
      for(let i=0;i<4;i++)ell(0,.28-i*.06,-.2-i*.17,.05,.1,.07,[.96,.84,.5]);ell(-.2,-.4,.1,.12,.12,.16,W,1);ell(.2,-.4,.1,.12,.12,.16,W,1);ell(-.26,.0,.3,.06,.1,.06,W,1);ell(.26,0,.3,.06,.1,.06,W,1);});}
  else {P(1,()=>ell(0,-.1,0,.34,.4,.3,W,1));P(1,()=>ell(0,.4,.06,.26,.24,.24,W,1));P(1,()=>{ell(-.1,.84,0,.08,.3,.055,W,1);ell(.1,.84,0,.08,.3,.055,W,1);});
    P(0,()=>{ell(-.1,.84,.03,.04,.2,.02,[1,.7,.8]);ell(.1,.84,.03,.04,.2,.02,[1,.7,.8]);ell(0,.38,.28,.04,.03,.03,[1,.6,.7]);ell(0,-.1,-.3,.12,.12,.12,[1,1,1]);ell(-.18,-.42,.14,.12,.08,.2,W,1);ell(.18,-.42,.14,.12,.08,.2,W,1);ell(-.1,.47,.24,.03,.03,.02,DK);ell(.1,.47,.24,.03,.03,.02,DK);});}
  const vb=gl.createBuffer(),ib=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,vb);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(V),gl.STATIC_DRAW);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(I),gl.STATIC_DRAW);
  return{vb,ib,n:I.length};}

/* ------------------------------ shaders ------------------------------ */
const LIGHT_GLSL=`
uniform vec4 uL[8]; uniform int uNL; uniform vec3 uCam; uniform float uExp;
vec3 lightAll(vec3 wp,vec3 N,vec3 V,vec3 alb,float spec,float rough){
  vec3 hemi=mix(vec3(.36,.31,.27),vec3(.80,.80,.86),N.y*.5+.5);
  vec3 c=alb*hemi*.8;
  for(int i=0;i<8;i++){ if(i>=uNL)break; vec3 L=uL[i].xyz-wp;float d2=dot(L,L);float R=uL[i].w;float a=clamp(1.-d2/(R*R),0.,1.);a*=a;L*=inversesqrt(d2+1e-4);
    float nl=max(dot(N,L),0.);vec3 H=normalize(L+V);float s=pow(max(dot(N,H),0.),mix(10.,110.,1.-rough))*spec;
    c+=(alb*nl*1.05+vec3(s*.55))*a*vec3(1.,.94,.84);}
  return c;}
vec3 finish(vec3 c,float dist){float f=1.-exp(-dist*.011);c=mix(c,vec3(.74,.72,.7),f*.55);c*=uExp;c=(c*(2.51*c+.03))/(c*(2.43*c+.59)+.14);return pow(clamp(c,0.,1.),vec3(1./2.2));}`;
const litVS=`#version 300 es
precision highp float;
layout(location=0)in vec3 aPos;layout(location=1)in vec3 aNor;layout(location=2)in vec2 aUV;layout(location=3)in vec3 aCol;layout(location=4)in float aL;
uniform mat4 uVP;uniform mat4 uModel;
out vec3 vWP,vN,vCol;out vec2 vUV;flat out float vL;
void main(){vec4 w=uModel*vec4(aPos,1.);vWP=w.xyz;vN=mat3(uModel)*aNor;vUV=aUV;vCol=aCol;vL=aL;gl_Position=uVP*w;}`;
const litFS=`#version 300 es
precision highp float;precision highp sampler2DArray;
in vec3 vWP,vN,vCol;in vec2 vUV;flat in float vL;out vec4 o;
uniform sampler2DArray uTex;uniform sampler2D uLab;
${LIGHT_GLSL}
void main(){vec3 V=normalize(uCam-vWP);vec3 N=normalize(vN);if(dot(N,V)<0.)N=-N;float dist=length(uCam-vWP);
  if(vL<-1.5){o=vec4(finish(vCol*2.4,dist),1.);return;}
  vec3 base;float spec=.12,rough=.6;
  if(vL>=10.){base=pow(texture(uLab,vUV).rgb,vec3(2.2));spec=.04;}
  else if(vL<-.5){base=pow(vCol,vec3(2.2));spec=.2;rough=.45;}
  else{base=pow(texture(uTex,vec3(vUV,vL)).rgb,vec3(2.2))*pow(vCol,vec3(2.2));if(vL<.5){spec=.45;rough=.35;}}
  float ao=abs(N.y)<.5?.6+.4*smoothstep(0.,1.,vWP.y):1.;
  vec3 c=lightAll(vWP,N,V,base,spec,rough)*ao;
  o=vec4(finish(c,dist),1.);}`;
const toyVS=`#version 300 es
precision highp float;
layout(location=0)in vec3 aPos;layout(location=1)in vec3 aNor;layout(location=2)in vec3 aCol;layout(location=3)in float aTint;
layout(location=4)in vec4 aI0;layout(location=5)in vec4 aQ;layout(location=6)in float aVar;
uniform mat4 uVP;uniform vec3 uTint[3];uniform float uLod,uAOH;
out vec3 vWP,vN,vA;out float vAO;
vec3 qr(vec4 q,vec3 v){return v+2.*cross(q.xyz,cross(q.xyz,v)+q.w*v);}
void main(){float sc=aI0.w*uLod;vec3 w=qr(aQ,aPos*sc)+aI0.xyz;vWP=w;vN=qr(aQ,aNor);
  vec3 a=pow(aCol,vec3(2.2));if(aTint>.5)a*=pow(uTint[int(aVar+.5)],vec3(2.2));vA=a;
  vAO=uAOH>0.?mix(.42,1.,smoothstep(0.,uAOH,w.y)):1.;gl_Position=uVP*vec4(w,1.);}`;
const toyFS=`#version 300 es
precision highp float;
in vec3 vWP,vN,vA;in float vAO;out vec4 o;uniform float uSpec,uFuzz;
${LIGHT_GLSL}
void main(){vec3 V=normalize(uCam-vWP);vec3 N=normalize(vN);float dist=length(uCam-vWP);
  vec3 c=lightAll(vWP,N,V,vA,uSpec,.5);c+=vA*pow(1.-max(dot(N,V),0.),3.)*uFuzz*.45;c*=vAO;
  o=vec4(finish(c,dist),1.);}`;
const fxVS=`#version 300 es
precision highp float;layout(location=0)in vec3 aPos;layout(location=1)in vec2 aUV;layout(location=2)in vec4 aCol;uniform mat4 uVP;out vec2 vUV;out vec4 vCol;
void main(){vUV=aUV;vCol=aCol;gl_Position=uVP*vec4(aPos,1.);}`;
const fxFS=`#version 300 es
precision highp float;in vec2 vUV;in vec4 vCol;uniform float uKind;out vec4 o;
void main(){float r=length(vUV);float a;if(uKind<.5)a=exp(-r*r*3.5)*step(r,1.);else a=(smoothstep(.07,0.,abs(r-.9))*.95+smoothstep(1.,0.,r)*.1)*step(r,1.);
  o=vec4(vCol.rgb,vCol.a*a);}`;
const P={lit:program(litVS,litFS),toy:program(toyVS,toyFS),fx:program(fxVS,fxFS)};

/* toy GPU objects */
const MESH=[];for(let t=0;t<NT;t++)MESH.push([buildToy(t,0),buildToy(t,1)]);
const VAOS=MESH.map(pair=>pair.map(m=>{const vao=gl.createVertexArray();gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,m.vb);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,m.ib);
  const st=40;gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,st,0);gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,3,gl.FLOAT,false,st,12);
  gl.enableVertexAttribArray(2);gl.vertexAttribPointer(2,3,gl.FLOAT,false,st,24);gl.enableVertexAttribArray(3);gl.vertexAttribPointer(3,1,gl.FLOAT,false,st,36);
  for(const a of[4,5,6]){gl.enableVertexAttribArray(a);gl.vertexAttribDivisor(a,1);}gl.bindVertexArray(null);return vao;}));
const IS=36; // instance stride: x y z s | qx qy qz qw | variant
function pointInst(buf,off){gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.vertexAttribPointer(4,4,gl.FLOAT,false,IS,off);gl.vertexAttribPointer(5,4,gl.FLOAT,false,IS,off+16);gl.vertexAttribPointer(6,1,gl.FLOAT,false,IS,off+32);}

/* ------------------------------ generate the 312,000 toys ------------------------------ */
const inst=new Float32Array(N*9);const segStart=new Int32Array(NT*NC),segCnt=new Int32Array(NT*NC);
const cellStart=new Int32Array(GW*GH+1),cellCnt=new Int32Array(GW*GH),cellCnt0=new Int32Array(GW*GH),cellItems=new Int32Array(N);
const toyType=new Uint8Array(N),toyVar=new Uint8Array(N);
function genToys(){
  const px=new Float32Array(N),pz=new Float32Array(N);const per=NV*PER;
  for(let t=0;t<NT;t++)for(let k=0;k<per;k++){let x,z;do{x=(rnd()*2-1)*(HX-.55);z=(rnd()*2-1)*(HZ-.55);}while(blocked(x,z,.15));px[t*per+k]=x;pz[t*per+k]=z;}
  // order inside each type by chunk
  const chunkOf=i=>Math.floor((px[i]+HX)/CH)+Math.floor((pz[i]+HZ)/CH)*CW;
  const order=new Int32Array(N);
  for(let t=0;t<NT;t++){const cnt=new Int32Array(NC+1);for(let k=0;k<per;k++)cnt[chunkOf(t*per+k)+1]++;
    for(let c=0;c<NC;c++){segCnt[t*NC+c]=cnt[c+1];}let acc=t*per;for(let c=0;c<NC;c++){segStart[t*NC+c]=acc;acc+=segCnt[t*NC+c];}
    const fill=new Int32Array(NC);for(let k=0;k<per;k++){const i=t*per+k,c=chunkOf(i);order[segStart[t*NC+c]+fill[c]++]=i;}}
  for(let o=0;o<N;o++){const i=order[o],t=Math.floor(i/per),v=Math.floor((i%per)/PER);toyType[o]=t;toyVar[o]=v;
    const y=.05+rnd()*.3,sc=CAT[t].sc*(.82+rnd()*.36);const q=qeul(rnd()*TAU,(rnd()-.5)*(y>.2?2.6:1.2),(rnd()-.5)*(y>.2?2.6:1.2));
    const b=o*9;inst[b]=px[i];inst[b+1]=y;inst[b+2]=pz[i];inst[b+3]=sc;inst[b+4]=q[0];inst[b+5]=q[1];inst[b+6]=q[2];inst[b+7]=q[3];inst[b+8]=v;}
  // picking grid, y-ascending inside each cell
  const cc=new Int32Array(GW*GH+1);for(let o=0;o<N;o++)cc[cellOf(inst[o*9],inst[o*9+2])+1]++;
  for(let c=0;c<GW*GH;c++){cellStart[c+1]=cellStart[c]+cc[c+1];cellCnt[c]=cc[c+1];cellCnt0[c]=cc[c+1];}
  const ord2=new Int32Array(N),yb=new Int32Array(65);for(let o=0;o<N;o++)yb[Math.min(63,Math.floor((inst[o*9+1]-.05)/.3*64))+1]++;for(let b=0;b<64;b++)yb[b+1]+=yb[b];
  for(let o=0;o<N;o++)ord2[yb[Math.min(63,Math.floor((inst[o*9+1]-.05)/.3*64))]++]=o;
  const fill=new Int32Array(GW*GH);for(let k=0;k<N;k++){const o=ord2[k],c=cellOf(inst[o*9],inst[o*9+2]);cellItems[cellStart[c]+fill[c]++]=o;}
}
genToys();
const fieldBuf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,fieldBuf);gl.bufferData(gl.ARRAY_BUFFER,inst,gl.STATIC_DRAW);

/* ------------------------------ game state ------------------------------ */
const UP={
  power:{name:'Vacuum power',desc:'Sucks up more toys per second',vals:[60,140,320,700,1500,3200],cost:[250,900,2800,8500,26000],lvl:0,fmt:v=>fmt(v)+'/s'},
  radius:{name:'Suction reach',desc:'Wider vacuum area',vals:[1.2,1.6,2,2.5,3,3.8],cost:[200,800,2500,7500,22000],lvl:0,fmt:v=>v.toFixed(1)+' m'},
  bag:{name:'Toy bag',desc:'Carry more toys per trip',vals:[300,800,2000,5000,12000,30000],cost:[300,1100,3300,9500,28000],lvl:0,fmt:v=>fmt(v)},
  speed:{name:'Sneakers',desc:'Walk and run faster',vals:[4.4,5,5.6,6.2,6.9,7.6],cost:[250,900,2800,8500,26000],lvl:0,fmt:v=>v.toFixed(1)+' m/s'}
};
const G={state:'menu',scale:1,x:0,z:2,yaw:0,pitch:-.12,eye:0,vy:0,money:0,bag:0,carry:new Int32Array(NT*NV),stock:new Int32Array(NT*NV),stocked:0,left:N,moved:0,
  pulling:false,time:0,tStart:0,keys:{},joy:[0,0],lookDX:0,lookDY:0,bob:0,pull:0,aim:null,active:false,acc:0,toastT:0,fps:60,fpsT:0,fpsN:0,q:1,winT:0,upgOpen:false,unit:null,cam:[0,1.7,2]};
const flyers=[];const FMAX=900;
function spawnFly(o){if(flyers.length<FMAX)flyers.push(o);}

/* ------------------------------ audio ------------------------------ */
const AU={ctx:null,master:null,hg:null,lp:0,
  init(){if(this.ctx)return;try{const C=window.AudioContext||window.webkitAudioContext;this.ctx=new C();this.master=this.ctx.createGain();this.master.gain.value=.5;this.master.connect(this.ctx.destination);
    const len=this.ctx.sampleRate*2,buf=this.ctx.createBuffer(1,len,this.ctx.sampleRate),d=buf.getChannelData(0);for(let i=0;i<len;i++)d[i]=Math.random()*2-1;
    const s=this.ctx.createBufferSource();s.buffer=buf;s.loop=true;const f=this.ctx.createBiquadFilter();f.type='bandpass';f.frequency.value=520;f.Q.value=.9;const g=this.ctx.createGain();g.gain.value=0;s.connect(f);f.connect(g);g.connect(this.master);s.start();this.hg=g;this.hf=f;
    const o=this.ctx.createOscillator(),og=this.ctx.createGain();o.type='sawtooth';o.frequency.value=90;og.gain.value=.12;o.connect(og);og.connect(g);o.start();}catch(e){}},
  setHum(v){if(this.hg){this.hg.gain.setTargetAtTime(v*.2,this.ctx.currentTime,.06);this.hf.frequency.setTargetAtTime(420+v*500,this.ctx.currentTime,.1);}},
  pop(){if(!this.ctx)return;const t=this.ctx.currentTime;if(t-this.lp<.045)return;this.lp=t;const o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type='sine';const f=380+Math.random()*420;o.frequency.setValueAtTime(f,t);o.frequency.exponentialRampToValueAtTime(f*1.8,t+.06);g.gain.setValueAtTime(.1,t);g.gain.exponentialRampToValueAtTime(.0001,t+.09);o.connect(g);g.connect(this.master);o.start(t);o.stop(t+.1);},
  note(f,t0,d,v=.3,type='triangle'){if(!this.ctx)return;const t=this.ctx.currentTime+t0,o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type=type;o.frequency.value=f;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+.02);g.gain.exponentialRampToValueAtTime(.0001,t+d);o.connect(g);g.connect(this.master);o.start(t);o.stop(t+d+.05);},
  cash(){this.note(1318,0,.3,.22);this.note(1760,.1,.5,.22);this.note(2093,.2,.5,.15);},buy(){this.note(660,0,.2,.25);this.note(990,.09,.3,.25);},no(){this.note(180,0,.25,.25,'square');},
  win(){[523,659,784,1047,1319,1568].forEach((f,i)=>this.note(f,i*.13,.9,.28));}};

/* ------------------------------ gameplay ------------------------------ */
function toast(t,ms=1800){const e=$('toast');e.textContent=t;e.classList.add('on');G.toastT=ms/1000;}
function camBasis(){const sy=Math.sin(G.yaw),cy=Math.cos(G.yaw),sp=Math.sin(G.pitch),cp=Math.cos(G.pitch);const f=[sy*cp,sp,-cy*cp],r=[cy,0,sy];return{f,r,u:v3.cross(r,f)};}
function topAt(x,z){const c=cellOf(x,z);if(c<0||!cellCnt0[c])return 0;return .06+.3*Math.sqrt(cellCnt[c]/cellCnt0[c]);}
function groundAt(x,z){let s=0,n=0;for(const[dx,dz]of[[0,0],[.5,0],[-.5,0],[0,.5],[0,-.5]]){s+=topAt(x+dx,z+dz);n++;}return s/n*.55;}
function updatePlayer(dt){
  const{f,r}=camBasis();let mx=0,mz=0;const k=G.keys;
  if(k.KeyW||k.ArrowUp)mz+=1;if(k.KeyS||k.ArrowDown)mz-=1;if(k.KeyD||k.ArrowRight)mx+=1;if(k.KeyA||k.ArrowLeft)mx-=1;
  mx+=G.joy[0];mz+=-G.joy[1];const l=Math.hypot(mx,mz);if(l>1){mx/=l;mz/=l;}
  const base=UP.speed.vals[UP.speed.lvl];const wade=1-.3*clamp(groundAt(G.x,G.z)/.17,0,1);
  const sp=base*(k.ShiftLeft||k.ShiftRight||Math.hypot(G.joy[0],G.joy[1])>.92?1.55:1)*wade;
  const ff=[Math.sin(G.yaw),-Math.cos(G.yaw)],rr=[Math.cos(G.yaw),Math.sin(G.yaw)];
  const vx=(ff[0]*mz+rr[0]*mx)*sp*dt,vz=(ff[1]*mz+rr[1]*mx)*sp*dt,R=.45;
  const tryMove=(nx,nz)=>{if(Math.abs(nx)>HX-.8||Math.abs(nz)>HZ-.8||blocked(nx,nz,R))return false;G.x=nx;G.z=nz;return true;};
  if(!tryMove(G.x+vx,G.z+vz)){tryMove(G.x+vx,G.z);tryMove(G.x,G.z+vz);}
  const target=groundAt(G.x,G.z);G.eye+=(target-G.eye)*Math.min(1,dt*10);
  if(l>.1)G.bob+=dt*sp*1.8;
}
function aimRay(){const{f}=camBasis(),o=G.cam;G.aim=null;
  for(let d=.3;d<16;d+=.12){const x=o[0]+f[0]*d,y=o[1]+f[1]*d,z=o[2]+f[2]*d;if(y<0){const t=(o[1])/(-f[1]);if(f[1]<0&&t>0){const px=o[0]+f[0]*t,pz=o[2]+f[2]*t;G.aim=[px,0,pz,t];}break;}
    if(Math.abs(x)<HX&&Math.abs(z)<HZ&&y<topAt(x,z)+.04){G.aim=[x,y,z,d];break;}}}
function nozzle(){const{f,r,u}=camBasis();return[G.cam[0]+r[0]*.2+f[0]*.55-u[0]*.17,G.cam[1]+r[1]*.2+f[1]*.55-u[1]*.17,G.cam[2]+r[2]*.2+f[2]*.55-u[2]*.17];}
function updateVac(dt){
  const rate=UP.power.vals[UP.power.lvl],rad=UP.radius.vals[UP.radius.lvl],cap=UP.bag.vals[UP.bag.lvl];
  aimRay();const want=G.pulling&&G.state==='play'&&G.aim&&G.bag<cap&&G.left>0;let active=false;
  if(want){active=true;G.acc+=rate*dt;let q=Math.floor(G.acc);G.acc-=q;q=Math.min(q,cap-G.bag);let got=0,tries=0;const nz=nozzle();
    while(got<q&&tries<q*3+8){tries++;const a=rnd()*TAU,d=Math.sqrt(rnd())*rad,x=G.aim[0]+Math.cos(a)*d,z=G.aim[2]+Math.sin(a)*d,c=cellOf(x,z);if(c<0||!cellCnt[c])continue;
      const idx=cellItems[cellStart[c]+--cellCnt[c]],t=toyType[idx],v=toyVar[idx],b=idx*9;
      if(got<30)spawnFly({t,v,x:inst[b],y:inst[b+1],z:inst[b+2],sc:inst[b+3],k:0,dur:.35+rnd()*.25,mode:0,noz:true,sp:rnd()*8});
      gl.bindBuffer(gl.ARRAY_BUFFER,fieldBuf);inst[b+3]=0;gl.bufferSubData(gl.ARRAY_BUFFER,b*4+12,inst.subarray(b+3,b+4));
      G.carry[t*3+v]++;got++;}
    G.bag+=got;G.left-=got;G.moved+=got;if(got>0&&Math.random()<.5)AU.pop();
    if(G.bag>=cap&&Math.random()<dt*2)toast('BAG FULL — stock a shelf!');}
  else if(G.pulling&&G.state==='play'&&G.bag>=cap&&Math.random()<dt*2)toast('BAG FULL — stock a shelf!');
  G.pull+=((active?1:0)-G.pull)*Math.min(1,dt*9);AU.setHum(G.pull);G.active=active;}
function nearUnit(){for(const u of UNITS){if(Math.abs(G.x-u.cx)<6.4&&Math.abs(G.z-u.frontZ)<3.4)return u;}return null;}
let shelfBuf=gl.createBuffer(),shelfCnt=new Int32Array(NT),shelfOff=new Int32Array(NT),shelfDirty=true;
function rebuildShelf(){const per=[];for(let t=0;t<NT;t++)per.push([]);
  for(const u of UNITS)for(let l=0;l<3;l++){const k=u.t*3+l,n=Math.ceil(G.stock[k]/PER*SLOTS);const sh=CAT[u.t].sc*.8;
    for(let s=0;s<n;s++){const row=s%2,col=s>>1,x=u.cx-5.2+col*SLOTX+(row?.1:0)+((s*37)%7-3)*.01,z=u.wallZ+u.dz*(.22+.36*row);
      const q=qeul((u.south?Math.PI:0)+(((s*53)%11)-5)*.03,0,0);per[u.t].push(x,BOARDY[l]+sh*.46,z,sh,q[0],q[1],q[2],q[3],l);}}
  let tot=0;for(let t=0;t<NT;t++){shelfOff[t]=tot;shelfCnt[t]=per[t].length/9;tot+=shelfCnt[t];}
  const arr=new Float32Array(tot*9);let o=0;for(let t=0;t<NT;t++){arr.set(per[t],o*9);o+=shelfCnt[t];}
  gl.bindBuffer(gl.ARRAY_BUFFER,shelfBuf);gl.bufferData(gl.ARRAY_BUFFER,arr,gl.DYNAMIC_DRAW);shelfDirty=false;}
function doAction(){
  if(G.state!=='play')return;const u=nearUnit();if(!u){toast('Walk up to a shelf with matching toys');return;}
  let n=0,full=false;const t=u.t;const nz=nozzle();
  for(let v=0;v<3;v++){const k=t*3+v,room=PER-G.stock[k],m=Math.min(G.carry[k],room);if(G.carry[k]>room)full=true;if(!m)continue;
    G.carry[k]-=m;G.stock[k]+=m;G.bag-=m;n+=m;tagDirty.add(k);
    for(let i=0;i<Math.min(m,26);i++){const row=i%2,x=u.cx-5.2+((rnd()*SLOTS)>>1)*SLOTX,z=u.wallZ+u.dz*(.22+.36*row);spawnFly({t,v,x:nz[0],y:nz[1],z:nz[2],tx:x,ty:BOARDY[v]+.2,tz:z,sc:CAT[t].sc*.8,k:-i*.03,dur:.5+rnd()*.25,mode:2,sp:rnd()*6});}}
  if(!n){toast(full?'That shelf is already full!':'You are not carrying '+CAT[t].n.toLowerCase()+'…');AU.no();return;}
  G.stocked+=n;G.money+=n*CAT[t].pay;AU.cash();shelfDirty=true;toast('+'+fmt(n*CAT[t].pay)+'$',1300);G.flash=.1;
  if(G.stocked>=N)startWin();}
function buy(k){const u=UP[k];if(u.lvl>=u.vals.length-1)return;const c=u.cost[u.lvl];if(G.money<c){AU.no();return;}G.money-=c;u.lvl++;AU.buy();renderUpg();}
function renderUpg(){$('upgMoney').textContent=fmt(G.money)+'$';const rows=$('urows');rows.innerHTML='';
  for(const k in UP){const u=UP[k],max=u.lvl>=u.vals.length-1;const el=document.createElement('div');el.className='urow';
    el.innerHTML=`<div class="t"><span class="stroke">${u.name}</span> <small>${u.desc} · now ${u.fmt(u.vals[u.lvl])}${max?'':' → '+u.fmt(u.vals[u.lvl+1])}</small><div class="pips">${u.vals.map((_,i)=>`<i class="${i<=u.lvl?'f':''}"></i>`).join('')}</div></div>`;
    const b=document.createElement('button');b.className='ubtn stroke';b.textContent=max?'MAX':fmt(u.cost[u.lvl])+'$';b.disabled=max||G.money<u.cost[u.lvl];b.onclick=()=>buy(k);el.appendChild(b);rows.appendChild(el);}}
function openUpg(v){G.upgOpen=v;$('upgScreen').classList.toggle('on',v);if(v){renderUpg();if(document.pointerLockElement)document.exitPointerLock();G.state='upg';G.pulling=false;}else if(G.state==='upg'){G.state='play';lockPointer();}}
function startWin(){if(G.state==='win')return;G.state='win';G.winT=0;G.pulling=false;$('hud').classList.remove('on');AU.win();G.flash=.6;
  const t=Math.floor((performance.now()-G.tStart)/1000);G.timeTxt=Math.floor(t/60)+'m '+String(t%60).padStart(2,'0')+'s';}
function updateWin(dt){G.winT+=dt;
  if(G.winT<5)for(let i=0;i<10;i++)spawnFly({t:(rnd()*8)|0,v:(rnd()*3)|0,x:G.x+(rnd()-.5)*16,y:HH-.4,z:G.z+(rnd()-.5)*16,vx:(rnd()-.5)*2,vy:-rnd()*1.5,vz:(rnd()-.5)*2,sc:.28+rnd()*.12,k:0,dur:5,mode:1,sp:rnd()*6});
  if(G.winT>2&&!G.winShown){G.winShown=true;$('winStats').innerHTML=`Time <b class="win-stat-highlight">${G.timeTxt}</b> · Toys tidied <b class="win-stat-highlight">${fmt(G.stocked)}</b><br>Cash earned <b class="win-stat-highlight">${fmt(G.money)}$</b>`;$('win').classList.add('on');}}

/* flyers → instance data */
const flyBuf=gl.createBuffer(),flyCnt=new Int32Array(NT),flyOff=new Int32Array(NT);let flyArr=new Float32Array(FMAX*9);
function updateFlyers(dt){const nz=nozzle();const tmp=[];for(let t=0;t<NT;t++)tmp.push([]);
  for(let i=flyers.length-1;i>=0;i--){const f=flyers[i];f.k+=dt/f.dur;if(f.k>=1){flyers.splice(i,1);continue;}if(f.k<0)continue;
    let x,y,z,sc=f.sc,k=f.k,e=k*k*(3-2*k);
    if(f.mode===0){x=lerp(f.x,nz[0],e);y=lerp(f.y,nz[1],e)+Math.sin(k*Math.PI)*.5;z=lerp(f.z,nz[2],e);sc=f.sc*(1-.75*e);}
    else if(f.mode===2){x=lerp(f.x,f.tx,e);y=lerp(f.y,f.ty,e)+Math.sin(k*Math.PI)*.6;z=lerp(f.z,f.tz,e);sc=lerp(f.sc*.3,f.sc,e);}
    else{f.vy-=9*dt;f.x+=f.vx*dt;f.y+=f.vy*dt;f.z+=f.vz*dt;if(f.y<.1){f.y=.1;f.vy*=-.3;f.vx*=.8;f.vz*=.8;}x=f.x;y=f.y;z=f.z;}
    const q=qeul(f.sp*G.time*.8,f.sp*G.time*.5,f.sp*.3);tmp[f.t].push(x,y,z,sc,q[0],q[1],q[2],q[3],f.v);}
  let tot=0;for(let t=0;t<NT;t++){flyOff[t]=tot;flyCnt[t]=tmp[t].length/9;tot+=flyCnt[t];}
  let o=0;for(let t=0;t<NT;t++){flyArr.set(tmp[t],o*9);o+=flyCnt[t];}
  gl.bindBuffer(gl.ARRAY_BUFFER,flyBuf);gl.bufferData(gl.ARRAY_BUFFER,flyArr.subarray(0,tot*9),gl.DYNAMIC_DRAW);}

/* ------------------------------ viewmodel + fx ------------------------------ */
function buildVac(){const mb=new MB(),teal=[.15,.7,.78],or=[1,.5,.12],yel=[1,.82,.15],gr=[.25,.27,.33];
  mb.box(-.07,-.07,-.28,.07,.08,.14,teal,PL);mb.box(-.05,.08,-.18,.05,.13,.08,gr,PL);mb.box(-.035,-.2,-.02,.035,-.06,.06,or,PL);mb.box(-.03,-.06,.06,.03,-.02,.1,gr,PL);
  const cyl=(z0,z1,r0,r1,col,seg=14)=>{for(let i=0;i<seg;i++){const a0=i/seg*TAU,a1=(i+1)/seg*TAU,c0=Math.cos(a0),s0=Math.sin(a0),c1=Math.cos(a1),s1=Math.sin(a1);
    mb.quad(mb.vert([c0*r0,s0*r0,z0],[c0,s0,0],0,0,col,PL),mb.vert([c1*r0,s1*r0,z0],[c1,s1,0],0,0,col,PL),mb.vert([c1*r1,s1*r1,z1],[c1,s1,0],0,0,col,PL),mb.vert([c0*r1,s0*r1,z1],[c0,s0,0],0,0,col,PL));}};
  cyl(.14,.4,.05,.05,yel);cyl(.4,.58,.05,.115,or);cyl(.58,.6,.115,.095,[.12,.12,.15]);return mb.build();}
const vac=buildVac();
const fxBuf=gl.createBuffer();let fxArr=new Float32Array(9*6*700),fxN=0;const fxSegs=[];
function fxQuadW(p,r,u,s,col,uvx=1){const a=[p[0]-r[0]*s-u[0]*s,p[1]-r[1]*s-u[1]*s,p[2]-r[2]*s-u[2]*s],b=[p[0]+r[0]*s-u[0]*s,p[1]+r[1]*s-u[1]*s,p[2]+r[2]*s-u[2]*s],c=[p[0]+r[0]*s+u[0]*s,p[1]+r[1]*s+u[1]*s,p[2]+r[2]*s+u[2]*s],d=[p[0]-r[0]*s+u[0]*s,p[1]-r[1]*s+u[1]*s,p[2]-r[2]*s+u[2]*s];
  const ps=[a,b,c,a,c,d],uv=[[-1,-1],[1,-1],[1,1],[-1,-1],[1,1],[-1,1]];if(fxN+6>fxArr.length/9)return;
  for(let i=0;i<6;i++){fxArr.set([ps[i][0],ps[i][1],ps[i][2],uv[i][0],uv[i][1],col[0],col[1],col[2],col[3]],fxN*9);fxN++;}}
function buildFx(cb){fxN=0;fxSegs.length=0;let s=fxN;
  // ground ring marking the suction area
  if(G.aim&&G.state==='play'){const rad=UP.radius.vals[UP.radius.lvl],ay=G.aim[1]+.02;fxQuadW([G.aim[0],ay,G.aim[2]],[1,0,0],[0,0,1],rad,G.active?[.5,.9,1,.9]:[1,1,1,.5]);}
  if(fxN>s)fxSegs.push({kind:1,s,n:fxN-s});s=fxN;
  if(G.active&&G.aim){const nz=nozzle(),rad=UP.radius.vals[UP.radius.lvl];for(let i=0;i<34;i++){const ph=(G.time*1.7+i/34)%1,a=i*2.399,d=Math.sqrt((i*.618)%1)*rad*(1-ph);
      const p=[lerp(G.aim[0]+Math.cos(a)*d,nz[0],ph*ph),lerp(G.aim[1]+.1,nz[1],ph)+Math.sin(ph*Math.PI)*.35,lerp(G.aim[2]+Math.sin(a)*d,nz[2],ph*ph)];
      fxQuadW(p,cb.r,cb.u,.03+.04*(1-ph),[.7,.95,1,.8]);}
    fxQuadW(nz,cb.r,cb.u,.16,[.5,.85,1,.55]);}
  if(fxN>s)fxSegs.push({kind:0,s,n:fxN-s});
  gl.bindBuffer(gl.ARRAY_BUFFER,fxBuf);gl.bufferData(gl.ARRAY_BUFFER,fxArr.subarray(0,fxN*9),gl.DYNAMIC_DRAW);}
const fxVao=gl.createVertexArray();gl.bindVertexArray(fxVao);gl.bindBuffer(gl.ARRAY_BUFFER,fxBuf);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,36,0);gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,2,gl.FLOAT,false,36,12);gl.enableVertexAttribArray(2);gl.vertexAttribPointer(2,4,gl.FLOAT,false,36,20);gl.bindVertexArray(null);
const hallVao=gl.createVertexArray(),vacVao=gl.createVertexArray();
function bindMB(vao,m){gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,m.vb);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,m.ib);const st=48;
  gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,st,0);gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,3,gl.FLOAT,false,st,12);gl.enableVertexAttribArray(2);gl.vertexAttribPointer(2,2,gl.FLOAT,false,st,24);
  gl.enableVertexAttribArray(3);gl.vertexAttribPointer(3,3,gl.FLOAT,false,st,32);gl.enableVertexAttribArray(4);gl.vertexAttribPointer(4,1,gl.FLOAT,false,st,44);gl.bindVertexArray(null);}
bindMB(hallVao,hall);bindMB(vacVao,vac);

/* ------------------------------ rendering ------------------------------ */
function resize(){const dpr=Math.min(window.devicePixelRatio||1,touch?1.5:1.75)*G.scale;const w=Math.max(320,Math.floor(innerWidth*dpr)),h=Math.max(200,Math.floor(innerHeight*dpr));
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}gl.viewport(0,0,w,h);}
const LARR=new Float32Array(LIGHTS.flat());
const IDM=M.id();
function setLit(p,VP,cam,nl,lights){gl.useProgram(p.p);gl.uniform3fv(p.u.uCam,cam);gl.uniform4fv(p.u.uL,lights);gl.uniform1i(p.u.uNL,nl);gl.uniform1f(p.u.uExp,1.25);if(p.u.uVP)gl.uniformMatrix4fv(p.u.uVP,false,VP);}
const SPEC=[.08,.5,.55,.5,.6,.55,.12,.08],FUZZ=[1,.2,0,0,0,0,.8,1];
function drawToyType(t,lod,buf,off,count,lodScale,aoh){if(count<=0)return;const m=MESH[t][lod];gl.bindVertexArray(VAOS[t][lod]);pointInst(buf,off*IS);
  gl.uniform1f(P.toy.u.uLod,lodScale);gl.drawElementsInstanced(gl.TRIANGLES,m.n,gl.UNSIGNED_SHORT,0,count);}
function frame(now){
  requestAnimationFrame(frame);
  const dt=Math.min(.05,(now-(G.last||now))/1000||.016);G.last=now;G.time+=dt;
  G.fpsT+=dt;G.fpsN++;if(G.fpsT>2.5){G.fps=G.fpsN/G.fpsT;G.fpsT=0;G.fpsN=0;if(!DEBUG&&G.state==='play'){if(G.fps<30&&G.q>.4)G.q=Math.max(.4,G.q-.15);else if(G.fps<24&&G.scale>.6)G.scale=Math.max(.6,G.scale-.15);else if(G.fps>57&&G.q<1)G.q=Math.min(1,G.q+.05);}}
  resize();const playing=G.state==='play';
  if(playing){G.yaw+=G.lookDX;G.pitch=clamp(G.pitch-G.lookDY,-1.5,1.5);G.lookDX=G.lookDY=0;updatePlayer(dt);}
  else{G.lookDX=G.lookDY=0;G.pull*=.9;AU.setHum(G.pull);}
  G.cam=[G.x,G.eye+1.68+(playing?Math.sin(G.bob)*.02:0),G.z];
  if(playing){updateVac(dt);G.unit=nearUnit();}else if(G.state==='win'){updateWin(dt);}
  updateFlyers(dt);
  if(shelfDirty)rebuildShelf();if(tagDirty.size&&(G.time-(G.lastTag||0))>.15){G.lastTag=G.time;flushTags();}
  const cb=camBasis(),cam=G.cam;
  const view=M.view(cb.r,cb.u,cb.f,cam),aspect=canvas.width/canvas.height,proj=M.persp(touch?1.1:1.05,aspect,.06,90),VP=M.mul(proj,view);
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.clearColor(.74,.72,.7,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);
  // hall
  setLit(P.lit,VP,cam,8,LARR);gl.uniformMatrix4fv(P.lit.u.uModel,false,IDM);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D_ARRAY,tex);gl.uniform1i(P.lit.u.uTex,0);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,labTex);gl.uniform1i(P.lit.u.uLab,1);
  gl.bindVertexArray(hallVao);gl.drawElements(gl.TRIANGLES,hall.n,hall.t,0);
  // toys: choose the 4 lights closest to the camera
  const near=LIGHTS.map(l=>[Math.hypot(l[0]-cam[0],l[2]-cam[2]),l]).sort((a,b)=>a[0]-b[0]).slice(0,4);const TL=new Float32Array(16);near.forEach((n,i)=>TL.set(n[1],i*4));
  setLit(P.toy,VP,cam,4,TL);
  const tg=(k)=>gl.uniform3fv(P.toy.u.uTint,new Float32Array(CAT[k].vars.flatMap(v=>v[1])));
  // field
  const fwd2=[cb.f[0],cb.f[2]],fl=Math.hypot(fwd2[0],fwd2[1])||1,fx=fwd2[0]/fl,fz=fwd2[1]/fl,tanH=Math.tan(.5236*1.1)*aspect*1.1+.35,q=G.q;
  const vis=[];for(let c=0;c<NC;c++){const cx=-HX+((c%CW)+.5)*CH,cz=-HZ+(Math.floor(c/CW)+.5)*CH,dx=cx-cam[0],dz=cz-cam[2],d=Math.hypot(dx,dz);if(d>42*(.6+.4*q))continue;
    const fwd=dx*fx+dz*fz;if(fwd<-4.5)continue;const side=Math.abs(dx*-fz+dz*fx);if(side>Math.max(0,fwd)*tanH+4.5)continue;vis.push([c,d]);}
  for(let t=0;t<NT;t++){tg(t);gl.uniform1f(P.toy.u.uSpec,SPEC[t]);gl.uniform1f(P.toy.u.uFuzz,FUZZ[t]);gl.uniform1f(P.toy.u.uAOH,.32);
    for(const[c,d]of vis){const cnt=segCnt[t*NC+c];if(!cnt)continue;const st=segStart[t*NC+c];
      if(d<7)drawToyType(t,0,fieldBuf,st,cnt,1,.32);
      else{let frac=1,ls=1;if(d>13){frac=.55;ls=1.22;}if(d>22){frac=.28;ls=1.5;}frac=Math.min(1,frac/Math.max(.35,q)*.9+0);drawToyType(t,1,fieldBuf,st,Math.ceil(cnt*frac*(d>13?q:1)),ls,.32);}}}
  // shelf + flyers
  for(let t=0;t<NT;t++){tg(t);gl.uniform1f(P.toy.u.uSpec,SPEC[t]);gl.uniform1f(P.toy.u.uFuzz,FUZZ[t]);gl.uniform1f(P.toy.u.uAOH,0);
    drawToyType(t,0,shelfBuf,shelfOff[t],shelfCnt[t],1,0);drawToyType(t,0,flyBuf,flyOff[t],flyCnt[t],1,0);}
  gl.bindVertexArray(null);
  // fx
  buildFx(cb);gl.useProgram(P.fx.p);gl.uniformMatrix4fv(P.fx.u.uVP,false,VP);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE);gl.depthMask(false);gl.bindVertexArray(fxVao);
  for(const s of fxSegs){gl.uniform1f(P.fx.u.uKind,s.kind);gl.drawArrays(gl.TRIANGLES,s.s,s.n);}
  gl.depthMask(true);gl.disable(gl.BLEND);gl.bindVertexArray(null);
  // viewmodel
  if(playing){gl.clear(gl.DEPTH_BUFFER_BIT);const vp=M.persp(1.0,aspect,.02,10),pull=G.pull;
    let m=M.trans(.3+Math.sin(G.bob)*.006,-.27+Math.abs(Math.cos(G.bob))*.006+pull*(Math.random()-.5)*.004,-.5+pull*.02);m=M.mul(m,M.rotY(Math.PI+.1));m=M.mul(m,M.rotX(-.04));m=M.mul(m,M.scale(.62));
    setLit(P.lit,vp,[0,0,0],1,new Float32Array([0,1.2,1.2,14,0,0,0,1]));gl.uniformMatrix4fv(P.lit.u.uModel,false,m);
    gl.uniform3fv(P.lit.u.uCam,[0,0,0]);gl.bindVertexArray(vacVao);gl.drawElements(gl.TRIANGLES,vac.n,vac.t,0);gl.bindVertexArray(null);}
  updateHUD(dt);
}

/* ------------------------------ HUD ------------------------------ */
let hc={};function setT(id,v){if(hc[id]!==v){hc[id]=v;$(id).textContent=v;}}
const carryEl=$('carry');for(let t=0;t<NT;t++){const d=document.createElement('div');d.id='cr'+t;d.innerHTML=`<i style="background:${css(CAT[t].hc)}"></i>${CAT[t].n[0]+CAT[t].n.slice(1).toLowerCase()}<span>0</span>`;carryEl.appendChild(d);}
function updateHUD(dt){
  setT('moneyV',fmt(G.money)+'$');setT('left',fmt(G.left));setT('tidy',(G.stocked/N*100).toFixed(1)+'%');
  $('barBag').firstElementChild.style.height=Math.round(clamp(G.bag/UP.bag.vals[UP.bag.lvl],0,1)*100)+'%';$('barTidy').firstElementChild.style.height=Math.round(G.stocked/N*100)+'%';
  for(let t=0;t<NT;t++){const n=G.carry[t*3]+G.carry[t*3+1]+G.carry[t*3+2];const sp=carryEl.children[t].lastChild;if(hc['c'+t]!==n){hc['c'+t]=n;sp.textContent=fmt(n);carryEl.children[t].style.display=n?'flex':'none';}}
  const pr=$('prompt');const u=G.unit;let txt='';if(G.state==='play'&&u){let n=0;for(let v=0;v<3;v++)n+=Math.min(G.carry[u.t*3+v],PER-G.stock[u.t*3+v]);txt=n?(touch?'TAP E':'PRESS E')+' — STOCK '+fmt(n)+' '+CAT[u.t].n:CAT[u.t].n+' — bring matching toys here';}
  if(hc.pr!==txt){hc.pr=txt;pr.textContent=txt;pr.classList.toggle('on',!!txt);}
  if(G.toastT>0){G.toastT-=dt;if(G.toastT<=0)$('toast').classList.remove('on');}
  if(G.flash>.001){G.flash=Math.max(0,G.flash-dt*1.6);$('flash').style.opacity=G.flash;}else if(hc.fl!==0){hc.fl=0;$('flash').style.opacity=0;}
}

/* ------------------------------ input ------------------------------ */
function lockPointer(){if(touch||DEBUG)return;try{const r=canvas.requestPointerLock();if(r&&r.catch)r.catch(()=>{});}catch(e){}}
function begin(){AU.init();if(AU.ctx&&AU.ctx.state==='suspended')AU.ctx.resume();$('start').classList.remove('on');$('pause').classList.remove('on');$('hud').classList.add('on');G.state='play';if(!G.tStart){G.tStart=performance.now();setTimeout(()=>toast('Hold click to vacuum toys — then stock the matching shelf',3800),600);}lockPointer();}
function pauseGame(){if(G.state!=='play')return;G.state='pause';G.pulling=false;$('pause').classList.add('on');if(document.pointerLockElement)document.exitPointerLock();}
$('playBtn').onclick=begin;$('resumeBtn').onclick=begin;$('pauseBtn').onclick=pauseGame;
$('upgBtn').onclick=()=>openUpg(true);$('upgBtn2').onclick=()=>{$('pause').classList.remove('on');G.state='play';openUpg(true);};$('upgClose').onclick=()=>openUpg(false);$('againBtn').onclick=()=>location.reload();
document.addEventListener('pointerlockchange',()=>{if(!document.pointerLockElement&&G.state==='play'&&!touch&&!DEBUG)pauseGame();});
document.addEventListener('mousemove',e=>{if(document.pointerLockElement===canvas&&G.state==='play'){G.lookDX+=e.movementX*.0023;G.lookDY+=e.movementY*.0023;}});
canvas.addEventListener('mousedown',e=>{if(G.state==='play'&&e.button===0){G.pulling=true;AU.init();}});
window.addEventListener('mouseup',e=>{if(e.button===0)G.pulling=false;});
window.addEventListener('keydown',e=>{G.keys[e.code]=true;if(e.code==='KeyE'&&!e.repeat)doAction();
  if(e.code==='KeyU'&&!e.repeat&&(G.state==='play'||G.state==='upg'))openUpg(!G.upgOpen);if(e.code==='KeyP'&&!e.repeat&&G.state==='play')pauseGame();
  if(['Space','ArrowUp','ArrowDown'].includes(e.code))e.preventDefault();});
window.addEventListener('keyup',e=>{G.keys[e.code]=false;});window.addEventListener('blur',()=>{G.keys={};G.pulling=false;});
(function(){const joy=$('joy'),knob=joy.firstElementChild;let jid=null,lid=null,lx=0,ly=0;
  const mv=e=>{if(e.pointerId!==jid)return;const r=joy.getBoundingClientRect(),dx=(e.clientX-(r.left+r.width/2))/(r.width/2),dy=(e.clientY-(r.top+r.height/2))/(r.height/2),l=Math.hypot(dx,dy),k=l>1?1/l:1;G.joy=[dx*k,dy*k];knob.style.transform=`translate(${dx*k*40}px,${dy*k*40}px)`;};
  joy.addEventListener('pointerdown',e=>{jid=e.pointerId;joy.setPointerCapture(e.pointerId);mv(e);});joy.addEventListener('pointermove',mv);
  const up=e=>{if(e.pointerId===jid){jid=null;G.joy=[0,0];knob.style.transform='';}};joy.addEventListener('pointerup',up);joy.addEventListener('pointercancel',up);
  const vb=$('btnVac');vb.addEventListener('pointerdown',e=>{G.pulling=true;AU.init();e.preventDefault();});const mu=()=>{G.pulling=false;};['pointerup','pointercancel','pointerleave'].forEach(n=>vb.addEventListener(n,mu));
  $('btnAct').addEventListener('pointerdown',e=>{doAction();e.preventDefault();});
  canvas.addEventListener('pointerdown',e=>{if(!touch||e.pointerType==='mouse')return;lid=e.pointerId;lx=e.clientX;ly=e.clientY;});
  canvas.addEventListener('pointermove',e=>{if(e.pointerId!==lid)return;G.lookDX+=(e.clientX-lx)*.0052;G.lookDY+=(e.clientY-ly)*.0052;lx=e.clientX;ly=e.clientY;});
  const lu=e=>{if(e.pointerId===lid)lid=null;};canvas.addEventListener('pointerup',lu);canvas.addEventListener('pointercancel',lu);})();
document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseGame();});
if(touch){G.q=.6;G.scale=.8;}
{const qq=new URLSearchParams(location.search).get('q');if(qq)G.q=parseFloat(qq);}

/* ------------------------------ boot ------------------------------ */
setTimeout(()=>{$('loading').style.display='none';},150);
if(DEBUG){window.__ts={G,UP,CAT,UNITS,BLOCKS,N,doAction,startWin,cellCnt,flyers,setCam(x,z,yaw,pitch){G.x=x;G.z=z;G.yaw=yaw;G.pitch=pitch;},
  grab(n){for(let i=0;i<n;i++){G.pulling=true;}},
  fillBag(){for(let t=0;t<NT;t++)for(let v=0;v<3;v++){G.carry[t*3+v]=500;}G.bag=12000;},
  stockAll(f){for(let k=0;k<24;k++){G.stock[k]=Math.floor(PER*f);tagDirty.add(k);}G.stocked=G.stock.reduce((a,b)=>a+b,0);shelfDirty=true;}};
  G.state='play';$('start').classList.remove('on');$('hud').classList.add('on');G.tStart=performance.now();}
requestAnimationFrame(frame);
})();
