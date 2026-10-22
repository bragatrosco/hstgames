'use strict';
// All scene coordinates use the reference room's 1024 × 840 grid.
const $ = id => document.getElementById(id);
const stage=$('stage'),tray=$('inventory'),canvas=$('actors'),ctx=canvas.getContext('2d');
const state={keyRevealed:false,keyOwned:false,diaryOpen:false,items:[],selected:null,context:null,completed:false,discoveries:{}};
// Floor outline and individual furniture footprints, in background coordinates.
// Navigation uses an elliptical foot clearance and a connected 10-pixel grid.
const floor=[{x:285,y:605},{x:470,y:583},{x:520,y:650},{x:580,y:730},{x:690,y:838},{x:160,y:838},{x:220,y:745},{x:282,y:690}];
const obstacles=[
 {id:'bed',points:[{x:0,y:385},{x:276,y:455},{x:316,y:560},{x:310,y:690},{x:240,y:738},{x:0,y:760}]},
 {id:'books',points:[{x:105,y:697},{x:230,y:690},{x:288,y:745},{x:295,y:839},{x:115,y:839},{x:78,y:768}]},
 {id:'desk',points:[{x:490,y:476},{x:1024,y:445},{x:1024,y:840},{x:760,y:840},{x:745,y:727},{x:690,y:650},{x:510,y:626}]},
 {id:'chair',points:[{x:560,y:500},{x:650,y:490},{x:710,y:775},{x:665,y:812},{x:594,y:809},{x:570,y:754}]}
];
const footprint={x:61,y:10};
const hotspots=[
 {id:'vinyl',name:'Tocador de vinil',box:[919,467,105,92],access:{x:525,y:795}},
 {id:'radio',name:'Rádio de ondas curtas',box:[574,368,158,127],access:{x:460,y:680}},
 {id:'diary',name:'Diário — gaveta trancada',box:[846,566,178,125],access:{x:540,y:817}},
 {id:'bed',name:'Cama de Beto',box:[18,403,256,263],access:{x:365,y:705}},
 {id:'guitar',name:'Violão',box:[2,523,96,195],access:{x:345,y:753}},
 {id:'shelves',name:'Estante de livros',box:[285,244,161,337],access:{x:405,y:650}},
 {id:'window',name:'Janela e persianas',box:[470,50,200,332],access:{x:450,y:648}},
 {id:'posters',name:'Cartazes na parede',box:[18,23,297,227],access:{x:382,y:688}},
 {id:'photos',name:'Fotografias da família',box:[18,254,241,110],access:{x:363,y:714}},
 {id:'books',name:'Livros na escrivaninha',box:[740,407,180,105],access:{x:485,y:745}},
 {id:'papers',name:'Papéis no chão',box:[147,735,121,91],access:{x:345,y:807}},
 {id:'posterDesafio',name:'Cartaz: O Desafio',box:[704,48,85,199],access:{x:460,y:690}},
 {id:'posterDeus',name:'Cartaz: Deus e o Diabo na Terra do Sol',box:[794,26,94,238],access:{x:480,y:740}},
 {id:'posterCruzeiro',name:'Capa de O Cruzeiro',box:[893,5,121,260],access:{x:505,y:795}},
 {id:'key',name:'Chave oculta',box:[945,502,74,36],access:{x:525,y:795},visible:()=>state.keyRevealed&&!state.keyOwned}
];
// Future NPCs use the same actor and path-following system as Lucas.
class Actor{
 constructor(id,x,y){this.id=id;this.x=x;this.y=y;this.path=[];this.direction=1;this.facing='side';this.moving=false;this.onArrival=null;this.phase=0;this.speed=0;}
 walkTo(point,after=null){const start=projectToFloor(this),end=projectToFloor(point);this.x=start.x;this.y=start.y;this.path=findPath(start,end);this.onArrival=after;if(!this.path.length){this.onArrival=null;return false;}return true;}
 stop(){this.path=[];this.onArrival=null;this.moving=false;this.speed=0;}
 update(dt){this.moving=this.path.length>0;if(!this.moving){this.speed=0;return;}const goal=this.path[0],dx=goal.x-this.x,dy=goal.y-this.y,d=Math.hypot(dx,dy);this.speed+=(135-this.speed)*(1-Math.exp(-dt*9));const velocity=this.path.length===1?Math.min(this.speed,Math.max(35,d*4)):this.speed,step=velocity*dt;if(Math.abs(dx)>Math.abs(dy)*.9){this.facing='side';this.direction=dx<0?-1:1;}else this.facing=dy<0?'back':'front';this.phase+=dt*velocity/21;if(d<=step){this.x=goal.x;this.y=goal.y;this.path.shift();if(!this.path.length){this.moving=false;this.speed=0;const fn=this.onArrival;this.onArrival=null;if(fn)fn();}}else{this.x+=dx/d*step;this.y+=dy/d*step;}}
}
function inPolygon(p,polygon){let c=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if(((a.y>p.y)!==(b.y>p.y))&&(p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x))c=!c;}return c;}
function floorPixel(p){return inPolygon(p,floor)&&!obstacles.some(o=>inPolygon(p,o.points));}
function inside(p){if(!floorPixel(p))return false;for(const dx of [-footprint.x,footprint.x])for(const dy of [-footprint.y,footprint.y])if(!floorPixel({x:p.x+dx,y:p.y+dy}))return false;for(let i=0;i<12;i++){const t=i/12*Math.PI*2;if(!floorPixel({x:p.x+Math.cos(t)*footprint.x,y:p.y+Math.sin(t)*footprint.y}))return false;}return true;}
const grid=[],gridMap=new Map(),gridStep=10;
let reachable=new Set(),navNodes=[];
function rebuildNavigation(){
 grid.length=0;gridMap.clear();
 for(let y=590;y<=830;y+=gridStep)for(let x=70;x<=950;x+=gridStep)if(inside({x,y})){const n={x,y,index:grid.length,neighbors:[]};grid.push(n);gridMap.set(x+','+y,n);}
 for(const n of grid)for(const [dx,dy]of [[10,0],[-10,0],[0,10],[0,-10],[10,10],[-10,10],[10,-10],[-10,-10]]){const q=gridMap.get((n.x+dx)+','+(n.y+dy));if(q&&clearLine(n,q))n.neighbors.push(q.index);}
 const seed=grid.reduce((a,b)=>Math.hypot(a.x-420,a.y-750)<Math.hypot(b.x-420,b.y-750)?a:b);reachable=new Set([seed.index]);const queue=[seed];for(let i=0;i<queue.length;i++)for(const j of queue[i].neighbors)if(!reachable.has(j)){reachable.add(j);queue.push(grid[j]);}
 navNodes=grid.filter(n=>reachable.has(n.index));
}
function clearLine(a,b){const steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/2));for(let i=0;i<=steps;i++){const t=i/steps;if(!inside({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t}))return false;}return true;}
rebuildNavigation();
function projectToFloor(p){return navNodes.reduce((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)<Math.hypot(b.x-p.x,b.y-p.y)?a:b);}
function findPath(start,end){if(clearLine(start,end))return[{x:end.x,y:end.y}];const a=projectToFloor(start),b=projectToFloor(end),dist=new Map([[a.index,0]]),prev=new Map(),openSet=new Set([a.index]);while(openSet.size){let i=-1,score=Infinity;for(const k of openSet){const n=grid[k],v=dist.get(k)+Math.hypot(n.x-b.x,n.y-b.y);if(v<score){score=v;i=k;}}if(i===b.index)break;openSet.delete(i);for(const j of grid[i].neighbors){if(!reachable.has(j))continue;const v=dist.get(i)+Math.hypot(grid[i].x-grid[j].x,grid[i].y-grid[j].y);if(v<(dist.get(j)??Infinity)){dist.set(j,v);prev.set(j,i);openSet.add(j);}}}
 if(!dist.has(b.index))return[];const raw=[];for(let i=b.index;i!==a.index;i=prev.get(i))raw.unshift(grid[i]);raw.unshift(a);const result=[];let at=start,index=0;while(index<raw.length){let far=index;while(far+1<raw.length&&clearLine(at,raw[far+1]))far++;result.push({x:raw[far].x,y:raw[far].y});at=raw[far];index=far+1;}return result;}
const spawn=projectToFloor({x:350,y:638}),lucas=new Actor('lucas',spawn.x,spawn.y),actors=[lucas];

function point(event){const r=stage.getBoundingClientRect();return{x:(event.clientX-r.left)/r.width*1024,y:(event.clientY-r.top)/r.height*840};}
function hit(p){return [...hotspots].reverse().find(h=>(!h.visible||h.visible())&&p.x>=h.box[0]&&p.x<=h.box[0]+h.box[2]&&p.y>=h.box[1]&&p.y<=h.box[1]+h.box[3])||null;}
function say(text,speaker='LUCAS'){$('speaker').textContent=speaker;$('line').textContent=text;}
let open=false,deadline=0,hover=false,focused=false,pendingAction=0;
function openTray(target){state.context=target;open=true;tray.classList.add('open');tray.inert=false;deadline=performance.now()+6000;renderInventory();}
function closeTray(){open=false;tray.classList.remove('open');tray.inert=true;hover=false;focused=false;stage.focus({preventScroll:true});}
function cancel(){pendingAction++;lucas.onArrival=null;state.selected=null;closeTray();}
function renderInventory(){const target=state.context;$('contextTitle').textContent=target?target.name:'Ações e inventário';$('interactLabel').textContent=state.selected?'Usar':target?.id==='key'?'Pegar':'Interagir';$('inventoryNote').textContent=state.selected?`${names[state.selected]} selecionado. Botão direito no destino → mão para usar.`:'A barra fecha após 6 s sem uso. Escolha uma ação ou um item.';
 $('items').replaceChildren();if(!state.items.length){const el=document.createElement('span');el.className='empty';el.textContent='Nenhum objeto coletado';$('items').append(el);}for(const id of state.items){const b=document.createElement('button');b.className='slot'+(state.selected===id?' selected':'');b.dataset.item=id;b.setAttribute('aria-pressed',String(state.selected===id));b.innerHTML=icons[id]+`<span>${names[id]}</span>`;b.onclick=()=>selectItem(id);$('items').append(b);}deadline=performance.now()+6000;}
const names={key:'Chave oculta',diary:'Diário de Beto'};
const icons={key:'<svg viewBox="0 0 32 32"><circle cx="10" cy="10" r="6"/><path d="m14 14 14 14m-6-6 3-3m-7 0 3-3"/></svg>',diary:'<svg viewBox="0 0 32 32"><rect x="7" y="3" width="20" height="26" rx="2"/><path d="M11 3v26M4 8h5m-5 8h5m-5 8h5m6-13h8m-8 5h8"/></svg>'};
function selectItem(id){if(state.selected&&state.selected!==id){combine(state.selected,id);return;}state.selected=state.selected===id?null:id;renderInventory();}
// Explicit recipe registry; this first scene has no item-item crafting recipe.
const recipes=new Map();
function combine(a,b){const recipe=recipes.get([a,b].sort().join('+'));if(recipe)recipe(state);else say('Esses objetos não se encaixam. Posso usá-los separadamente.');state.selected=null;renderInventory();}
function perform(action){const target=state.context,selected=state.selected;closeTray();if(!target){say(action==='talk'?'Estou sozinho aqui. Preciso encontrar Beto.':'Clique com o botão direito no objeto que você quer examinar.');return;}if(action==='talk'){say('Não há ninguém para conversar ali. O quarto está vazio.');return;}const request=++pendingAction;const done=()=>{if(request!==pendingAction)return;resolveAction(action,target.id,selected);};if(!lucas.walkTo(target.access,done))say('Não consigo passar por aqui. Vou tentar outro caminho.');}
function resolveAction(action,id,item){if(action==='investigate'&&displayObjects[id]){remember(id);say(displayObjects[id].line);showDetail(id);return;}if(action==='investigate')remember(id);if(exploration[id]&&(action==='investigate'||!item)){say(action==='investigate'?exploration[id].look:exploration[id].touch);return;}if(item&&action==='interact'){state.selected=null;if(item==='key'&&id==='diary'){if(!state.diaryOpen){state.diaryOpen=true;state.completed=true;state.items.push('diary');say('A chave abriu a gaveta! No diário, Beto escreveu: “JUHPLR — 23K”. A dica diz: “Troque cada letra pela que vem três posições antes no alfabeto.”');$('progress').textContent='Pista encontrada: decifre o recado de Beto.';}else say('A gaveta já está aberta. O diário está comigo.');}else say('Isso não parece funcionar aqui.');refresh();return;}
 if(action==='investigate'){if(id==='vinyl'){if(!state.keyRevealed){state.keyRevealed=true;say('Este disco de Tropicália está fora da capa... Espere. Há uma chave escondida aqui dentro.');}else say(state.keyOwned?'Foi dentro desta capa que encontrei a chave.':'A chave está ali, na capa. Posso pegá-la.');}else if(id==='key')say('Uma chave pequena, escondida de propósito. Deve abrir alguma coisa neste quarto.');else if(id==='diary')say(state.diaryOpen?'Troquei cada letra pela que vem três posições antes. “JUHPLR — 23K” virou “GREMIO — 23H”. É um encontro às onze da noite no grêmio, o grupo de estudantes da escola.':'A gaveta está trancada. Beto guardava o diário aqui.');else if(id==='radio')say('É um rádio que pode receber estações distantes. Algumas peças parecem estar com problema. Beto anotava os números das estações.');}
 else if(id==='key'){if(state.keyRevealed&&!state.keyOwned){state.keyOwned=true;state.items.push('key');say('Peguei a chave. Ela está no inventário. Talvez sirva na gaveta da escrivaninha.');openTray(hotspots.find(h=>h.id==='diary'));}}
 else if(id==='diary')say(state.diaryOpen?'O diário está comigo. Preciso entender o recado de Beto.':'Está trancada. Preciso selecionar a chave e usá-la aqui.');
 else if(id==='radio')say('Só estática... O conserto do rádio fica para a próxima etapa.');
 else if(id==='vinyl')say('Não vou levar o aparelho. Melhor investigar o disco e a capa.');refresh();}
const exploration={
 bed:{look:'O cobertor está fora do lugar. Beto não costuma deixar a cama assim. Parece que saiu com pressa.',touch:'Vou deixar a cama como está. Primeiro, preciso saber o que aconteceu.'},
 guitar:{look:'O violão de Beto ficou aqui. Ele sempre o levava aos encontros. Será que precisou sair sem se preparar?',touch:'Vou deixar o violão aqui. É estranho não ouvir Beto tocando.'},
 shelves:{look:'Há livros, discos e cadernos na estante. Beto costumava esconder coisas entre objetos do dia a dia.',touch:'Não preciso pegar todos esses livros. Vou olhar o disco que está fora da capa.'},
 window:{look:'As persianas, que cobrem a janela, estão quase fechadas. A rua parece vazia. Não vejo Beto lá fora.',touch:'Melhor deixar a janela assim. Não quero chamar atenção de quem está na rua.'},
 posters:{look:'Beto colocou estes cartazes na parede. Eles mostram suas ideias e o que ele queria mudar no país.',touch:'Vou deixar os cartazes na parede. Eles são importantes para Beto.'},
 photos:{look:'Sou eu com Beto nesta foto. Sinto falta dele. Preciso descobrir onde está.',touch:'Vou deixar as fotografias aqui. Preciso encontrar meu irmão.'},
 books:{look:'Os livros de Beto estão ao lado do rádio. Vou olhar os títulos com calma.',touch:'Vou deixar os livros nesta ordem. Talvez precise olhar de novo.'},
 papers:{look:'Reconheço a letra de Beto neste papel: “Guardei algo onde a música descansa.” Será que ele fala dos discos?',touch:'Já anotei a pista no meu caderno. Posso deixar as folhas aqui.'}
};
const clueText={vinyl:'Uma chave estava escondida na capa do disco de Tropicália.',key:'A chave pequena pode abrir a gaveta da escrivaninha.',diary:'Beto guardava o diário nesta gaveta. Preciso de uma chave para abrir.',radio:'O rádio recebe estações distantes, mas algumas peças parecem estar com problema.'};
const deskBooks=[
 {title:'Manifesto Comunista',author:'Karl Marx e Friedrich Engels'},
 {title:'Cem Anos de Solidão',author:'Gabriel García Márquez'},
 {title:'Autobiografia de Malcolm X',author:'Malcolm X e Alex Haley'},
 {title:'Mito e Verdade da Revolução Brasileira',author:'Guerreiro Ramos'}
];
const displayObjects={
 books:{title:'Os livros de Beto',line:'Beto deixou quatro livros perto do rádio. Vou olhar os títulos com calma.'},
 posterDesafio:{title:'O Desafio',image:'assets/poster-o-desafio.png',line:'Beto prendeu na parede um cartaz do filme O Desafio. O amarelo se destaca na luz da mesa.'},
 posterDeus:{title:'Deus e o Diabo na Terra do Sol',image:'assets/poster-deus-e-o-diabo.png',line:'Este cartaz é do filme Deus e o Diabo na Terra do Sol. Beto gostava de conversar sobre cinema.'},
 posterCruzeiro:{title:'O Cruzeiro',image:'assets/revista-o-cruzeiro.png',line:'Beto guardou esta capa da revista O Cruzeiro e a colocou na parede, perto dos cartazes de cinema.'}
};
function showDetail(id){closeTray();lucas.stop();const data=displayObjects[id],body=$('detailBody');body.replaceChildren();$('detailTitle').textContent=data.title;if(id==='books'){const list=document.createElement('ol');list.className='book-list';for(const book of deskBooks){const li=document.createElement('li'),title=document.createElement('strong'),author=document.createElement('span');title.textContent=book.title;author.textContent=book.author;li.append(title,author);list.append(li);}body.append(list);}else{const img=document.createElement('img');img.src=data.image;img.alt=data.title;img.className='detail-image';body.append(img);}$('detail').classList.remove('hidden');$('detailClose').focus();}
function closeDetail(){$('detail').classList.add('hidden');stage.focus();}
$('detailClose').onclick=closeDetail;
document.addEventListener('keydown',e=>{if($('detail').classList.contains('hidden'))return;if(e.key==='Escape'){e.preventDefault();closeDetail();}if(e.key==='Tab'){e.preventDefault();$('detailClose').focus();}});
function remember(id){const target=hotspots.find(h=>h.id===id);if(!target)return;state.discoveries[id]={title:target.name,text:displayObjects[id]?.line||exploration[id]?.look||clueText[id]||target.name};$('notesCount').textContent=Object.keys(state.discoveries).length;}
function showNotes(show){$('notes').classList.toggle('hidden',!show);if(show){closeTray();lucas.stop();const list=$('notesList');list.replaceChildren();for(const value of Object.values(state.discoveries)){const section=document.createElement('section'),h=document.createElement('h3'),p=document.createElement('p');h.textContent=value.title;p.textContent=value.text;section.append(h,p);list.append(section);}if(!list.children.length){const p=document.createElement('p');p.textContent='Ainda não registrei nenhuma pista. Botão direito em um objeto e lupa para investigar.';list.append(p);}if(state.diaryOpen){const p=document.createElement('p');p.textContent='No diário: JUHPLR — 23K. Ao trocar cada letra pela que vem três posições antes, leio GREMIO — 23H. O grêmio é o grupo de estudantes da escola. O encontro é às onze da noite.';list.append(p);}$('notesClose').focus();}else stage.focus();}
$('notesButton').onclick=()=>showNotes(true);$('notesClose').onclick=()=>showNotes(false);
let showHotspots=false;
document.addEventListener('keydown',e=>{if(e.code==='Space'&&e.target===stage){e.preventDefault();showHotspots=true;}if(e.key==='Escape')showNotes(false);});document.addEventListener('keyup',e=>{if(e.code==='Space')showHotspots=false;});window.addEventListener('blur',()=>showHotspots=false);
function refresh(){$('keyGlint').classList.toggle('hidden',!state.keyRevealed||state.keyOwned);if(open)renderInventory();}
$('investigate').onclick=()=>perform('investigate');$('interact').onclick=()=>perform('interact');$('talk').onclick=()=>perform('talk');$('closeInventory').onclick=closeTray;
tray.addEventListener('click',e=>e.stopPropagation());
tray.addEventListener('pointerenter',()=>hover=true);tray.addEventListener('pointerleave',()=>{hover=false;deadline=performance.now()+6000;});tray.addEventListener('focusin',()=>focused=true);tray.addEventListener('focusout',()=>{focused=false;deadline=performance.now()+6000;});tray.addEventListener('contextmenu',e=>{e.preventDefault();e.stopPropagation();deadline=performance.now()+6000;});
stage.addEventListener('contextmenu',e=>{e.preventDefault();if(tray.contains(e.target))return;pendingAction++;lucas.stop();openTray(hit(point(e)));});
let suppressClick=false,touchTimer=null,touchStart=null;
stage.addEventListener('pointerdown',e=>{if(tray.contains(e.target)||e.pointerType==='mouse')return;touchStart={x:e.clientX,y:e.clientY};touchTimer=setTimeout(()=>{suppressClick=true;openTray(hit(point(e)));},480);});
stage.addEventListener('pointermove',e=>{if(touchStart&&Math.hypot(e.clientX-touchStart.x,e.clientY-touchStart.y)>12)clearTimeout(touchTimer);if(tray.contains(e.target))return;const h=hit(point(e));$('targetName').textContent=h?h.name:'';stage.style.cursor=h?'crosshair':'default';});
for(const ev of ['pointerup','pointercancel'])stage.addEventListener(ev,()=>{clearTimeout(touchTimer);touchStart=null;});
stage.addEventListener('click',e=>{if(e.composedPath().includes(tray)||tray.contains(e.target)||!$('help').classList.contains('hidden')||!$('notes').classList.contains('hidden')||!$('detail').classList.contains('hidden'))return;if(suppressClick){suppressClick=false;return;}if(e.button!==0)return;pendingAction++;closeTray();const dest=projectToFloor(point(e));lucas.walkTo(dest);const marker=document.createElement('div');marker.className='click-marker';marker.style.left=dest.x/1024*100+'%';marker.style.top=dest.y/840*100+'%';stage.append(marker);setTimeout(()=>marker.remove(),850);});
$('touchInventory').onclick=()=>openTray(state.context);
function help(show){$('help').classList.toggle('hidden',!show);if(show){closeTray();$('helpClose').focus();}else stage.focus();}
$('helpButton').onclick=()=>help(true);$('helpClose').onclick=()=>help(false);
$('resetButton').onclick=()=>{if(confirm('Recomeçar a investigação e esvaziar o inventário?'))location.reload();};
document.addEventListener('keydown',e=>{if(e.key==='Escape'){help(false);cancel();}if((e.key==='i'||e.key==='I')&&$('help').classList.contains('hidden')&&$('notes').classList.contains('hidden')&&$('detail').classList.contains('hidden')&&$('radioPanel').classList.contains('hidden'))openTray(state.context);if(e.key==='Tab'&&!$('notes').classList.contains('hidden')){e.preventDefault();$('notesClose').focus();}if(e.key==='Tab'&&!$('help').classList.contains('hidden')){const buttons=[$('helpClose')];e.preventDefault();buttons[0].focus();}});
const sprite=new Image();sprite.src=$('spriteTexture').src;sprite.onerror=()=>{$('loadError').classList.remove('hidden');};$('background').onerror=()=>{$('loadError').classList.remove('hidden');};
// Neutralize the orange highlights painted in the source art before applying world lighting.
// The texture is embedded so this rendering pass also works when opened offline via file://.
const neutralSprite=document.createElement('canvas'),neutralCtx=neutralSprite.getContext('2d',{willReadFrequently:true});
let neutralReady=false;
sprite.addEventListener('load',()=>{
 neutralSprite.width=sprite.naturalWidth;neutralSprite.height=sprite.naturalHeight;neutralCtx.drawImage(sprite,0,0);
 const pixels=neutralCtx.getImageData(0,0,neutralSprite.width,neutralSprite.height),d=pixels.data;
 for(let i=0;i<d.length;i+=4){if(!d[i+3])continue;const r=d[i],g=d[i+1],b=d[i+2],warm=Math.max(0,Math.min(1,(r-b)/150)),shade=1-.10*warm;const contrast=v=>Math.max(0,Math.min(255,(v-16)*1.10));d[i]=contrast(r)*shade;d[i+1]=contrast(g)*shade;d[i+2]=contrast(b)*shade;}
 neutralCtx.putImageData(pixels,0,0);neutralReady=true;
});
const actorSurface=document.createElement('canvas'),actorCtx=actorSurface.getContext('2d');
const lampLight={x:735,y:330};
function renderLitActor(a,index,width,height){
 if(a.id==='beto'&&window.renderBeto)return window.renderBeto(a,index,width,height);
 if(a.id==='clara'&&window.renderClara)return window.renderClara(a,index,width,height);
 if(a.id==='inspector'&&window.renderInspector)return window.renderInspector(a,index,width,height);
 const c=spriteFrames[index],w=Math.ceil(width),h=Math.ceil(height),flip=index<4?a.direction:1;
 if(actorSurface.width!==w||actorSurface.height!==h){actorSurface.width=w;actorSurface.height=h;}else actorCtx.clearRect(0,0,w,h);
 actorCtx.save();actorCtx.imageSmoothingEnabled=false;if(flip<0){actorCtx.translate(w,0);actorCtx.scale(-1,1);}actorCtx.drawImage(neutralReady?neutralSprite:sprite,c.x,c.y,c.w,c.h,0,0,w,h);actorCtx.restore();
 // Multiply preserves the dark outlines and material contrast; no pale color veil.
 const lampOnRight=lampLight.x>a.x,dist=Math.hypot(lampLight.x-a.x,lampLight.y-(a.y-height*.64)),reach=Math.max(.55,Math.min(1,1.25-dist/900));
 const lit=[Math.round(90+165*reach),Math.round(128+94*reach),Math.round(205-31*reach)];
 const light=actorCtx.createLinearGradient(lampOnRight?0:w,0,lampOnRight?w:0,0);light.addColorStop(0,'rgb(74,108,174)');light.addColorStop(.35,'rgb(95,131,188)');light.addColorStop(.70,'rgb('+Math.round((95+lit[0])/2)+','+Math.round((131+lit[1])/2)+','+Math.round((188+lit[2])/2)+')');light.addColorStop(1,'rgb('+lit.join(',')+')');
 actorCtx.globalCompositeOperation='multiply';if(window.photoActive){const red=actorCtx.createLinearGradient(0,0,w,0);red.addColorStop(0,'rgb(92,84,133)');red.addColorStop(1,'rgb(240,101,89)');actorCtx.fillStyle=red;}else actorCtx.fillStyle=light;actorCtx.fillRect(0,0,w,h);
 // Local light emission: keep crisp shadows, but make the illuminated planes readable.
 actorCtx.globalCompositeOperation='soft-light';
 const amber=actorCtx.createLinearGradient(lampOnRight?0:w,0,lampOnRight?w:0,0);
 amber.addColorStop(0,'rgb(128,128,128)');amber.addColorStop(.60,'rgb(128,128,128)');amber.addColorStop(.84,'rgb(154,139,120)');amber.addColorStop(1,window.photoActive?'rgb(192,116,116)':'rgb('+Math.round(170+42*reach)+','+Math.round(150+22*reach)+',119)');
 actorCtx.fillStyle=amber;actorCtx.fillRect(0,0,w,h);
 // Narrow cool rim from the window; it does not illuminate the whole face from behind.
 const blue=actorCtx.createLinearGradient(lampOnRight?0:w,0,lampOnRight?w:0,0);
 blue.addColorStop(0,'rgb(115,130,157)');blue.addColorStop(.14,'rgb(124,128,138)');blue.addColorStop(.30,'rgb(128,128,128)');blue.addColorStop(1,'rgb(128,128,128)');actorCtx.fillStyle=blue;actorCtx.fillRect(0,0,w,h);
 // Restore original transparency after both world-space light passes.
 actorCtx.globalCompositeOperation='destination-in';actorCtx.save();if(flip<0){actorCtx.translate(w,0);actorCtx.scale(-1,1);}actorCtx.drawImage(neutralReady?neutralSprite:sprite,c.x,c.y,c.w,c.h,0,0,w,h);actorCtx.restore();actorCtx.globalCompositeOperation='source-over';
 return actorSurface;
}
const spriteFrames=[{"x":214,"y":24,"w":77,"h":366,"feet":[1,76]},{"x":424,"y":26,"w":151,"h":364,"feet":[0,150]},{"x":683,"y":24,"w":156,"h":366,"feet":[0,155]},{"x":943,"y":26,"w":158,"h":364,"feet":[0,157]},{"x":186,"y":429,"w":111,"h":369,"feet":[13,96]},{"x":441,"y":429,"w":118,"h":369,"feet":[26,87]},{"x":691,"y":430,"w":118,"h":370,"feet":[28,86]},{"x":958,"y":429,"w":126,"h":371,"feet":[40,84]},{"x":184,"y":836,"w":115,"h":363,"feet":[15,98]},{"x":438,"y":836,"w":123,"h":363,"feet":[21,87]},{"x":693,"y":836,"w":118,"h":363,"feet":[24,88]},{"x":960,"y":836,"w":126,"h":363,"feet":[38,90]}];
// Reference: head at y≈228, feet at y≈638, visible height ≈410 px.
// Gentle depth variation keeps the actor proportional to the furniture.
function actorHeight(a){if(a.id==='beto')return window.roofActive||window.stationActive?330:94;if(window.roofActive||window.stationActive)return 330;if(window.plazaActive)return 330+(a.y-650)*.25;if(window.dispatchActive)return 330+(a.y-650)*.25;if(window.pressActive)return (a.id==='clara'?345:330)+(a.y-650)*.25;if(window.schoolActive||window.photoActive)return (a.id==='inspector'?350:330)+(a.y-650)*.25;return 410+(a.y-638)*.35;}
function actorScale(a){return actorHeight(a)/460;}
function shoesFit(a,index){const c=spriteFrames[index],factor=actorHeight(a)/c.h,flip=index<4?a.direction:1;let lo=(c.feet[0]-c.w/2)*factor*flip,hi=(c.feet[1]-c.w/2)*factor*flip;if(lo>hi)[lo,hi]=[hi,lo];for(let x=lo;x<=hi;x+=4)for(const dy of [-4,0,4])if(!floorPixel({x:a.x+x,y:a.y+dy}))return false;return true;}
function actorFrame(a){if(a.id==='beto')return a.moving?[1,2,3,2][Math.floor(a.phase)%4]:0;if(a.id==='clara')return a.moving?1+Math.floor(a.phase)%3:0;if(a.id==='inspector')return a.moving?1+Math.floor(a.phase)%3:0;const base=a.facing==='front'?4:a.facing==='back'?8:0,step=a.moving?1+Math.floor(a.phase)%3:0,desired=base+step;if(shoesFit(a,desired))return desired;const compact=(a.facing==='back'?8:4)+step;if(shoesFit(a,compact))return compact;return a.facing==='back'?8:4;}

let last=performance.now();function frame(now){const dt=Math.min((now-last)/1000,.05);last=now;if(window.updateSchool)window.updateSchool(dt);ctx.clearRect(0,0,1024,840);if(window.drawRoofObjects)window.drawRoofObjects(ctx);if(window.drawStationObjects)window.drawStationObjects(ctx);for(const a of [...actors].sort((a,b)=>a.y-b.y)){a.update(dt);if(sprite.complete&&sprite.naturalWidth){const index=actorFrame(a),cell=a.id==='beto'&&window.betoFrames?window.betoFrames[index]:a.id==='clara'&&window.claraFrames?window.claraFrames[index]:a.id==='inspector'&&window.inspectorFrames?window.inspectorFrames[index]:spriteFrames[index],scale=actorScale(a),height=actorHeight(a),width=height*cell.w/cell.h;ctx.save();ctx.translate(a.x,a.y);ctx.fillStyle='#0007';ctx.beginPath();ctx.ellipse(0,-4,37*scale,8,0,0,Math.PI*2);ctx.fill();ctx.imageSmoothingEnabled=false;ctx.drawImage(renderLitActor(a,index,width,height),-width/2,-height,width,height);ctx.restore();if(a.id==='beto'&&window.drawPlazaForeground)window.drawPlazaForeground(ctx);}}
 if(showHotspots){ctx.save();ctx.strokeStyle='#e9be79';ctx.lineWidth=2;ctx.setLineDash([5,5]);for(const h of hotspots)if(!h.visible||h.visible())ctx.strokeRect(...h.box);ctx.restore();}if(open){if(hover||focused)deadline=now+6000;const remain=Math.max(0,(deadline-now)/6000);$('timerFill').style.transform=`scaleX(${remain})`;if(now>=deadline)closeTray();}requestAnimationFrame(frame);}requestAnimationFrame(frame);
// Read-only snapshot for manual QA and future integrations.
window.Ecos={getState:()=>JSON.parse(JSON.stringify(state)),getActors:()=>actors.map(a=>({id:a.id,x:a.x,y:a.y,moving:a.moving})),floor,hotspots,obstacles,footprint,navNodes:navNodes.map(n=>({x:n.x,y:n.y}))};

