import assert from 'node:assert/strict';
import bridge,{bar,dailyText} from '../worker/telegram-bridge.mjs';
const saved=new Map();
const PROGRESS={
 get:async key=>saved.get(key)||null,
 put:async(key,value)=>{saved.set(key,String(value))},
 delete:async key=>{saved.delete(key)}
};
const env={PROGRESS,TELEGRAM_BOT_TOKEN:'mock-token',TELEGRAM_CHANNEL_ID:'@testchannel',TELEGRAM_WEBHOOK_SECRET:'secret-word',TELEGRAM_OWNER_ID:'123',OPENAI_API_KEY:'mock-ai'};
let apiCalls=[],posts=[];
const nativeFetch=globalThis.fetch;
globalThis.fetch=async(input,opts={})=>{
 const url=String(input);apiCalls.push({url,options:opts});
 if(url.endsWith('/v1/responses'))return Response.json({output:[{content:[{type:'output_text',text:JSON.stringify({title:'Обед',summary:'Тунец 177 г, джемелли 100 г сухих',cal:617,protein:64.1,fat:8,carbs:76,notes:'Тунец оценочный'})}]}]});
 if(url.includes('/getFile'))return Response.json({ok:true,result:{file_path:'photos/test.jpg',file_size:3}});
 if(url.includes('/file/bot'))return new Response(new Uint8Array([1,2,3]),{status:200});
 if(url.includes('/sendPhoto')||url.includes('/sendMessage')){
  const payload=JSON.parse(opts.body);posts.push({url,payload});
  return Response.json({ok:true,result:{message_id:posts.length}});
 }
 if(url.includes('/answerCallbackQuery'))return Response.json({ok:true,result:true});
 throw Error('Unexpected URL: '+url);
};
const webhook=(update,{validSecret=true}={})=>bridge.fetch(new Request('https://x.example/telegram-webhook',{method:'POST',headers:{'content-type':'application/json','X-Telegram-Bot-Api-Secret-Token':validSecret?'secret-word':'wrong'},body:JSON.stringify(update)}),env);
try{
 assert.equal((await webhook({update_id:1,message:{}},{validSecret:false})).status,403);
 assert.equal(apiCalls.length,0,'Bad secret should not reach services');
 assert.equal((await webhook({update_id:2,message:{from:{id:555},chat:{id:555,type:'private'},text:'Мой ужин'}})).status,200);
 assert.equal(apiCalls.length,0,'Other Telegram users must be ignored');
 const chat={id:123,type:'private'},from={id:123};
 await webhook({update_id:3,message:{from,chat,message_id:51,text:'/goal 2350 175'}});
 await webhook({update_id:4,message:{from,chat,message_id:52,text:'/weight 84.8'}});
 assert.ok([...saved.values()].some(x=>x.includes('"weight":84.8')));
 await webhook({update_id:5,message:{from,chat,message_id:53,caption:'Паста 100 г сухих, тунец 177 г',photo:[{file_id:'small'},{file_id:'large'}]}});
 assert.equal(apiCalls.filter(x=>x.url.endsWith('/v1/responses')).length,1,'One AI call per meal');
 const aiPayload=JSON.parse(apiCalls.find(x=>x.url.endsWith('/v1/responses')).options.body);
 assert.ok(aiPayload.input[0].content.some(x=>x.type==='input_image'));
 const previewMessage=posts.find(x=>x.payload.reply_markup);
 assert.ok(previewMessage.payload.text.includes('Предпросмотр'));
 const callbackData=previewMessage.payload.reply_markup.inline_keyboard[0][0].callback_data;
 assert.ok(callbackData.startsWith('post:'));
 const update={update_id:6,callback_query:{id:'callback-a',from,message:{chat},data:callbackData}};
 await webhook(update);
 assert.equal(posts.filter(x=>x.url.includes('sendPhoto')&&x.payload.chat_id==='@testchannel').length,1,'Publish one channel photo');
 assert.ok(posts.find(x=>x.payload.chat_id==='@testchannel').payload.caption.includes('Калории: 617 / 2350'));
 assert.ok(posts.find(x=>x.payload.chat_id==='@testchannel').payload.caption.includes('Белок: 64.1 / 175'));
 await webhook({...update,update_id:7,callback_query:{...update.callback_query,id:'callback-b'}});
 assert.equal(posts.filter(x=>x.payload.chat_id==='@testchannel').length,1,'Repeated publish does not duplicate channel post');
 await webhook({...update,update_id:6});
 assert.equal(posts.filter(x=>x.payload.chat_id==='@testchannel').length,1,'Repeated webhook does not duplicate');
 await webhook({update_id:8,message:{from,chat,message_id:55,text:'/today'}});
 assert.ok(posts.at(-1).payload.text.includes('Вес: 84.8 кг'));
 assert.ok(bar(10,100).includes('🟩'));
 assert.ok(dailyText({cal:2500,protein:180},{cal:2350,protein:175}).includes('🔴'));
 console.log('Telegram bot private-channel permission, photo analysis, preview approval, goals, weight, progress and idempotency tests: OK');
}finally{globalThis.fetch=nativeFetch}