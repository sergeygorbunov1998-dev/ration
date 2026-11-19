/* Self-drawn SVG exercise diagrams. Offline, no third-party copyrighted media. */
/* These schematic illustrations indicate movement only and do not depict precise equipment adjustment. */
(()=>{
'use strict';
const defs=[
 {id:'legpress',rx:/гак|жим ногами/i,label:'Жим ногами / гакк',pose:[[[73,56],[88,86],[105,113],[104,130],[115,139],[158,123],[187,137]],[[73,56],[88,86],[105,113],[104,130],[115,139],[181,105],[218,101]]],machine:'press'},
 {id:'hip',rx:/ягодичн.*мост/i,label:'Ягодичный мост',pose:[[[64,70],[91,98],[119,127],[130,132],[153,149],[209,151],[234,175]],[[64,70],[91,98],[119,127],[130,132],[153,114],[209,151],[234,175]]],machine:'bench'},
 {id:'chest',rx:/жим.*груд/i,label:'Жим от груди',pose:[[[78,53],[90,89],[125,100],[160,105],[94,140],[131,155],[150,183]],[[78,53],[90,89],[163,95],[218,95],[94,140],[131,155],[150,183]]],machine:'seated'},
 {id:'row',rx:/горизонтальн.*тяг/i,label:'Горизонтальная тяга',pose:[[[86,53],[89,88],[137,95],[191,98],[95,141],[135,153],[167,179]],[[86,53],[89,88],[105,108],[90,106],[95,141],[135,153],[167,179]]],machine:'cable'},
 {id:'lat',rx:/вертикальн.*тяг/i,label:'Вертикальная тяга',pose:[[[119,50],[120,88],[157,53],[171,25],[121,140],[153,161],[161,184]],[[119,50],[120,88],[157,112],[145,94],[121,140],[153,161],[161,184]]],machine:'lat'},
 {id:'curl',rx:/сгибан.*ног/i,label:'Сгибание ног лёжа',pose:[[[56,100],[94,111],[130,117],[155,118],[161,119],[209,119],[247,128]],[[56,100],[94,111],[130,117],[155,118],[161,119],[219,103],[223,60]]],machine:'lying'},
 {id:'reverse',rx:/обратн.*бабочк/i,label:'Обратная бабочка',pose:[[[107,54],[112,94],[159,111],[208,119],[114,147],[139,165],[145,189]],[[107,54],[112,94],[77,92],[37,84],[114,147],[139,165],[145,189]]],machine:'seated'},
 {id:'pec',rx:/^(?!обратн).*бабочк/i,label:'Бабочка',pose:[[[108,54],[110,93],[167,105],[197,112],[111,146],[136,163],[143,188]],[[108,54],[110,93],[139,100],[173,92],[111,146],[136,163],[143,188]]],machine:'seated'},
 {id:'raise',rx:/отведен.*рук/i,label:'Отведение руки в сторону',pose:[[[115,47],[117,82],[143,130],[146,163],[117,143],[121,170],[122,197]],[[115,47],[117,82],[163,84],[215,82],[117,143],[121,170],[122,197]]],machine:'standing'},
 {id:'abs',rx:/пресс|подъ.м.*колен|перекладин/i,label:'Подъём коленей в висе',pose:[[[117,52],[119,89],[139,49],[149,22],[120,143],[122,170],[127,196]],[[117,52],[119,89],[139,49],[149,22],[120,143],[164,130],[182,147]]],machine:'hanging'}
];
function line(a,b,stroke='#bad9d5',width=7){return '<line x1="'+a[0]+'" y1="'+a[1]+'" x2="'+b[0]+'" y2="'+b[1]+'" stroke="'+stroke+'" stroke-width="'+width+'" stroke-linecap="round"/>'}
function machine(kind){
 const m='<g stroke="#526a78" stroke-width="4" stroke-linecap="round" fill="none">';
 if(kind==='press')return m+'<path d="M28 125 L89 168 L140 196 M233 58 L250 64 L250 147 L233 151 M228 80 L239 83 M228 130 L239 133"/>'+'</g>';
 if(kind==='bench')return m+'<path d="M39 133 H102 M49 134 V185 M101 134 V185 M204 182 H244"/>'+'</g>';
 if(kind==='lat')return m+'<path d="M64 28 H195 M194 27 V191 M96 178 H183 M148 24 V40 M70 159 H159 M100 160 V181"/>'+'</g>';
 if(kind==='cable')return m+'<path d="M224 46 V186 M224 98 L250 98 M50 168 L181 168 M66 167 V189"/>'+'</g>';
 if(kind==='lying')return m+'<path d="M36 144 H247 M51 145 V187 M220 145 V187"/>'+'</g>';
 if(kind==='seated')return m+'<path d="M69 90 L70 149 L113 149 M88 149 V191 M201 169 H228"/>'+'</g>';
 if(kind==='hanging')return m+'<path d="M49 20 H209 M83 20 V27 M190 20 V27"/>'+'</g>';
 return m+'<path d="M47 200 H251"/>'+'</g>'}
function figure(p){let [h,s,e,w,hip,knee,ankle]=p,marks='<g fill="none">'+line(s,hip,'#bbd6d5',9)+line(s,e,'#8ac8bd',8)+line(e,w,'#8ac8bd',8)+line(hip,knee,'#dde7e1',9)+line(knee,ankle,'#dde7e1',8)+'</g>';return marks+'<circle cx="'+h[0]+'" cy="'+h[1]+'" r="16" fill="#90c7b9" stroke="#d3eee1" stroke-width="3"/><circle cx="'+s[0]+'" cy="'+s[1]+'" r="6" fill="#d4e9e1"/><circle cx="'+hip[0]+'" cy="'+hip[1]+'" r="6" fill="#d4e9e1"/>'}
function diagram(d){let parts=d.pose.map((p,i)=>'<g transform="translate('+(i*280+3)+',0)"><rect x="1" y="7" width="266" height="233" rx="17" fill="#162730" stroke="#3d5861"/><text x="19" y="31" font-family="system-ui" font-size="15" font-weight="700" fill="#aed6cc">'+(i?'КОНЕЦ':'НАЧАЛО')+'</text>'+machine(d.machine)+figure(p)+'</g>').join('');return '<div class="tech-diagram"><svg viewBox="0 0 566 252" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Схематичные начальное и конечное положения для упражнения '+d.label+'">'+parts+'</svg><p>Схема движения · не фотография · настройка тренажёра индивидуальна</p></div>'}
const lookup=(name)=>{const d=defs.find(x=>x.rx.test(String(name||'')));return d?{id:d.id,diagram:diagram(d),steps:null}:null};
window.RATION_GUIDES={lookup,catalog:defs.map(x=>({id:x.id,name:x.label}))};
})();