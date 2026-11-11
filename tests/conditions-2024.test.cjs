// Test the published quick-reference content without starting the Roll20 mod sandbox.
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'CombatGremlin.js'), 'utf8');
const match = src.match(/var RULES_2024 = (\{.*?\});\n\n    \/\/ Macro owners/s);
assert(match, '2024 rules data missing');
const conditions = vm.runInNewContext('('+match[1]+')');
const names=['Blinded','Charmed','Deafened','Exhaustion','Frightened','Grappled','Incapacitated','Invisible','Paralyzed','Petrified','Poisoned','Prone','Restrained','Stunned','Unconscious'];
assert.deepStrictEqual(Object.keys(conditions),names);
for(const name of names){
  assert(Array.isArray(conditions[name]) && conditions[name].length, name+' has no rules');
  for(const entry of conditions[name])assert(typeof entry==='string'&&entry.length>5, name+' has invalid rule');
}
assert(src.includes('Exhaustion,Exhaustion'), 'Exhaustion missing from dropdown');
assert(src.includes('var data = RULES_2024[requested]'), '2024 lookup not wired');
assert(src.includes('(2024 SRD 5.2.1 quick reference)'), 'outgoing message not marked 2024');
assert(!src.includes('RULES_2014'), 'legacy data still present');
assert(!src.includes('(legacy 2014 rules reference)'), 'legacy UI label still present');
assert(conditions.Grappled.join(' ').includes('other than the grappler'), '2024 Grappled attack rule missing');
assert(conditions.Invisible.join(' ').includes('Initiative'), '2024 Invisible initiative rule missing');
assert(conditions.Incapacitated.join(' ').includes('Bonus Actions'), '2024 Incapacitated rule missing');
assert(conditions.Petrified.join(' ').includes('Poisoned'), '2024 Petrified immunity missing');
assert(conditions.Exhaustion.join(' ').includes('2 per Exhaustion'), '2024 Exhaustion math missing');
assert(conditions.Stunned.every(x=>!x.includes('Speed is 0')), 'wrong legacy Stunned movement rule');
console.log('PASS: all 15 D&D 2024 condition references and macro wiring');
