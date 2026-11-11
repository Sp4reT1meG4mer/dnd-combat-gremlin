'use strict';
const fs=require('fs'), vm=require('vm'), assert=require('assert'), path=require('path');
const file=fs.readFileSync(path.resolve(__dirname,'..','CombatGremlin.js'),'utf8');
const coreStart=file.indexOf('var CombatGremlinTurnBridge =');
const coreEnd=file.indexOf('// Combat Gremlin: campaign-aware status marker menu.');
assert(coreStart>=0 && coreEnd>coreStart,'Found original integrated attack and AoE modules');
const output=[],handlers=[],tok={id:'TARGET',attrs:{subtype:'token',layer:'objects',represents:'MONSTER',name:'Ogre',bar1_value:300,bar1_max:300},get(k){return this.attrs[k]},set(k,v){this.attrs[k]=v}};
const pc={id:'CASTER',get(k){return {controlledby:'PLAYER',name:'Test Caster',charactersheetname:'dnd2024byroll20'}[k]||''}};
const monster={id:'MONSTER',get(k){return {name:'Ogre',charactersheetname:'D&D 5e OGL'}[k]||''}};
const player={id:'PLAYER',get(k){return k==='_displayname'?'Test Player':''}};
const env={state:{},on:(n,fn)=>handlers.push([n,fn]),sendChat:(who,line)=>output.push({who,line}),
 log:()=>{},getObj:(type,id)=>type==='graphic'&&id==='TARGET'?tok:type==='character'&&id==='CASTER'?pc:type==='character'&&id==='MONSTER'?monster:type==='player'&&id==='PLAYER'?player:null,
 getAttrByName:(id,key)=>id==='MONSTER'&&key==='npc_ac'?'14':id==='CASTER'&&key==='spell_save_dc'?'15':'',
 findObjs:()=>[],Campaign:()=>({get:()=>false}),playerIsGM:id=>id==='GM',randomInteger:()=>123457,
 CombatGremlinKO:{sync:()=>{}},JSON,Math,Number,Object,Array,String,Set,RegExp,Date};
vm.runInNewContext(file.slice(coreStart,coreEnd),env,{filename:'CombatGremlin.js'});
// Roll20 executes ready, then invokes all chat listeners for each chat message.
handlers.filter(([name])=>name==='ready').forEach(([name,fn])=>fn());
const receive=msg=>handlers.filter(([name])=>name==='chat:message').forEach(([name,fn])=>fn(msg));
const cmd=(content,playerid='PLAYER')=>receive({type:'api',content,playerid,who:'Test Player'});
const spellCard={type:'advancedroll',playerid:'PLAYER',characterId:'CASTER',rolledByCharacterId:'CASTER',who:'Test Player',secret:false,secrecy:'public',
 action:{action:'repeating_attack',args:['METEOR-ROW','attack']},content:'<rolltemplate class="dnd-2024 dnd-2024--chat"><div class="header__title">Meteor Swarm</div><div class="dc__name">Dexterity Save</div><div class="dc__value">DC 15</div><p class="save-outcomes__fail">On Failed Save: Takes Fire damage and Bludgeoning damage.</p><p class="save-outcomes__success">On Successful Save: Half as much damage.</p></rolltemplate>'};
const dice=(natural,total=25)=>({type:'advancedroll',playerid:'PLAYER',characterId:'CASTER',rolledByCharacterId:'CASTER',who:'Test Player',secret:false,secrecy:'public',
 action:{action:'repeating_attack',args:['GREATSWORD','attack']},
 content:'<rolltemplate class="dnd-2024 dnd-2024--roll"><div class="dnd-2024__header dnd-2024__header--Normal"><div class="header__title">Greatsword</div></div><span data-rollSubcategory="Attack">Attack</span><span class="total__value">'+total+'</span></rolltemplate>',
 rolls:{Base:{results:{total:natural,rolls:[{type:'R',sides:20,results:[{v:natural}]}]}}}});
const rollDamage={type:'advancedroll',playerid:'PLAYER',characterId:'CASTER',rolledByCharacterId:'CASTER',who:'Test Player',secret:false,secrecy:'public',
 action:{action:'repeating_attack',args:['GREATSWORD','attack','dmg']},content:'<rolltemplate class="dnd-2024 dnd-2024--roll"><div class="header__title header__title--damage">Greatsword Damage</div><div class="header__damage-breakdown"><div class="damage-breakdown__icon"></div>Slashing<div class="damage-breakdown__total">9</div></div><span data-rollSubcategory="Damage">Damage</span><span class="total__value">9</span></rolltemplate>',rolls:{Damageroll:{results:{total:9}}}};
const meteorDamage={...rollDamage,action:{action:'repeating_attack',args:['METEOR-ROW','attack','dmg']},content:'<rolltemplate class="dnd-2024 dnd-2024--roll"><div class="header__title header__title--damage">Meteor Swarm Damage</div><div class="header__damage-breakdown"><div class="damage-breakdown__icon"></div>Fire<div class="damage-breakdown__total">63</div></div><div class="header__damage-breakdown"><div class="damage-breakdown__icon"></div>Bludgeoning<div class="damage-breakdown__total">69</div></div><span data-rollSubcategory="Damage">Damage</span><span class="total__value">132</span></rolltemplate>',rolls:{Fire:{results:{total:63}},Bludgeoning:{results:{total:69}}}};
let passed=0;
function test(name,fn){fn();passed++;console.log('PASS',name)}
const warns=()=>output.filter(x=>x.line.includes('Unable to parse 2024 attack unambiguously'));
cmd('!cg-target TARGET');
test('sticky single target selected',()=>assert(env.state.CombatGremlinV01.targets.PLAYER));
let initial=warns().length;
receive(spellCard);
test('2024 Combat-tab save spell does not trigger single-target parse warning',()=>assert.strictEqual(warns().length,initial));
test('sticky single target survives save spell announcement',()=>assert(env.state.CombatGremlinV01.targets.PLAYER));
receive({...spellCard,content:spellCard.content.replace('class="save-outcomes__success"','class="save-outcomes__other"')});
test('malformed saving throw cards still report parser error',()=>assert.strictEqual(warns().length,initial+1));
receive(dice(18,25));
test('normal 2024 AC attack still succeeds and starts damage pairing',()=>assert(env.state.CombatGremlinV01.pending2024.PLAYER));
receive(spellCard);
test('save spell does not cancel pending single-target damage pairing',()=>assert(env.state.CombatGremlinV01.pending2024.PLAYER));
receive(rollDamage);
test('normal single-target typed damage still resolves after intervening save card',()=>assert.strictEqual(tok.attrs.bar1_value,291));
cmd('!cg-multi-select auto TARGET');
const beforeWarnings=warns().length;
receive(spellCard);
receive(meteorDamage);
test('Multi-Save picks up the same 2024 spell, no extra single-target warning',()=>{
 assert.strictEqual(warns().length,beforeWarnings);
 assert(output.some(x=>x.line.includes('!group-check')),'GroupCheck invoked');
});
const lastGroup=output.filter(x=>x.line.includes('!group-check')).at(-1).line;
const nonce=lastGroup.match(/!cg-multi-result (\d{36})/)[1];
cmd('!cg-multi-result '+nonce+' TARGET 16','API');
test('Multi-Save applies halved per-type damage on successful save',()=>assert.strictEqual(tok.attrs.bar1_value,226));
test('attack target selection preserved while AoE processing',()=>assert(env.state.CombatGremlinV01.targets.PLAYER));
console.log(`TOTAL ${passed}/${passed} save-card routing checks passed`);
