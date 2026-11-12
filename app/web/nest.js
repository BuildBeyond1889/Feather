// Feather nest menu: with the narrow menu on, hovering it slides out a drawer where each room is a small animation.
// Only the menu changes. The drawer floats over the page, and its animations run only while it is open.
(() => {

let C={bg:'#0c0d0b',panel:'#141612',line:'#262a22',line2:'#343a2e',text:'#e8ecdf',soft:'#c9d0bf',muted:'#8e9686',lime:'#c6f432',bad:'#ff8a6b'};
const hexA=(c,a)=>{c=(c||'').trim();let m=c.match(/^#([0-9a-f]{3})$/i);if(m)c='#'+m[1].split('').map(x=>x+x).join('');m=c.match(/^#([0-9a-f]{6})/i);if(m){const n=parseInt(m[1],16);return `rgba(${n>>16},${n>>8&255},${n&255},${a})`}m=c.match(/^rgba?\(([^)]+)\)/);return m?`rgba(${m[1].split(',').slice(0,3).join(',')},${a})`:c},LA=a=>hexA(C.lime,a),BA=a=>hexA(C.bad,a);
const eio=x=>x<.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2,eob=x=>{const c=1.7;return 1+(c+1)*Math.pow(x-1,3)+c*Math.pow(x-1,2)},cl=(x,a=0,b=1)=>Math.max(a,Math.min(b,x)),hs=k=>{const s=Math.sin(k*12.9898)*43758.5453;return s-Math.floor(s)};
function P(x,y,z,c){const cy=Math.cos(c.yaw),sy=Math.sin(c.yaw);let X=x*cy-z*sy,Z=x*sy+z*cy;const cp=Math.cos(c.pitch),sp=Math.sin(c.pitch);const Y=y*cp-Z*sp;Z=y*sp+Z*cp;const f=c.f/(c.d+Z);return[c.cx+X*f,c.cy-Y*f,f,Z]}
function poly(g,pts,st,fi,lw=1,close=true){g.beginPath();pts.forEach((p,i)=>i?g.lineTo(p[0],p[1]):g.moveTo(p[0],p[1]));if(close)g.closePath();if(fi){g.fillStyle=fi;g.fill()}if(st){g.strokeStyle=st;g.lineWidth=lw;g.stroke()}}
function box(g,c,x,y,z,w,h,d,st,fi,lw=1){const v=[];for(const a of[-1,1])for(const b of[-1,1])for(const e of[-1,1])v.push(P(x+a*w/2,y+b*h/2,z+e*d/2,c));[[0,1,3,2],[4,5,7,6],[0,1,5,4],[2,3,7,6],[0,2,6,4],[1,3,7,5]].map(f=>[f,f.reduce((s,i)=>s+v[i][3],0)]).sort((a,b)=>b[1]-a[1]).forEach(([f])=>poly(g,f.map(i=>v[i]),st,fi,lw))}
function txt(g,s,x,y,col,sz=10,al='left',f='"JetBrains Mono",monospace'){g.font=`${sz}px ${f}`;g.fillStyle=col;g.textAlign=al;g.fillText(s,x,y)}
function ring(c,r,y=0,n=64,ax='y'){const p=[];for(let i=0;i<=n;i++){const a=i/n*6.283;p.push(ax=='y'?P(Math.cos(a)*r,y,Math.sin(a)*r,c):P(Math.cos(a)*r,Math.sin(a)*r,y,c))}return p}
function feather(g,x,y,len,ang,col,al=1){g.save();g.translate(x,y);g.rotate(ang);g.globalAlpha=al;g.strokeStyle=col;g.lineWidth=1;g.beginPath();g.moveTo(0,0);g.quadraticCurveTo(len*.1,-len*.5,0,-len);g.stroke();
 for(let i=2;i<9;i++){const u=i/10,yy=-len*u,bw=len*.22*Math.sin(u*3.14);g.beginPath();g.moveTo(len*.05*u,yy);g.lineTo(-bw,yy+len*.08);g.moveTo(len*.05*u,yy);g.lineTo(bw,yy+len*.08);g.stroke()}g.restore()}
let MX=.5,MY=.5,LASTMOVE=-1e9;addEventListener('pointerdown',e=>{MX=e.clientX/innerWidth;MY=e.clientY/innerHeight;LASTMOVE=performance.now()});addEventListener('pointermove',e=>{if(e.pointerType!=='mouse'&&e.buttons===0)return;LASTMOVE=performance.now();MX=e.clientX/innerWidth;MY=e.clientY/innerHeight});

/* HERO · the owl: facial disc rings breathe, eyes follow you, blinks, head tilts; feathers drift */
let ex=0,ey=0;
function owl(g,w,h,t){const cx=w/2,cy=h*.58,S=Math.min(w,h)*.33,tilt=.07*Math.sin(t*.5);{const idle=performance.now()-LASTMOVE>2500,tx=idle?.38*Math.sin(t*.9)+.12*Math.sin(t*2.3):MX-.5,ty=idle?.22*Math.cos(t*.7):MY-.5;ex+=(tx-ex)*.06;ey+=(ty-ey)*.06}
 for(let i=0;i<14;i++){const k=(t*.12+hs(i))%1,x=hs(i+3)*w,y=-20+k*(h+40);feather(g,x+Math.sin(t+i)*14,y,14+hs(i+5)*10,Math.sin(t*.7+i)*.6,C.muted,.25*(1-Math.abs(k-.5)*1.6))}
 g.save();g.translate(cx,cy);g.rotate(tilt);
 const br=1+.015*Math.sin(t*1.2);
 [-1,1].forEach(sd=>{for(let k=0;k<5;k++){g.strokeStyle=k==0?C.lime:C.line2;g.globalAlpha=k==0?.9:.7-k*.1;g.lineWidth=k==0?1.6:1;g.beginPath();g.ellipse(sd*S*.42,0,S*(.36+k*.09)*br,S*(.4+k*.1)*br,sd*.12,0,6.283);g.stroke()}});g.globalAlpha=1;
 for(let i=0;i<48;i++){const a=i/48*6.283,r1=S*1.02,r2=S*(1.1+.05*Math.sin(i*1.7+t));g.strokeStyle=C.line2;g.beginPath();g.moveTo(Math.cos(a)*r1*1.05,Math.sin(a)*r1*.92);g.lineTo(Math.cos(a)*r2*1.05,Math.sin(a)*r2*.92);g.stroke()}
 g.strokeStyle=C.soft;g.lineWidth=1.4;[-1,1].forEach(sd=>{g.beginPath();g.moveTo(sd*S*.55,-S*.82);g.lineTo(sd*S*.95,-S*1.32);g.lineTo(sd*S*.86,-S*.72);g.stroke()});
 const bl=(t%5.2)<.16?Math.abs(Math.sin((t%5.2)/.16*3.14)):0;
 [-1,1].forEach(sd=>{const X=sd*S*.42,R=S*.2;g.save();g.translate(X,0);g.scale(1,1-bl*.95);g.fillStyle=C.panel;g.strokeStyle=C.lime;g.lineWidth=2;g.beginPath();g.arc(0,0,R,0,6.283);g.fill();g.stroke();
  g.strokeStyle=LA(.35);g.lineWidth=1;for(let k=0;k<12;k++){const a=k/12*6.283+t*.2;g.beginPath();g.moveTo(Math.cos(a)*R*.55,Math.sin(a)*R*.55);g.lineTo(Math.cos(a)*R*.92,Math.sin(a)*R*.92);g.stroke()}
  const px=ex*R*.7,py=ey*R*.6,pr=R*(.42+.06*Math.sin(t*.8));g.fillStyle=C.bg;g.beginPath();g.arc(px,py,pr,0,6.283);g.fill();g.fillStyle=C.text;g.beginPath();g.arc(px-pr*.35,py-pr*.35,pr*.18,0,6.283);g.fill();g.restore()});
 g.fillStyle=C.lime;g.beginPath();g.moveTo(0,S*.12);g.lineTo(S*.07,S*.24);g.lineTo(0,S*.42);g.lineTo(-S*.07,S*.24);g.closePath();g.globalAlpha=.85;g.fill();g.globalAlpha=1;g.restore();
 txt(g,'WATCHING · '+new Date().toTimeString().slice(0,5),12,h-10,C.muted,9)}

/* 1 ASK ARCHIE · iris gyroscope: three rings turn on different axes; the pupil widens while Archie thinks */
function ask(g,w,h,t){const c={yaw:t*.3,pitch:.5,f:h*1.9,d:5,cx:w/2,cy:h*.5},th=(t%7)<2.6,pu=th?.18+.06*Math.sin(t*5):.12;
 [[0,0],[1.1,.7],[2.1,-.5]].forEach(([a,b],i)=>{const cc={...c,yaw:c.yaw+a,pitch:c.pitch+b+t*.1*(i-1)};poly(g,ring(cc,.85-i*.13,0,80),i?C.line2:C.lime,null,i?1:1.6,false)});
 const o=P(0,0,0,c);g.fillStyle=th?C.lime:C.soft;g.beginPath();g.arc(o[0],o[1],pu*o[2],0,6.283);g.fill();
 txt(g,th?'THINKING …':'LISTENING',o[0],o[1]+pu*o[2]+22,th?C.lime:C.muted,10,'center')}
/* 2 VAULT · the nest: a ring of books woven round; the newest lifts out glowing */
function vault(g,w,h,t){const c={yaw:t*.25,pitch:.55,f:h*1.9,d:5.5,cx:w/2,cy:h*.58},N=16,k=Math.floor(t/2.4)%N,p=(t%2.4)/2.4,L=p<.3?eob(p/.3):p<.75?1:1-eio((p-.75)/.25);
 const it=[...Array(N)].map((_,i)=>{const a=i/N*6.283,x=Math.cos(a)*1,z=Math.sin(a)*1,y=i==k?.42*L:0;return{i,a,x,y,z,Z:P(x,y,z,c)[3]}});
 poly(g,ring(c,1.25,-.16),C.line2,null,1,false);poly(g,ring(c,.72,-.16),C.line2,null,1,false);
 it.sort((a,b)=>b.Z-a.Z).forEach(m=>{const cc={...c,yaw:c.yaw-m.a};const q=P(m.x,0,m.z,c);box(g,{...c},m.x,m.y,m.z,.16,.34+hs(m.i)*.12,.32,m.i==k?C.lime:C.soft,C.panel,m.i==k?1.6:.9)});
 }
/* 3 WORLD · wireframe globe; an owl flies a great-circle arc, leaving feather sparks */
function world(g,w,h,t){const c={yaw:t*.2,pitch:.3,f:h*1.8,d:5,cx:w/2,cy:h*.5},R=.85;g.globalAlpha=.6;
 for(let L=1;L<6;L++){const la=-1.57+L*3.1416/6,p=[];for(let i=0;i<=48;i++){const a=i/48*6.283;p.push(P(Math.cos(la)*Math.cos(a)*R,Math.sin(la)*R,Math.cos(la)*Math.sin(a)*R,c))}poly(g,p,C.line2,null,1,false)}
 for(let M=0;M<8;M++){const a=M/8*3.1416,p=[];for(let i=0;i<=48;i++){const b=i/48*6.283;p.push(P(Math.cos(b)*Math.cos(a)*R,Math.sin(b)*R,Math.cos(b)*Math.sin(a)*R,c))}poly(g,p,C.line2,null,1,false)}g.globalAlpha=1;
 const arc=u=>{const a=-.9+u*2.2,lat=.35+.5*Math.sin(u*3.14);const r=R*(1+.25*Math.sin(u*3.14));return[Math.cos(lat)*Math.cos(a)*r,Math.sin(lat)*r,Math.cos(lat)*Math.sin(a)*r]};
 const u=(t*.18)%1,tr=[];for(let i=0;i<=40;i++){tr.push(P(...arc(i/40),c))}g.setLineDash([3,4]);poly(g,tr,LA(.4),null,1,false);g.setLineDash([]);
 for(let j=0;j<10;j++){const v=u-j*.015;if(v<0)continue;const q=P(...arc(v),c);g.fillStyle=LA(1-j/10);g.beginPath();g.arc(q[0],q[1],2.6-j*.2,0,6.283);g.fill()}
 const q=P(...arc(u),c);g.strokeStyle=C.lime;g.lineWidth=1.5;g.beginPath();const f=Math.sin(t*9)*5;g.moveTo(q[0]-9,q[1]-f);g.quadraticCurveTo(q[0]-4,q[1]-3,q[0],q[1]);g.quadraticCurveTo(q[0]+4,q[1]-3,q[0]+9,q[1]-f);g.stroke()}
/* 4 READING · the open book turns a page under a moon whose phase is how far you've read */
function reading(g,w,h,t,pct){const c={yaw:-.3,pitch:.7,f:h*2.1,d:5,cx:w*.45,cy:h*.66},Wp=.85,Hp=1.1,pg=(t%3.6)/3.6,ang=pg<.15?0:pg<.75?eio((pg-.15)/.6)*3.1416:3.1416;
 const page=(a,col,fi,curl=0)=>{const pts=[];for(let i=0;i<=12;i++){const u=i/12,x=Math.cos(a)*u*Wp,y=Math.sin(a)*u*Wp+Math.sin(u*3.14)*curl;pts.push([x,y])}const A=pts.map(([x,y])=>P(x,y,-Hp/2,c)),B=pts.map(([x,y])=>P(x,y,Hp/2,c)).reverse();poly(g,[...A,...B],col,fi,1.2)};
 page(3.1416,C.soft,C.panel);page(0,C.soft,C.panel);for(let l=1;l<6;l++){const a=P(.12,0,-Hp/2+l*.17,c),b=P(.75,0,-Hp/2+l*.17,c);g.strokeStyle=C.line2;g.beginPath();g.moveTo(a[0],a[1]);g.lineTo(b[0],b[1]);g.stroke()}
 if(ang>0&&ang<3.14)page(ang,C.lime,'rgba(20,22,18,.92)',.08*Math.sin(ang));
 const mx=w*.82,my=h*.28,mr=Math.min(w,h)*.12;pct=READ.pct;g.fillStyle=C.line2;g.beginPath();g.arc(mx,my,mr,0,6.283);g.fill();
 g.fillStyle=C.lime;g.beginPath();if(pct<.5){g.arc(mx,my,mr,-1.5708,1.5708);g.ellipse(mx,my,mr*(1-2*pct),mr,0,1.5708,-1.5708,true)}else{g.arc(mx,my,mr,-1.5708,1.5708);g.ellipse(mx,my,mr*(2*pct-1),mr,0,1.5708,-1.5708,false)}g.closePath();g.fill();
 g.strokeStyle=C.line2;g.beginPath();g.arc(mx,my,mr,0,6.283);g.stroke();}
/* 5 DOCUMENTS · a fanned stack; a lime scan reads the top sheet and the lines appear (OCR) */
function docs(g,w,h,t){const c={yaw:-.5,pitch:.9,f:h*2.2,d:5,cx:w/2,cy:h*.55},p=(t%4)/4,sc=eio(cl(p/.7));
 for(let i=5;i>=0;i--){const r=-.12*i+.04*Math.sin(t*.4+i),cr=Math.cos(r),sr=Math.sin(r),y=i*.035,q=[[-.6,-.8],[.6,-.8],[.6,.8],[-.6,.8]].map(([a,b])=>P(a*cr-b*sr+i*.06,y*-1,a*sr+b*cr,c));poly(g,q,i?C.line2:C.soft,C.panel,i?1:1.3)}
 for(let l=0;l<9;l++){const zz=-.65+l*.16;if((zz+.8)/1.6>sc)break;const L=.25+.65*hs(l+Math.floor(t/4)),a=P(-.48,0,zz,c),b=P(-.48+L,0,zz,c);g.strokeStyle=C.muted;g.lineWidth=2;g.beginPath();g.moveTo(a[0],a[1]);g.lineTo(b[0],b[1]);g.stroke()}
 if(p<.75){const zz=-.8+1.6*sc,a=P(-.62,0,zz,c),b=P(.62,0,zz,c);g.shadowColor=C.lime;g.shadowBlur=10;g.strokeStyle=C.lime;g.lineWidth=2;g.beginPath();g.moveTo(a[0],a[1]);g.lineTo(b[0],b[1]);g.stroke();g.shadowBlur=0}
 txt(g,p<.75?'READING TEXT …':'SEARCHABLE ✓',w-14,22,p<.75?C.lime:C.soft,10,'right')}
/* 6 PAPER · a quill writes a line of handwriting, then the ink settles */
/* idea board: sparks drift in, bloom into cards that pin with a bounce; lime threads stitch them together */
function ideasTile(g,w,h,t){const L=7,p=t%L;
 g.fillStyle=C.line2;for(let x=6;x<w;x+=13)for(let y=6;y<h;y+=13)g.fillRect(x,y,1,1);
 const S=Math.min(w,h)/78,cards=[[.2,.36,-.08],[.5,.62,.05],[.78,.34,-.03],[.36,.84,.06]];
 const at=i=>.4+i*1.15,P=i=>[w*cards[i][0],h*cards[i][1]];
 // threads first, under the cards
 for(let i=1;i<cards.length;i++){const u=eio(seg(p,at(i)+.6,at(i)+1.2));if(u<=0)continue;const a=P(i-1),b=P(i),sag=10*S+Math.sin(t*1.6+i)*2*S;
  g.strokeStyle=LA(.55);g.lineWidth=1.2*S;g.beginPath();const steps=24;for(let k=0;k<=steps*u;k++){const v=k/steps,x=a[0]+(b[0]-a[0])*v,y=a[1]+(b[1]-a[1])*v+Math.sin(v*Math.PI)*sag-14*S;k?g.lineTo(x,y):g.moveTo(x,y)}g.stroke()}
 cards.forEach(([cx,cy,rot],i)=>{const s0=at(i),u=seg(p,s0,s0+.55),out=seg(p,L-.6,L);if(u<=0)return;
  const [x,y]=[w*cx,h*cy],drop=(1-eob(u))*-18*S,sc=.6+.4*eob(u),cw=36*S,ch=22*S,wig=i==cards.length-1&&p>at(i)+1.4?Math.sin((p-at(i)-1.4)*9)*.08*Math.exp(-(p-at(i)-1.4)*2):0;
  g.save();g.globalAlpha=1-out;g.translate(x,y-14*S+drop);g.rotate(rot+wig);g.scale(sc,sc);
  g.fillStyle=C.panel;g.strokeStyle=i==cards.length-1&&u>=1?C.lime:C.line2;g.lineWidth=1;g.beginPath();g.roundRect(-cw/2,0,cw,ch,3*S);g.fill();g.stroke();
  g.strokeStyle=C.soft;g.lineWidth=1;for(let l=0;l<2;l++){g.beginPath();g.moveTo(-cw/2+5*S,6*S+l*6*S);g.lineTo(-cw/2+(l?20:28)*S,6*S+l*6*S);g.stroke()}
  g.fillStyle=C.lime;g.beginPath();g.arc(0,0,2.6*S,0,6.283);g.fill();g.restore();
  // the spark that becomes the card
  if(u<1){const k=eio(cl(u*1.6)),sx=w*.5+(x-w*.5)*k,sy=-6+(y-14*S+6)*k;g.fillStyle=C.lime;g.shadowColor=C.lime;g.shadowBlur=10;g.beginPath();g.arc(sx,sy,2.4*S*(1-u*.6),0,6.283);g.fill();g.shadowBlur=0;
   for(let j=1;j<5;j++){g.globalAlpha=.5-j*.1;g.beginPath();g.arc(sx-(x-w*.5)*j*.03,sy-(y-14*S)*j*.05,1.6*S,0,6.283);g.fill()}g.globalAlpha=1}});
 // a little bloom when the last idea lands
 const lb=seg(p,at(3)+.55,at(3)+1.3);if(lb>0&&lb<1){const [x,y]=P(3);g.strokeStyle=LA(1-lb);g.lineWidth=1.2;g.beginPath();g.arc(x,y-14*S,4*S+lb*16*S,0,6.283);g.stroke()}}

let paperFn=()=>{};function paper(g,w,h,t){paperFn(g,w,h,t)}
{
const PST=[[[30.3,81.8],[24.2,81.8],[18.2,84.8],[15.2,90.9],[18.2,97.0],[27.3,100.0],[36.4,100.0],[48.5,97.0],[57.6,97.0],[63.6,100.0]],[[48.5,97.0],[42.4,75.8],[36.4,57.6],[30.3,45.5],[24.2,39.4],[18.2,36.4],[12.1,36.4],[6.1,39.4],[3.0,45.5],[3.0,51.5],[6.1,54.5],[12.1,54.5],[18.2,51.5]],[[27.3,69.7],[54.5,69.7]],[[63.6,42.4],[69.7,45.5],[72.7,48.5],[75.8,54.5],[75.8,60.6],[72.7,63.6],[69.7,63.6],[63.6,60.6],[60.6,54.5],[60.6,45.5],[63.6,39.4],[69.7,36.4],[75.8,36.4],[81.8,39.4],[84.8,42.4],[90.9,51.5]],[[118.2,54.5],[115.2,60.6],[109.1,63.6],[103.0,63.6],[97.0,60.6],[93.9,57.6],[90.9,51.5],[90.9,45.5],[93.9,39.4],[100.0,36.4],[106.1,36.4],[112.1,39.4],[115.2,45.5],[121.2,63.6],[118.2,48.5],[118.2,39.4],[121.2,36.4],[124.2,36.4],[130.3,39.4],[133.3,42.4],[139.4,51.5],[145.5,60.6],[151.5,72.7]],[[160.6,100.0],[142.4,45.5],[142.4,39.4],[145.5,36.4],[151.5,36.4],[157.6,39.4],[160.6,42.4],[166.7,51.5]],[[142.4,75.8],[163.6,75.8]],[[166.7,51.5],[172.7,60.6],[181.8,75.8],[184.8,81.8],[187.9,90.9],[187.9,97.0],[184.8,100.0],[178.8,97.0],[175.8,90.9],[172.7,78.8],[169.7,60.6],[166.7,36.4],[169.7,45.5],[172.7,51.5],[178.8,60.6],[184.8,63.6],[190.9,63.6],[193.9,60.6],[193.9,54.5],[190.9,45.5],[190.9,39.4],[193.9,36.4],[197.0,36.4],[203.0,39.4],[206.1,42.4],[212.1,51.5]],[[215.2,42.4],[221.2,45.5],[224.2,48.5],[227.3,54.5],[227.3,60.6],[224.2,63.6],[221.2,63.6],[215.2,60.6],[212.1,54.5],[212.1,45.5],[215.2,39.4],[221.2,36.4],[227.3,36.4],[233.3,39.4],[236.4,42.4],[242.4,51.5],[248.5,60.6],[251.5,66.7],[251.5,60.6],[260.6,60.6],[263.6,57.6],[263.6,51.5],[260.6,42.4],[260.6,39.4],[263.6,36.4],[266.7,36.4],[272.7,39.4],[275.8,42.4],[281.8,51.5]]],QUILL=Object.assign(new Image(),{src:'quill-only.svg'});
const smoothP=s=>{if(s.length<3)return s;const o=[];for(let i=0;i<s.length-1;i++){const p0=s[i-1]||s[i],p1=s[i],p2=s[i+1],p3=s[i+2]||s[i+1];for(let k=0;k<6;k++){const t=k/6,t2=t*t,t3=t2*t;o.push([.5*((2*p1[0])+(-p0[0]+p2[0])*t+(2*p0[0]-5*p1[0]+4*p2[0]-p3[0])*t2+(-p0[0]+3*p1[0]-3*p2[0]+p3[0])*t3),.5*((2*p1[1])+(-p0[1]+p2[1])*t+(2*p0[1]-5*p1[1]+4*p2[1]-p3[1])*t2+(-p0[1]+3*p1[1]-3*p2[1]+p3[1])*t3)])}}o.push(s[s.length-1]);return o};
const SS=PST.map(smoothP),xs=SS.flat().map(p=>p[0]),ys=SS.flat().map(p=>p[1]),X0=Math.min(...xs),X1=Math.max(...xs),Y0=Math.min(...ys),Y1=Math.max(...ys);
// timeline: ink length plus a short lifted glide between strokes
const TL=[];let acc=0;SS.forEach((s,i)=>{if(i){const a=SS[i-1].at(-1),b=s[0],d=Math.hypot(b[0]-a[0],b[1]-a[1])*.35;TL.push({lift:1,a,b,s:acc,e:acc+d});acc+=d}let L=0;const cum=[0];for(let j=1;j<s.length;j++){L+=Math.hypot(s[j][0]-s[j-1][0],s[j][1]-s[j-1][1]);cum.push(L)}TL.push({s:acc,e:acc+L,pts:s,cum});acc+=L});const TOT=acc;
paperFn=function(g,w,h,t){const p=(t%5.5)/5.5,sc=Math.min(w*.8/(X1-X0),h*.62/(Y1-Y0)),ox=(w-(X1-X0)*sc)/2-X0*sc,oy=h*.5+((Y0+Y1)/2)*sc,M=q=>[ox+q[0]*sc,oy-q[1]*sc];
 g.strokeStyle=C.line;g.lineWidth=1;for(let l=0;l<3;l++){const y=oy-Y0*sc+2-(l*(h*.26));g.beginPath();g.moveTo(w*.06,y);g.lineTo(w*.94,y);g.stroke()}
 const u=Math.min(1,p/.8),e=u*u*(3-2*u)*.15+u*.85,D=e*TOT,fade=p>.86?1-(p-.86)/.14:1;let pen=null,lift=false;
 g.save();g.globalAlpha=fade;g.strokeStyle=C.text;g.lineWidth=Math.max(1.3,h*.011);g.lineCap='round';g.lineJoin='round';
 for(const k of TL){if(D<k.s)break;if(k.lift){if(D<k.e){const f=(D-k.s)/(k.e-k.s);pen=M([k.a[0]+(k.b[0]-k.a[0])*f,k.a[1]+(k.b[1]-k.a[1])*f]);lift=true}continue}
  const L=Math.min(D,k.e)-k.s;g.beginPath();let last=k.pts[0];g.moveTo(...M(last));for(let j=1;j<k.pts.length;j++){if(k.cum[j]>L){const f=(L-k.cum[j-1])/(k.cum[j]-k.cum[j-1]);last=[k.pts[j-1][0]+(k.pts[j][0]-k.pts[j-1][0])*f,k.pts[j-1][1]+(k.pts[j][1]-k.pts[j-1][1])*f];g.lineTo(...M(last));break}last=k.pts[j];g.lineTo(...M(last))}g.stroke();if(D<=k.e){pen=M(last);lift=false}}
 g.restore();
 if(p<.8&&pen&&QUILL.complete){const S=Math.min(h*.5,w*.24),up=lift?-S*.06:0;g.drawImage(QUILL,pen[0]-S*.17,pen[1]-S*.96+up+Math.sin(t*30)*.5,S,S)}}
}
/* 7 STUDY SESSION · the night clock: a 24h dial, your sessions as lime arcs, the owl at "now" */
function study(g,w,h,t){const c={yaw:0,pitch:1.0,f:h*2.2,d:5,cx:w/2,cy:h*.56},S=[[19.5,21],[21.3,22.4],[7,7.6],[13,14.2]],drift=t*.35;
 poly(g,ring(c,1.05),C.line2,null,1,false);poly(g,ring(c,.8),C.line2,null,1,false);
 for(let i=0;i<24;i++){const a=i/24*6.283-1.57,a1=P(Math.cos(a)*1.05,0,Math.sin(a)*1.05,c),a2=P(Math.cos(a)*(i%6?1.0:.95),0,Math.sin(a)*(i%6?1.0:.95),c);g.strokeStyle=C.muted;g.beginPath();g.moveTo(a1[0],a1[1]);g.lineTo(a2[0],a2[1]);g.stroke();if(i%6==0){const q=P(Math.cos(a)*1.2,0,Math.sin(a)*1.2,c);txt(g,String(i).padStart(2,'0'),q[0],q[1]+3,C.muted,9,'center')}}
 S.forEach(([s0,e0],j)=>{const u=cl((t-j*.6)/1.5),len=(e0-s0)*(1+.25*Math.sin(t*.9+j*1.7)),s=s0+drift,pts=[];for(let i=0;i<=20;i++){const hr=s+len*i/20*eio(u),a=hr/24*6.283-1.57;pts.push(P(Math.cos(a)*.92,0,Math.sin(a)*.92,c))}poly(g,pts,C.lime,null,4,false)})}
/* 8 MOCK EXAMS · a radar shaped like an owl's facial disc; last attempt morphs into this one */
const SUB=['ALGEBRA','BIO','HISTORY','CHEM','WRITING','NET+'],LAST=[.62,.7,.48,.55,.8,.58],NOW=[.74,.72,.6,.52,.85,.71];
function exams(g,w,h,t){const cx=w/2,cy=h*.54,R=Math.min(w,h)*.36,u=eio(cl(((t%6)-.5)/2)),n=SUB.length,pt=(k,v)=>{const a=k/n*6.283-1.57;return[cx+Math.cos(a)*R*v*1.1,cy+Math.sin(a)*R*v*.9]};
 for(let r=1;r<=4;r++)poly(g,SUB.map((_,k)=>pt(k,r/4)),C.line2,null,1);SUB.forEach((s,k)=>{const q=pt(k,1);g.strokeStyle=C.line;g.beginPath();g.moveTo(cx,cy);g.lineTo(q[0],q[1]);g.stroke();const l=pt(k,1.22);});
 poly(g,LAST.map((v,k)=>pt(k,v)),C.muted,null,1);const cur=NOW.map((v,k)=>LAST[k]+(v-LAST[k])*u);poly(g,cur.map((v,k)=>pt(k,v)),C.lime,LA(.14),1.8);
 cur.forEach((v,k)=>{const q=pt(k,v),dn=NOW[k]<LAST[k];g.fillStyle=dn?C.bad:C.lime;g.beginPath();g.arc(q[0],q[1],3,0,6.283);g.fill()});}
/* 9 FLASHCARDS · the top card flips question→answer and is sorted; a feather drops for each one done */
const QA=[['mitochondria','powerhouse of the cell'],['port 443','HTTPS'],['∫ 2x dx','x² + C'],['1066','Battle of Hastings']];
function cards(g,w,h,t){const c={yaw:-.2,pitch:.75,f:h*2,d:5,cx:w/2,cy:h*.55},D=3.2,k=Math.floor(t/D)%QA.length,p=(t%D)/D,fl=p<.3?0:p<.55?eio((p-.3)/.25)*3.1416:3.1416,out=p>.82?eio((p-.82)/.18):0;
 for(let i=3;i>0;i--)poly(g,[[-.7,-.45],[.7,-.45],[.7,.45],[-.7,.45]].map(([a,b])=>P(a,-i*.04,b,c)),C.line2,C.panel,1);
 const ca=Math.cos(fl),q=[[-.7,-.45],[.7,-.45],[.7,.45],[-.7,.45]].map(([a,b])=>P(a+out*1.6,Math.abs(Math.sin(fl))*.5*0+out*.3,b*ca,c));poly(g,q,fl>1.57?C.lime:C.soft,C.panel,1.5);
 if(Math.abs(ca)>.2){const m=P(out*1.6,out*.3,0,c);txt(g,fl>1.57?QA[k][1]:QA[k][0],m[0],m[1]+5,fl>1.57?C.lime:C.text,15,'center','Newsreader,serif');txt(g,fl>1.57?'ANSWER':'QUESTION',m[0],m[1]-16*Math.abs(ca),C.muted,9,'center')}
 for(let j=0;j<k+1;j++){const fy=h*.15+j*14;feather(g,w-24-j*10,fy+20,18,.4,C.lime,.6)}}
/* 10 TEACH IT BACK · your explanation as a ribbon; Archie's checks light where it's clear, coral where there's a gap */
function teach(g,w,h,t){const c={yaw:Math.sin(t*.12)*.05,pitch:.3,f:h*1.6,d:5,cx:w/2,cy:h*.52},X=w/2/(c.f/c.d)*1.3,N=120,qs=[];let pv=null;
 for(let i=0;i<=N;i++){const u=i/N,x=-X+2*X*u,y=.32*Math.sin(x*1.6-t*1.2)*(.4+.6*Math.abs(Math.sin(x*.7+t*.3))),tw=x*.9-t*.6,wd=.18,a=P(x,y+Math.sin(tw)*wd,Math.cos(tw)*wd,c),b=P(x,y-Math.sin(tw)*wd,-Math.cos(tw)*wd,c);
  if(pv){const gap=Math.sin(x*.8-t*.25)>.86;qs.push({q:[pv[0],a,b,pv[1]],Z:(a[3]+b[3])/2,f:Math.cos(tw),gap})}pv=[a,b]}
 qs.sort((a,b)=>b.Z-a.Z).forEach(({q,f,gap})=>{const k=Math.abs(f);poly(g,q,null,gap?BA(.3+.6*k):f>0?LA(.2+.7*k):`rgba(142,150,134,${.15+.35*k})`)});}
/* 11 MATH · each solved problem lights a star; the stars join into an owl constellation */
const ST=[[.5,.18],[.38,.28],[.62,.28],[.3,.45],[.7,.45],[.42,.42],[.58,.42],[.5,.55],[.34,.66],[.66,.66],[.5,.82],[.22,.2],[.78,.2]],ED=[[11,1],[12,2],[1,0],[0,2],[1,3],[2,4],[3,8],[4,9],[8,10],[9,10],[5,7],[6,7],[1,5],[2,6]];
const EQ=['3x + 5 = 20','∫ x² dx','sin²θ + cos²θ','d/dx eˣ','√144','2⁸ = ?'];
function math(g,w,h,t){const solved=Math.floor((t*.9)%(ED.length+4)),pt=i=>[w*.2+ST[i][0]*w*.6,h*.06+ST[i][1]*h*.86];
 ED.forEach(([a,b],i)=>{if(i>=solved)return;const A=pt(a),B=pt(b),u=cl(t*.9%(ED.length+4)-i);g.strokeStyle=LA(.55);g.lineWidth=1.2;g.beginPath();g.moveTo(A[0],A[1]);g.lineTo(A[0]+(B[0]-A[0])*u,A[1]+(B[1]-A[1])*u);g.stroke()});
 ST.forEach((s,i)=>{const q=pt(i),on=ED.slice(0,solved).some(e=>e.includes(i)),tw=.6+.4*Math.sin(t*3+i*1.3);g.fillStyle=on?C.lime:C.muted;g.globalAlpha=on?tw:.5;g.beginPath();g.arc(q[0],q[1],on?3:1.6,0,6.283);g.fill();g.globalAlpha=1});
 for(let i=0;i<3;i++){const k=(t*.15+i/3)%1;g.globalAlpha=Math.sin(k*3.14)*.7;txt(g,EQ[(Math.floor(t*.15+i/3)+i*2)%EQ.length],14+i*w*.28,h*.95-k*h*.8,C.soft,12,'left','Newsreader,serif');g.globalAlpha=1}}
/* 12 MASTERY · one feather per subject; the barbs fill in to your mastery */
const MS=[['ALG',.82],['GEO',.55],['CALC',.3],['STAT',.66],['BIO',.72],['NET+',.48]];
function mastery(g,w,h,t){const n=MS.length;MS.forEach(([s,v],i)=>{const x=w*(i+.5)/n,y0=h*.84,L=h*.68,sw=Math.sin(t*1.2+i)*.04,fill=v*eio(cl((t-i*.25)/2));
 g.save();g.translate(x,y0);g.rotate(sw);g.strokeStyle=C.soft;g.lineWidth=1.2;g.beginPath();g.moveTo(0,0);g.quadraticCurveTo(4,-L*.5,0,-L);g.stroke();
 for(let j=0;j<16;j++){const u=(j+2)/18,yy=-L*u,bw=Math.min(w/n*.38,26)*Math.sin(u*3.14),on=u<fill+.1;g.strokeStyle=on?C.lime:C.line2;g.globalAlpha=on?.9:.8;g.beginPath();g.moveTo(1,yy);g.lineTo(-bw,yy+8);g.moveTo(1,yy);g.lineTo(bw,yy+8);g.stroke()}g.restore();g.globalAlpha=1;
 })}


const READ={pct:0,at:0};async function readPct(){if(Date.now()-READ.at<60000||typeof api!=='function')return;READ.at=Date.now();try{const bs=await api('books'),b=bs.find(x=>!x.finished)||bs[0];READ.pct=b&&b.pages?Math.min(1,(+(b.progress&&b.progress.page)||0)/b.pages):0}catch(e){}}
/* shelf: two shelves of spines; one lifts off Feather's side and lands on Archie's */
function shelf(g,w,h,t){const S=Math.min(w,h)/78,p=(t%4)/4;g.lineWidth=1;g.strokeStyle=C.line2;
 [h*.44,h*.8].forEach(y=>{g.beginPath();g.moveTo(w*.1,y);g.lineTo(w*.9,y);g.stroke();});
 [[.14,.44,9,26],[.2,.44,7,21],[.25,.44,10,28],[.6,.8,8,24],[.66,.8,10,27],[.73,.8,7,20]].forEach(([x,y,bw,bh])=>g.strokeRect(w*x,h*y-bh*S,bw*S,bh*S));
 const u=Math.min(1,Math.max(0,(p-.1)/.6)),e=u<.5?2*u*u:1-Math.pow(-2*u+2,2)/2,x=w*.33+(w*.79-w*.33)*e,y=h*.44+(h*.8-h*.44)*e-Math.sin(e*Math.PI)*h*.14;
 g.strokeStyle=C.lime;g.strokeRect(x,y-25*S,8*S,25*S);txt(g,'SEND · GET',12,h-10,C.muted,9)}
const FN={home:owl,ask,vault,world,reading,docs,paper,ideas:ideasTile,study,exam:exams,cards,shelf,teach,math,mastery};
const css=`.fdr{position:fixed;inset:0 auto 0 0;width:316px;background:var(--panel,#141612);border-right:1px solid var(--line2,#343a2e);transform:translateX(-330px);transition:transform .42s cubic-bezier(.2,.9,.25,1.08),box-shadow .42s;z-index:60;display:flex;flex-direction:column}
body.fdopen .fdr{transform:none;box-shadow:24px 0 60px rgba(0,0,0,.55)}
.fdscrim{position:fixed;inset:0;background:rgba(0,0,0,.35);opacity:0;pointer-events:none;transition:opacity .3s;z-index:59}body.fdopen .fdscrim{opacity:1;pointer-events:auto}
.fdh{display:flex;align-items:center;justify-content:space-between;padding:16px 16px 6px}.fdh .wordmark{color:var(--lime)}
.fdpin{font:700 10px "JetBrains Mono",monospace;letter-spacing:.08em;background:none;border:1px solid var(--line2);color:var(--soft);border-radius:99px;padding:4px 9px;cursor:pointer}.fdpin.on{background:var(--lime);color:#0c0d0b;border-color:var(--lime)}
.fdl{flex:1;min-height:0;overflow:auto;padding:0 12px 12px;scrollbar-width:thin}.fdf{display:flex;gap:8px;padding:10px 12px 14px;border-top:1px solid var(--line,#262a22)}.fdfb{flex:1;display:flex;align-items:center;justify-content:center;gap:8px;height:36px;border:1px solid var(--line2,#343a2e);border-radius:8px;background:none;color:var(--soft);font:14px "Croissant One",Georgia,serif;text-decoration:none;cursor:pointer}.fdfb:hover{color:var(--lime);border-color:var(--lime)}.fdfb svg{flex-shrink:0}.fdg{margin:12px 4px 6px;font:700 10px "JetBrains Mono",monospace;letter-spacing:.14em;color:var(--muted)}
.fdt{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.fdi{display:block;background:color-mix(in srgb,var(--bg,#0c0d0b) 70%,transparent);border:1px solid var(--line,#262a22);border-radius:10px;overflow:hidden;color:var(--text);text-decoration:none;opacity:0;transform:translateX(-14px)}
body.fdopen .fdi{opacity:1;transform:none;transition:opacity .35s,transform .45s cubic-bezier(.2,.9,.25,1.1),border-color .2s}
.fdi:hover{border-color:var(--lime)}.fdi.on{border-color:var(--lime);box-shadow:inset 0 0 0 1px var(--lime)}.fdi.wide{grid-column:1/-1}
.fdi canvas{display:block;width:100%;height:78px}.fdi.wide canvas{height:110px}.fdi span{display:block;padding:0 9px 7px;font:14px "Croissant One",Georgia,serif;color:var(--soft)}.fdi.on span{color:var(--lime)}`;
document.head.append(Object.assign(document.createElement('style'),{textContent:css}));
const scrim=Object.assign(document.createElement('div'),{className:'fdscrim'}),dr=Object.assign(document.createElement('aside'),{className:'fdr'});
document.body.append(scrim,dr);
let tiles=[],open=false,pinned=false,raf=0,T=6,last=0,closeT=0;
function build(){const wm=typeof WORDMARK==='function'?WORDMARK(30):'<b>Feather</b>';
 const ic=(k,n)=>typeof icon==='function'?icon(k,n):'';dr.innerHTML=`<div class="fdh">${wm}<span><button class="fdnote" title="quick note (Ctrl+J)">✎ NOTE</button><button class="fdpin">PIN OPEN</button></span></div><div class="fdl"></div><div class="fdf"><a href="#/settings" class="fdfb">${ic('settings',16)}<span>Settings</span></a><button class="fdfb fdej" title="Save, lock and eject the stick">${ic('eject',14)}<span>Eject</span></button></div>`;const L=dr.querySelector('.fdl');let box=null;tiles=[];
 (typeof NAV!=='undefined'?NAV:[]).forEach(([k,l])=>{if(k==='-'){L.append(Object.assign(document.createElement('div'),{className:'fdg',textContent:l.toUpperCase()}));box=null;return}
  if(!box){box=Object.assign(document.createElement('div'),{className:'fdt'});L.append(box)}
  const a=document.createElement('a');a.href='#/'+k;a.className='fdi'+(k==='home'?' wide':'');a.dataset.k=k;a.innerHTML=`<canvas></canvas><span>${l}</span>`;a.onclick=()=>{if(!pinned)setTimeout(()=>setOpen(false),60)};box.append(a);
  const c=a.querySelector('canvas');tiles.push({c,g:c.getContext('2d'),fn:FN[k]||((g,w,h,t)=>feather(g,w/2,h*.85,h*.7,Math.sin(t)*.2,C.lime))})});
 dr.querySelectorAll('.fdi').forEach((t,i)=>t.style.transitionDelay=(i*.03)+'s');
 dr.querySelector('.fdej').onclick=()=>{const e=document.querySelector('#ej');setOpen(false);if(e)e.click();else if(typeof ejectNow==='function')ejectNow()};dr.querySelector('.fdfb').onclick=()=>{if(!pinned)setTimeout(()=>setOpen(false),60)};dr.querySelector('.fdnote').onclick=()=>{setOpen(false);quickNote()};const pin=dr.querySelector('.fdpin');pin.onclick=()=>{pinned=!pinned;pin.classList.toggle('on',pinned);pin.textContent=pinned?'PINNED':'PIN OPEN';if(pinned)setOpen(true)};mark()}
function mark(){const k=(location.hash.match(/^#\/([a-z]+)/)||[])[1]||'home';dr.querySelectorAll('.fdi').forEach(a=>a.classList.toggle('on',a.dataset.k===k))}
function colors(){const cs=getComputedStyle(document.querySelector('.frame')||document.body),v=(n,d)=>cs.getPropertyValue(n).trim()||d;
 C={bg:v('--bg','#0c0d0b'),panel:v('--panel','#141612'),line:v('--line','#262a22'),line2:v('--line2','#343a2e'),text:v('--text','#e8ecdf'),soft:v('--soft','#c9d0bf'),muted:v('--muted','#8e9686'),lime:v('--lime','#c6f432'),bad:v('--bad','#ff8a6b')}}
function fit(){const dp=Math.min(2,devicePixelRatio||1);tiles.forEach(o=>{const r=o.c.getBoundingClientRect();o.w=r.width;o.h=r.height;o.c.width=Math.round(r.width*dp);o.c.height=Math.round(r.height*dp);o.g.setTransform(dp,0,0,dp,0,0)})}
const calm_=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
function frame(){tiles.forEach(o=>{o.g.clearRect(0,0,o.w,o.h);o.g.save();o.g.lineCap='butt';try{o.fn(o.g,o.w,o.h,T)}catch(e){}o.g.restore()})}
function loop(n){const dt=Math.min(.05,(n-last)/1000);last=n;if(!document.hidden)T+=dt*.4;frame();raf=requestAnimationFrame(loop)}
function setOpen(v){if(pinned&&!v)return;clearTimeout(closeT);closeT=0;if(v===open)return;open=v;document.body.classList.toggle('fdopen',v);
 if(v){if(!tiles.length)build();if(typeof syncDecor==='function')syncDecor(dr);readPct();colors();mark();fit();last=performance.now();if(calm_())frame();else if(!raf)raf=requestAnimationFrame(loop)}
 else setTimeout(()=>{if(!open){cancelAnimationFrame(raf);raf=0}},450)}
const mini=()=>document.body.classList.contains('navmini');
document.addEventListener('mouseover',e=>{if(mini()&&e.target.closest&&e.target.closest('.app>nav')&&!e.target.closest('.app>nav .foot'))setOpen(true)});
document.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse'&&mini()&&e.target.closest&&e.target.closest('.app>nav .brand')){e.preventDefault();setOpen(!open)}});
document.addEventListener('mousemove',e=>{if(!open||pinned)return;if(e.clientX>dr.offsetWidth+16||e.clientY>dr.getBoundingClientRect().bottom+4){if(!closeT)closeT=setTimeout(()=>{closeT=0;setOpen(false)},250)}else{clearTimeout(closeT);closeT=0}});
scrim.onclick=()=>{pinned=false;setOpen(false);const p=dr.querySelector('.fdpin');if(p){p.classList.remove('on');p.textContent='PIN OPEN'}};
addEventListener('hashchange',mark);addEventListener('resize',()=>open&&fit());
// first run: start in the narrow menu so the drawer is what you get; the « / » button (or [ ) still brings the full names back
try{if(localStorage.getItem('feather-nav')===null&&typeof navToggle==='function')navToggle(true)}catch(e){}

// ---------- book report: open it any time while reading, fill in what you like, close, keep reading ----------
document.head.append(Object.assign(document.createElement('style'),{textContent:`.fdrep{position:fixed;right:22px;bottom:40px;z-index:55;font:700 11px "JetBrains Mono",monospace;letter-spacing:.06em;background:var(--panel,#141612);color:var(--lime,#c6f432);border:1px solid var(--lime,#c6f432);border-radius:99px;padding:8px 14px;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.4)}
.fdrep:hover{background:var(--lime);color:#0c0d0b}.fdmod{position:fixed;inset:0;z-index:70;background:rgba(0,0,0,.5);display:flex;justify-content:flex-end}
.fdbox{width:min(560px,100%);height:100%;background:var(--panel,#141612);border-left:1px solid var(--line2);display:flex;flex-direction:column;animation:fdin .35s cubic-bezier(.2,.9,.25,1.05)}@keyframes fdin{from{transform:translateX(40px);opacity:0}}
.fdbh{display:flex;justify-content:space-between;align-items:flex-start;padding:18px 20px 10px;border-bottom:1px solid var(--line)}.fdbt{font:500 22px Newsreader,serif;color:var(--text)}.fdx{background:none;border:0;color:var(--soft);font-size:26px;cursor:pointer;line-height:1}
.fdbb{flex:1;overflow:auto;padding:14px 20px;display:flex;flex-direction:column;gap:8px}.fdbb label{font-size:14px;color:var(--soft);text-transform:none;letter-spacing:0;margin-top:6px}.fdbb textarea{min-height:64px;resize:vertical}.fdbb .fdout{min-height:200px;font:18px Newsreader,serif}
.fdbf{display:flex;gap:8px;align-items:center;padding:12px 20px;border-top:1px solid var(--line)}.fdst{flex:1;font:11px "JetBrains Mono",monospace;color:var(--muted)}`}));
const RB=Object.assign(document.createElement('button'),{className:'fdrep',textContent:'✎ BOOK REPORT'});document.body.append(RB);
const readId=()=>{const m=location.hash.match(/^#\/read\/([^/]+)/);RB.style.display=m?'':'none';return m?decodeURIComponent(m[1]):null};addEventListener('hashchange',readId);readId();
const E_=v=>typeof esc==='function'?esc(v):String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
RB.onclick=async()=>{const rid=readId();if(!rid||document.querySelector('.fdmod'))return;let bs,qs;try{[bs,qs]=await Promise.all([api('books'),api('review/questions')])}catch(e){return}
 const b=bs.find(x=>x.digital===rid);if(!b){if(typeof toast==='function')toast('This book isn\'t on your Reading list yet.');return}const R=b.review||{},ans=R.answers||[];
 const ov=document.createElement('div');ov.className='fdmod';ov.innerHTML=`<div class="fdbox"><div class="fdbh"><div><div class="fdg" style="margin:0 0 2px">BOOK REPORT</div><div class="fdbt">${E_(b.title)}</div></div><button class="fdx" title="close (Esc)">×</button></div>
  <div class="fdbb">${qs.map((q,i)=>`<label>${E_(q)}</label><textarea data-i="${i}">${E_(ans[i]||'')}</textarea>`).join('')}<label>Review (edit freely)</label><textarea class="fdout">${E_(R.text||'')}</textarea></div>
  <div class="fdbf"><span class="fdst">saves as you type · mark it finished on the book's page</span><button class="fdshape">shape my review</button><button class="fdsave go">save &amp; close</button></div></div>`;
 document.body.append(ov);const st_=ov.querySelector('.fdst'),get=()=>({id:b.id,answers:[...ov.querySelectorAll('textarea[data-i]')].map(x=>x.value),text:ov.querySelector('.fdout').value});
 let tm=null;const save=async()=>{try{await api('book/review/draft',get());st_.textContent='saved '+new Date().toTimeString().slice(0,5)}catch(e){st_.textContent='not saved: '+e.message}};
 const close=async()=>{clearTimeout(tm);await save();ov.remove()};
 ov.addEventListener('input',()=>{clearTimeout(tm);tm=setTimeout(save,800)});ov.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape')close()});
 ov.querySelector('.fdx').onclick=close;ov.querySelector('.fdsave').onclick=close;ov.addEventListener('click',e=>{if(e.target===ov)close()});
 ov.querySelector('.fdshape').onclick=async()=>{const o=ov.querySelector('.fdout'),g=get();o.value='writing…';try{const r=await api('book/review',{id:b.id,answers:g.answers});o.value=r.text}catch(e){o.value=g.text}};
 setTimeout(()=>{const t=ov.querySelector('textarea');t&&t.focus()},60)};

// ---------- quick notes: Ctrl+J anywhere (or ✎ in the menu). Each goes to Obsidian at the next sync, linked into a note you pick ----------
document.head.append(Object.assign(document.createElement('style'),{textContent:`.fdj textarea.fdjt{min-height:150px;font:18px Newsreader,serif}.fdjl{display:flex;flex-direction:column;gap:6px;margin-top:10px}
.fdji{display:flex;gap:10px;align-items:flex-start;padding:9px 11px;border:1px solid var(--line);border-radius:8px;cursor:pointer}.fdji:hover{border-color:var(--lime)}.fdji p{flex:1;margin:0;color:var(--soft);font-size:15px;white-space:pre-wrap;max-height:4.4em;overflow:hidden}
.fdji small{font:10px "JetBrains Mono",monospace;color:var(--muted);display:block;margin-top:3px}.fdji button{background:none;border:0;color:var(--muted);font-size:18px;cursor:pointer}.fdji button:hover{color:var(--bad)}
.fdnote{font:700 10px "JetBrains Mono",monospace;letter-spacing:.08em;background:none;border:1px solid var(--line2);color:var(--soft);border-radius:99px;padding:4px 9px;cursor:pointer;margin-right:6px}.fdnote:hover{color:var(--lime);border-color:var(--lime)}`}));
async function quickNote(edit){if(document.querySelector('.fdj'))return;let notes=[],jots=[];try{[notes,jots]=await Promise.all([api('notes'),api('jots')])}catch(e){}
 const ov=document.createElement('div');ov.className='fdmod fdj';let cur=edit||null;
 ov.innerHTML=`<div class="fdbox"><div class="fdbh"><div><div class="fdg" style="margin:0 0 2px">QUICK NOTE</div><div class="fdbt">Jot it down</div></div><button class="fdx" title="close (Esc)">×</button></div>
  <div class="fdbb"><textarea class="fdjt" placeholder="What's on your mind…"></textarea><label>Link it into a note (optional)</label><input class="fdjlink" list="fdjnl" placeholder="start typing a note's name"><datalist id="fdjnl">${notes.map(n=>`<option value="${E_(n.path)}">${E_(n.title)}</option>`).join('')}</datalist>
  <div class="fdg" style="margin:14px 0 0">RECENT</div><div class="fdjl"></div></div>
  <div class="fdbf"><span class="fdst">goes to Obsidian at the next sync · Ctrl+Enter saves</span><button class="fdnew">new</button><button class="fdsave go">save</button></div></div>`;
 document.body.append(ov);const ta=ov.querySelector('.fdjt'),ln=ov.querySelector('.fdjlink'),st=ov.querySelector('.fdst'),L=ov.querySelector('.fdjl');
 const when=t=>new Date(t*1000).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
 const fill=j=>{cur=j;ta.value=j?j.text:'';ln.value=j?j.link||'':'';ov.querySelector('.fdbt').textContent=j?'Edit note':'Jot it down';ta.focus()};
 const list=()=>{L.innerHTML=jots.length?'':'<div class="muted" style="font-size:13px">Nothing yet.</div>';jots.slice(0,30).forEach(j=>{const d=document.createElement('div');d.className='fdji';d.innerHTML=`<div style="flex:1"><p>${E_(j.text)}</p><small>${when(j.t)}${j.link?' · → '+E_(j.link.split('/').pop().replace(/\.md$/,'')):''}</small></div><button title="delete">×</button>`;
  d.onclick=()=>fill(j);d.querySelector('button').onclick=async e=>{e.stopPropagation();await api('jot/delete',{id:j.id});jots=jots.filter(x=>x!==j);if(cur===j)fill(null);list()};L.append(d)})};
 const save=async()=>{const text=ta.value.trim();if(!text){st.textContent='nothing to save';return}try{const j=await api('jot/save',{id:cur&&cur.id,text,link:ln.value.trim()});jots=[j,...jots.filter(x=>x.id!==j.id)];list();fill(null);st.textContent='saved · goes to Obsidian at the next sync'}catch(e){st.textContent='not saved: '+e.message}};
 const close=async()=>{if(ta.value.trim()&&(!cur||cur.text!==ta.value.trim()))await save();ov.remove()};
 ov.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape')close();if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();save()}});
 ov.querySelector('.fdx').onclick=close;ov.querySelector('.fdsave').onclick=save;ov.querySelector('.fdnew').onclick=()=>fill(null);ov.addEventListener('click',e=>{if(e.target===ov)close()});
 list();fill(edit||null)}
window.quickNote=quickNote;
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&(e.key==='j'||e.key==='J')&&!document.querySelector('#lockroot')){e.preventDefault();quickNote()}});
})();
