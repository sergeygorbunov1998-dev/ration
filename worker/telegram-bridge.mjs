/**
 * Рацион+ Telegram-first bridge. Standalone Cloudflare Worker.
 * Private chat photo/text -> AI preview -> explicit owner approval -> Telegram channel.
 * No tokens, photos, or credentials stored in the public repository.
 */
const json=(x,status=200)=>Response.json(x,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
const finite=(x,min,max)=>Number.isFinite(Number(x))&&Number(x)>=min&&Number(x)<=max;
const n=x=>Math.round(Number(x)*10)/10;
const escapeHtml=x=>String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const required=env=>Boolean(env.PROGRESS&&env.OPENAI_API_KEY&&env.TELEGRAM_BOT_TOKEN&&env.TELEGRAM_CHANNEL_ID&&env.TELEGRAM_WEBHOOK_SECRET&&env.TELEGRAM_OWNER_ID);
export function bar(value,target){const f=target>0?clamp(Math.round(value/target*10),0,10):0;return '🟩'.repeat(f)+'⬜'.repeat(10-f)+(value>target?' 🔴':'');}
export function dailyText(day,goals){const cal=n(day.cal||0),protein=n(day.protein||0);return 'Калории: '+cal+' / '+goals.cal+' ккал\n'+bar(cal,goals.cal)+' '+Math.round(cal/goals.cal*100)+'%\nБелок: '+protein+' / '+goals.protein+' г\n'+bar(protein,goals.protein)+' '+Math.round(protein/goals.protein*100)+'%\nОсталось: '+Math.max(0,n(goals.cal-cal))+' ккал и '+Math.max(0,n(goals.protein-protein))+' г белка';}
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const kvKey=(prefix,id)=>'telegram:'+prefix+':'+id;
async function telegram(env,method,payload){
 const r=await fetch('https://api.telegram.org/bot'+env.TELEGRAM_BOT_TOKEN+'/'+method,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
 const data=await r.json().catch(()=>({}));
 if(!r.ok||!data.ok)throw Error('Telegram '+method+' failed ('+r.status+')');
 return data.result;
}
async function tell(env,chatId,text,reply_markup){
 return telegram(env,'sendMessage',{chat_id:chatId,text,parse_mode:'HTML',...(reply_markup?{reply_markup}:{})});
}
async function fetchPhoto(env,fileId){
 const f=await telegram(env,'getFile',{file_id:fileId});if(!f.file_path||f.file_size>5_000_000)throw Error('Фото слишком большое');
 const response=await fetch('https://api.telegram.org/file/bot'+env.TELEGRAM_BOT_TOKEN+'/'+f.file_path);
 if(!response.ok)throw Error('Не удалось скачать фото');
 const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length>5_000_000)throw Error('Фото слишком большое');
 let raw='';for(let i=0;i<bytes.length;i+=8192)raw+=String.fromCharCode(...bytes.subarray(i,i+8192));
 const mime=/\.png$/i.test(f.file_path)?'image/png':'image/jpeg';
 return 'data:'+mime+';base64,'+btoa(raw);
}
const mealSchema={type:'object',additionalProperties:false,required:['title','cal','protein','fat','carbs','summary','notes'],properties:{title:{type:'string'},cal:{type:'number'},protein:{type:'number'},fat:{type:'number'},carbs:{type:'number'},summary:{type:'string'},notes:{type:'string'}}};
async function estimate(env,description,fileId){
 const images=fileId?[{type:'input_image',image_url:await fetchPhoto(env,fileId),detail:'high'}]:[];
 const prompt='Оцени пищевую ценность приёма пищи по сообщению и фото. Верни строго JSON по схеме. Текст: '+description+'. Если вес неизвестен, явно напиши об оценке в notes. Не выдумывай точных масс, брендов и этикеток. Если точное КБЖУ на фото, читай его. Если в сообщении задан готовый/сухой вес, не путай. Если калории/белок неизвестны, предпочти осторожную оценку с пояснением. summary: короткое описание еды и граммовок для Telegram на русском, одна-две строки; никаких медицинских заявлений. Не учитывай овощи, если пользователь просил их не учитывать.';
 const resp=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{authorization:'Bearer '+env.OPENAI_API_KEY,'content-type':'application/json'},body:JSON.stringify({model:env.OPENAI_MODEL||'gpt-5-mini',input:[{role:'user',content:[{type:'input_text',text:prompt},...images]}],reasoning:{effort:'low'},text:{format:{type:'json_schema',name:'meal_estimate',strict:true,schema:mealSchema}},max_output_tokens:1100})});
 const data=await resp.json().catch(()=>({}));if(!resp.ok)throw Error('OpenAI API error');
 const content=data.output_text||data.output?.flatMap(x=>x.content||[]).find(x=>x.type==='output_text')?.text;
 let result;try{result=JSON.parse(content)}catch{throw Error('Модель не вернула расчёт')}
 if(!result||!['cal','protein','fat','carbs'].every(k=>finite(result[k],0,10000)))throw Error('Некорректный расчёт');
 return {title:String(result.title||'Приём пищи').slice(0,80),summary:String(result.summary||description||'Еда').slice(0,600),notes:String(result.notes||'').slice(0,300),cal:n(result.cal),protein:n(result.protein),fat:n(result.fat),carbs:n(result.carbs)};
}
const buttons=id=>({inline_keyboard:[[{text:'✅ Опубликовать в канал',callback_data:'post:'+id}],[{text:'✏️ Исправить КБЖУ',callback_data:'edit:'+id},{text:'❌ Отмена',callback_data:'cancel:'+id}]]});
function preview(d){return '<b>Предпросмотр · '+escapeHtml(d.title)+'</b>\n'+escapeHtml(d.summary)+'\n\n'+d.cal+' ккал · '+d.protein+' г белка\nЖиры: '+d.fat+' г · Углеводы: '+d.carbs+' г'+(d.notes?'\n\n⚠️ '+escapeHtml(d.notes):'')+'\n\nПубликация только после подтверждения.';}
async function prefs(env){
 const p=JSON.parse(await env.PROGRESS.get(kvKey('prefs',env.TELEGRAM_OWNER_ID))||'{}');
 return {cal:finite(p.cal,800,6000)?Number(p.cal):2350,protein:finite(p.protein,20,400)?Number(p.protein):175,weight:finite(p.weight,20,400)?Number(p.weight):null};
}
async function setPrefs(env,changes){const p={...await prefs(env),...changes};await env.PROGRESS.put(kvKey('prefs',env.TELEGRAM_OWNER_ID),JSON.stringify(p));return p;}
async function processMessage(env,msg){
 const owner=String(env.TELEGRAM_OWNER_ID);
 if(String(msg.from?.id)!==owner||msg.chat?.type!=='private')return;
 const chat=msg.chat.id,body=String(msg.text||msg.caption||'').trim();
 if(/^\/start\b/i.test(body))return tell(env,chat,'Рацион+ · Пришли фото еды или описание с весами. Я подготовлю расчёт и покажу его до публикации.\nКоманды: /today, /goal 2350 175, /weight 84.8, /edit 300 35');
 if(/^\/today\b/i.test(body)){const p=await prefs(env);const val=JSON.parse(await env.PROGRESS.get(kvKey('day',today()))||'{}');return tell(env,chat,'<b>Прогресс за сегодня</b>\n'+dailyText(val,p)+'\nВес: '+p.weight+' кг');}
 let m=body.match(/^\/goal\s+(\d+(?:[.,]\d+)?)\s+(\d+(?:[.,]\d+)?)/i);
 if(m){const cal=Number(m[1].replace(',','.')),protein=Number(m[2].replace(',','.'));if(!finite(cal,800,6000)||!finite(protein,20,400))return tell(env,chat,'Неверные цели');await setPrefs(env,{cal,protein});return tell(env,chat,'Цели сохранены: '+cal+' ккал и '+protein+' г белка.');}
 m=body.match(/^\/weight\s+(\d+(?:[.,]\d+)?)/i);
 if(m){const weight=Number(m[1].replace(',','.'));if(!finite(weight,20,400))return tell(env,chat,'Неверный вес');await setPrefs(env,{weight});return tell(env,chat,'Вес сохранён: '+weight+' кг. Цели автоматически не меняю по одному замеру.');}
 m=body.match(/^\/edit\s+(\d+(?:[.,]\d+)?)\s+(\d+(?:[.,]\d+)?)/i);
 if(m){const id=await env.PROGRESS.get(kvKey('editing',owner));const d=id?JSON.parse(await env.PROGRESS.get(kvKey('draft',id))||'null'):null;if(!d||d.status!=='pending')return tell(env,chat,'Нет активного черновика для исправления.');const cal=Number(m[1].replace(',','.')),protein=Number(m[2].replace(',','.'));if(!finite(cal,0,5000)||!finite(protein,0,400))return tell(env,chat,'Неверные значения');d.cal=cal;d.protein=protein;d.notes='Показатели вручную исправлены пользователем.';await env.PROGRESS.put(kvKey('draft',id),JSON.stringify(d),{expirationTtl:259200});return tell(env,chat,preview(d),buttons(id));}
 if(body.startsWith('/'))return tell(env,chat,'Неизвестная команда. /start — помощь.');
 const photo=msg.photo?.at(-1)?.file_id||null;
 if(!photo&&!body)return;
 if(body.length>2500)return tell(env,chat,'Слишком длинное описание (макс. 2500 символов).');
 const incomingId=String(msg.message_id);
 const already=await env.PROGRESS.get(kvKey('msg',incomingId));
 if(already)return;
 await env.PROGRESS.put(kvKey('msg',incomingId),'1',{expirationTtl:86400});
 try{
  const analysis=await estimate(env,body,photo),id=crypto.randomUUID();
  const d={id,owner,chat,date:today(),photo,status:'pending',...analysis};
  await env.PROGRESS.put(kvKey('draft',id),JSON.stringify(d),{expirationTtl:259200});
  await env.PROGRESS.put(kvKey('editing',owner),id,{expirationTtl:259200});
  return tell(env,chat,preview(d),buttons(id));
 }catch(e){await env.PROGRESS.delete(kvKey('msg',incomingId));return tell(env,chat,'Не удалось обработать фото/описание: '+escapeHtml(e.message)+'. Отправь ещё раз.');}
}
async function processCallback(env,cb){
 const owner=String(env.TELEGRAM_OWNER_ID);
 if(String(cb.from?.id)!==owner||cb.message?.chat?.type!=='private')return;
 const [action,id]=String(cb.data||'').split(':');if(!/^[a-f0-9-]{36}$/i.test(id||''))return;
 const d=JSON.parse(await env.PROGRESS.get(kvKey('draft',id))||'null');
 const done=()=>telegram(env,'answerCallbackQuery',{callback_query_id:cb.id});
 if(!d||d.owner!==owner){await done();return tell(env,cb.message.chat.id,'Черновик истёк или не найден.');}
 if(action==='cancel'){d.status='cancelled';await env.PROGRESS.put(kvKey('draft',id),JSON.stringify(d),{expirationTtl:86400});await done();return tell(env,d.chat,'Черновик отменён.');}
 if(action==='edit'){await env.PROGRESS.put(kvKey('editing',owner),id,{expirationTtl:259200});await done();return tell(env,d.chat,'Отправь: /edit 300 35 (калории и белок). Потом ещё раз подтверди публикацию.');}
 if(action!=='post')return done();
 if(d.status==='published'){await done();return tell(env,d.chat,'Этот приём уже опубликован.');}
 if(d.status!=='pending'){await done();return;}
 const goals=await prefs(env),key=kvKey('day',d.date);
 const prev=JSON.parse(await env.PROGRESS.get(key)||'{"cal":0,"protein":0,"count":0}');
 const next={cal:n((prev.cal||0)+d.cal),protein:n((prev.protein||0)+d.protein),count:(prev.count||0)+1};
 const caption='<b>'+escapeHtml(d.title)+'</b>\n'+escapeHtml(d.summary)+'\n\n<b>'+d.cal+' ккал | '+d.protein+' г белка</b>\n\n<b>Прогресс за '+escapeHtml(d.date)+'</b>\n'+dailyText(next,goals)+(d.notes?'\n\n⚠️ '+escapeHtml(d.notes):'');
 try{
  // Reusing Telegram file_id avoids downloading/storing personal image data a second time.
  const args={chat_id:env.TELEGRAM_CHANNEL_ID,parse_mode:'HTML',...(d.photo?{photo:d.photo,caption}:{text:caption})};
  await telegram(env,d.photo?'sendPhoto':'sendMessage',args);
  d.status='published';await env.PROGRESS.put(kvKey('draft',id),JSON.stringify(d),{expirationTtl:259200});
  await env.PROGRESS.put(key,JSON.stringify(next),{expirationTtl:7776000});
  await done();return tell(env,d.chat,'✅ Опубликовано.\n'+dailyText(next,goals));
 }catch(e){await done();return tell(env,d.chat,'Не удалось отправить или сохранить публикацию. Перед повтором проверь канал: сообщение могло быть доставлено.');}
}
export default {async fetch(request,env){
 if(request.method!=='POST'||new URL(request.url).pathname!=='/telegram-webhook')return json({ok:false},404);
 if(!required(env))return json({error:'Integration not configured'},503);
 if(request.headers.get('X-Telegram-Bot-Api-Secret-Token')!==env.TELEGRAM_WEBHOOK_SECRET)return json({error:'Forbidden'},403);
 if(Number(request.headers.get('content-length')||0)>1_000_000)return json({error:'Payload too big'},413);
 let update;try{update=await request.json()}catch{return json({error:'Invalid JSON'},400)}
 if(!update||!finite(update.update_id,0,Number.MAX_SAFE_INTEGER))return json({error:'Invalid update'},400);
 // Telegram may retry updates. Ignore repeats after accepted processing.
 const id=kvKey('update',update.update_id);
 if(await env.PROGRESS.get(id))return json({ok:true});
 try{
  if(update.message)await processMessage(env,update.message);
  else if(update.callback_query)await processCallback(env,update.callback_query);
  await env.PROGRESS.put(id,'1',{expirationTtl:172800});
  return json({ok:true});
 }catch(e){return json({error:'Could not process update'},502)}
}};
