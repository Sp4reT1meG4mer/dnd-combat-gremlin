/*
 * Combat Gremlin v1.0.0 | Roll20 Mod Script
 * Documentation: README.md | Third-party notices: THIRD_PARTY_NOTICES.md
 */


// Combat Gremlin: KO status marker.
var CombatGremlinKO = CombatGremlinKO || (function () {
    'use strict';
    var STATE_KEY = 'CombatGremlinKO_v062';

    function stateData() {
        if (!state[STATE_KEY] || typeof state[STATE_KEY] !== 'object') {
            state[STATE_KEY] = {owned: {}};
        }
        if (!state[STATE_KEY].owned) state[STATE_KEY].owned = {};
        return state[STATE_KEY];
    }
    function validNumber(value) {
        var string = String(value === undefined || value === null ? '' : value).trim();
        if (!/^-?\d+(?:\.\d+)?$/.test(string)) return null;
        var number = Number(string);
        return isFinite(number) ? number : null;
    }
    function syncToken(token) {
        if (!token || token.get('subtype') !== 'token') return;
        var hp = validNumber(token.get('bar1_value'));
        if (hp === null) return;
        // Only use Bar 1 when it resembles an HP bar: a numeric maximum or a
        // represented character. Unrelated counters with a bare number are ignored.
        if (validNumber(token.get('bar1_max')) === null && !token.get('represents')) return;

        var owned = stateData().owned;
        if (hp <= 0) {
            if (!token.get('status_dead')) {
                token.set('status_dead', true);
                owned[token.id] = true;
            }
        } else if (owned[token.id]) {
            // Remove ONLY the X we applied. An X placed manually by the DM
            // on an already-0-HP token is never claimed as ours.
            if (token.get('status_dead')) token.set('status_dead', false);
            delete owned[token.id];
        }
    }

    on('ready', function () {
        stateData();
        // Linked and API-driven HP updates may take different event paths.
        on('change:graphic:bar1_value', function (token) { syncToken(token); });
        on('destroy:graphic', function (token) {
            delete stateData().owned[token.id];
        });
        log('Combat Gremlin KO marker ready: Bar 1 HP at 0 -> red X; restore clears Gremlin-owned X.');
    });
    return {sync: syncToken};
}());


// Combat Gremlin: save damage from GroupCheck results (Bar 1 only).
// Independent implementation using the Roll20 Mod API.
var CombatGremlinSaveDamage = (function () {
    'use strict';

    function tellGM(message) {
        sendChat('Combat Gremlin', '/w gm ' + message);
    }

    function isWholeNumber(value) {
        return /^\d+$/.test(String(value || '').trim());
    }

    function isSignedInteger(value) {
        return /^-?\d+$/.test(String(value || '').trim());
    }

    function resolveInlineRolls(message) {
        return String(message.content || '').replace(/\$\[\[(\d+)\]\]/g, function (token, index) {
            var roll = message.inlinerolls && message.inlinerolls[Number(index)];
            var total = roll && roll.results && roll.results.total;
            return typeof total === 'number' && Number.isInteger(total) ? String(total) : 'INVALID_ROLL';
        });
    }

    function parseArguments(content) {
        var parts = {}, match;
        var pattern = /(?:^|\s)--([a-z]+)\s+([\s\S]*?)(?=\s+--[a-z]+\s+|$)/gi;
        while ((match = pattern.exec(content)) !== null) {
            var key = match[1].toLowerCase();
            if (Object.prototype.hasOwnProperty.call(parts, key)) return null;
            parts[key] = match[2].trim();
        }
        return parts;
    }

    function handle(message) {
        if (!message || message.type !== 'api' || !/^!cg-save-damage(?:\s|$)/i.test(message.content || '')) return;
        if (!playerIsGM(message.playerid)) {
            tellGM('Rejected a save-damage request from a non-GM.');
            return;
        }

        var params = parseArguments(resolveInlineRolls(message));
        if (!params || !isWholeNumber(params.dc) || !isWholeNumber(params.dmg) ||
            !/^(half|none)$/i.test(params.type || '')) {
            tellGM('Save damage cancelled: invalid DC, damage amount, or save mode. No HP changed.');
            return;
        }

        var rawIds = String(params.ids || '').split(',').map(function (v) { return v.trim(); });
        var rawSaves = String(params.saves || '').split(',').map(function (v) { return v.trim(); });
        if (!params.ids || !params.saves || rawIds.length !== rawSaves.length ||
            rawIds.length > 100 || new Set(rawIds).size !== rawIds.length) {
            tellGM('Save damage cancelled: token IDs and save results do not match. No HP changed.');
            return;
        }

        var dc = Number(params.dc), damage = Number(params.dmg), type = params.type.toLowerCase();
        if (!Number.isSafeInteger(dc) || !Number.isSafeInteger(damage)) {
            tellGM('Save damage cancelled: invalid numeric values. No HP changed.');
            return;
        }

        var changes = [];
        for (var i = 0; i < rawIds.length; i++) {
            var token = getObj('graphic', rawIds[i]);
            var hpText = token && String(token.get('bar1_value')).trim();
            if (!token || token.get('subtype') !== 'token' || !/^-?\d+$/.test(hpText || '') ||
                !isSignedInteger(rawSaves[i])) {
                tellGM('Save damage cancelled: a token or saving throw is invalid. No HP changed.');
                return;
            }
            var save = Number(rawSaves[i]), hp = Number(hpText);
            if (!Number.isSafeInteger(save) || !Number.isSafeInteger(hp)) {
                tellGM('Save damage cancelled: a roll or HP value is out of range. No HP changed.');
                return;
            }
            var taken = save >= dc ? (type === 'half' ? Math.floor(damage / 2) : 0) : damage;
            changes.push({token: token, remaining: Math.max(0, hp - taken)});
        }

        changes.forEach(function (change) {
            change.token.set('bar1_value', change.remaining);
            CombatGremlinKO.sync(change.token);
        });
        tellGM('Save damage applied to ' + changes.length + ' token(s). ' +
               'Failure: full damage; success: ' + (type === 'half' ? 'half' : 'none') +
               '. No automatic save-damage undo.');
    }

    on('ready', function () { on('chat:message', handle); });
    return {handle: handle};
}());


// Bundled dependency: TokenNameNumber v0.5.12 (The Aaron).
(function(globalconfig){
// Github:   https://github.com/shdwjk/Roll20API/blob/master/TokenNameNumber/TokenNameNumber.js
// By:       The Aaron, Arcane Scriptomancer
// Contact:  https://app.roll20.net/users/104025/the-aaron

// globalconfig is injected from Roll20 (or undefined).
var TokenNameNumber = TokenNameNumber || (function() {
    'use strict';

    var version = '0.5.12',
        lastUpdate = 1500994908,
        schemaVersion = 0.5,
        statuses = [
            'red', 'blue', 'green', 'brown', 'purple', 'pink', 'yellow', // 0-6
            'skull', 'sleepy', 'half-heart', 'half-haze', 'interdiction',
            'snail', 'lightning-helix', 'spanner', 'chained-heart',
            'chemical-bolt', 'death-zone', 'drink-me', 'edge-crack',
            'ninja-mask', 'stopwatch', 'fishing-net', 'overdrive', 'strong',
            'fist', 'padlock', 'three-leaves', 'fluffy-wing', 'pummeled',
            'tread', 'arrowed', 'aura', 'back-pain', 'black-flag',
            'bleeding-eye', 'bolt-shield', 'broken-heart', 'cobweb',
            'broken-shield', 'flying-flag', 'radioactive', 'trophy',
            'broken-skull', 'frozen-orb', 'rolling-bomb', 'white-tower',
            'grab', 'screaming', 'grenade', 'sentry-gun', 'all-for-one',
            'angel-outfit', 'archery-target'
        ],
        statusColormap = ['#C91010', '#1076c9', '#2fc910', '#c97310', '#9510c9', '#eb75e1', '#e5eb75'],
        regex = {
            escape: /(\\|\/|\[|\]|\(|\)|\{|\}|\?|\+|\*|\||\.|\^|\$)/g
        },
        tokenIds = [],

    checkGlobalConfig = function(){
        var s=state.TokenNameNumber,
            g=globalconfig && globalconfig.tokennamenumber,
            parsedDots;
        if(g && g.lastsaved && g.lastsaved > s.globalconfigCache.lastsaved
        ){
          log('  > Updating from Global Config <  ['+(new Date(g.lastsaved*1000))+']');

          s.config.randomSpace = parseInt(g['Random Space'])||0;
          s.config.useDots = 'useDots' === g['Use Dots'];
          if(s.config.useDots){
            parsedDots=_.chain(g.Dots.match(/[a-zA-Z-]+/g))
              .map(function(s){ return s.toLowerCase();})
              .uniq()
              .filter(function(s){ return _.contains(statuses,s);})
              ;
            if(parsedDots.length){
              s.config.dots = parsedDots;
            }
          }
          state.TokenNameNumber.globalconfigCache=globalconfig.tokennamenumber;
        }
    },
    checkInstall = function() {    
        log('-=> TokenNameNumber v'+version+' <=-  ['+(new Date(lastUpdate*1000))+']');

        if( ! _.has(state,'TokenNameNumber') || state.TokenNameNumber.version !== schemaVersion) {
            log('  > Updating Schema to v'+schemaVersion+' <');
            switch(state.TokenNameNumber && state.TokenNameNumber.version) {
                case 0.3: 
				case 0.4:
					delete state.TokenNameNumber.globalConfigCache;
					state.TokenNameNumber.globalconfigCache = {lastsaved:0};

                /* falls through */
                case 'UpdateSchemaVersion':
                    state.TokenNameNumber.version = schemaVersion;
                    break;

                default:
                    state.TokenNameNumber = {
                        version: schemaVersion,
                        globalconfigCache: {lastsaved:0},
                        config: {
                            randomSpace: 0,
                            useDots: false,
                            dots: ['red','brown','yellow','green','blue','purple']
                        },
                        registry: {
                        }
                    };
                    break;
            }
        }
        checkGlobalConfig();
    },
    esRE = function (s) {
        return s.replace(regex.escape,"\\$1");
    },

    ch = function (c) {
		var entities = {
			'<' : 'lt',
			'>' : 'gt',
			"'" : '#39',
			'@' : '#64',
			'{' : '#123',
			'|' : '#124',
			'}' : '#125',
			'[' : '#91',
			']' : '#93',
			'"' : 'quot',
			'-' : 'mdash',
			' ' : 'nbsp'
		};

		if(_.has(entities,c) ){
			return ('&'+entities[c]+';');
		}
		return '';
	},

    getConfigOption_RandomSpace = function() {
        var text = ( state.TokenNameNumber.config.randomSpace > 0 ?
            '<span style="color: green; font-weight:bold;">'+ state.TokenNameNumber.config.randomSpace+ '</span>' :
            '<span style="color: red; font-weight:bold;">Off</span>' );
        return '<div>'+
            'Random Space of numbers between each consecutively generated token number:'+
                text+'. '+
                '<a href="!tnn-config --random-space|?{size of the random gap between token numbers (0 for off, any number for a range from 1 to that number)?|'+state.TokenNameNumber.config.randomSpace+'}">'+
                    'Set Random Space'+
                '</a>'+
            '</div>';
    },

    getConfigOption_UseDots = function() {
        var text = (state.TokenNameNumber.config.useDots ?
            '<span style="color: green; font-weight:bold;">On</span>' :
            '<span style="color: red; font-weight:bold;">Off</span>');

        return '<div>'+
            'Use Dots is currently <b>'+
                text+
            '</b>.'+
            '<a href="!tnn-config --toggle-use-dots">Toggle</a>'+
        '</div>';
    },

    getStatusButton = function(status) {
        var i=_.indexOf(statuses,status);
        if(i<7) {
            return '<a style="background-color: transparent; padding: 0;" href="!tnn-config --toggle-dot|'+status+'"><div style="width: 22px; height: 22px; border-radius:20px; display:inline-block; margin: 0; border:0; cursor: pointer;background-color: '+statusColormap[i]+'"></div></a>';
        } 
        return '<a style="background-color: transparent; padding: 0;" href="!tnn-config --toggle-dot|'+status+'"><div style="width: 24px; height: 24px; display:inline-block; margin: 0; border:0; cursor: pointer;padding:0;background-image: url(\'https://app.roll20.net/images/statussheet.png\');background-repeat:no-repeat;background-position: '+((-34)*(i-7))+'px 0px;"></div></a>';
    },

// https://app.roll20.net/images/statussheet.png
    getConfigOption_Dots = function() {
        return '<div>'+
            '<div>'+
                '<div style="font-weight: bold;">Dots (Click to move between pools).</div>'+
                '<div style="border: 1px solid #999999;border-radius: 10px; background-color: #eeffee;">'+
                    _.map(state.TokenNameNumber.config.dots,function(s){
                        return getStatusButton(s);
                    }).join('')+
                '</div>'+
            '</div>'+
            '<div>'+
                '<div style="font-weight: bold;">Available Statuses</div>'+
                '<div style="border: 1px solid #999999;border-radius: 10px; background-color: #ffeeee;">'+
                    _.map(_.difference(statuses,state.TokenNameNumber.config.dots),function(s){
                        return getStatusButton(s);
                    }).join('')+
                '</div>'+
            '</div>'+
        '</div>';
    },

    getAllConfigOptions = function() {
        return '<ul>'+_.map([
                getConfigOption_RandomSpace(),
                getConfigOption_UseDots(),
                getConfigOption_Dots()
            ], function(c){
                return '<li style="border-top: 1px solid #ccc;border-bottom: 1px solid #ccc;">'+c+'</li>';
        }).join('')+'</ul>';
    },

    showHelp = function(who) {
        sendChat('','/w '+who+' '+
            '<div style="border: 1px solid black; background-color: white; padding: 3px 3px;">'+
                '<div style="font-weight: bold; border-bottom: 1px solid black;font-size: 130%;">'+
                    'TokenNameNumber v'+version+
                '</div>'+
                '<div style="padding-left:10px;margin-bottom:3px;">'+
                    '<p>Provides automatic numbering of tokens dragged into onto the tabletop.  Token names need to have the special word <b>%%NUMBERED%%</b> somewhere in them.</p>'+
                '</div>'+
                '<b>Commands</b>'+
                '<div style="padding-left:10px;">'+
                    '<b><span style="font-family: serif;">!tnn [--help]</span></b>'+
                    '<div style="padding-left: 10px;padding-right:20px">'+
                        '<p>Currently, this just displays the help, which is used for configuring.</p>'+
                        '<ul>'+
                            '<li style="border-top: 1px solid #ccc;border-bottom: 1px solid #ccc;">'+
                                '<b><span style="font-family: serif;">--help</span></b> '+ch('-')+' Displays the help and configuration options.'+
                            '</li> '+
                        '</ul>'+
                    '</div>'+
                '</div>'+
                '<b>Config</b>'+
                '<div>'+
                    getAllConfigOptions()+
                '</div>'+
            '</div>'
        );
    },

    handleInput = function(msg) {
        var args, who;

        if (msg.type !== "api" || !playerIsGM(msg.playerid)) {
            return;
        }
        who=(getObj('player',msg.playerid)||{get:()=>'API'}).get('_displayname');

        args = msg.content.split(/\s+--/);
        switch(args.shift()) {
            case '!tnn':
                    showHelp(who);
                break;

            case '!tnn-config':
                if(_.contains(args,'help')) {
                    showHelp(who);
                    return;
                }
                if(!args.length) {
                    sendChat('','/w '+who+' '+
                        '<div style="border: 1px solid black; background-color: white; padding: 3px 3px;">'+
                            '<div style="font-weight: bold; border-bottom: 1px solid black;font-size: 130%;">'+
                                'TokenNameNumber v'+version+
                            '</div>'+
                            getAllConfigOptions()+
                        '</div>'
                    );
                    return;
                }
                _.each(args,function(a){
                    var opt=a.split(/\|/);
                    switch(opt.shift()) {
                        case 'toggle-use-dots':
                            state.TokenNameNumber.config.useDots=!state.TokenNameNumber.config.useDots;
                            sendChat('','/w '+who+' '+
                                '<div style="border: 1px solid black; background-color: white; padding: 3px 3px;">'+
                                    getConfigOption_UseDots()+
                                '</div>'
                            );
                            break;

                        case 'toggle-dot':
                            if(_.contains(state.TokenNameNumber.config.dots, opt[0])){
                                state.TokenNameNumber.config.dots = _.without(state.TokenNameNumber.config.dots, opt[0]);
                            } else {
                                state.TokenNameNumber.config.dots.push(opt[0]);
                            }
                            sendChat('','/w '+who+' '+
                                '<div style="border: 1px solid black; background-color: white; padding: 3px 3px;">'+
                                    getConfigOption_Dots()+
                                '</div>'
                            );
                            break;


                        case 'random-space':
                           state.TokenNameNumber.config.randomSpace=parseInt(opt[0],10);
                            sendChat('','/w '+who+' '+
                                '<div style="border: 1px solid black; background-color: white; padding: 3px 3px;">'+
                                    getConfigOption_RandomSpace()+
                                '</div>'
                            );
                            break;

                        default:
                            sendChat('','/w '+who+' '+
                                '<div><b>Unsupported Option:</div> '+a+'</div>'
                            );
                    }
                            
                });

                break;
        }
    },


    getMatchers = function(pageid,represents) {
        var matchers = [];
        if(_.has(state.TokenNameNumber.registry, pageid) &&
            _.has(state.TokenNameNumber.registry[pageid],represents) ) {
                _.each(state.TokenNameNumber.registry[pageid][represents], function(regstr) {
                    matchers.push(new RegExp(regstr));
                });
            }
            return matchers;
    },
    addMatcher = function(pageid,represents,matcherRegExpStr) {
        if( ! _.has(state.TokenNameNumber.registry, pageid) ) {
            state.TokenNameNumber.registry[pageid] = {};
        }
        if( ! _.has(state.TokenNameNumber.registry[pageid],represents) ) {
            state.TokenNameNumber.registry[pageid][represents]=[matcherRegExpStr];
        } else {
            state.TokenNameNumber.registry[pageid][represents].push(matcherRegExpStr);
        }
    },

    getDotNumber = function(num) {
        var base = (function (b){
            var radix = b;
            return (b && function base_dot(number,digits){
                digits = digits || [];
                digits.push(number % radix);
                if(number < radix) {
                    return digits;
                }
                return base_dot(Math.floor(number/radix),digits);
            }) || function(){return [];};
        }(state.TokenNameNumber.config.dots.length));

        return base(num); 
    },

    saveTokenId = function(obj){
        tokenIds.push(obj.id);
        let token_id = obj.id;
        
        _.delay(()=>{
                var token=getObj('graphic',token_id);
                if(token){
                    setNumberOnToken(token);
                }
        },100);
        _.delay(()=>{
            tokenIds=_.without(tokenIds,token_id);
        },1000);
    },

    setNumberOnToken = function(obj) {
        var matchers,
        tokenName,
        matcher,
        renamer,
        parts,
        num,
        statuspart='';

        if(_.contains(tokenIds,obj.id)){

            if( 'graphic' === obj.get('type') &&
                'token'   === obj.get('subtype') ) {

                    matchers = (getMatchers(obj.get('pageid'), obj.get('represents'))) || [];
                    tokenName = (obj.get('name'));


                    if(tokenName.match( /%%NUMBERED%%/ ) || _.some(matchers,function(m) { return m.test(tokenName);}) ) {
                        tokenIds=_.without(tokenIds,obj.id);
                        if( 0 === matchers.length || !_.some(matchers,function(m) { return m.test(tokenName);}) ) {
                            matcher='^('+esRE(tokenName).replace(/%%NUMBERED%%/,')(\\d+)(')+')$';
                            addMatcher(obj.get('pageid'), obj.get('represents'), matcher );
                        }
                        if( !_.some(matchers,function(m) {
                            if(m.test(tokenName)) {
                                matcher=m;
                                return true;
                            }
                            return false;
                        }) ) {
                            matcher=new RegExp('^('+esRE(tokenName).replace(/%%NUMBERED%%/,')(\\d+)(')+')$');
                            renamer=new RegExp('^('+esRE(tokenName).replace(/%%NUMBERED%%/,')(%%NUMBERED%%)(')+')$');
                        }
                        renamer = renamer || matcher;

                        num = (_.chain(findObjs({
                            type: 'graphic',
                            subtype: 'token',
                            represents: obj.get('represents'),
                            pageid: obj.get('pageid')
                        }))
                        .filter(function(t){
                            return matcher.test(t.get('name'));
                        })
                        .reduce(function(memo,t){
                            var c=parseInt(matcher.exec(t.get('name'))[2],10);
                            return Math.max(memo,c);
                        },0)
                        .value() );

                        num += ( state.TokenNameNumber.config.randomSpace ? (randomInteger(state.TokenNameNumber.config.randomSpace)-1) : 0);

                        if(state.TokenNameNumber.config.useDots) {
                            statuspart = _.map(getDotNumber(num), function(n){
                                return state.TokenNameNumber.config.dots[n];
                            }).join(',');
                            if(statuspart) {
                                obj.set({
                                    statusmarkers: statuspart
                                });
                            }
                        }

                        parts=renamer.exec(tokenName);
                        obj.set({
                            name: parts[1]+(++num)+parts[3]
                        });
                    }
                }
        }
    },

    registerEventHandlers = function() {
        on('chat:message', handleInput);
        on('add:graphic', saveTokenId);
        on('change:graphic', setNumberOnToken);
    };

    return {
        CheckInstall: checkInstall,
        RegisterEventHandlers: registerEventHandlers,
		NotifyOfCreatedToken: saveTokenId
    };
}());

on("ready",function(){
    'use strict';

    TokenNameNumber.CheckInstall(); 
    TokenNameNumber.RegisterEventHandlers();
});
}(typeof globalconfig !== "undefined" ? globalconfig : undefined));


var CombatGremlinTurnBridge = CombatGremlinTurnBridge || {};
var CombatGremlinSaveBridge = CombatGremlinSaveBridge || {};

// Combat Gremlin: attack automation (2014 OGL and 2024 Beacon).
(function(){
// Targets belong to players, not initiative slots; off-turn reactions are allowed.

var CombatGremlin = CombatGremlin || (function () {
    'use strict';

    // Keep persistent state keys stable across upgrades.
    var STATE_KEY = 'CombatGremlinV01';
    var DAMAGE_WAIT_MS = 90 * 1000;
    var HISTORY_LIMIT = 250;
    // Public rolls and damage, but NPC remaining HP stays GM-only by default.
    var SHOW_HP_TO_PLAYERS = false;

    function data() {
        if (!state[STATE_KEY]) {
            state[STATE_KEY] = { targets: {}, history: [], nextId: 1 };
        }
        if (!state[STATE_KEY].pending2024) state[STATE_KEY].pending2024 = {};
        return state[STATE_KEY];
    }

    function safe(s) {
        return String(s || '').replace(/[<>&\[\]{}()!`]/g, '').replace(/[\r\n]/g, ' ').slice(0, 100);
    }

    function publicChat(s) {
        sendChat('Combat Gremlin', s);
    }

    function dmWhisper(s) {
        sendChat('Combat Gremlin', '/w gm ' + s);
    }

    function whisperPlayer(playerId, s) {
        var player = getObj('player', playerId);
        if (!player) return;
        // Quoting the display name accommodates player names with spaces.
        var name = String(player.get('_displayname') || '').replace(/["\r\n]/g, '');
        if (name) sendChat('Combat Gremlin', '/w "' + name + '" ' + s);
    }

    function numeric(s) {
        // Do not silently interpret a formula, an absent attribute or a malformed bar.
        var v = String(s === null || s === undefined ? '' : s).trim();
        if (!/^-?\d+(?:\.\d+)?$/.test(v)) return null;
        var n = Number(v);
        return isFinite(n) ? n : null;
    }

    function tokenFor(id) {
        var token = id && getObj('graphic', id);
        if (!token) return null;
        if (token.get('subtype') !== 'token') return null;
        return token;
    }

    function acFor(token) {
        var cid = token.get('represents');
        if (!cid) return null;
        var character = getObj('character', cid);
        if (!character) return null;
        if (isBeacon(character)) {
            // Beacon calculated AC is not a legacy attribute. Use only a
            // properly linked AC bar on the represented token, never an
            // unrelated/unlinked bar value that might be another resource.
            var link = String(token.get('bar2_link') || '');
            var value = numeric(token.get('bar2_value'));
            if (!link || value === null || !Number.isInteger(value) || value < 1 || value > 40) return null;
            var attr = getObj('attribute', link);
            if (attr && !/^(?:npc_)?ac$/i.test(String(attr.get('name') || ''))) return null;
            return value;
        }
        // Read from the represented legacy character, not an arbitrary number on the map.
        var ac = numeric(getAttrByName(cid, 'npc_ac'));
        if (ac === null) ac = numeric(getAttrByName(cid, 'ac'));
        return ac;
    }

    function isBeacon(character) {
        return !!character && /dnd2024byroll20/i.test(String(character.get('charactersheetname') || ''));
    }

    var TYPES = ['acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning',
        'necrotic', 'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder'];

    function canonicalType(type) {
        var t = String(type || '').toLowerCase().replace(/\s+/g, ' ').trim();
        return TYPES.indexOf(t) !== -1 ? t : null;
    }

    // Verified Beacon source: character attribute "store", nested
    // integrants.integrants. Failed reads must not imply no defenses.
    function readBeaconStore(cid) {
        var attrs = findObjs({type: 'attribute', characterid: cid}) || [];
        var storeAttr = attrs.filter(function(a) { return a.get('name') === 'store'; })[0];
        if (!storeAttr) return { error: '2024 NPC store attribute unavailable; no HP changed.' };
        try {
            var root = storeAttr.get('current');
            for (var i = 0; i < 3 && typeof root === 'string'; i++) root = JSON.parse(root);
            if (!root || typeof root !== 'object') throw new Error('not an object');
            var inner = root.integrants && root.integrants.integrants;
            if (typeof inner === 'string') inner = JSON.parse(inner);
            if (!inner || typeof inner !== 'object' || Array.isArray(inner))
                throw new Error('integrants.integrants not found');
            return { entries: inner, root: root };
        } catch (e) {
            return { error: '2024 NPC store could not be parsed; no HP changed.' };
        }
    }

    function beaconDefense(token) {
        var store = readBeaconStore(token.get('represents'));
        if (store.error) return { error: store.error };
        var result = { resistance: [], immunity: [], vulnerability: [] };
        var entries = store.entries;
        var keys = Object.keys(entries);
        for (var i = 0; i < keys.length; i++) {
            var e = entries[keys[i]];
            if (typeof e === 'string') {
                try { e = JSON.parse(e); } catch (err) { return { error: 'Malformed 2024 defense entry.' }; }
            }
            if (!e || e.type !== 'Defense') continue;
            if (e._enabled === false || e.overwriteDisabled === true || e.parentDisabled === true) continue;
            // A condition immunity (e.g., Poisoned) must never become damage
            // immunity (e.g., Poison).
            if (e.condition !== null && e.condition !== undefined && String(e.condition).trim()) {
                if (e.damage !== null && e.damage !== undefined && String(e.damage).trim())
                    return { error: 'Mixed 2024 damage/condition defense is ambiguous.' };
                continue;
            }
            if (e._enabled !== true) return { error: '2024 defense activation status is unknown.' };
            var type = canonicalType(e.damage);
            if (!type) return { error: 'Unrecognized or conditional 2024 damage defense: ' + safe(e.damage) };
            var kind = String(e.defense || '').toLowerCase();
            var field = kind === 'resistance' ? 'resistance' :
                        kind === 'immunity' ? 'immunity' :
                        kind === 'vulnerability' ? 'vulnerability' : null;
            if (!field) return { error: 'Unknown 2024 damage defense: ' + safe(e.defense) };
            // Roll20's verified damage-defense entries have an explicit single
            // type and no conditional qualifiers. Stop if a custom entry adds one.
            var qualifierKeys = ['qualifier','requirements','restriction','against','unless',
                                 'only','notes','description','damageCondition'];
            if (qualifierKeys.some(function(k) { return e[k] !== null && e[k] !== undefined && String(e[k]).trim(); }))
                return { error: 'Conditional 2024 defense requires GM adjudication.' };
            result[field].push(type);
        }
        return { resistance: result.resistance.join(', '),
                 immunity: result.immunity.join(', '),
                 vulnerability: result.vulnerability.join(', ') };
    }

    function legacyDefense(token) {
        var cid = token.get('represents');
        var character = cid && getObj('character', cid);
        if (!character) return { error: 'Target has no linked character.' };
        if (isBeacon(character)) return beaconDefense(token);
        return {
            resistance: String(getAttrByName(cid, 'npc_resistances') || ''),
            immunity: String(getAttrByName(cid, 'npc_immunities') || ''),
            vulnerability: String(getAttrByName(cid, 'npc_vulnerabilities') || '')
        };
    }

    function hasDefense(defenseText, type) {
        var raw = String(defenseText || '').toLowerCase();
        var rx = new RegExp('\\b' + type + '\\b', 'i');
        if (!rx.test(raw)) return { yes: false };
        // Qualifiers need attacker/weapon context (magical, nonmagical,
        // silvered, etc.). Never silently treat a conditional as unconditional.
        if (/\b(from|against|except|unless|only|while|nonmagical|magical|silvered|adamantine|spell|attack|weapon|resistance|immunity|vulnerability)\b/i.test(raw)) {
            return { error: 'Conditional defense requires manual adjudication: ' + type };
        }
        // Only accept simple lists, so irrelevant prose cannot cause a match.
        var residue = raw.replace(/\b(acid|bludgeoning|cold|fire|force|lightning|necrotic|piercing|poison|psychic|radiant|slashing|thunder|and|or|damage)\b/g, '')
                         .replace(/[,;.&\s]/g, '');
        if (residue) return { error: 'Unrecognized defense wording for ' + type };
        return { yes: true };
    }

    function applyDefenses(token, components) {
        if (!Array.isArray(components) || !components.length) return { error: 'No typed damage components.' };
        var defense = legacyDefense(token);
        if (defense.error) return { error: defense.error };
        var grouped = {}, raw = 0, effective = 0, notes = [];
        components.forEach(function (part) {
            var type = canonicalType(part.type);
            if (!type || !Number.isInteger(part.value) || part.value < 0) return;
            grouped[type] = (grouped[type] || 0) + part.value;
            raw += part.value;
        });
        if (components.some(function (part) { return !canonicalType(part.type) || !Number.isInteger(part.value) || part.value < 0; })) {
            // Ambiguous multi-type 2014 damage requires GM adjudication if the target has defenses.
            var noDefenses = !String(defense.resistance).trim() &&
                !String(defense.immunity).trim() && !String(defense.vulnerability).trim();
            var allAmountsValid = components.every(function(part) {
                return Number.isInteger(part.value) && part.value >= 0;
            });
            if (noDefenses && allAmountsValid) {
                var unchanged = components.reduce(function(sum,part) { return sum + part.value; }, 0);
                return { raw: unchanged, value: unchanged, notes: [], breakdown: 'Unmodified' };
            }
            return { error: 'Ambiguous damage type or amount. Resolve manually when target has defenses. No HP changed.' };
        }
        var keys = Object.keys(grouped);
        for (var i = 0; i < keys.length; i++) {
            var t = keys[i], amount = grouped[t];
            var imm = hasDefense(defense.immunity, t);
            var res = hasDefense(defense.resistance, t);
            var vul = hasDefense(defense.vulnerability, t);
            if (imm.error || res.error || vul.error) return { error: imm.error || res.error || vul.error };
            var after = amount;
            if (imm.yes) after = 0;
            else {
                if (res.yes) after = Math.floor(after / 2);
                if (vul.yes) after *= 2;
            }
            effective += after;
            if (after !== amount) notes.push(t + ' ' + amount + ' -> ' + after +
                (imm.yes ? ' (immune)' : res.yes && vul.yes ? ' (resistant + vulnerable)' :
                 res.yes ? ' (resistant)' : ' (vulnerable)'));
        }
        return { raw: raw, value: effective, notes: notes, breakdown: keys.map(function(t) {
            return grouped[t] + ' ' + t;
        }).join(' + ') };
    }

    // GM-only defense diagnostics; never changes tokens or sheets.
    function defenseDiagnostics(msg, tokenId) {
        if (!playerIsGM(msg.playerid)) { whisperPlayer(msg.playerid, 'GM only.'); return; }
        var token = tokenFor(tokenId);
        var cid = token && token.get('represents');
        var character = cid && getObj('character', cid);
        if (!character) { dmWhisper('Select a linked NPC token: !cg-defdiag @{target|token_id}'); return; }
        var name = String(character.get('name') || 'NPC');
        if (!isBeacon(character)) {
            var legacy = legacyDefense(token);
            log('=== CG DEFENSE DIAG 2014 ' + name + ' ===');
            log(JSON.stringify(legacy, null, 2));
            dmWhisper('2014 defenses for ' + safe(name) + ' written to Mod Output Console.');
            return;
        }
        var store = readBeaconStore(cid);
        var parsed = beaconDefense(token);
        var defenselist = [];
        if (store.entries) Object.keys(store.entries).forEach(function(id) {
            var e = store.entries[id];
            if (e && e.type === 'Defense') defenselist.push({id: id, defense: e.defense,
                damage: e.damage, condition: e.condition, enabled: e._enabled,
                overwriteDisabled: e.overwriteDisabled, parentDisabled: e.parentDisabled,
                label: e._label});
        });
        log('=== CG DEFENSE DIAG 2024 ' + name + ' ===');
        log(JSON.stringify({sheet: character.get('charactersheetname'),
            source: 'character attribute store', availableEntries: store.entries ? Object.keys(store.entries).length : 0,
            defenses: defenselist, parsed: parsed,
            tokenAcBar2: token.get('bar2_value'), bar2Linked: !!token.get('bar2_link'),
            acceptedAC: acFor(token)}, null, 2));
        dmWhisper('2024 defenses for ' + safe(name) + ': ' +
            (parsed.error ? safe(parsed.error) : 'readable') + '. See Mod Output Console.');
    }

    function templateFields(content) {
        var fields = {};
        var rx = /\{\{\s*([^={}]+?)\s*=([\s\S]*?)\}\}/g;
        var m;
        while ((m = rx.exec(content || '')) !== null) {
            fields[m[1].trim()] = m[2].trim();
        }
        return fields;
    }

    function inlineRoll(msg, raw) {
        var match = /^\$\[\[(\d+)\]\]$/.exec(String(raw || '').trim());
        if (!match || !msg.inlinerolls) return null;
        var item = msg.inlinerolls[Number(match[1])];
        if (!item || !item.results) return null;
        var n = numeric(item.results.total);
        return n === null ? null : { value: n, detail: item.results };
    }

    function naturalD20(results) {
        // Require exactly one active d20 in each attack roll.
        var values = [];
        function scan(rolls) {
            (rolls || []).forEach(function (roll) {
                if (roll.type === 'R' && Number(roll.sides) === 20) {
                    (roll.results || []).forEach(function (die) {
                        if (!die.d && typeof die.v === 'number') values.push(die.v);
                    });
                } else if (roll.rolls) {
                    // Roll20 grouped rolls contain arrays of rolls.
                    roll.rolls.forEach(function (group) {
                        scan(Array.isArray(group) ? group : [group]);
                    });
                }
            });
        }
        scan(results && results.rolls);
        return values.length === 1 ? values[0] : null;
    }

    function playerControls(character, playerId) {
        if (playerIsGM(playerId)) return true;
        var allowed = String(character.get('controlledby') || '').split(',');
        return allowed.indexOf('all') !== -1 || allowed.indexOf(playerId) !== -1;
    }

    function locateAttacker(fields, msg) {
        var name = String(fields.charname || '').trim();
        // Legacy 2014 sheets may append charname=NAME outside {{template fields}}.
        if (!name) {
            var trailing = String(msg.content || '').match(/(?:^|\s)charname=([^\r\n{}]*?)\s*$/);
            if (trailing) name = trailing[1].trim();
        }
        var candidates = name ? (findObjs({ _type: 'character', name: name }) || []) : [];
        // Player rolls require an unambiguous, controlled character; verify the ID when available.
        if (!playerIsGM(msg.playerid)) {
            if (candidates.length !== 1 || !playerControls(candidates[0], msg.playerid)) return null;
            if (msg.rolledByCharacterId && msg.rolledByCharacterId !== candidates[0].id) return null;
            return candidates[0];
        }
        // GM-only fallback handles legacy templates without reliable character metadata.
        if (candidates.length === 1) return candidates[0];
        var gmLabel = name || String(msg.who || 'GM-Testwurf');
        return { get: function (key) { return key === 'name' ? gmLabel : ''; } };
    }

    // Target records are indexed by the selecting PLAYER, never globally.
    // These helpers also run when CG-EndTurn or the native tracker advances.
    function clearPlayerTarget(playerId) {
        var d = data();
        delete d.targets[playerId];
        delete d.pending2024[playerId];
    }

    function clearTargetsForTurn(tokenId) {
        if (!tokenId || tokenId === '-1') return;
        var d = data();
        Object.keys(d.targets).forEach(function (playerId) {
            if (d.targets[playerId] && d.targets[playerId].turnId === tokenId) {
                clearPlayerTarget(playerId);
            }
        });
    }

    function clearAllTargets() {
        data().targets = {};
        data().pending2024 = {};
    }

    function currentTurnId() {
        var campaign = Campaign();
        if (!campaign || !campaign.get('initiativepage')) return null;
        try {
            var order = JSON.parse(campaign.get('turnorder') || '[]');
            if (!Array.isArray(order) || !order.length) return null;
            var id = String(order[0].id || '');
            return id && id !== '-1' ? id : null;
        } catch (e) { return null; }
    }

    function activeTurnIdForPlayer(playerId) {
        var id = currentTurnId();
        if (!id) return null;
        if (playerIsGM(playerId)) return id; // GM may test any character.
        var token = tokenFor(id);
        if (!token) return null;
        var character = token.get('represents') && getObj('character', token.get('represents'));
        var controlledby = character ? character.get('controlledby') : token.get('controlledby');
        var allowed = String(controlledby || '').split(',').map(function(v) { return v.trim(); });
        return allowed.indexOf('all') !== -1 || allowed.indexOf(playerId) !== -1 ? id : null;
    }

    function parseTrackerOrder(raw) {
        try {
            var order = JSON.parse(raw || '[]');
            return Array.isArray(order) ? order : null;
        } catch (e) { return null; }
    }

    function trackerEntryKey(entry) {
        return String(entry && entry.id || '') + ':' + String(entry && entry.custom || '');
    }

    function handleNativeTurnChange(campaign, previous) {
        // This Roll20 event fires for native UI edits. Changes caused by Mod
        // scripts do NOT fire it, so CG-EndTurn explicitly calls clearTurn too.
        var before = parseTrackerOrder(previous && previous.turnorder);
        var after = parseTrackerOrder(campaign.get('turnorder'));
        if (!before || !after) return;
        if (!after.length) { clearAllTargets(); return; }
        // Only interpret a one-step rotation as an ended turn; sorting or
        // manually adjusting initiative does not cancel anyone's target.
        if (before.length < 2 || before.length !== after.length) return;
        var isRotation = after.every(function (entry, i) {
            return trackerEntryKey(entry) === trackerEntryKey(before[(i + 1) % before.length]);
        });
        if (isRotation) clearTargetsForTurn(String(before[0].id || ''));
    }

    function endTurn(playerId, tokenId) {
        clearPlayerTarget(playerId);
        clearTargetsForTurn(tokenId);
    }

    function rememberTarget(msg, targetId) {
        var token = tokenFor(targetId);
        if (!token || (!playerIsGM(msg.playerid) && token.get('layer') !== 'objects')) {
            whisperPlayer(msg.playerid, 'No valid visible target token.');
            return;
        }
        if (acFor(token) === null || numeric(token.get('bar1_value')) === null) {
            whisperPlayer(msg.playerid, 'Target must represent a character with numeric AC and HP in token Bar 1.');
            return;
        }
        // Selecting a new target invalidates an unfinished 2024 damage pairing.
        delete data().pending2024[msg.playerid];
        // Bind the selection to the active token for selective clearing on turn advance.
        data().targets[msg.playerid] = {
            tokenId: targetId,
            turnId: activeTurnIdForPlayer(msg.playerid)
        };
        publicChat('🎯 ' + safe(msg.who) + ' targets **' + safe(token.get('name') || 'Target') +
                   '** until changing target or ending their turn.');
    }

    function sumDamage(msg, fields, critical) {
        var parts = ['dmg1', 'dmg2', 'hldmg'];
        var critParts = ['crit1', 'crit2', 'hldmgcrit'];
        var total = 0;
        var hasBase = false;
        var hasCrit = false;
        var pieces = [];
        var components = [];
        var error = null;

        parts.forEach(function (key, index) {
            if (!fields[key]) return;
            if (key === 'dmg2' && !fields.dmg2flag) return;
            // dmg2 may be an unused blank template field; only count actual rolls.
            var roll = inlineRoll(msg, fields[key]);
            if (!roll || roll.value < 0) { error = 'Unable to read damage dice unambiguously.'; return; }
            if (key === 'dmg1') hasBase = true;
            var type = fields[key + 'type'] || (key === 'hldmg' ? fields.globaldamagetype : '');
            components.push({ type: type, value: roll.value });
            total += roll.value;
            if (roll.value !== 0) pieces.push(roll.value + ' ' + safe(type));
            if (critical && fields[critParts[index]]) {
                var extra = inlineRoll(msg, fields[critParts[index]]);
                if (!extra || extra.value < 0) { error = 'Unable to read additional critical damage.'; return; }
                hasCrit = true;
                total += extra.value;
                components.push({ type: type, value: extra.value });
                pieces.push(extra.value + ' Critical ' + safe(type));
            }
        });
        // A critical hit with no extra crit roll is too ambiguous for safe auto-damage.
        if (!hasBase) error = 'No automatic damage roll (dmg1) found.';
        if (critical && !hasCrit) error = 'Missing extra critical damage roll.';
        if (!Number.isInteger(total)) error = 'Damage must be an integer.';
        return error ? { error: error } : { value: total, components: components,
            breakdown: pieces.join(' + ') || '0 Damage' };
    }

    function handleAttack(msg) {
        var d = data();
        var targetInfo = d.targets[msg.playerid];
        if (!targetInfo) return;
        // Sticky target: a miss, a hit, or an unsupported roll NEVER consumes it.

        if (msg.type !== 'general' || msg.secret === true || (msg.secrecy && msg.secrecy !== 'public')) {
            whisperPlayer(msg.playerid, 'Only public attack rolls can apply automatic damage.');
            return;
        }
        if (msg.rolltemplate === 'atk') {
            whisperPlayer(msg.playerid, 'Enable Auto Roll Damage & Crit on the 2014 sheet. No HP changed.');
            return;
        }
        if (msg.rolltemplate !== 'atkdmg') return;

        var fields = templateFields(msg.content);
        var attacker = locateAttacker(fields, msg);
        if (!attacker) {
            dmWhisper('Unknown or unauthorized attacker, or duplicate character name. No HP changed.');
            return;
        }
        var token = tokenFor(targetInfo.tokenId);
        var armor = token && acFor(token);
        var hp = token && numeric(token.get('bar1_value'));
        if (!token || armor === null || hp === null) {
            clearPlayerTarget(msg.playerid); // do not keep targeting a deleted/invalid token
            dmWhisper('Missing target, AC, or HP. Target cleared; no HP changed.');
            return;
        }
        if (fields.save) {
            if (typeof CombatGremlinMultiSave !== 'undefined' && CombatGremlinMultiSave.isArmed(msg.playerid)) return;
            dmWhisper('Attack includes an additional saving throw. Resolve manually. No HP changed.');
            return;
        }
        if (!fields.r1 || !fields.dmg1) {
            dmWhisper('Attack or damage roll missing. No HP changed.');
            return;
        }

        var a = inlineRoll(msg, fields.r1);
        var b = fields.r2 ? inlineRoll(msg, fields.r2) : null;
        if (!a || (fields.r2 && !b)) {
            dmWhisper('Cannot parse attack dice. No HP changed.');
            return;
        }
        var advantage = Object.prototype.hasOwnProperty.call(fields, 'advantage');
        var disadvantage = Object.prototype.hasOwnProperty.call(fields, 'disadvantage');
        var always = Object.prototype.hasOwnProperty.call(fields, 'always');
        if (always || (advantage && disadvantage) || ((advantage || disadvantage) && !b) || (b && !advantage && !disadvantage && !Object.prototype.hasOwnProperty.call(fields, 'normal'))) {
            dmWhisper('Ambiguous roll mode (e.g., Always Roll Advantage). No HP changed.');
            return;
        }
        var chosen = advantage ? (a.value >= b.value ? a : b) :
                     disadvantage ? (a.value <= b.value ? a : b) : a;
        var nat = naturalD20(chosen.detail);
        if (nat === null) {
            dmWhisper('Cannot identify the natural d20 result. No HP changed.');
            return;
        }
        var critThreshold = 20;
        var chosenAttackRoll = (chosen.detail.rolls || []).filter(function(r) { return r.type === 'R' && Number(r.sides) === 20; })[0];
        var custom = chosenAttackRoll && chosenAttackRoll.mods && chosenAttackRoll.mods.customCrit;
        if (custom && custom.length === 1 && custom[0].comp === '>=' && Number.isInteger(custom[0].point) &&
            custom[0].point >= 1 && custom[0].point <= 20) critThreshold = custom[0].point;
        var crit = nat !== 1 && nat >= critThreshold;
        var hit = nat !== 1 && (crit || chosen.value >= armor);
        var action = safe(fields.rname || 'Attack');
        var label = safe(attacker.get('name')) + ' → ' + safe(token.get('name') || 'Target');
        var attackText = label + ' | ' + action + ' | ATK: ' + chosen.value + ' (d20: ' + nat + ') vs AC ' + armor;
        if (!hit) {
            publicChat('⚔️ ' + attackText + ' | **MISS** | **DMG: 0**');
            return;
        }
        var damage = sumDamage(msg, fields, crit);
        if (damage.error) {
            dmWhisper(damage.error + ' **No HP changed.**');
            return;
        }
        var adjusted = applyDefenses(token, damage.components);
        if (adjusted.error) { dmWhisper(adjusted.error + ' **No HP changed.**'); return; }
        var nextHP = Math.max(0, hp - adjusted.value);
        var applied = hp - nextHP;
        token.set('bar1_value', nextHP);
        CombatGremlinKO.sync(token);
        var id = d.nextId++;
        d.history.push({ id: id, targetId: token.id, applied: applied, undone: false, actor: safe(msg.who) });
        if (d.history.length > HISTORY_LIMIT) d.history.shift();
        var undo = applied > 0 ? ' [DM Undo](!cg-undo ' + id + ')' : '';
        var message = '⚔️ ' + attackText + ' | **' + (crit ? 'CRIT' : 'HIT') + '** | **DMG: ' + damage.value + '** (' + damage.breakdown + ')';
        if (SHOW_HP_TO_PLAYERS) message += ' HP **' + hp + ' → ' + nextHP + '**.' + undo;
        publicChat(message);
        if (!SHOW_HP_TO_PLAYERS) dmWhisper('Entry #' + id + ': ' + safe(token.get('name') || 'Target') +
                         ' HP **' + hp + ' → ' + nextHP + '**. Effective ' + adjusted.value +
                         ' / rolled ' + damage.value + (adjusted.notes.length ? '. ' + safe(adjusted.notes.join('; ')) : '') + '.' + undo);
    }

    function undo(msg, idText) {
        if (!playerIsGM(msg.playerid)) {
            whisperPlayer(msg.playerid, 'Only the GM may undo damage.');
            return;
        }
        var id = Number(idText);
        var entry = data().history.filter(function (e) { return e.id === id; })[0];
        if (!entry || entry.undone) {
            dmWhisper('Undo ID not found or already used.');
            return;
        }
        var token = tokenFor(entry.targetId);
        if (!token) { dmWhisper('Target token no longer exists.'); return; }
        var current = numeric(token.get('bar1_value'));
        if (current === null) { dmWhisper('Invalid HP bar. No HP changed.'); return; }
        var maximum = numeric(token.get('bar1_max'));
        // Reverse the effective change, not by restoring stale HP. This leaves
        // OTHER attacks/heals intact when undoing an older hit.
        var corrected = current + entry.applied;
        if (maximum !== null && maximum >= 0) corrected = Math.min(maximum, corrected);
        token.set('bar1_value', corrected);
        CombatGremlinKO.sync(token);
        entry.undone = true;
        var undoText = '↩️ **GM UNDO #' + id + '** | ' + safe(token.get('name') || 'Target') +
                       ' | Damage entry reversed.';
        if (SHOW_HP_TO_PLAYERS) undoText += ' HP **' + current + ' → ' + corrected + '**.';
        publicChat(undoText);
        if (!SHOW_HP_TO_PLAYERS) dmWhisper('Undo #' + id + ': HP **' + current + ' → ' + corrected + '**.');
    }

    // 2024 Beacon attacks and typed damage arrive in separate chat messages.
    // Pair them by player, character, action ID and damage kind.
    function isPublic2024(msg) {
        return msg.type === 'advancedroll' && msg.secret !== true &&
               (!msg.secrecy || msg.secrecy === 'public');
    }

    function action2024(msg) {
        var a = msg.action;
        if (!a || a.action !== 'repeating_attack' || !Array.isArray(a.args) || a.args.length < 2 ||
            typeof a.args[0] !== 'string' || !a.args[0] || a.args[1] !== 'attack') return null;
        if (a.args.length === 2) return { id: a.args[0], kind: 'attack' };
        if (a.args.length === 3 && (a.args[2] === 'dmg' || a.args[2] === 'crit')) return { id: a.args[0], kind: 'damage', damageKind: a.args[2] };
        return null;
    }

    // A 2024 Combat-tab saving-throw spell also uses repeating_attack.
    // Its announcement is NOT an attack roll and belongs to Multi-Save.
    // Recognize only unmistakable 2024 save cards, not ordinary weapon attacks
    // or malformed attack events (those must still report useful errors).
    function is2024SaveSpellCard(msg) {
        var html = String(msg.content || '');
        return html.indexOf('dnd-2024--chat') >= 0 &&
            /class=["']dc__name["']/.test(html) &&
            /class=["']dc__value["']/.test(html) &&
            /class=["']save-outcomes__fail["']/.test(html) &&
            /class=["']save-outcomes__success["']/.test(html);
    }

    function identity2024(msg) {
        if (!msg.characterId || msg.characterId !== msg.rolledByCharacterId) return null;
        var ch = getObj('character', msg.characterId);
        if (!ch || !playerControls(ch, msg.playerid)) return null;
        return ch;
    }

    function parse2024Attack(msg) {
        var html = String(msg.content || '');
        if (html.indexOf('dnd-2024--roll') < 0 || !/data-rollSubcategory=["']Attack["']/.test(html)) return null;
        var m = html.match(/dnd-2024__header--(Normal|Advantage|Disadvantage)\b/);
        if (!m || !msg.rolls || !msg.rolls.Base || !msg.rolls.Base.results) return null;
        var mode = m[1], base = msg.rolls.Base.results;
        var diceParts = (base.rolls || []).filter(function(r) { return r.type === 'R' && Number(r.sides) === 20; });
        if (diceParts.length !== 1) return null; // no multi-pool or complex attack yet
        var dice = diceParts[0].results || [];
        var selected = dice.filter(function(d) { return d.d !== true && Number.isInteger(d.v); });
        if (selected.length !== 1) return null;
        if (mode === 'Normal' && dice.length !== 1) return null;
        if (mode !== 'Normal') {
            if (dice.length !== 2 || dice.filter(function(d) { return d.d === true; }).length !== 1) return null;
            var other = dice.filter(function(d) { return d.d === true; })[0];
            if (!Number.isInteger(other.v)) return null;
            if (mode === 'Advantage' && selected[0].v < other.v) return null;
            if (mode === 'Disadvantage' && selected[0].v > other.v) return null;
        }
        var nat = selected[0].v;
        if (nat < 1 || nat > 20 || numeric(base.total) !== nat) return null;
        // The Base roll is only the D20. The actual attack total includes bonuses
        // from the 2024 roll card. Never compare the Base die with target AC.
        var attackMarkup = html.slice(html.indexOf('data-rollSubcategory="Attack"'));
        var totals = attackMarkup.match(/class=["']total__value["']>\s*([+-]?\d+)\s*<\/span>/g) || [];
        if (totals.length !== 1) return null;
        var totalNum = Number(totals[0].match(/>\s*([+-]?\d+)\s*</)[1]);
        if (!Number.isInteger(totalNum)) return null;
        var weapon = html.match(/<div class=["']header__title["']>\s*([^<>]{1,100})\s*<\/div>/);
        var criticalMarkup = /dnd-2024__result--critical\b/.test(html.slice(0, html.indexOf('data-rollSubcategory="Attack"')));
        return { total: totalNum, natural: nat, critical: (nat === 20 || criticalMarkup), mode: mode,
                 weapon: weapon ? weapon[1].trim() : 'Attack' };
    }

    // Damage types are not encoded in the effect-* roll IDs. On the Roll20 2024
    // sheet, a 'Custom' chip may be a feature that inherits weapon damage or
    // one that deals its own damage type. Do NOT globally treat Custom as physical.
    // Only labels with a verified single damage type are mapped here; the player
    // and GM remain responsible for applying each effect legally.
    function custom2024DamageType(label, weaponType) {
        var name = String(label || '').toLowerCase().replace(/\s+/g, ' ').trim();
        // Remove Roll20's rolled formula, e.g. Sneak Attack (5d6) or Rage (+2),
        // but keep named parentheses such as The Court's Favor (Divine Favor).
        name = name.replace(/\s*\((?:[+-]?\d+|\d+d\d+(?:\s*[+-]\s*\d+)?)\)\s*$/, '').trim();
        if (/^(?:rage|great weapon master|heavy weapon mastery|sneak attack|fury of the small|magic weapon)$/.test(name)) {
            return weaponType || null;
        }
        if (/^dreadful strikes?$/.test(name)) return 'psychic';
        if (/^hunter['’]s mark$/.test(name)) return 'force'; // 2024 spell rules
        if (name === 'hex') return 'necrotic';
        if (name === 'divine favor' || /\(divine favor\)$/.test(name)) return 'radiant';
        return null; // Unknown or choice-based type: GM resolves manually.
    }

    function parse2024Damage(msg) {
        var html = String(msg.content || '');
        if (html.indexOf('dnd-2024--roll') < 0 || !/data-rollSubcategory=["']Damage["']/.test(html)) return null;
        if (html.indexOf('header__title--damage') < 0) return null;
        var names = Object.keys(msg.rolls || {});
        if (!names.length || names.length > 12 || names.indexOf('Base') >= 0) return null;
        var rollTotal = 0;
        for (var i = 0; i < names.length; i++) {
            var results = msg.rolls[names[i]] && msg.rolls[names[i]].results;
            var amount = results && numeric(results.total);
            if (amount === null || !Number.isInteger(amount) || amount < 0) return null;
            rollTotal += amount;
        }
        // The first set of 2024 damage chips lists damage types and integer
        // values. Effect chips can say 'Custom': that is NOT a damage type.
        var chips = [], rx = /<div class=["']header__damage-breakdown["']>[\s\S]*?<div class=["']damage-breakdown__icon["'][^>]*>[\s\S]*?<\/div>\s*([A-Za-z][A-Za-z ]{0,35})\s*<div class=["']damage-breakdown__total["']>\s*([+-]?\d+)\s*<\/div>/g;
        var m;
        while ((m = rx.exec(html)) !== null) {
            var rawType = String(m[1]).trim().toLowerCase();
            var type = canonicalType(rawType);
            var n = Number(m[2]);
            if ((!type && rawType !== 'custom') || !Number.isInteger(n) || n < 0) return null;
            chips.push({ type: type, value: n, custom: rawType === 'custom' });
        }
        if (!chips.length || chips.length > 12 || chips.length !== names.length) return null;
        var totalValue = html.match(/class=["']total__value["']>\s*([+-]?\d+)\s*<\/span>/);
        if (!totalValue) return null;
        var displayedTotal = Number(totalValue[1]);
        var partsTotal = chips.reduce(function(sum, part) { return sum + part.value; }, 0);
        if (partsTotal !== displayedTotal || partsTotal !== rollTotal) return null;

        var hasCustom = chips.some(function(part) { return part.custom; });
        if (!hasCustom) {
            // Preserve the established, successful parsing path for existing
            // typed 2024 rolls, including mixed-type saving-throw spells.
            return { value: partsTotal, components: chips.map(function(part) {return {type:part.type,value:part.value};}),
                breakdown: chips.map(function(part) { return part.value + ' ' + part.type; }).join(' + ') };
        }

        // For Custom components, cross-check the rendered roll formula rows with
        // individual signed Roll20 roll IDs. Never pair by amount alone: two
        // effects may happen to roll the same number.
        var formulas = [], seenIds = {}, re = /<div class=["']rt-formula["']>\s*<div class=["']rt-formula__raw["']>\s*([^<]*?)\s*<\/div>\s*<div class=["']rt-formula__evaluated["']>\s*<span class=["']rt-formula__evaluated-string["']([^>]*)>\s*([+-]?\d+)\s*<\/span>\s*<\/div>\s*<\/div>/g;
        while ((m = re.exec(html)) !== null) {
            var attrs = m[2];
            var nameAttr = attrs.match(/\bdata-rollname=["']([^"']+)["']/);
            var idAttr = attrs.match(/\bdata-rollid=["']([^"']+)["']/);
            var rollName = nameAttr && nameAttr[1];
            if (!rollName || !idAttr || rollName !== idAttr[1] || seenIds[rollName] ||
                !Object.prototype.hasOwnProperty.call(msg.rolls, rollName)) return null;
            var actual = numeric(msg.rolls[rollName].results && msg.rolls[rollName].results.total);
            var shown = Number(m[3]);
            if (!Number.isInteger(shown) || shown < 0 || shown !== actual) return null;
            seenIds[rollName] = true;
            formulas.push({ name: String(m[1]).trim(), id: rollName, value: shown });
        }
        if (formulas.length !== chips.length || Object.keys(seenIds).length !== names.length) return null;
        // The FIRST component must be the base weapon roll, with a real damage
        // type, before any inherited weapon-type effect can be resolved.
        var weaponType = !chips[0].custom && formulas[0].id.indexOf('effect-') !== 0 ? chips[0].type : null;
        var components = [], breakdown = [];
        for (var j = 0; j < chips.length; j++) {
            if (chips[j].value !== formulas[j].value) return null;
            // 'Custom' is permitted only for explicit named effect rolls.
            if (chips[j].custom && formulas[j].id.indexOf('effect-') !== 0) return null;
            var resolvedType = chips[j].custom ? custom2024DamageType(formulas[j].name, weaponType) : chips[j].type;
            if (!resolvedType) return null;
            components.push({type:resolvedType,value:chips[j].value});
            breakdown.push(chips[j].value + ' ' + resolvedType +
                (chips[j].custom ? ' [' + formulas[j].name + ']' : ''));
        }
        return { value:partsTotal, components:components, breakdown:breakdown.join(' + ') };
    }

    function handle2024(msg) {
        var a = action2024(msg);
        if (!a || !msg.playerid || msg.playerid === 'API') return;
        var d = data();
        if (a.kind === 'attack') {
            // Leave save-spell cards entirely to Multi-Save, even if the player
            // has a sticky single target or an unfinished attack pairing.
            if (is2024SaveSpellCard(msg)) return;
            var targetInfo = d.targets[msg.playerid];
            if (!targetInfo) return;
            // Only one 2024 attack/damage pairing may be pending per player.
            if (d.pending2024[msg.playerid]) {
                delete d.pending2024[msg.playerid];
                whisperPlayer(msg.playerid, 'Previous 2024 attack had no damage roll; pairing cancelled. Current target stays selected.');
            }
            var attacker = identity2024(msg);
            if (!isPublic2024(msg) || !attacker) {
                dmWhisper('2024 attack is not public or attacker is unauthorized. No HP changed.'); return;
            }
            var roll = parse2024Attack(msg);
            if (!roll) {
                dmWhisper('Unable to parse 2024 attack unambiguously. No HP changed.'); return;
            }
            var token = tokenFor(targetInfo.tokenId);
            var armor = token && acFor(token);
            var hp = token && numeric(token.get('bar1_value'));
            if (!token || armor === null || hp === null) {
                clearPlayerTarget(msg.playerid);
                dmWhisper('Missing 2024 target, AC, or HP. Target cleared; no HP changed.'); return;
            }
            var textLine = safe(attacker.get('name')) + ' → ' + safe(token.get('name') || 'Target') +
                ' | ' + safe(roll.weapon) + ' | ' + roll.mode + ' | ATK: ' + roll.total +
                ' (d20: ' + roll.natural + ') vs AC ' + armor;
            if (roll.natural === 1 || (!roll.critical && roll.total < armor)) {
                publicChat('⚔️ ' + textLine + ' | **MISS** | **DMG: 0**'); return;
            }
            d.pending2024[msg.playerid] = {
                targetId: token.id, characterId: msg.characterId, actionId: a.id,
                damageKind: roll.critical ? 'crit' : 'dmg', critical: roll.critical,
                expires: Date.now() + DAMAGE_WAIT_MS, attackLine: textLine
            };
            publicChat('⚔️ ' + textLine + ' | **' + (roll.critical ? 'CRIT' : 'HIT') + '** | Roll DMG on the 2024 sheet.');
        } else {
            var pending = d.pending2024[msg.playerid];
            if (!pending) return;
            if (Date.now() > pending.expires) {
                delete d.pending2024[msg.playerid];
                whisperPlayer(msg.playerid, '2024 damage roll arrived too late. No HP changed.'); return;
            }
            // A different attack's damage means the intended pairing is now
            // ambiguous. Clear it rather than risking stale damage later.
            if (a.id !== pending.actionId || msg.characterId !== pending.characterId ||
                msg.rolledByCharacterId !== pending.characterId || a.damageKind !== pending.damageKind) {
                delete d.pending2024[msg.playerid];
                whisperPlayer(msg.playerid, 'Damage belongs to a different 2024 attack. No HP changed; current target remains selected.');
                return;
            }
            delete d.pending2024[msg.playerid]; // one-shot: no damage double-clicks
            if (!isPublic2024(msg) || !identity2024(msg)) {
                dmWhisper('2024 damage roll is secret or unauthorized. No HP changed.'); return;
            }
            var dmg = parse2024Damage(msg);
            if (!dmg) {
                dmWhisper('Cannot parse typed 2024 damage unambiguously. No HP changed.'); return;
            }
            var targetToken = tokenFor(pending.targetId);
            var before = targetToken && numeric(targetToken.get('bar1_value'));
            if (!targetToken || before === null) {
                dmWhisper('2024 target missing or HP invalid. No HP changed.'); return;
            }
            var adjusted = applyDefenses(targetToken, dmg.components);
            if (adjusted.error) { dmWhisper(adjusted.error + ' **No HP changed.**'); return; }
            var next = Math.max(0, before - adjusted.value);
            var actual = before - next;
            targetToken.set('bar1_value', next);
            CombatGremlinKO.sync(targetToken);
            var id = d.nextId++;
            d.history.push({id: id, targetId: targetToken.id, applied: actual, undone: false, actor: safe(msg.who)});
            if (d.history.length > HISTORY_LIMIT) d.history.shift();
            var button = actual > 0 ? ' [DM Undo](!cg-undo ' + id + ')' : '';
            var textLine = '⚔️ ' + pending.attackLine + ' | **' + (pending.critical ? 'CRIT' : 'HIT') + '** | **DMG: ' + dmg.value + '** (' + safe(dmg.breakdown) + ')';
            if (SHOW_HP_TO_PLAYERS) textLine += ' HP ' + before + ' → ' + next + '.' + button;
            publicChat(textLine);
            if (!SHOW_HP_TO_PLAYERS) dmWhisper('Entry #' + id + ': ' + safe(targetToken.get('name') || 'Target') +
                ' HP ' + before + ' → ' + next + '. Effective ' + adjusted.value +
                ' / rolled ' + dmg.value + (adjusted.notes.length ? '. ' + safe(adjusted.notes.join('; ')) : '') + '.' + button);
        }
    }

    function handleMessage(msg) {
        if (!msg || msg.playerid === 'API') return;
        if (msg.type === 'api') {
            var bits = String(msg.content || '').trim().split(/\s+/);
            // GroupInitiative can clear the tracker through a Mod command. Mod
            // changes need not trigger change:campaign events, so clear here.
            if (bits[0] === '!group-init' && bits.indexOf('--clear') !== -1 && playerIsGM(msg.playerid)) {
                clearAllTargets();
            }
            if (bits[0] === '!cg-target') {
                var id = bits[1] || (msg.selected && msg.selected.length === 1 && msg.selected[0]._id);
                rememberTarget(msg, id);
            } else if (bits[0] === '!cg-undo') {
                undo(msg, bits[1]);
            } else if (bits[0] === '!cg-cancel') {
                clearPlayerTarget(msg.playerid);
                whisperPlayer(msg.playerid, 'Target selection cleared.');
            } else if (bits[0] === '!cg-defdiag') {
                defenseDiagnostics(msg, bits[1] || (msg.selected && msg.selected.length === 1 && msg.selected[0]._id));
            }
            return;
        }
        if (msg.type === 'advancedroll') handle2024(msg);
        else if (msg.rolltemplate === 'atk' || msg.rolltemplate === 'atkdmg') handleAttack(msg);
    }

    on('ready', function () {
        data();
        // Never carry a stale target into a new session after sandbox restart.
        clearAllTargets();
        on('chat:message', handleMessage);
        on('change:campaign:turnorder', handleNativeTurnChange);
        on('change:campaign:initiativepage', function (campaign) {
            if (!campaign.get('initiativepage')) clearAllTargets();
        });
        log('Combat Gremlin attack core ready v1.0.0 (2014/2024 attacks, defenses, sticky targets).');
    });
    CombatGremlinTurnBridge.endTurn = endTurn;
    // Share the established defense and damage parsers with the AoE save handler.
    CombatGremlinSaveBridge.applyDefenses = applyDefenses;
    CombatGremlinSaveBridge.parse2024Damage = parse2024Damage;
    CombatGremlinSaveBridge.recordDamage = function(token, applied, actor) {
        if (!Number.isSafeInteger(applied) || applied < 0) return null;
        var d = data(), id = d.nextId++;
        d.history.push({id:id, targetId:token.id, applied:applied, undone:false, actor:safe(actor)});
        if (d.history.length > HISTORY_LIMIT) d.history.shift();
        return id;
    };
    return { version: '1.0.0' };
}());

}());


// Combat Gremlin: one-shot multi-target saves for 2014 and 2024 sheet spells.
// Damage is changed only after a verified GroupCheck result and complete spell data.
var CombatGremlinMultiSave = CombatGremlinMultiSave || (function () {
    'use strict';
    var KEY = 'CombatGremlinMultiSave_v1';
    var WAIT_MS = 90000;
    var MAX_TARGETS = 10;
    var ABILITIES = {strength:1, dexterity:1, constitution:1, intelligence:1, wisdom:1, charisma:1};

    function data() {
        if (!state[KEY] || typeof state[KEY] !== 'object') state[KEY] = {};
        if (!state[KEY].players) state[KEY].players = {};
        return state[KEY];
    }
    function safe(s) {
        return String(s == null ? '' : s).replace(/[<>&\[\]{}()!`]/g, '').replace(/[\r\n]/g, ' ').slice(0, 90);
    }
    function whisper(id, message) {
        var p = getObj('player', id);
        if (!p) return;
        var name = String(p.get('_displayname') || '').replace(/["\r\n]/g, '');
        if (name) sendChat('Combat Gremlin', '/w "' + name + '" ' + message);
    }
    function gm(message) { sendChat('Combat Gremlin', '/w gm ' + message); }
    function publicChat(message) { sendChat('Combat Gremlin', message); }
    function num(value) {
        var text = String(value == null ? '' : value).trim();
        if (!/^-?\d+$/.test(text)) return null;
        var result = Number(text);
        return Number.isSafeInteger(result) ? result : null;
    }
    function fieldsOf(content) {
        var fields = {}, rx = /\{\{\s*([^={}]+?)\s*=([\s\S]*?)\}\}/g, m;
        while ((m = rx.exec(String(content || ''))) !== null) fields[m[1].trim()] = m[2].trim();
        return fields;
    }
    function rollValue(msg, expression) {
        var match = /^\$\[\[(\d+)\]\]$/.exec(String(expression || '').trim());
        if (!match || !Array.isArray(msg.inlinerolls)) return null;
        var roll = msg.inlinerolls[Number(match[1])];
        return roll && roll.results ? num(roll.results.total) : null;
    }
    function playerControls(ch, id) {
        if (playerIsGM(id)) return true;
        return !!ch && String(ch.get('controlledby') || '').split(',').some(function(p) {
            return p.trim() === id || p.trim() === 'all';
        });
    }
    function caster(msg, beacon) {
        var id = msg.rolledByCharacterId || (beacon ? msg.characterId : '');
        if (!id || (beacon && msg.characterId !== id)) return null;
        var ch = getObj('character', id);
        return ch && playerControls(ch, msg.playerid) ? ch : null;
    }
    function expires(record) { return !record || Date.now() > record.expires; }
    function menu(msg) {
        var buttons = [];
        // API-generated chat cannot trigger the target picker without another click.
        // HTML-encoded @ and ? in command buttons expand on that click.
        for (var n = 1; n <= MAX_TARGETS; n++) {
            var targets = [];
            for (var i = 1; i <= n; i++) {
                targets.push('&#64;{target|Gremlin ' + i + '|token_id}');
            }
            buttons.push('[' + n + '](!cg-multi-select &#63;{On successful save|Auto,auto|Half damage,half|No damage,none|Save only,saveonly} ' + targets.join(',') + ')');
        }
        whisper(msg.playerid, '<b>🔥 MULTI-TARGET SAVE🔥</b><br>How many different targets? ' +
            'Choose a number, set the outcome mode, then click each creature.<br>' + buttons.join(' '));
    }
    // Native Roll20 macro queries collect the target count and save outcome.
    // API scripts cannot directly open a client-side token target picker, so
    // this command provides exactly one subsequent target-selection link.
    function openPicker(msg) {
        if (!msg.playerid || msg.playerid === 'API') return;
        var m = String(msg.content || '').trim().match(/^!cg-multi-open\s+([1-9]|10)\s+(auto|half|none|saveonly)$/i);
        if (!m) {
            whisper(msg.playerid, 'Invalid target count or save mode. Use 🔥 MULTI-TARGET SAVE🔥.');
            return;
        }
        var count = Number(m[1]), mode = m[2].toLowerCase(), targets = [];
        // A new selection cancels any unfinished one, without changing HP.
        delete data().players[msg.playerid];
        for (var i = 1; i <= count; i++) {
            targets.push('&#64;{target|Gremlin ' + i + '|token_id}');
        }
        whisper(msg.playerid, '<b>🔥 MULTI-TARGET SAVE🔥</b><br>' +
            'Selected ' + count + ' target(s). Click once below, then pick the creatures on the map:<br>' +
            '[🎯 SELECT ' + count + ' TARGET' + (count === 1 ? '' : 'S') + '](!cg-multi-select ' + mode + ' ' + targets.join(',') + ')');
    }
    function select(msg) {
        if (!msg.playerid || msg.playerid === 'API') return;
        var match = String(msg.content || '').match(/^!cg-multi-select\s+(auto|half|none|saveonly)\s+(\S+)\s*$/i);
        if (!match) { whisper(msg.playerid, 'Invalid target selection. Use 🔥 MULTI-TARGET SAVE🔥.'); return; }
        var mode = match[1].toLowerCase(), ids = match[2].split(',');
        if (!ids.length || ids.length > MAX_TARGETS || new Set(ids).size !== ids.length) {
            whisper(msg.playerid, 'Choose 1-10 distinct target tokens. Selection cancelled.'); return;
        }
        for (var i = 0; i < ids.length; i++) {
            var t = getObj('graphic', ids[i]);
            if (!t || t.get('subtype') !== 'token' || t.get('layer') !== 'objects' ||
                !t.get('represents') || !getObj('character', t.get('represents'))) {
                whisper(msg.playerid, 'Every target must be a visible, character-linked token. No targets saved.'); return;
            }
        }
        data().players[msg.playerid] = {mode:mode, ids:ids, phase:'selected', expires:Date.now()+WAIT_MS};
        whisper(msg.playerid, '🔥 ' + ids.length + ' target(s) ready. Cast a public saving-throw spell from your character sheet within 90 seconds. ' +
            'For legacy 2014 spells with no success rule, choose Half/None/Save only explicitly.');
    }
    function parse2014(msg) {
        if (msg.type !== 'general' || (msg.rolltemplate !== 'atkdmg' && msg.rolltemplate !== 'spell')) return null;
        var f = fieldsOf(msg.content), isCard = msg.rolltemplate === 'spell';
        if (!isCard && !Object.prototype.hasOwnProperty.call(f, 'save')) return null;
        // 2014 attack+save hybrid abilities need GM adjudication, not AoE automation.
        if (f.attack === '1') return {error:'Hybrid attack + save must be resolved manually.'};
        var spell = String(isCard ? f.name : f.rname || f.name || '').trim();
        if (!spell) return {error:'Spell name missing.'};
        var save = String(f.saveattr || '').trim();
        if (!save) {
            var description = String(f.description || f.desc || '');
            var matches = [], pattern = /\b(strength|dexterity|constitution|intelligence|wisdom|charisma)\s+saving\s+throw\b/gi, m;
            while ((m = pattern.exec(description)) !== null) matches.push(m[1].toLowerCase());
            if (new Set(matches).size !== 1) return {error:'Save ability is missing or ambiguous in the 2014 spell description.'};
            save = matches[0];
        }
        save = save.toLowerCase();
        if (!ABILITIES[save]) return {error:'Unsupported 2014 save ability.'};
        var ch = caster(msg, false);
        if (!ch) return {error:'Could not verify the spellcasting character and player.'};
        // Explicit per-spell DC wins; only absent DC uses the legacy sheet fallback.
        var explicit = f.savedc ? rollValue(msg, f.savedc) : null;
        if (f.savedc && explicit === null) explicit = num(f.savedc);
        if (f.savedc && explicit === null) return {error:'Spell has an invalid explicit save DC.'};
        var dc = explicit !== null ? explicit : num(getAttrByName(ch.id, 'spell_save_dc'));
        if (dc === null || dc < 1 || dc > 40) return {error:'2014 spell_save_dc is unavailable or not numeric.'};
        var components = [], parts = ['dmg1','dmg2'];
        for (var i = 0; i < parts.length; i++) {
            if (!f[parts[i]]) continue;
            var value = rollValue(msg, f[parts[i]]), type = String(f[parts[i]+'type'] || '').toLowerCase().trim();
            if (value === null || value < 0) return {error:'Damage roll is incomplete.'};
            if (value && !type) return {error:'2014 damage type is missing.'};
            if (value) components.push({type:type, value:value});
        }
        var text = String(f.savedesc || f.description || f.desc || '');
        var policy = /\bhalf\b/i.test(text) && /\b(sav|success)/i.test(text) ? 'half' :
            /\bno damage\b/i.test(text) && /\b(sav|success)/i.test(text) ? 'none' : null;
        if (!components.length && !policy) policy = 'saveonly';
        return {name:spell, dc:dc, save:save, components:components, policy:policy,
            characterId:ch.id, sheet:'2014'};
    }
    function plain(html) {
        return String(html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g,' ')
            .replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
    }
    function is2024SpellCardAction(msg) {
        if (msg.type !== 'advancedroll' || !msg.action || !Array.isArray(msg.action.args)) return false;
        var type = String(msg.action.action || ''), args = msg.action.args;
        var spellTab = /^repeating_spell-/i.test(type) && args.length === 2 && args[1] === 'spell';
        var combatTab = type === 'repeating_attack' && args.length === 2 && args[1] === 'attack';
        if (!spellTab && !combatTab) return false;
        // Combat-tab attacks can be weapons. Only treat the *spell save card*
        // as a spell: it must have 2024 chat markup and save-specific fields.
        var html = String(msg.content || '');
        return spellTab || (html.indexOf('dnd-2024--chat') >= 0 &&
            (html.indexOf('dc__name') >= 0 || html.indexOf('save-outcomes__') >= 0));
    }
    function parse2024(msg) {
        if (!is2024SpellCardAction(msg)) return null;
        var ch = caster(msg, true);
        if (!ch) return {error:'Could not verify the 2024 spellcasting character.'};
        var html = String(msg.content || '');
        if (html.indexOf('dnd-2024--chat') < 0) return {error:'Unrecognized 2024 spell card.'};
        var name = html.match(/<div class="header__title">\s*([^<>]+)\s*<\/div>/);
        var ability = html.match(/<div class="dc__name">\s*([^<>]+)\s*<\/div>/);
        var dcMatch = html.match(/<div class="dc__value">\s*DC\s+(\d+)\s*<\/div>/);
        if (!name || !ability || !dcMatch) return {error:'Spell card missing name, save ability, or DC.'};
        var save = plain(ability[1]).replace(/\s+save$/i, '').toLowerCase();
        if (!ABILITIES[save]) return {error:'Unrecognized 2024 saving throw.'};
        var dc = num(dcMatch[1]);
        if (dc === null || dc < 1 || dc > 40) return {error:'Invalid 2024 save DC.'};
        var fail = html.match(/<p class="save-outcomes__fail">\s*([\s\S]*?)<\/p>/);
        var success = html.match(/<p class="save-outcomes__success">\s*([\s\S]*?)<\/p>/);
        if (!fail || !success) return {error:'2024 success/failure save rules are missing.'};
        var failText = plain(fail[1]), successText = plain(success[1]);
        var dealsDamage = /\bdamage\b/i.test(failText);
        var policy = /\bhalf\b/i.test(successText) && /\bdamage\b/i.test(successText) ? 'half' :
            /\b(no|zero)\s+damage\b/i.test(successText) ? 'none' :
            !dealsDamage ? 'saveonly' : null;
        return {name:plain(name[1]), dc:dc, save:save, components:[],
            policy:policy, damageExpected:dealsDamage, characterId:ch.id, sheet:'2024',
            // A Combat-tab spell and its damage share an attack-row ID.
            // The Spells tab uses a different row; keep name+caster pairing there.
            combatActionId:msg.action.action === 'repeating_attack' ? msg.action.args[0] : null,
            failText:failText, successText:successText};
    }
    function verifyMatch(record, msg, spell) {
        if (!spell || spell.error) return false;
        return msg.playerid && msg.playerid !== 'API' && !expires(record) && record.phase === 'selected';
    }
    function modeFor(record, spell) {
        if (record.mode === 'auto') return spell.policy;
        return record.mode;
    }
    function begin(msg, spell) {
        var d = data(), r = d.players[msg.playerid];
        if (!r || expires(r) || r.phase !== 'selected') return;
        if (spell.error) {
            delete d.players[msg.playerid];
            whisper(msg.playerid, safe(spell.error) + ' No HP changed.'); return;
        }
        var policy = modeFor(r, spell);
        if (!policy || !/^(half|none|saveonly)$/.test(policy)) {
            delete d.players[msg.playerid];
            whisper(msg.playerid, 'Success outcome was not explicit. Choose Half/None/Save only instead of Auto. No HP changed.'); return;
        }
        if (spell.sheet === '2014' && policy !== 'saveonly' && !spell.components.length) {
            delete d.players[msg.playerid];
            whisper(msg.playerid, '2014 spell has no numeric damage roll. No HP changed.'); return;
        }
        if (spell.sheet === '2024' && spell.damageExpected && policy !== 'saveonly') {
            r.phase = 'waiting_damage';
            r.spell = spell;
            r.policy = policy;
            r.expires = Date.now()+WAIT_MS;
            whisper(msg.playerid, '🔥 ' + safe(spell.name) + ': roll its Damage from the 2024 sheet to process the saves.');
            return;
        }
        dispatch(msg.playerid, r, spell, policy, spell.components);
    }
    function damage2024(msg) {
        if (msg.type !== 'advancedroll' || !msg.action || msg.action.action !== 'repeating_attack' ||
            !Array.isArray(msg.action.args) || msg.action.args.length !== 3 ||
            msg.action.args[1] !== 'attack' || msg.action.args[2] !== 'dmg') return;
        var r = data().players[msg.playerid];
        if (!r || r.phase !== 'waiting_damage') return;
        if (expires(r)) { delete data().players[msg.playerid]; whisper(msg.playerid,'Save damage pairing expired. No HP changed.'); return; }
        if (msg.characterId !== r.spell.characterId || msg.rolledByCharacterId !== r.spell.characterId) return;
        if (r.spell.combatActionId && msg.action.args[0] !== r.spell.combatActionId) return;
        var html = String(msg.content || '');
        var title = html.match(/class="header__title header__title--damage">\s*([^<>]+)\s*<\/div>/);
        if (!title || plain(title[1]).toLowerCase() !== r.spell.name.toLowerCase()+' damage') return;
        var parsed = CombatGremlinSaveBridge.parse2024Damage(msg);
        if (!parsed) {
            delete data().players[msg.playerid];
            whisper(msg.playerid, 'Ambiguous 2024 damage roll. No HP changed.'); return;
        }
        dispatch(msg.playerid, r, r.spell, r.policy, parsed.components);
    }
    // When a successful save halves damage, halve EACH typed component and
    // round DOWN immediately. Only then apply the target's resistances,
    // immunities and vulnerabilities to the resulting typed components.
    // Components of the same type are grouped in dispatch() before this step.
    function evaluateSaveDamage(token, components, policy, success) {
        if (!success) return CombatGremlinSaveBridge.applyDefenses(token, components);
        if (policy === 'none') return {value:0, notes:[]};
        if (policy !== 'half') return {error:'Unsupported save outcome.'};
        var parts = components.map(function(part) {
            return {type:part.type, value:Math.floor(part.value / 2)};
        });
        return CombatGremlinSaveBridge.applyDefenses(token, parts);
    }
    function dispatch(playerId, record, spell, policy, components) {
        var ids = record.ids.slice();
        // Group each damage type before applying half damage or resistances.
        var grouped = {};
        components.forEach(function(part) {grouped[part.type.toLowerCase()] = (grouped[part.type.toLowerCase()] || 0) + part.value;});
        var typedParts = Object.keys(grouped).map(function(type) {return {type:type,value:grouped[type]};});
        // Preflight: ensure every token and HP can be read BEFORE any save is rolled.
        for (var i = 0; i < ids.length; i++) {
            var token = getObj('graphic', ids[i]);
            if (!token || !token.get('represents') || token.get('subtype') !== 'token' ||
                (policy !== 'saveonly' && num(token.get('bar1_value')) === null)) {
                delete data().players[playerId];
                whisper(playerId, 'Target disappeared or HP is invalid. No changes made.'); return;
            }
            if (policy !== 'saveonly') {
                var check = evaluateSaveDamage(token, typedParts, policy, false);
                var halfCheck = policy === 'half' && evaluateSaveDamage(token, typedParts, policy, true);
                if (!check || check.error || (halfCheck && halfCheck.error)) {
                    delete data().players[playerId];
                    whisper(playerId, 'Cannot calculate target damage: ' + safe((check && check.error) || (halfCheck && halfCheck.error)) + ' No HP changed.'); return;
                }
            }
        }
        var nonce = '';
        for (var n = 0; n < 6; n++) nonce += String(randomInteger(1000000)-1).padStart(6,'0');
        var r = data().players[playerId];
        r.phase = 'waiting_saves';
        r.nonce = nonce;
        r.spell = {name:spell.name, dc:spell.dc, save:spell.save, characterId:spell.characterId};
        r.policy = policy;
        r.components = typedParts;
        r.expires = Date.now()+WAIT_MS;
        var ability = spell.save.charAt(0).toUpperCase()+spell.save.slice(1);
        // 'send' produces an API message with playerid='API'. A one-time nonce,
        // exact token ordering and pending phase associate it with this cast.
        var command = '!group-check --process --ids ' + ids.join(',') + ' --' + ability +
            ' Save --send !cg-multi-result ' + nonce + ' IDS(,) RESULTS(,)';
        sendChat('Combat Gremlin', command);
        publicChat('🔥 ' + safe(spell.name) + ': ' + ids.length + ' target(s) roll ' + ability +
            ' DC ' + spell.dc + '. ' + (policy === 'saveonly' ? 'Saves only; GM handles effects.' : 'Damage calculated automatically.'));
    }
    function resolve(msg) {
        var matches = String(msg.content || '').match(/^!cg-multi-result\s+(\d{36})\s+(\S+)\s+([\s\S]+)$/);
        if (!matches || msg.playerid !== 'API') return;
        var nonce = matches[1], ids = matches[2].split(','), saves = matches[3].trim().split(',');
        var d = data();
        var pid = Object.keys(d.players).filter(function(id) {
            return d.players[id] && d.players[id].nonce === nonce && d.players[id].phase === 'waiting_saves';
        })[0];
        if (!pid) return;
        var r = d.players[pid];
        if (expires(r) || ids.length !== r.ids.length || saves.length !== ids.length ||
            ids.some(function(id,i) { return id !== r.ids[i]; })) {
            delete d.players[pid]; gm('Multi-target save response expired/mismatched. No HP changed.'); return;
        }
        var changes = [];
        for (var i = 0; i < ids.length; i++) {
            var score = num(saves[i]), token = getObj('graphic', ids[i]);
            var hp = token && num(token.get('bar1_value'));
            if (score === null || !token || !token.get('represents') ||
                (r.policy !== 'saveonly' && hp === null)) {
                delete d.players[pid]; gm('Invalid save roll or target. No HP changed.'); return;
            }
            var success = score >= r.spell.dc, amount = 0, notes = [];
            if (r.policy !== 'saveonly') {
                var damage = evaluateSaveDamage(token, r.components, r.policy, success);
                if (!damage || damage.error) {
                    delete d.players[pid]; gm('Defense data changed or ambiguous. No HP changed.'); return;
                }
                amount = damage.value;
                notes = damage.notes;
            }
            changes.push({token:token, hp:hp, score:score, success:success, amount:amount, notes:notes});
        }
        // All-or-nothing: apply only after every roll, token and defense validates.
        delete d.players[pid];
        var labels = [], gmLabels = [];
        changes.forEach(function(change) {
            var name = safe(change.token.get('name') || 'Target');
            var label = name + ' ' + change.score + ' ' + (change.success ? 'SUCCESS' : 'FAIL');
            if (r.policy !== 'saveonly') {
                var next = Math.max(0,change.hp-change.amount);
                var applied = change.hp-next;
                change.token.set('bar1_value',next);
                CombatGremlinKO.sync(change.token);
                var id = CombatGremlinSaveBridge.recordDamage(change.token,applied,'AoE '+r.spell.name);
                label += ' ' + change.amount + ' damage';
                gmLabels.push(name + ': HP ' + change.hp + ' → ' + next +
                    (change.notes.length ? ' (' + safe(change.notes.join('; ')) + ')' : '') +
                    (applied && id !== null ? ' [Undo](!cg-undo ' + id + ')' : ''));
            }
            labels.push(label);
        });
        publicChat('🔥 ' + safe(r.spell.name) + ' | ' + labels.map(function(s) {return safe(s);}).join(' | '));
        if (gmLabels.length) gm('AoE ' + safe(r.spell.name) + ': ' + gmLabels.join(' ; '));
        else gm('AoE ' + safe(r.spell.name) + ': saves only, apply effects manually.');
    }
    function handle(msg) {
        if (!msg) return;
        if (msg.type === 'api') {
            var command = String(msg.content || '').trim();
            if (/^!cg-multi-open(?:\s|$)/i.test(command)) openPicker(msg);
            else if (/^!cg-multi-menu(?:\s|$)/i.test(command) && msg.playerid !== 'API') menu(msg);
            else if (/^!cg-multi-select(?:\s|$)/i.test(command)) select(msg);
            else if (/^!cg-multi-cancel(?:\s|$)/i.test(command) && msg.playerid !== 'API') {
                delete data().players[msg.playerid]; whisper(msg.playerid,'Multi-target save cancelled.');
            } else if (/^!cg-multi-result(?:\s|$)/i.test(command)) resolve(msg);
            return;
        }
        if (!msg.playerid || msg.playerid === 'API' || msg.secret === true ||
            (msg.secrecy && msg.secrecy !== 'public')) return;
        var r = data().players[msg.playerid];
        if (!r) return;
        if (expires(r)) { delete data().players[msg.playerid]; return; }
        if (r.phase === 'waiting_damage') {
            // Another spell announcement makes the old damage pairing ambiguous.
            if (is2024SpellCardAction(msg)) {
                delete data().players[msg.playerid];
                whisper(msg.playerid, 'Another spell was cast before the previous damage roll. Select targets again; no HP changed.');
                return;
            }
            damage2024(msg); return;
        }
        if (r.phase !== 'selected') return;
        var spell = msg.type === 'advancedroll' ? parse2024(msg) : parse2014(msg);
        if (spell) begin(msg,spell);
    }
    on('ready', function () {
        data().players = {}; // never resume an unfinished spell after sandbox restart
        on('chat:message', handle);
        log('Combat Gremlin multi-target spell saves ready (1-10 tokens).');
    });
    return {handle:handle, parse2014:parse2014, parse2024:parse2024, resolve:resolve,
        isArmed:function(id) { var r=data().players[id]; return !!r && !expires(r); }};
}());


// Combat Gremlin: campaign-aware status marker menu.
// Marker names are for display only. The real Roll20 tag, including ::ID for
// uploaded markers, is resolved at runtime from the Roll20 Campaign object.
var CombatGremlinStatus = CombatGremlinStatus || (function () {
    'use strict';
    var MAX_SELECTED = 50;
    var MAX_MARKERS = 250;
    var CATEGORY_ORDER = ['Actions', 'Conditions', 'Debuffs', 'Buffs', 'Spells', 'Class Buffs', 'Status', 'Other Markers'];
    // Unrecognized campaign markers are listed under Other Markers.
    var LABEL_GROUPS = {
        'Actions': ['Concentration', 'Concentrating', 'Help Action', 'Holding Action', 'Dodge Action', 'Reaction Used'],
        'Conditions': ['Blinded', 'Charmed', 'Confused', 'Deafened', 'Frightened', 'Grappled',
            'Invisible', 'Incapacitated', 'Paralyzed', 'Petrified', 'Poisoned', 'Prone',
            'Restrained', 'Stunned', 'Unconscious'],
        'Debuffs': ['Disadvantage', 'Baned', 'Bane', 'Compelled Duel', 'Comppelled Duel',
            'Exhausted', 'Faerie Fire', 'Hex', 'Hexblades Curse', 'Marked', 'Mark',
            'Madness', 'Possessed', 'Posessed', 'Slowed'],
        'Buffs': ['Advantage', 'Blessed', 'Bless', 'Bardic Inspiration', 'Cloak of Displacement',
            'Hasted', 'Sanctuary', 'Shield of Faith'],
        'Spells': ['Bladesong', 'Death Ward', 'Divine Favor', 'DivineFavor', 'Flying',
            'Hunters Mark', 'Hunter’s Mark', 'Mirror Image', 'Mage Armor', 'Shield',
            'Warding Bond', 'Blur'],
        'Class Buffs': ['Raging', 'Reckless'],
        'Status': ['Has Healing Potion', 'Has Renown Inspiration', 'Stabilized', 'Stabelized', 'Dead', 'On Fire', 'OnFire']
    };
    function normalize(s) {
        return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    }
    function html(v) {
        return String(v == null ? '' : v).replace(/&/g,'&amp;').replace(/</g,'&lt;')
            .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    }
    function whisper(t) { sendChat('Combat Gremlin', '/w gm ' + t); }
    // The Campaign object can be unavailable while scripts are first being evaluated.
    // IMPORTANT: never call this during top-level macro-definition construction.
    var lastMarkerWarning = '';
    function warnOnce(message) {
        if (lastMarkerWarning !== message) {
            log('Combat Gremlin Status: ' + message);
            lastMarkerWarning = message;
        }
    }
    function availableMarkers() {
        var campaign;
        try {
            campaign = (typeof Campaign === 'function') ? Campaign() : null;
            if (!campaign || typeof campaign.get !== 'function') {
                warnOnce('Campaign object not ready; markers will be retried on next sync.');
                return [];
            }
            // Different Roll20 docs/engines expose token_markers or _token_markers.
            // Prefer the public field and fall back if absent or not useful.
            var raw = campaign.get('token_markers');
            if (raw == null || raw === '' || raw === '[]') {
                raw = campaign.get('_token_markers');
            }
            var list = typeof raw === 'string' ? JSON.parse(raw || '[]') : (raw || []);
            if (!Array.isArray(list)) {
                warnOnce('Campaign marker data was not an array; no markers loaded.');
                return [];
            }
            var seen = {};
            var result = list.filter(function (item) {
                if (!item || typeof item.name !== 'string' || typeof item.tag !== 'string' ||
                    !item.name.trim() || !item.tag.trim() || seen[item.tag]) return false;
                seen[item.tag] = true;
                return true;
            }).slice(0, MAX_MARKERS);
            lastMarkerWarning = '';
            return result;
        } catch (e) {
            warnOnce('Could not read Campaign marker data: ' + String(e));
            return [];
        }
    }
    function sortByName(a, b) {
        return a.name.localeCompare(b.name);
    }
    function categoryFor(marker) {
        var n = normalize(marker.name);
        for (var i=0; i<CATEGORY_ORDER.length-1; i++) {
            var group = CATEGORY_ORDER[i];
            if ((LABEL_GROUPS[group] || []).some(function(label){ return normalize(label) === n; }))
                return group;
        }
        return 'Other Markers';
    }
    // Avoid arbitrary displayed label characters interfering with ?{...|...,...}
    function safeLabel(s) {
        return String(s || '').replace(/[|,}{}\r\n]/g, ' ').replace(/\s+/g,' ').trim().slice(0, 65);
    }
    function groupedMarkers() {
        var groups = {};
        CATEGORY_ORDER.forEach(function (c) { groups[c] = []; });
        var list = availableMarkers();
        var nameCounts = {};
        list.forEach(function(m) { nameCounts[normalize(m.name)] = (nameCounts[normalize(m.name)] || 0) + 1; });
        list.forEach(function(m) {
            var label = m.name;
            if (nameCounts[normalize(m.name)] > 1) {
                label += m.tag.indexOf('::') !== -1 ? ' (custom '+ String(m.tag).split('::').pop() + ')' : ' (standard)';
            }
            groups[categoryFor(m)].push({name:label, tag:m.tag});
        });
        CATEGORY_ORDER.forEach(function(g) { groups[g].sort(sortByName); });
        return groups;
    }
    function macroAction() {
        var groups = groupedMarkers();
        var options = ['Status'];
        CATEGORY_ORDER.forEach(function(group) {
            if (!groups[group].length) return;
            options.push('--- ' + group + ' ---,ignore');
            groups[group].forEach(function (m) {
                // URL-encode IDs so that no user-provided marker name can inject
                // a pipe/comma/closing brace into the Roll20 query.
                options.push(safeLabel(m.name) + ',' + encodeURIComponent(m.tag));
            });
        });
        options.push('--- Clear ---,ignore');
        options.push('Clear all markers,clear-confirm');
        // The player's selected tokens are delivered via msg.selected; no need
        // to bind to a single @{selected|token_id} (which would break multi-select).
        return '!cg-status ?{' + options.join('|') + '}';
    }
    function selectedTokens(msg) {
        var seen = {};
        return (msg.selected || []).filter(function(sel) {
            if (!sel || sel._type !== 'graphic' || seen[sel._id]) return false;
            seen[sel._id] = true; return true;
        }).map(function(s) { return getObj('graphic',s._id); })
          .filter(function(t) { return t && t.get('subtype') === 'token'; }).slice(0,MAX_SELECTED);
    }
    function tokensFromIds(raw) {
        var seen = {};
        return String(raw || '').split(',').slice(0,MAX_SELECTED).filter(function(id) {
            if (!/^[-a-zA-Z0-9_]{5,100}$/.test(id) || seen[id]) return false;
            seen[id] = true; return true;
        }).map(function(id) { return getObj('graphic',id); })
          .filter(function(t) { return t && t.get('subtype') === 'token'; });
    }
    function ids(ts) { return ts.map(function(t){ return t.id; }).join(','); }
    function button(text, action) {
        return '<a style="display:inline-block;margin:3px;padding:4px 7px;border:1px solid #888;'+
            'background:#eee;color:#222;text-decoration:none" href="'+html(action)+'">'+html(text)+'</a>';
    }
    function toggle(tag, tokens) {
        var match = availableMarkers().filter(function(m) { return m.tag === tag; })[0];
        if (!match) { whisper('Marker not found. Run !cg-extras --sync.'); return; }
        var added=0, removed=0;
        tokens.forEach(function(token) {
            var entries = String(token.get('statusmarkers') || '').split(',').filter(Boolean);
            var had = entries.some(function(v) { return v.split('@')[0] === tag; });
            var updated = had ? entries.filter(function(v) { return v.split('@')[0] !== tag; }) : entries.concat([tag]);
            token.set('statusmarkers',updated.join(','));
            if(had) removed++; else added++;
        });
        whisper('<b>'+html(match.name)+'</b>: '+added+' added, '+removed+' removed ('+tokens.length+' tokens).');
    }
    function menu(tokens) {
        if (!tokens.length) { whisper('Select one or more tokens first.'); return; }
        var available = availableMarkers();
        if (!available.length) { whisper('No token markers found. Check the campaign marker sets.'); return; }
        var htmlButtons = available.sort(sortByName).map(function(m) {
            return button(m.name,'!cg-status toggle '+encodeURIComponent(m.tag)+' '+ids(tokens));
        }).join('');
        whisper('<div style="border:1px solid #888;background:white;padding:7px"><b>Status ('+tokens.length+' Token)</b><div>'+htmlButtons+'</div>'+button('Remove all markers ...','!cg-status clear-confirm '+ids(tokens))+'</div>');
    }
    function confirmClear(tokens) {
        if (!tokens.length) { whisper('No target tokens selected.'); return; }
        whisper('<b>Remove ALL markers from '+tokens.length+' tokens?</b> '+
            button('Yes, remove','!cg-status clear '+ids(tokens)));
    }
    function handle(msg) {
        if (!msg || msg.type !== 'api' || !playerIsGM(msg.playerid)) return;
        if (!/^!cg-status(?:\s|$)/i.test(String(msg.content || ''))) return;
        var parts = String(msg.content || '').trim().split(/\s+/);
        var cmd = parts[1] || 'menu';
        if (cmd === 'menu' && parts.length <= 2) { menu(selectedTokens(msg)); return; }
        if (cmd === 'menu' && parts[2] && parts[3]) { menu(tokensFromIds(parts[3])); return; }
        if (cmd === 'clear-confirm') {
            confirmClear(parts[2] ? tokensFromIds(parts[2]) : selectedTokens(msg)); return;
        }
        if (cmd === 'clear') {
            // Only reached by clicking the GM's explicit confirmation button.
            var targets = parts[2] ? tokensFromIds(parts[2]) : [];
            if (!targets.length) { whisper('No valid target tokens.'); return; }
            targets.forEach(function(t){ t.set('statusmarkers',''); });
            whisper('Removed all markers from '+targets.length+' tokens.'); return;
        }
        if (cmd === 'ignore') return;
        var encoded = cmd === 'toggle' ? parts[2] : cmd;
        var ts = cmd === 'toggle' && parts[3] ? tokensFromIds(parts[3]) : selectedTokens(msg);
        if (!ts.length) { whisper('Select the intended tokens before clicking.'); return; }
        var tag;
        try { tag = decodeURIComponent(encoded); } catch (_) { whisper('Invalid marker ID.'); return; }
        toggle(tag,ts);
    }
    on('ready',function(){
        on('chat:message',handle);
        log('Combat Gremlin: status dropdown and dynamic marker discovery ready.');
    });
    return {macroAction:macroAction,availableMarkers:availableMarkers};
}());

// Combat Gremlin: End Turn permissions.
(function () {
    'use strict';
    var COMMAND = /^!cg-endturn\s*$/i;
    // Guard against rapid double-clicks that might otherwise skip another turn.
    var DOUBLE_CLICK_GUARD_MS = 1800;
    var lastSuccessByPlayer = {};

    function whisper(playerId, message) {
        var p = getObj('player', playerId);
        if (!p) return;
        var name = String(p.get('_displayname') || '').replace(/["\\\r\n]/g, '').trim();
        if (!name) return;
        sendChat('Combat Gremlin', '/w "' + name + '" ' + message);
    }

    function controls(playerIds, playerId) {
        // On Roll20, "all" in controlledby really means all players can control.
        var ids = String(playerIds || '').split(',').map(function (id) { return id.trim(); });
        return ids.indexOf('all') !== -1 || ids.indexOf(playerId) !== -1;
    }

    function canEndToken(token, playerId) {
        if (!token) return false;
        var characterId = token.get('represents');
        if (characterId) {
            // A linked token gets its actual control permissions from the sheet.
            var character = getObj('character', characterId);
            return !!character && controls(character.get('controlledby'), playerId);
        }
        return controls(token.get('controlledby'), playerId);
    }

    function handle(msg) {
        if (!msg || msg.type !== 'api' || !COMMAND.test(String(msg.content || '').trim())) return;
        if (!msg.playerid || msg.playerid === 'API' || !getObj('player', msg.playerid)) return;

        var campaign = Campaign();
        if (!campaign || !campaign.get('initiativepage')) {
            whisper(msg.playerid, 'Turn tracker is not active.');
            return;
        }
        var raw = campaign.get('turnorder');
        var order;
        try {
            order = raw ? JSON.parse(raw) : [];
        } catch (e) {
            whisper(msg.playerid, 'Turn order could not be read. No changes made.');
            log('Combat Gremlin End Turn: invalid turnorder JSON: ' + e);
            return;
        }
        if (!Array.isArray(order) || order.length < 2) {
            whisper(msg.playerid, 'End Turn requires at least two entries in the turn tracker.');
            return;
        }

        var current = order[0];
        var tokenId = current && String(current.id || '');
        var isGM = playerIsGM(msg.playerid);
        if (!isGM) {
            // Custom rows / round counters have no token controller.
            if (!tokenId || tokenId === '-1' || !canEndToken(getObj('graphic', tokenId), msg.playerid)) {
                whisper(msg.playerid, 'You can only end the turn of your currently active character.');
                return;
            }
        }

        var now = Date.now();
        if (lastSuccessByPlayer[msg.playerid] && (now - lastSuccessByPlayer[msg.playerid]) < DOUBLE_CLICK_GUARD_MS) {
            whisper(msg.playerid, 'End Turn was already pressed. Please do not double-click.');
            return;
        }

        // Exactly one step: do not skip custom tracker rows or alter initiative scores.
        // No automatic round arithmetic; this also keeps other turnorder mods compatible.
        order.push(order.shift());
        try {
            campaign.set('turnorder', JSON.stringify(order));
        } catch (e) {
            whisper(msg.playerid, 'Could not update the turn tracker.');
            log('Combat Gremlin End Turn: failed setting turnorder: ' + e);
            return;
        }
        lastSuccessByPlayer[msg.playerid] = now;
        // Mod-script turnorder changes do not fire a normal campaign change event.
        // Explicitly clear this player's target and any target bound to the old turn.
        if (CombatGremlinTurnBridge.endTurn) {
            CombatGremlinTurnBridge.endTurn(msg.playerid, tokenId);
        }
        // Avoid revealing hidden GM-only NPC/token names in the public chat.
        sendChat('Combat Gremlin', '&#9197; Turn ended. Next turn.');
    }

    on('ready', function () {
        on('chat:message', handle);
        log('Combat Gremlin End Turn ready: players may advance only their current token; GM may advance any.');
    });
}());

// Combat Gremlin: macro installer and optional condition reference.
(function () {
    'use strict';
    var VERSION = '1.0.0';
    // These are the actual Collection macro names, not per-user Quickbar nicknames.
    // No spaces: Roll20 invokes Collection macros by a #name reference.
    var MACRO_NAMES = {
        init: '🎲INITIATIVE🎲',
        clear: '🧹CLEAR-INIT🧹',
        target: '🎯TARGET-MONSTER🎯',
        multi: '🔥SPELL-MULTI-SAVE🔥',
        end: '⏭END-TURN⏭',
        status: '⚙️SET-STATUS⚙️',
        rules: '📖CONDITIONS📖'
    };
    var CORE_MACROS = [
        [MACRO_NAMES.init, '!group-init', ''],
        [MACRO_NAMES.clear, '!group-init --clear', ''],
        // CG-Saves remains unchanged: this optional manual GroupCheck helper was
        // not among the seven macros approved for renaming.
        ['CG-Saves', '!group-check {{\n--?{Ability Save|Strength,Strength Save|Dexterity,Dexterity Save|Constitution,Constitution Save|Intelligence,Intelligence Save|Wisdom,Wisdom Save|Charisma,Charisma Save}\n--process\n--subheader vs DC ?{DC}\n--button SaveDamage !cg-save-damage\n~dmg [[?{Damage}]]\n~type ?{Damage on Save|Half,half|None,none}\n~DC ?{DC}\n~saves RESULTS(,)\n~ids IDS(,)\n}}', ''],
        [MACRO_NAMES.target, '!cg-target @{target|token_id}', 'all'],
        [MACRO_NAMES.multi, '!cg-multi-menu', 'all'],
        [MACRO_NAMES.end, '!cg-endturn', 'all']
    ];
    var EXTRA_MACROS = [
        [MACRO_NAMES.status, '!cg-status menu', ''],
        [MACRO_NAMES.rules, '!cg-rules ?{Condition|Blinded,Blinded|Charmed,Charmed|Deafened,Deafened|Exhaustion,Exhaustion|Frightened,Frightened|Grappled,Grappled|Incapacitated,Incapacitated|Invisible,Invisible|Paralyzed,Paralyzed|Petrified,Petrified|Poisoned,Poisoned|Prone,Prone|Restrained,Restrained|Stunned,Stunned|Unconscious,Unconscious}', '']
    ];
    // Migrate the exact old script-managed names in place, preserving the macro ID
    // and its Quickbar association where Roll20 allows this.
    var LEGACY_NAMES = {};
    LEGACY_NAMES[MACRO_NAMES.init] = ['CG-Init'];
    LEGACY_NAMES[MACRO_NAMES.clear] = ['CG-Clear'];
    LEGACY_NAMES[MACRO_NAMES.target] = ['CG-Target', '🎯 TARGET MONSTER 🎯'];
    LEGACY_NAMES[MACRO_NAMES.multi] = ['CG-MultiSave', '🔥 MULTI-TARGET SAVE🔥', '🔥 MULTI-TARGET SAVE'];
    LEGACY_NAMES[MACRO_NAMES.end] = ['CG-EndTurn', '⏭ END TURN'];
    LEGACY_NAMES[MACRO_NAMES.status] = ['CG-Status'];
    LEGACY_NAMES[MACRO_NAMES.rules] = ['CG-Rules'];
    // Optional 2024 quick reference. Original summaries based on CC BY 4.0 SRD 5.2.1.
    var RULES_2024 = {"Blinded":["You cannot see and automatically fail ability checks that require sight.","Attacks against you have Advantage; your attacks have Disadvantage."],"Charmed":["You cannot attack the charmer or target them with damaging abilities or magical effects.","The charmer has Advantage on ability checks for social interaction with you."],"Deafened":["You cannot hear and automatically fail ability checks that require hearing."],"Exhaustion":["Each instance adds one Exhaustion level (maximum 6); reaching level 6 kills you.","Your D20 Tests take a penalty of 2 per Exhaustion level.","Your Speed is reduced by 5 feet per Exhaustion level.","Finishing a Long Rest removes one level; the condition ends at level 0."],"Frightened":["You have Disadvantage on ability checks and attack rolls while the source of fear is in line of sight.","You cannot willingly move closer to the source of fear."],"Grappled":["Your Speed is 0 and cannot increase.","Your attack rolls have Disadvantage against creatures other than the grappler.","The grappler can move you, usually spending one extra foot of movement per foot moved (size exceptions apply).","You can use an action to try to escape with Athletics or Acrobatics against the grapple escape DC. The grapple also ends if the grappler is Incapacitated or you leave its reach."],"Incapacitated":["You cannot take actions, Bonus Actions, or Reactions.","Concentration ends, and you cannot speak.","You have Disadvantage on Initiative if Incapacitated when you roll it."],"Invisible":["You have Advantage on Initiative rolls while Invisible.","Effects requiring the target to be seen cannot target you unless their creator can somehow see you; worn and carried gear is concealed too.","Your attacks have Advantage, and attacks against you have Disadvantage, unless the other creature can somehow see you."],"Paralyzed":["You are Incapacitated, and your Speed is 0 and cannot increase.","You automatically fail Strength and Dexterity saving throws.","Attacks against you have Advantage. Any attack that hits you is a Critical Hit if its attacker is within 5 feet."],"Petrified":["You and nonmagical equipment become solid inanimate substance; your weight increases tenfold and you stop aging.","You are Incapacitated; your Speed is 0 and cannot increase.","Attacks against you have Advantage; you automatically fail Strength and Dexterity saving throws.","You have Resistance to all damage and Immunity to the Poisoned condition."],"Poisoned":["You have Disadvantage on attack rolls and ability checks."],"Prone":["You can crawl, or spend movement equal to half your Speed (rounded down) to stand. You cannot stand while your Speed is 0.","Your attacks have Disadvantage. Attacks against you have Advantage from within 5 feet and Disadvantage from farther away."],"Restrained":["Your Speed is 0 and cannot increase.","Attacks against you have Advantage, and your attacks have Disadvantage.","You have Disadvantage on Dexterity saving throws."],"Stunned":["You are Incapacitated.","You automatically fail Strength and Dexterity saving throws.","Attacks against you have Advantage."],"Unconscious":["You are Incapacitated and Prone, drop held items, and are unaware of your surroundings.","Your Speed is 0 and cannot increase. You remain Prone after Unconscious ends.","Attacks against you have Advantage; you automatically fail Strength and Dexterity saving throws.","Any attack that hits you is a Critical Hit if its attacker is within 5 feet."]};

    // Macro owners must be real players. An API-generated macro cannot set a user's
    // personal "In Bar" checkbox; this is a Roll20 client-side preference.
    function gmPlayers() {
        return (findObjs({ _type: 'player' }) || []).filter(function (p) {
            return playerIsGM(p.id);
        });
    }
    function isStockMultiAction(value) {
        var current = String(value || '').trim();
        return current === '!cg-multi-menu' ||
            current === '!cg-multi-open ?{How many targets?|1|2|3|4|5|6|7|8|9|10} ?{On successful save|Auto,auto|Half damage,half|No damage,none|Save only,saveonly}';
    }
    function isManagedAction(name, action, expected) {
        var actual = String(action || '').trim();
        if (name === MACRO_NAMES.multi) return isStockMultiAction(actual);
        // Status action is assembled from campaign-specific marker IDs; its
        // exact text can legitimately differ from the current sync result.
        if (name === MACRO_NAMES.status) return /^!cg-status(?:\s|$)/i.test(actual);
        // Upgrading from the older 2014 CG-Rules dropdown should update the
        // list of conditions to SRD 5.2.1 without losing the macro ID.
        if (name === MACRO_NAMES.rules) return /^!cg-rules\s+\?\{Condition\|/.test(actual);
        return actual === String(expected || '').trim();
    }
    function installFor(playerId, includeExtras, force) {
        var defs = CORE_MACROS.concat(includeExtras ? EXTRA_MACROS : []);
        var added = 0, updated = 0, kept = 0, renamed = 0;
        defs.forEach(function (d) {
            var name = d[0], action = name === MACRO_NAMES.status ? CombatGremlinStatus.macroAction() : d[1], visibleto = d[2];
            var same = (findObjs({ _type:'macro', _playerid:playerId, name:name }) || []);
            var migrated = false;
            if (!same.length && LEGACY_NAMES[name]) {
                var legacy = [];
                LEGACY_NAMES[name].forEach(function(alias) {
                    (findObjs({ _type:'macro', _playerid:playerId, name:alias }) || []).forEach(function(m) {
                        if (isManagedAction(name, m.get('action'), d[1])) legacy.push(m);
                    });
                });
                // Do not guess which macro to rename if multiple aliases exist.
                // Also do not touch a custom macro with a modified action.
                if (legacy.length === 1) {
                    legacy[0].set({name:name, action:action, visibleto:visibleto});
                    same = legacy;
                    migrated = true;
                    renamed += 1;
                } else if (legacy.length > 1) {
                    // Keep both old macros and avoid creating a third copy;
                    // the GM can remove the duplicate manually, preserving IDs.
                    kept += 1;
                    log('Combat Gremlin: multiple legacy copies of '+name+' for '+playerId+'. Rename one manually before sync; nothing changed.');
                    return;
                }
            }
            if (!same.length) {
                createObj('macro', {
                    playerid: playerId,
                    name: name,
                    action: action,
                    visibleto: visibleto,
                    istokenaction: false
                });
                added += 1;
            } else if (migrated) {
                // The rename above already refreshed the stock action.
            } else if (force || (name === MACRO_NAMES.multi && isStockMultiAction(same[0].get('action')) && String(same[0].get('action') || '').trim() !== action) || (name === 'CG-Saves' && String(same[0].get('action') || '') === action.replace('--button SaveDamage !cg-save-damage', '--button ApplyDamage !apply-damage')) || (name === MACRO_NAMES.status && /^!cg-status(?:\s|$)/.test(String(same[0].get('action') || '')) && same[0].get('action') !== action)) {
                same[0].set({ action:action, visibleto:visibleto });
                updated += 1;
            } else {
                kept += 1;
            }
        });
        return { created: added, updated: updated, kept: kept, renamed: renamed };
    }
    function whisper(s) { sendChat('Combat Gremlin', '/w gm ' + s); }
    function html(s) {
        return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
    function handle(msg) {
        if (!msg || msg.type !== 'api' || !playerIsGM(msg.playerid)) return;
        var input = String(msg.content || '').trim();
        if (/^!cg-(?:install|extras)(?:\s+--sync)?$/i.test(input)) {
            var includeExtras = /^!cg-extras/i.test(input);
            var force = /--sync$/i.test(input);
            var result = installFor(msg.playerid, includeExtras, force);
            whisper('Macros: '+result.created+' created, '+result.renamed+' renamed, '+result.updated+' updated, '+result.kept+' unchanged. '+
                    'Open Collections and select "In Bar" once. '+
                    (includeExtras ? 'Status and Rules installed.' : 'Optional Status/Rules: !cg-extras. To refresh CG-Status: !cg-extras --sync.'));
            return;
        }
        if (/^!cg-help$/i.test(input)) {
            whisper('Combat Gremlin '+VERSION+' | '+
                    '<b>'+MACRO_NAMES.init+'</b>: !group-init | <b>'+MACRO_NAMES.clear+'</b>: !group-init --clear | '+
                    '<b>CG-Saves</b>: GM manual GroupCheck | <b>'+MACRO_NAMES.target+'</b>: Select a target. '+
                    '<b>'+MACRO_NAMES.multi+'</b>: Choose 1-10 targets for a spell save, then cast from the sheet. '+
                    '<b>'+MACRO_NAMES.end+'</b>: End only the current controlled turn (GM override). '+
                    'Refresh macros/markers: !cg-extras --sync. '+
                    'Targets persist until changed or turn end; !cg-cancel clears yours. '+
                    'Opportunity attacks/reactions outside your turn are allowed. '+
                    '2024 critical damage and typed multi-part damage supported. Simple 2014/2024 NPC defenses automated; GM diagnostics: !cg-defdiag.');
            return;
        }
        if (/^!cg-rules(?:\s+(.+))?$/i.test(input)) {
            var requested = input.replace(/^!cg-rules\s*/i,'').trim();
            var data = RULES_2024[requested];
            if (!data) { whisper('Unknown condition. Use the '+MACRO_NAMES.rules+' button.'); return; }
            sendChat('Combat Gremlin', '<div style="border:1px solid #999;background:#fff;padding:6px">'+
                '<b>Condition: '+html(requested)+'</b> (2024 SRD 5.2.1 quick reference)<ul><li>'+
                data.map(html).join('</li><li>')+'</li></ul><small>Condition summary for play; specific effects determine duration and removal.</small></div>');
        }
    }
    on('ready', function () {
        gmPlayers().forEach(function(p) {
            var result = installFor(p.id, true, false);
            log('Combat Gremlin '+VERSION+': '+result.created+' macros created for '+p.id+'.');
        });
        on('chat:message', handle);
        log('Combat Gremlin '+VERSION+': Core + macros ready. Status markers resolved during sync.');
    });
}());


