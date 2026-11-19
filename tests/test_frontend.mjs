import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const app=fs.readFileSync('app.js','utf8'),html=fs.readFileSync('index.html','utf8'),css=fs.readFileSync('style.css','utf8');
const guides={window:{}};vm.runInNewContext(fs.readFileSync('exercise-guides.js','utf8'),guides);
assert.ok(guides.window.RATION_GUIDES);
for(const name of ['Жим ногами в гаке','Ягодичный мост в тренажёре','Жим от груди в тренажёре','Горизонтальная тяга','Вертикальная тяга широким хватом','Сгибание ног лёжа','Обратная бабочка','Подъём коленей на перекладине']){
 let info=guides.window.RATION_GUIDES.lookup(name);
 assert.ok(info?.diagram?.includes('<svg'),name+' diagram');
 assert.ok(info.diagram.includes('НАЧАЛО')&&info.diagram.includes('КОНЕЦ'));
}
assert.equal(guides.window.RATION_GUIDES.lookup('Новое неизвестное упражнение'),null);
const foods={window:{}};vm.runInNewContext(fs.readFileSync('food-library.js','utf8'),foods);
const list=foods.window.RATION_FOODS;assert.ok(list.length>=18);assert.equal(list.find(x=>x.name.includes('Хашбрауны')).cal,181.4);
assert.equal(list.find(x=>x.name.includes('Булгур')).grams,80);
for(const f of list){assert.ok(f.source&&f.aliases.length>0);for(const key of ['cal','p','f','c'])assert.ok(Number.isFinite(f.per100[key])&&f.per100[key]>=0)}
const start=app.indexOf('function parseProgramNotes('),end=app.indexOf('function importProgramNotes(',start);
assert.ok(start>=0&&end>start);
const names={uid:()=>String(Math.random()),dateNow:()=> '2026-11-19',String,Number};
vm.runInNewContext(app.slice(start,end),names);
let rows=names.parseProgramNotes('Жим ногами в гаке — 50 кг — 2×10\nЯгодичный мост — 25 кг — 2×12');
assert.equal(rows.length,2);assert.equal(rows[0].weight,50);assert.equal(rows[1].sets,2);
let past=names.parseCompletedWorkout('Тренировка 18.11.26\nЖим ногами\t2/10 (всё сделал)\t50\nЖим груди\tпропуск\t15');
assert.equal(past.date,'2026-11-18');assert.equal(past.items.length,2);assert.equal(past.items[0].setsDone,2);assert.equal(past.items[1].skipped,true);
assert.ok(!app.includes('data-rir='));
assert.ok(!app.includes('выполнено ${past.items.filter('));
assert.ok(html.includes('id="techModal"')&&html.includes('id="managePlan"'));
assert.ok(html.indexOf('food-library.js')<html.indexOf('app.js'));
assert.ok(css.includes('.tech-modal{z-index:55')&&css.includes('env(safe-area-inset-bottom)'));
assert.ok(app.includes('lookupExerciseGuide(name)'));
console.log('Offline UI and nutrition regression tests: OK');