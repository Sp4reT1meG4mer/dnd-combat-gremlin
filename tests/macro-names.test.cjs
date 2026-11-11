'use strict';
const fs=require('fs'), vm=require('vm'), assert=require('assert'), path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','CombatGremlin.js'),'utf8');
const idx=src.indexOf('// Combat Gremlin: macro installer');
assert(idx>0,'macro installer found');
const macroCode=src.slice(idx);
const NAMED={
 'CG-Init':'🎲INITIATIVE🎲',
 'CG-Clear':'🧹CLEAR-INIT🧹',
 'CG-Target':'🎯TARGET-MONSTER🎯',
 'CG-MultiSave':'🔥SPELL-MULTI-SAVE🔥',
 'CG-EndTurn':'⏭END-TURN⏭',
 'CG-Status':'⚙️SET-STATUS⚙️',
 'CG-Rules':'📖CONDITIONS📖'
};
const actions={
 'CG-Init':'!group-init','CG-Clear':'!group-init --clear',
 'CG-Target':'!cg-target @{target|token_id}',
 'CG-MultiSave':'!cg-multi-menu',
 'CG-EndTurn':'!cg-endturn',
 'CG-Status':'!cg-status menu',
 'CG-Rules':'!cg-rules ?{Condition|Blinded,Blinded|Charmed,Charmed|Deafened,Deafened|Exhaustion,Exhaustion|Frightened,Frightened|Grappled,Grappled|Incapacitated,Incapacitated|Invisible,Invisible|Paralyzed,Paralyzed|Petrified,Petrified|Poisoned,Poisoned|Prone,Prone|Restrained,Restrained|Stunned,Stunned|Unconscious,Unconscious}',
 'CG-Saves':'!group-check {{\n--?{Ability Save|Strength,Strength Save|Dexterity,Dexterity Save|Constitution,Constitution Save|Intelligence,Intelligence Save|Wisdom,Wisdom Save|Charisma,Charisma Save}\n--process\n--subheader vs DC ?{DC}\n--button SaveDamage !cg-save-damage\n~dmg [[?{Damage}]]\n~type ?{Damage on Save|Half,half|None,none}\n~DC ?{DC}\n~saves RESULTS(,)\n~ids IDS(,)\n}}'
};
let passed=0;
function test(title,fn){fn();passed++;console.log('PASS',title)}
function setup(initial=[]){
 let serial=0;
 const macros=[],handlers=[],chat=[],logs=[];
 function macro(name,action,owner='GM',visibleto=''){
   const attrs={name,action,playerid:owner,visibleto};
   const m={id:'MACRO-'+(++serial),attrs,get(k){return attrs[k]},set(arg,v){if(typeof arg==='string')attrs[arg]=v;else Object.assign(attrs,arg)}};
   macros.push(m);return m;
 }
 initial.forEach(x=>macro(x.name,x.action,x.owner||'GM',x.visibleto||''));
 const env={on:(event,fn)=>handlers.push({event,fn}),findObjs:(filter)=>filter._type==='player'?[{id:'GM'},{id:'PLAYER'}]:macros.filter(m=>filter._type==='macro' && m.attrs.playerid===filter._playerid && m.attrs.name===filter.name),
  createObj:(type,data)=>{assert.strictEqual(type,'macro');return macro(data.name,data.action,data.playerid,data.visibleto)},
  playerIsGM:id=>id==='GM',sendChat:(a,b)=>chat.push(b),log:msg=>logs.push(msg),CombatGremlinStatus:{macroAction:()=> '!cg-status ?{Status|Clear all markers,clear-confirm}'},String,Array,Object,RegExp,Math};
 vm.runInNewContext(macroCode,env,{filename:'macro-installer'});
 function ready(){handlers.filter(h=>h.event==='ready').forEach(h=>h.fn())}
 function api(content,id='GM'){handlers.filter(h=>h.event==='chat:message').forEach(h=>h.fn({type:'api',playerid:id,content}))}
 return {macros,logs,chat,ready,api,macro};
}
function byName(macros,name){const arr=macros.filter(x=>x.get('name')===name);assert.strictEqual(arr.length,1,`expected exactly one ${name}, got ${arr.length}`);return arr[0]}
function verifyNamesAndActions(macros){
 assert.strictEqual(macros.length,8,'7 renamed macros plus CG-Saves');
 Object.entries(NAMED).forEach(([old,decorated])=>{
   assert(!/\s/.test(decorated),`name has whitespace: ${decorated}`);
   const m=byName(macros,decorated);
   assert(!macros.some(x=>x.get('name')===old),`obsolete ${old} must be absent`);
   assert.strictEqual(m.get('action'),old==='CG-Status'?'!cg-status ?{Status|Clear all markers,clear-confirm}':actions[old]);
   assert.strictEqual(m.get('visibleto'),['CG-Target','CG-MultiSave','CG-EndTurn'].includes(old)?'all':'');
 });
 assert.strictEqual(byName(macros,'CG-Saves').get('action'),actions['CG-Saves']);
}
const f=setup();f.ready();
test('fresh GM campaign receives all 7 EXACT emoji names + unchanged CG-Saves',()=>verifyNamesAndActions(f.macros));
test('all player-facing macros are shared, optional extras are GM only',()=>{
 const visible=f.macros.filter(x=>x.get('visibleto')==='all').map(x=>x.get('name')).sort();
 assert.deepStrictEqual(visible.sort(),[NAMED['CG-Target'],NAMED['CG-MultiSave'],NAMED['CG-EndTurn']].sort());
});
test('new non-GM cannot run macro installer',()=>{f.api('!cg-extras --sync','PLAYER');assert.strictEqual(f.macros.length,8)});
test('ready + --sync idempotent without clones',()=>{f.api('!cg-extras --sync');f.ready();f.api('!cg-install --sync');verifyNamesAndActions(f.macros)});
test('2024 condition dropdown intact and !cg-help mentions new names',()=>{f.api('!cg-help');assert(f.chat.at(-1).includes(NAMED['CG-MultiSave']));assert(f.chat.at(-1).includes(NAMED['CG-Target']));assert(actions['CG-Rules'].includes('Exhaustion'))});
const aliases=Object.entries(actions).map(([name,action])=>({name,action}));
const old=setup(aliases),ids=new Map(old.macros.map(x=>[x.get('name'),x.id]));old.ready();
test('migrates all 7 old CG-* names IN PLACE and preserves ID/quickbar relation',()=>{
 verifyNamesAndActions(old.macros);
 Object.entries(NAMED).forEach(([before,after])=>assert.strictEqual(byName(old.macros,after).id,ids.get(before)));
 assert.strictEqual(byName(old.macros,'CG-Saves').id,ids.get('CG-Saves'));
});
test('second ready does not add duplicates after migration',()=>{old.ready();old.api('!cg-extras --sync');verifyNamesAndActions(old.macros)});
const retired=setup([
 {name:'🎯 TARGET MONSTER 🎯',action:actions['CG-Target']},
 {name:'🔥 MULTI-TARGET SAVE🔥',action:actions['CG-MultiSave']},
 {name:'⏭ END TURN',action:actions['CG-EndTurn']}
]);
const aliasIds=new Map(retired.macros.map(x=>[x.get('name'),x.id]));retired.ready();
test('old spaced emoji macro names migrate in place',()=>{
 assert.strictEqual(retired.macros.length,8);
 assert.strictEqual(byName(retired.macros,NAMED['CG-Target']).id,aliasIds.get('🎯 TARGET MONSTER 🎯'));
 assert.strictEqual(byName(retired.macros,NAMED['CG-MultiSave']).id,aliasIds.get('🔥 MULTI-TARGET SAVE🔥'));
 assert.strictEqual(byName(retired.macros,NAMED['CG-EndTurn']).id,aliasIds.get('⏭ END TURN'));
});
const own=setup([{name:'CG-Status',action:'!something-user-customized'}]);own.ready();
test('customized old action remains untouched rather than being overwritten',()=>{
 assert.strictEqual(byName(own.macros,'CG-Status').get('action'),'!something-user-customized');
 assert.strictEqual(byName(own.macros,NAMED['CG-Status']).get('action'),'!cg-status ?{Status|Clear all markers,clear-confirm}');
});
const dupe=setup([{name:'CG-MultiSave',action:actions['CG-MultiSave']},{name:'🔥 MULTI-TARGET SAVE🔥',action:actions['CG-MultiSave']}]);dupe.ready();
test('multiple old aliases are not silently destroyed or tripled',()=>{
 assert.strictEqual(dupe.macros.length,9,'two preexisting legacy aliases plus 6 other macros; no third multi macro');
 assert(dupe.logs.some(x=>x.includes('multiple legacy copies')));
});
console.log(`TOTAL ${passed}/${passed} macro-name checks passed`);
