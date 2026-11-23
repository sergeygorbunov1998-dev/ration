import assert from 'node:assert/strict';
import app from '../worker/index.js';
import {formatChannelPost} from '../worker/telegram-bot.mjs';

const now=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const kvStore=new Map(), calls=[];
const kv={
 async get(k){return kvStore.get(k)||null},
 async put(k,v){kvStore.set(k,v)},
 async delete(k){kvStore.delete(k)},
 async list({prefix}){return {keys:[...kvStore.keys()].filter(k=>k.startsWith(prefix)).map(name=>({name}))}}
};
const env={
 TELEGRAM_WEBHOOK_SECRET:'secret-telegram-123',
 TELEGRAM_OWNER_IDS:'10001',
 TELEGRAM_BOT_TOKEN:'mock-token',
 TELEGRAM_CHAT_ID:'@demo_channel',
 OPENAI_API_KEY:'fake-openai',
 OPENAI_MODEL:'gpt-5-mini',
 PROGRESS:kv
};
const base='https://example.workers.dev/telegram/webhook';
const createUpdate=(id,text,msgid)=>({update_id:msgid,message:{message_id:msgid,chat:{id,type:'private'},from:{id},text}});
const webhook=(data,secret=env.TELEGRAM_WEBHOOK_SECRET)=>app.fetch(new Request(base,{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Bot-Api-Secret-Token':secret},body:JSON.stringify(data)}),env);
const apiCalls=()=>calls.filter(x=>x.type==='api');
const telegramCalls=(method,chat)=>calls.filter(x=>x.type==='telegram'&&x.method===method&&(!chat||x.body.chat_id===chat));
const original=globalThis.fetch;
globalThis.fetch=async(uri,args)=>{
 const url=String(uri);
 if(url.includes('api.telegram.org/bot')){
  const method=url.split('/').at(-1),body=args?.body?JSON.parse(args.body):{};
  calls.push({type:'telegram',method,body});
  return Response.json({ok:true,result:{message_id:999,chat:{id:body.chat_id}}});
 }
 if(url.includes('api.openai.com')){
  calls.push({type:'api',body:JSON.parse(args.body)});
  const meal={description:'Яйца — 3 шт.; хлеб 30 г',cal:350,p:25,f:17,c:24,notes:'По этикетке',source:'этикетка',confidence:'medium',items:[],sources:[]};
  return Response.json({output:[{content:[{type:'output_text',text:JSON.stringify(meal)}]}],usage:{input_tokens:300,output_tokens:160}});
 }
 throw Error('Unexpected network call: '+url);
};
try{
 assert.equal((await webhook(createUpdate(10001,'Яйца — 3 шт.; хлеб 30 г',5),'not-the-secret')).status,403);
 assert.equal((await webhook(createUpdate(555,'Чужая еда',6))).status,200);
 assert.equal(telegramCalls('sendMessage').length,0,'Outsider must be silent');
 await webhook(createUpdate(10001,'/вес 84.8',7));
 assert.equal(apiCalls().length,0,'Weight should never use AI');
 const weights=JSON.parse(kvStore.get('tg:weights:10001'));assert.equal(weights.at(-1).value,84.8);
 await webhook(createUpdate(10001,'Яйца — 3 шт.; хлеб 30 г',8));
 assert.equal(apiCalls().length,0,'Sending food description alone must not spend tokens');
 assert.equal(telegramCalls('sendMessage','@demo_channel').length,0,'Channel requires confirmation');
 await webhook(createUpdate(10001,'/рассчитать',9));
 assert.equal(apiCalls().length,1,'Single analysis only on explicit /рассчитать');
 let draft=JSON.parse(kvStore.get('tg:pending:10001'));
 assert.equal(draft.meal.p,25);
 assert.match(draft.body,/🟩/u);
 assert.equal(telegramCalls('sendMessage','@demo_channel').length,0);
 await webhook(createUpdate(10001,'/поправить 380 28 17 27',10));
 assert.equal(apiCalls().length,1,'Manual correction must not spend tokens');
 draft=JSON.parse(kvStore.get('tg:pending:10001'));
 assert.equal(draft.meal.p,28);
 const update={update_id:11,callback_query:{id:'callback1',from:{id:10001},message:{chat:{id:10001,type:'private'},message_id:100},data:'tg:publish:'+draft.id}};
 await webhook(update);
 assert.equal(telegramCalls('sendMessage','@demo_channel').length,1,'Exactly one channel message');
 const sent=telegramCalls('sendMessage','@demo_channel')[0].body.text;
 assert.match(sent,/380 ккал/);
 assert.match(sent,/28 г белка/);
 assert.match(sent,/2[\s\u00a0\u202f]350/);
 const dayKey='tg:day:10001:'+now;
 const tracked=JSON.parse(kvStore.get(dayKey));
 assert.equal(tracked.cal,380);assert.equal(tracked.p,28);
 await webhook(update);
 assert.equal(telegramCalls('sendMessage','@demo_channel').length,1,'Duplicate callback should not repost');
 await webhook(createUpdate(10001,'/итог',12));
 const last=telegramCalls('sendMessage',10001).at(-1);
 assert.match(last.body.text,/380/);
 const sample=formatChannelPost({description:'Тунец 180 г',cal:240,p:50},{cal:1200,p:115,goalCal:2350,goalP:175},now);
 assert.ok(sample.includes('🟩'));assert.ok(sample.includes('Осталось'));
 console.log('Telegram webhook security, AI gating, edit, approval, deduplication and progress: OK');
}finally{globalThis.fetch=original}
