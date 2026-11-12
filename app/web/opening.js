// Feather opening: "Constellation". Stars drift into your quill where it rests, a shooting star writes the word,
// and the ink dries into the script wordmark with a lime glint. Then the lock screen rises in as before.
(() => {
const PST=[[[30.3,81.8],[24.2,81.8],[18.2,84.8],[15.2,90.9],[18.2,97.0],[27.3,100.0],[36.4,100.0],[48.5,97.0],[57.6,97.0],[63.6,100.0]],[[48.5,97.0],[42.4,75.8],[36.4,57.6],[30.3,45.5],[24.2,39.4],[18.2,36.4],[12.1,36.4],[6.1,39.4],[3.0,45.5],[3.0,51.5],[6.1,54.5],[12.1,54.5],[18.2,51.5]],[[27.3,69.7],[54.5,69.7]],[[63.6,42.4],[69.7,45.5],[72.7,48.5],[75.8,54.5],[75.8,60.6],[72.7,63.6],[69.7,63.6],[63.6,60.6],[60.6,54.5],[60.6,45.5],[63.6,39.4],[69.7,36.4],[75.8,36.4],[81.8,39.4],[84.8,42.4],[90.9,51.5]],[[118.2,54.5],[115.2,60.6],[109.1,63.6],[103.0,63.6],[97.0,60.6],[93.9,57.6],[90.9,51.5],[90.9,45.5],[93.9,39.4],[100.0,36.4],[106.1,36.4],[112.1,39.4],[115.2,45.5],[121.2,63.6],[118.2,48.5],[118.2,39.4],[121.2,36.4],[124.2,36.4],[130.3,39.4],[133.3,42.4],[139.4,51.5],[145.5,60.6],[151.5,72.7]],[[160.6,100.0],[142.4,45.5],[142.4,39.4],[145.5,36.4],[151.5,36.4],[157.6,39.4],[160.6,42.4],[166.7,51.5]],[[142.4,75.8],[163.6,75.8]],[[166.7,51.5],[172.7,60.6],[181.8,75.8],[184.8,81.8],[187.9,90.9],[187.9,97.0],[184.8,100.0],[178.8,97.0],[175.8,90.9],[172.7,78.8],[169.7,60.6],[166.7,36.4],[169.7,45.5],[172.7,51.5],[178.8,60.6],[184.8,63.6],[190.9,63.6],[193.9,60.6],[193.9,54.5],[190.9,45.5],[190.9,39.4],[193.9,36.4],[197.0,36.4],[203.0,39.4],[206.1,42.4],[212.1,51.5]],[[215.2,42.4],[221.2,45.5],[224.2,48.5],[227.3,54.5],[227.3,60.6],[224.2,63.6],[221.2,63.6],[215.2,60.6],[212.1,54.5],[212.1,45.5],[215.2,39.4],[221.2,36.4],[227.3,36.4],[233.3,39.4],[236.4,42.4],[242.4,51.5],[248.5,60.6],[251.5,66.7],[251.5,60.6],[260.6,60.6],[263.6,57.6],[263.6,51.5],[260.6,42.4],[260.6,39.4],[263.6,36.4],[266.7,36.4],[272.7,39.4],[275.8,42.4],[281.8,51.5]]];
const cl=(x,a=0,b=1)=>Math.max(a,Math.min(b,x)),eio=x=>x<.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2,hs=k=>{const s=Math.sin(k*12.9898)*43758.5453;return s-Math.floor(s)},seg=(t,a,b)=>cl((t-a)/(b-a));
const sm=s=>{if(s.length<3)return s;const o=[];for(let i=0;i<s.length-1;i++){const p0=s[i-1]||s[i],p1=s[i],p2=s[i+1],p3=s[i+2]||s[i+1];for(let k=0;k<6;k++){const t=k/6,t2=t*t,t3=t2*t;o.push([.5*((2*p1[0])+(-p0[0]+p2[0])*t+(2*p0[0]-5*p1[0]+4*p2[0]-p3[0])*t2+(-p0[0]+3*p1[0]-3*p2[0]+p3[0])*t3),.5*((2*p1[1])+(-p0[1]+p2[1])*t+(2*p0[1]-5*p1[1]+4*p2[1]-p3[1])*t2+(-p0[1]+3*p1[1]-3*p2[1]+p3[1])*t3)])}}o.push(s[s.length-1]);return o};
const SS=PST.map(sm),AX=SS.flat().map(p=>p[0]),AY=SS.flat().map(p=>p[1]),X0=Math.min(...AX),X1=Math.max(...AX),Y0=Math.min(...AY),Y1=Math.max(...AY);
const TL=[];let acc=0;SS.forEach((s,i)=>{if(i){const a=SS[i-1].at(-1),b=s[0],d=Math.hypot(b[0]-a[0],b[1]-a[1])*.35;TL.push({lift:1,a,b,s:acc,e:acc+d});acc+=d}let L=0;const cum=[0];for(let j=1;j<s.length;j++){L+=Math.hypot(s[j][0]-s[j-1][0],s[j][1]-s[j-1][1]);cum.push(L)}TL.push({s:acc,e:acc+L,pts:s,cum});acc+=L});const TOT=acc;
function write(g,cx,cy,W,u,col,lw){const sc=W/(X1-X0),M=q=>[cx+(q[0]-(X0+X1)/2)*sc,cy-(q[1]-(Y0+Y1)/2)*sc],D=u*TOT;let pen=null;
 g.save();g.strokeStyle=col;g.lineWidth=lw;g.lineCap='round';g.lineJoin='round';
 for(const k of TL){if(D<k.s)break;if(k.lift){if(D<k.e){const f=(D-k.s)/(k.e-k.s);pen=M([k.a[0]+(k.b[0]-k.a[0])*f,k.a[1]+(k.b[1]-k.a[1])*f])}continue}
  const L=Math.min(D,k.e)-k.s;g.beginPath();let last=k.pts[0];g.moveTo(...M(last));for(let j=1;j<k.pts.length;j++){if(k.cum[j]>L){const f=(L-k.cum[j-1])/(k.cum[j]-k.cum[j-1]);last=[k.pts[j-1][0]+(k.pts[j][0]-k.pts[j-1][0])*f,k.pts[j-1][1]+(k.pts[j][1]-k.pts[j-1][1])*f];g.lineTo(...M(last));break}last=k.pts[j];g.lineTo(...M(last))}g.stroke();if(D<=k.e)pen=M(last)}
 g.restore();return pen}
const css=`.lock.cintro .word{animation:none!important;stroke:none!important;fill:url(#fglint)!important;opacity:0;transition:opacity .8s ease}
.lock.cintro .nib{animation:none!important;opacity:0;transform:none!important;transition:opacity .7s ease,filter 1.6s ease}.lock.cintro .ink{display:none}
.lock.cintro .after,.lock.cintro .lockfoot{animation:none!important;opacity:0}
.lock.cintro.cq .nib{opacity:1;filter:drop-shadow(0 0 14px #c6f432)}.lock.cintro.cq2 .nib{filter:none}.lock.cintro.cw .word{opacity:1}
.lock.cintro.cf .after,.lock.cintro.cf .lockfoot{animation:qup .6s ease forwards!important}.lock.cintro.cf .lockfoot{animation-delay:.25s!important}
.lock .cstars{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}`;
document.head.append(Object.assign(document.createElement('style'),{textContent:css}));
function run(L){
 const word=L.querySelector('.word'),nib=L.querySelector('.nib'),svg=L.querySelector('.wsvg');if(!word||!nib||!svg)return;
 L.classList.add('cintro');
 // the glint: a lime band that sweeps once across the dried wordmark
 svg.insertAdjacentHTML('afterbegin','<defs><linearGradient id="fglint" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#f4f4ec"/><stop offset="0" stop-color="#f4f4ec"><animate id="fga" attributeName="offset" values="-.1;1" dur="1.1s" begin="indefinite" fill="freeze"/></stop><stop offset="0" stop-color="#c6f432"><animate attributeName="offset" values="0;1.08" dur="1.1s" begin="fga.begin" fill="freeze"/></stop><stop offset="0" stop-color="#f4f4ec"><animate attributeName="offset" values=".1;1.16" dur="1.1s" begin="fga.begin" fill="freeze"/></stop><stop offset="1" stop-color="#f4f4ec"/></linearGradient></defs>');
 const cv=document.createElement('canvas');cv.className='cstars';L.insertBefore(cv,L.children[1]||null);const g=cv.getContext('2d');
 let W,H,QP=[];const dp=Math.min(2,devicePixelRatio||1);
 const size=()=>{const r=L.getBoundingClientRect();W=r.width;H=r.height;cv.width=W*dp;cv.height=H*dp;g.setTransform(dp,0,0,dp,0,0)};size();
 const sample=()=>{const N=240,o=document.createElement('canvas');o.width=o.height=N;const x=o.getContext('2d');x.drawImage(nib,0,0,N,N);let d;try{d=x.getImageData(0,0,N,N).data}catch(e){return}
  const P=[],cell=9;for(let cy=0;cy<N;cy+=cell)for(let cx=0;cx<N;cx+=cell){let best=null,bd=1e9;for(let j=cy;j<Math.min(N,cy+cell);j++)for(let i=cx;i<Math.min(N,cx+cell);i++){const k=(j*N+i)*4;
   if(d[k+3]>150&&d[k+1]>170&&d[k]>110&&d[k+2]<140){const dd=(i-cx-cell/2)**2+(j-cy-cell/2)**2;if(dd<bd){bd=dd;best=[i/N,j/N]}}}if(best)P.push(best)}
  P.sort((a,b)=>(b[0]-b[1])-(a[0]-a[1]));QP=P};
 if(nib.complete)sample();else nib.onload=sample;
 const T0=performance.now(),END=6.8;let done=false,flags={};
 const once=(k,f)=>{if(!flags[k]){flags[k]=1;f()}};
 const finish=()=>{if(done)return;done=true;L.classList.add('cq','cq2','cw','cf');const a=svg.querySelector('#fga');a&&a.beginElement&&a.beginElement();draw(99,true)};
 L.addEventListener('pointerdown',finish,{once:true});
 function draw(t,still){const lr=L.getBoundingClientRect(),nr=nib.getBoundingClientRect(),wr=word.getBoundingClientRect();g.clearRect(0,0,W,H);
  const fade=still?.45:1-seg(t,5.8,7)*.55;for(let i=0;i<140;i++){const x=hs(i)*W,y=hs(i+50)*H,tw=still?.6:.3+.7*Math.abs(Math.sin(t*1.3+i));g.fillStyle=`rgba(244,244,236,${.28*tw*fade})`;g.fillRect(x,y,1.3,1.3)}
  if(still)return;
  const qx=nr.left-lr.left,qy=nr.top-lr.top,S=nr.width,form=eio(seg(t,.4,2.4)),gone=1-seg(t,3.1,3.8);
  if(gone>0)QP.forEach((p,i)=>{const sx=hs(i+7)*W,sy=hs(i+3)*H,tx=qx+p[0]*S,ty=qy+p[1]*S,x=sx+(tx-sx)*form,y=sy+(ty-sy)*form,tw=.5+.5*Math.sin(t*3+i);
   if(form>.95&&i){const q=QP[i-1];g.strokeStyle=`rgba(198,244,50,${.35*seg(t,2.2,2.8)*gone})`;g.lineWidth=1;g.beginPath();g.moveTo(qx+q[0]*S,qy+q[1]*S);g.lineTo(x,y);g.stroke()}
   g.globalAlpha=gone*(.5+.5*tw);g.fillStyle=form>.95?'#c6f432':'#f4f4ec';g.beginPath();g.arc(x,y,1.3+form,0,6.283);g.fill();g.globalAlpha=1});
  if(t>2.8)once('q',()=>L.classList.add('cq'));if(t>4)once('q2',()=>L.classList.add('cq2'));
  const wu=eio(seg(t,3.4,5.4)),dry=seg(t,5.4,6.1),cx=wr.left-lr.left+wr.width/2,cy=wr.top-lr.top+wr.height*.52,ww=wr.width*.86;
  if(wu>0&&dry<1){g.globalAlpha=1-dry;const pen=write(g,cx,cy,ww,wu,'rgba(244,244,236,.92)',Math.max(1.6,wr.height*.012));g.globalAlpha=1;
   if(pen&&wu<1)for(let k=0;k<4;k++){g.fillStyle=`rgba(198,244,50,${1-k*.25})`;g.beginPath();g.arc(pen[0]-k*5,pen[1]+k*2.5,3.2-k*.7,0,6.283);g.fill()}}
  if(t>5.4)once('w',()=>{L.classList.add('cw');const a=svg.querySelector('#fga');setTimeout(()=>a&&a.beginElement&&a.beginElement(),250)});
  if(t>6)once('f',()=>L.classList.add('cf'))}
 (function loop(n){if(done||!L.isConnected)return;const t=(n-T0)/1000;draw(t);if(t>END){done=true;draw(99,true);return}requestAnimationFrame(loop)})(performance.now());
 addEventListener('resize',()=>{if(L.isConnected){size();if(done)draw(99,true)}});
}
new MutationObserver(()=>{const L=document.querySelector('#lockroot.intro');if(L&&!L.dataset.cdone){L.dataset.cdone=1;requestAnimationFrame(()=>run(L))}}).observe(document.getElementById('root'),{childList:true,subtree:false});
})();
