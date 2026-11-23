/* Telegram private intake bot for Рацион+.
   Only approved Telegram user IDs can invoke it; channel posts require a callback approval.
   The KV storage is also the day-level tracker. No credentials live in the repository. */
const response=()=>Response.json({ok:true});
const json=async(r)=>r.json().catch(()=>({}));
const trim=(x,n=3500)=>String(x??'').trim().slice(0,n);
const key=(kind,id)=>'tg:'+kind+':'+id;
const days=(date)=>date||new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const number=(x)=>Math.round(Number(x||0)*10)/10;
const bars=(n,goal)=>{const amount=Math.max(0,Math.min(10,Math.round(Number(n||0)/Math.max(1,goal)*10)));return '🟩'.repeat(amount)+'⬜'.repeat(10-amount)};
const fmt=(n)=>Number(number(n)).toLocaleString('ru-RU',{maximumFractionDigits:1});
export function formatChannelPost(meal,after,date){
 const title='🍽 '+trim(meal.description||'Приём пищи',230);
 return title+'\n\n'+fmt(meal.cal)+' ккал | '+fmt(meal.p)+' г белка\n\n'+
 '📊 Прогресс · '+date+'\n'+
 'Калории: '+fmt(after.cal)+' / '+fmt(after.goalCal)+' ккал\n'+bars(after.cal,after.goalCal)+' '+Math.round(100*after.cal/Math.max(after.goalCal,1))+'%\n'+
 'Белок: '+fmt(after.p)+' / '+fmt(after.goalP)+' г\n'+bars(after.p,after.goalP)+' '+Math.round(100*after.p/Math.max(after.goalP,1))+'%\n'+
 (after.goalCal-after.cal>=0?'Осталось '+fmt(after.goalCal-after.cal)+' ккал':'Превышение '+fmt(after.cal-after.goalCal)+' ккал')+
 ' · '+(after.goalP-after.p>=0?'белка '+fmt(after.goalP-after.p)+' г':'белок +'+fmt(after.p-after.goalP)+' г');
}
const owner=(from,env,chat)=>!!env.TELEGRAM_OWNER_IDS&&String(env.TELEGRAM_OWNER_IDS).split(',').map(x=>x.trim()).includes(String(from?.id))&&String(chat?.id)===String(from?.id)&&(chat?.type==='private'||!chat?.type);
async function tg(env,method,args){
 const r=await fetch('https://api.telegram.org/bot'+env.TELEGRAM_BOT_TOKEN+'/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(args)});
 const j=await json(r);
 if(!r.ok||!j.ok)throw Error('Telegram '+method+': '+(j.description||r.status));
 return j.result;
}
const tell=(env,id,text,extra={})=>tg(env,'sendMessage',{chat_id:id,text,...extra});
async function get(kv,name,fallback=null){const s=await kv.get(name);if(!s)return fallback;try{return JSON.parse(s)}catch{return fallback}}
async function put(kv,name,data,ttl=86400){return kv.put(name,JSON.stringify(data),{expirationTtl:ttl})}
async function getGoals(env,id){return await get(env.PROGRESS,key('goals',id),{cal:2350,p:175})}
async function getDaily(env,id,date){const goals=await getGoals(env,id);const d=await get(env.PROGRESS,key('day',id+':'+date),{cal:0,p:0,entries:[]});return {...d,goalCal:goals.cal,goalP:goals.p}}
async function getEntries(env,id){
 const cutoff=Number(await env.PROGRESS.get(key('cutoff',id))||0);
 const all=await env.PROGRESS.list({prefix:key('entry',id+':'),limit:1000});
 const entries=all.keys.map(x=>({name:x.name,id:Number(x.name.split(':').at(-1))})).filter(x=>x.id>cutoff).sort((a,b)=>a.id-b.id).slice(-40);
 const values=await Promise.all(entries.map(x=>get(env.PROGRESS,x.name)));
 return entries.map((e,i)=>({...values[i],messageId:e.id})).filter(x=>x.text||x.photo);
}
async function saveEntry(env,id,m){
 const photo=m.photo?.length?m.photo.filter(x=>x?.file_id).at(-1)?.file_id:null;
 const text=trim(m.caption||m.text||'',2600);
 if(!text&&!photo)return;
 await put(env.PROGRESS,key('entry',id+':'+m.message_id),{text,photo,group:m.media_group_id||null},86400);
}
function latinCommand(text){
 const raw=trim(text,4000);
 const word=raw.split(/\s+/)[0].toLowerCase().split('@')[0];
 return {cmd:word,arg:raw.slice(raw.indexOf(word)+word.length).trim()};
}
async function fileAsData(env,fileId){
 const f=await tg(env,'getFile',{file_id:fileId});
 if(!f.file_path||f.file_size>1900000)throw Error('Слишком крупное изображение: отправь фото со сжатием Telegram');
 const r=await fetch('https://api.telegram.org/file/bot'+env.TELEGRAM_BOT_TOKEN+'/'+f.file_path);
 if(!r.ok)throw Error('Не удалось загрузить фото из Telegram');
 const bytes=new Uint8Array(await r.arrayBuffer());
 if(bytes.byteLength>1900000)throw Error('Фото слишком большое');
 let bin='';for(let i=0;i<bytes.length;i+=12000)bin+=String.fromCharCode(...bytes.subarray(i,i+12000));
 return 'data:image/jpeg;base64,'+btoa(bin);
}
function approvalButtons(p){
 return {inline_keyboard:[
 [{text:'✅ Опубликовать в канал',callback_data:'tg:publish:'+p.id}],
 [{text:p.selected<0?'📷 Выбрать фото':'📷 Фото '+(p.selected+1)+' из '+p.photos.length,callback_data:'tg:photo:'+p.id},
  {text:'🚫 Без фото',callback_data:'tg:nophoto:'+p.id}],
 [{text:'🗑 Отменить',callback_data:'tg:cancel:'+p.id}]
 ]};
}
function afterTotals(d,meal){return {...d,cal:number(d.cal+meal.cal),p:number(d.p+meal.p)}}
function previewText(p){return 'Черновик (ещё НЕ опубликован):\n\n'+p.body.slice(0,3500)+'\n\n'+(p.notes?'⚠️ '+trim(p.notes,400)+'\n\n':'')+'Проверь значения и фото. Для уточнения отправь новый текст и /рассчитать заново.'}
async function preview(env,id,ctx){
 const current=await get(env.PROGRESS,key('pending',id));
 if(current){await put(env.PROGRESS,key('pending',id),{...current,status:'replaced'},1800)}
 const events=await getEntries(env,id);
 if(!events.length){await tell(env,id,'Пришли описание и фотографии, затем /рассчитать.');return}
 let photos=events.filter(x=>x.photo).map(x=>x.photo);
 if(photos.length>12){await tell(env,id,'Сейчас поддерживается максимум 12 фотографий за один приём. Отправь меньше или раздели приёмы.');return}
 const description=events.map(x=>x.text).filter(Boolean).join('\n').slice(0,3500);
 const firstId=events.at(-1).messageId;
 if(!description&&!photos.length){await tell(env,id,'Нет данных для анализа.');return}
 const pendingMessage=await tell(env,id,'Считаю КБЖУ. Данные остаются черновиком до твоего подтверждения.');
 const images=[];
 try{for(const photo of photos)images.push(await fileAsData(env,photo))}
 catch(e){await tell(env,id,trim(e.message,250));return}
 let meal,notes='';
 try {
  const res=await ctx.analyze({description,mealType:'Приём пищи',photos:images,allowWebSearch:false},env);
  const data=await json(res);
  if(!res.ok||!data.meal)throw Error(data.error||'Не удалось рассчитать КБЖУ');
  meal=data.meal;notes=meal.notes;
 }catch(e){await tell(env,id,'Не удалось подготовить расчёт: '+trim(e.message,300));return}
 const date=days();
 const d=await getDaily(env,id,date);
 const after=afterTotals(d,meal);
 const currentId=(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(id+':'+firstId+':'+date))).slice(0);
 const pendingId=[...new Uint8Array(currentId)].slice(0,6).map(x=>x.toString(16).padStart(2,'0')).join('');
 const p={id:pendingId,meal,body:formatChannelPost(meal,after,date),notes,date,photos,selected:photos.length-1,maxMessageId:firstId,status:'ready',originMessageId:pendingMessage?.message_id};
 await put(env.PROGRESS,key('pending',id),p,7200);
 await tell(env,id,previewText(p),{reply_markup:approvalButtons(p)});
}
async function callback(env,id,q){
 const c=trim(q.data,90),parts=c.split(':');
 if(parts[0]!=='tg')return;
 await tg(env,'answerCallbackQuery',{callback_query_id:q.id}).catch(()=>{});
 const p=await get(env.PROGRESS,key('pending',id));
 if(!p||p.id!==parts[2]||p.status!=='ready'){await tell(env,id,'Черновик устарел. Пришли /рассчитать ещё раз.');return}
 if(parts[1]==='cancel'){await env.PROGRESS.delete(key('pending',id));await tell(env,id,'Публикация отменена. Записи не удалены.');return}
 if(parts[1]==='photo'){p.selected=p.photos.length?((p.selected+1)%p.photos.length):-1;await put(env.PROGRESS,key('pending',id),p,7200);await tell(env,id,previewText(p),{reply_markup:approvalButtons(p)});return}
 if(parts[1]==='nophoto'){p.selected=-1;await put(env.PROGRESS,key('pending',id),p,7200);await tell(env,id,previewText(p),{reply_markup:approvalButtons(p)});return}
 if(parts[1]!=='publish')return;
 // Reserve the draft before external side effects. Telegram Bot API has no idempotent send operation.
 p.status='sending';
 await put(env.PROGRESS,key('pending',id),p,7200);
 try {
  const channel=trim(env.TELEGRAM_CHAT_ID,100);
  if(!channel)throw Error('Не установлен Telegram ID канала');
  const photo=p.selected>=0?p.photos[p.selected]:null;
  let result;
  if(photo&&p.body.length<=1024)result=await tg(env,'sendPhoto',{chat_id:channel,photo,caption:p.body});
  else if(photo){result=await tg(env,'sendPhoto',{chat_id:channel,photo,caption:'🍽 '+trim(p.meal.description,700)});await tg(env,'sendMessage',{chat_id:channel,text:p.body})}
  else result=await tg(env,'sendMessage',{chat_id:channel,text:p.body});
  const daily=await getDaily(env,id,p.date);
  // If a parallel confirm raced, do not record the same meal twice.
  if(!daily.entries.some(x=>x.id===p.id)){
   daily.cal=number(daily.cal+p.meal.cal);daily.p=number(daily.p+p.meal.p);
   daily.entries.push({id:p.id,cal:p.meal.cal,p:p.meal.p,description:p.meal.description,at:new Date().toISOString()});
   await put(env.PROGRESS,key('day',id+':'+p.date),{cal:daily.cal,p:daily.p,entries:daily.entries},60*60*24*120);
  }
  await env.PROGRESS.put(key('cutoff',id),String(p.maxMessageId),{expirationTtl:60*60*24*120});
  p.status='sent';p.channelMessageId=result?.message_id||null;
  await put(env.PROGRESS,key('pending',id),p,86400);
  await tell(env,id,'✅ Опубликовано в канал. Текущий итог: '+fmt(daily.cal)+' ккал и '+fmt(daily.p)+' г белка.');
 }catch(e){p.status='unknown';await put(env.PROGRESS,key('pending',id),p,86400);
  await tell(env,id,'⚠️ Статус публикации неизвестен: '+trim(e.message,220)+'. Проверь канал, прежде чем повторять, чтобы не создать дубль.');}
}
export async function handleTelegramWebhook(request,env,ctx={}){
 if(!env.TELEGRAM_WEBHOOK_SECRET||!env.TELEGRAM_BOT_TOKEN||!env.PROGRESS||request.headers.get('X-Telegram-Bot-Api-Secret-Token')!==env.TELEGRAM_WEBHOOK_SECRET)return new Response('Forbidden',{status:403});
 if(request.method!=='POST')return new Response('Method not allowed',{status:405});
 let update=await json(request);
 const q=update.callback_query,m=update.message;
 const from=q?.from||m?.from,chat=q?.message?.chat||m?.chat;
 if(!owner(from,env,chat))return response();
 const id=String(from.id);
 if(q){await callback(env,id,q);return response()}
 if(!m)return response();
 const {cmd,arg}=latinCommand(m.text||'');
 if(cmd==='/start'||cmd==='/help'||cmd==='/помощь'){
  await tell(env,id,'Рацион+ · защищённый дневник\n\n1. Отправь описание еды и фотографии (до 12).\n2. Напиши /рассчитать — получишь КБЖУ и готовый пост с полосками прогресса.\n3. Проверь и нажми «Опубликовать в канал».\n\n/итог — баланс за сегодня\n/поправить 500 40 15 50 — исправить КБЖУ черновика\n/вес 84.8 — записать утренний вес\n/цель 2350 175 — изменить калории и белок\n/сброс — очистить текущий черновик\n\nБез подтверждения публикации не будет.');
  return response()
 }
 if(cmd==='/итог'||cmd==='/status'){const d=await getDaily(env,id,days());const text='Сегодня: '+fmt(d.cal)+' / '+fmt(d.goalCal)+' ккал '+bars(d.cal,d.goalCal)+'\nБелок: '+fmt(d.p)+' / '+fmt(d.goalP)+' г '+bars(d.p,d.goalP);await tell(env,id,text);return response()}
 if(cmd==='/вес'||cmd==='/weight'){const val=Number(arg.replace(',','.'));if(!(val>=35&&val<=350)){await tell(env,id,'Формат: /вес 84.8');return response()}
  const rec=await get(env.PROGRESS,key('weights',id),[]);const today=days();const updated=rec.filter(x=>x.date!==today);updated.push({date:today,value:val});await put(env.PROGRESS,key('weights',id),updated.slice(-90),60*60*24*120);
  const seven=updated.slice(-7),avg=seven.reduce((s,x)=>s+x.value,0)/seven.length;
  await tell(env,id,'Вес записан: '+fmt(val)+' кг. Среднее по последним '+seven.length+' замерам: '+fmt(avg)+' кг. Цель калорий не изменялась.');return response()
 }
 if(cmd==='/цель'||cmd==='/goal'){const [cal,p]=arg.split(/\s+/).map(Number);if(!(cal>=1000&&cal<=6000&&p>=30&&p<=350)){await tell(env,id,'Формат: /цель 2350 175');return response()}
  await put(env.PROGRESS,key('goals',id),{cal,p},60*60*24*365);
  await tell(env,id,'Новые цели: '+cal+' ккал и '+p+' г белка. История не изменена.');return response()
 }
 if(cmd==='/сброс'||cmd==='/clear'){const events=await getEntries(env,id);const last=events.at(-1)?.messageId;if(last)await env.PROGRESS.put(key('cutoff',id),String(last),{expirationTtl:60*60*24*120});await env.PROGRESS.delete(key('pending',id));await tell(env,id,'Черновик очищен, дневной баланс не изменён.');return response()}
 if(cmd==='/поправить'||cmd==='/correct'){
  const values=arg.split(/\s+/).map(x=>Number(x.replace(',','.')));
  if(values.length!==4||values.some(v=>!Number.isFinite(v)||v<0||v>10000)){
    await tell(env,id,'Формат: /поправить 500 40 15 50 — калории, белок, жиры, углеводы.');return response();
  }
  const p=await get(env.PROGRESS,key('pending',id));
  if(!p||p.status!=='ready'){await tell(env,id,'Сначала /рассчитать — затем можно поправить значения.');return response()}
  [p.meal.cal,p.meal.p,p.meal.f,p.meal.c]=values;
  p.notes='КБЖУ вручную исправлены пользователем. Убедись, что данные верны.';
  const d=await getDaily(env,id,p.date);p.body=formatChannelPost(p.meal,afterTotals(d,p.meal),p.date);
  await put(env.PROGRESS,key('pending',id),p,7200);
  await tell(env,id,previewText(p),{reply_markup:approvalButtons(p)});return response();
 }
 if(cmd==='/рассчитать'||cmd==='/analyze'){await preview(env,id,ctx);return response()}
 if(cmd.startsWith('/')){await tell(env,id,'Неизвестная команда. Нажми /help');return response()}
 await saveEntry(env,id,m);
 await tell(env,id,'Добавлено к черновику. Если всё отправлено, нажми /рассчитать. Пока ничего не опубликовано.');
 return response();
}
