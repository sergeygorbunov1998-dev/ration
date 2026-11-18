// Scriptable for iPhone Home Screen and Lock Screen. Set URL, read key and profileId below.
const SERVER = 'https://YOUR-WORKER.workers.dev';
const READ_KEY = 'YOUR_WIDGET_READ_KEY';
const PROFILE_ID = 'COPY_PROFILE_ID_FROM_APP';
const w = new ListWidget();w.backgroundColor = new Color('#172532');
let state;try{const r=new Request(SERVER+'/api/widget?profileId='+encodeURIComponent(PROFILE_ID));r.headers={'X-Widget-Key':READ_KEY};state=await r.loadJSON()}catch(e){state=null}
const title=w.addText('РАЦИОН+');title.font=Font.boldSystemFont(11);title.textColor=new Color('#b9f385');w.addSpacer(5);
const localDay=new Date().toLocaleDateString('sv-SE');const valid=state&&state.date===localDay;
function bar(value,target,color){const box=new DrawContext();box.size=new Size(245,12);box.opaque=false;box.respectScreenScale=true;box.setFillColor(new Color('#354853'));box.fillRect(new Rect(0,0,245,12));box.setFillColor(new Color(color));box.fillRect(new Rect(0,0,245*Math.min(1,Math.max(0,value/Math.max(1,target))),12));let img=w.addImage(box.getImage());img.imageSize=new Size(190,9);w.addSpacer(7)}
if(valid){let a=w.addText(`${Math.round(state.cal)} / ${Math.round(state.goalCal)} ккал`);a.font=Font.semiboldSystemFont(12);a.textColor=Color.white();w.addSpacer(3);bar(state.cal,state.goalCal,'#b9f385');let b=w.addText(`Белок ${Math.round(state.protein)} / ${Math.round(state.goalProtein)} г`);b.font=Font.semiboldSystemFont(12);b.textColor=Color.white();w.addSpacer(3);bar(state.protein,state.goalProtein,'#8bd9dc')}
else{let t=w.addText('Нет данных на сегодня');t.font=Font.mediumSystemFont(12);t.textColor=Color.white();w.addSpacer(4);w.addText('Открой «Рацион+» и внеси еду.').textColor=new Color('#9badb7')}
w.url='https://YOUR-GITHUB-USERNAME.github.io/ration/';
Script.setWidget(w);if(config.runsInApp)await w.presentAccessoryRectangular();Script.complete();
