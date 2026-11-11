'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const script=fs.readFileSync(path.join(__dirname,'..','CombatGremlin.js'),'utf8');
const start=script.indexOf('var CombatGremlinMultiSave =');
const end=script.indexOf('// Combat Gremlin: campaign-aware status marker menu.',start);
assert(start!==-1&&end>start,'AoE module found');
const code=script.slice(start,end);
const handlers=[], chat=[], tokens=new Map(), defense=new Map();
let undoEntries=[];
const caster={id:'CHARACTER',get:(field)=>field==='controlledby'?'PLAYER':field==='name'?'Test Wizard':''};
const enemy={id:'ENEMY',get:(field)=>field==='controlledby'?'':''};
const player={id:'PLAYER',get:(f)=>f==='_displayname'?'Test Player':''};
const token=(id, hp, data={})=>{ const attrs={subtype:'token',layer:'objects',bar1_value:hp,represents:'ENEMY',name:id}; const t={id,attrs,get:(k)=>attrs[k],set:(k,v)=>{attrs[k]=v}};tokens.set(id,t);defense.set(id,data);return t};
const applyDefenses=(t,parts)=>{
 const types={}; let damage=0;
 for(const p of parts){assert(Number.isInteger(p.value)&&p.value>=0,'integer pre-modifier');types[p.type]=(types[p.type]||0)+p.value}
 for(const [kind,value] of Object.entries(types)){
  const flag=(defense.get(t.id)||{})[kind];
  if(flag==='immune')continue;
  let amount=value;
  if(flag==='resist') amount=Math.floor(amount/2);
  if(flag==='vuln') amount*=2;
  damage+=amount;
 }
 return {value:damage,notes:[]};
};
const environment={state:{},Object,Array,Map,Set,String,Math,Number,RegExp,JSON,Date,
 on:(evt,fn)=>handlers.push({evt,fn}),sendChat:(who,message)=>chat.push({who,message}),log:()=>{},
 getObj:(kind,id)=>kind==='player'?id==='PLAYER'?player:null:kind==='character'?id==='CHARACTER'?caster:id==='ENEMY'?enemy:null:tokens.get(id),
 getAttrByName:(id,k)=>k==='spell_save_dc'?'15':null,
 playerIsGM:id=>id==='GM',randomInteger:()=>123456,
 CombatGremlinKO:{sync:()=>{}},
 CombatGremlinSaveBridge:{applyDefenses,
  parse2024Damage:msg=>({components:msg.typedDamage}),
  recordDamage:(t,amount,actor)=>{undoEntries.push({id:t.id,amount,actor});return undoEntries.length;}}
};
vm.runInNewContext(code,environment);
handlers.filter(x=>x.evt==='ready').forEach(x=>x.fn());
const receive=(msg)=>handlers.filter(x=>x.evt==='chat:message').forEach(x=>x.fn(msg));
const command=(content,playerid='PLAYER')=>receive({type:'api',playerid,content});
const lastGroup=()=>chat.filter(x=>x.message.startsWith('!group-check')).at(-1)?.message;
const castCard=(name,dc=15)=>({type:'advancedroll',playerid:'PLAYER',characterId:'CHARACTER',rolledByCharacterId:'CHARACTER',action:{action:'repeating_attack',args:['ROW','attack']},content:`<rolltemplate class="dnd-2024 dnd-2024--chat"><div class="header__title">${name}</div><div class="dc__name">Dexterity Save</div><div class="dc__value">DC ${dc}</div><p class="save-outcomes__fail">On Failed Save: Takes typed damage.</p><p class="save-outcomes__success">On Successful Save: Half as much damage.</p></rolltemplate>`});
const castDamage=(name,typedDamage)=>({type:'advancedroll',playerid:'PLAYER',characterId:'CHARACTER',rolledByCharacterId:'CHARACTER',action:{action:'repeating_attack',args:['ROW','attack','dmg']},typedDamage,content:`<rolltemplate class="dnd-2024 dnd-2024--roll"><div class="header__title header__title--damage">${name} Damage</div></rolltemplate>`});
function runCase({name,parts,save,mode='auto',defenses={},expected,legacy=false}){
 tokens.clear(); defense.clear(); undoEntries=[];
 const id='TARGET'; token(id,300,defenses);
 const startGroup=chat.filter(x=>x.message.startsWith('!group-check')).length;
 command(`!cg-multi-select ${mode} ${id}`);
 if(!legacy){receive(castCard(name));receive(castDamage(name,parts));}
 else {
   const fields=['{{save=1}}',`{{rname=${name}}}`,'{{saveattr=Dexterity}}','{{savedc=$[[0]]}}'];
   const inlinerolls=[{results:{total:15}}];
   for(let n=0;n<parts.length;n++){
    const idx=n+1;fields.push(`{{dmg${idx}=$[[${idx}]]}}`,`{{dmg${idx}type=${parts[n].type}}}`);
    inlinerolls.push({results:{total:parts[n].value}});
   }
   receive({type:'general',rolltemplate:'atkdmg',content:fields.join(' '),inlinerolls,playerid:'PLAYER',rolledByCharacterId:'CHARACTER'});
 }
 const gs=chat.filter(x=>x.message.startsWith('!group-check'));
 assert.strictEqual(gs.length,startGroup+1,'save command dispatched: '+name);
 const nonce=lastGroup().match(/!cg-multi-result (\d{36})/)[1];
 command(`!cg-multi-result ${nonce} ${id} ${save}`,'API');
 const actual=300-tokens.get(id).attrs.bar1_value;
 assert.strictEqual(actual,expected,`${name}, save ${save}, ${JSON.stringify(defenses)}: expected ${expected}, got ${actual}`);
 // Duplicate callback must not apply twice.
 command(`!cg-multi-result ${nonce} ${id} ${save}`,'API');
 assert.strictEqual(300-tokens.get(id).attrs.bar1_value,expected,'callback replay blocked');
 console.log('PASS',name,legacy?'2014':'2024','save',save,JSON.stringify(defenses),'damage',actual);
}
const meteor=[{type:'fire',value:63},{type:'bludgeoning',value:71}];
const cases=[
{name:'Meteor Swarm',parts:meteor,save:20,expected:66},
{name:'Meteor Swarm',parts:meteor,save:1,expected:134},
{name:'Meteor Swarm',parts:meteor,save:20,defenses:{fire:'resist'},expected:50},
{name:'Meteor Swarm',parts:meteor,save:1,defenses:{fire:'resist'},expected:102},
{name:'Meteor Swarm',parts:meteor,save:20,defenses:{fire:'immune'},expected:35},
{name:'Meteor Swarm',parts:meteor,save:1,defenses:{fire:'immune'},expected:71},
{name:'Meteor Swarm',parts:meteor,save:20,defenses:{fire:'vuln'},expected:97},
{name:'Meteor Swarm',parts:meteor,save:1,defenses:{fire:'vuln'},expected:197},
{name:'Meteor Swarm',parts:meteor,save:20,defenses:{fire:'resist',bludgeoning:'resist'},expected:32},
{name:'Meteor Swarm',parts:meteor,save:20,defenses:{bludgeoning:'resist'},expected:48},
{name:'Fireball',parts:[{type:'fire',value:33}],save:15,expected:16},
{name:'Fireball',parts:[{type:'fire',value:33}],save:15,defenses:{fire:'resist'},expected:8},
{name:'Fireball',parts:[{type:'fire',value:33}],save:12,defenses:{fire:'resist'},expected:16},
{name:'Fireball',parts:[{type:'fire',value:33}],save:15,mode:'none',expected:0},
{name:'Same-type grouped',parts:[{type:'fire',value:13},{type:'fire',value:7}],save:15,expected:10},
{name:'Meteor 2014',parts:meteor,save:20,mode:'half',legacy:true,expected:66},
{name:'Meteor 2014',parts:meteor,save:20,mode:'half',legacy:true,defenses:{fire:'resist'},expected:50},
];
for(const x of cases)runCase(x);
console.log(`TOTAL: ${cases.length}/${cases.length} round-down regressions passed`);
