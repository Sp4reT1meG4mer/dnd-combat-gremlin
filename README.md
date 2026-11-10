# Combat Gremlin 👹

**Roll20 combat automation for D&D 5e (2014 and 2024 character sheets).**

Combat Gremlin is a single custom Roll20 Mod script that helps players and DMs resolve attacks and spell saving throws without repeatedly checking AC, adjusting hit points, or doing resistance math by hand. It handles **single-target attacks** and **saving-throw spells against 1–10 targets**, with transparent chat results and **DM-only Undo** for automated damage.

> **Version 1.0.0** · Roll20 Pro Mod API · Tested with the Roll20 D&D 5e 2014 and 2024 sheets. This is a community project, not an official Roll20 or D&D product.

## What it does

- **Single-target attacks:** Pick a monster with `CG-Target`, then roll from the character sheet. The Gremlin checks AC and applies supported damage to **Bar 1 HP**. Includes 2024 advantage/disadvantage, critical-hit and multi-component damage handling.
- **Multi-target spell saves:** `CG-MultiSave` lets you choose **1–10 creatures**, then cast a saving-throw spell from the character sheet. GroupCheck rolls the saves; the Gremlin compares them with the spell DC and applies damage to each target.
- **Damage defenses:** Accounts for supported Resistance, Immunity, and Vulnerability from NPC sheets. Mixed damage types (such as **Fire + Bludgeoning** from *Meteor Swarm*) remain separate.
- **Round down at every halving:** On a successful save, each grouped damage type is halved and **rounded down** first; then Resistance is applied to that type and **rounded down again**. This is Combat Gremlin's explicitly chosen per-type rounding convention.
- **Quality-of-life:** DM-only Undo links, automatic red X at 0 HP, numbered monster tokens (bundled TokenNameNumber), an End Turn button, and optional status-marker/2014-condition reference macros.
- **Off-turn actions still work:** Opportunity attacks, reactions, and readied attacks are **not** blocked by a hard active-turn lock.

The script does **not** automatically apply spell conditions such as Paralyzed, determine areas of effect, or adjudicate every possible feature, damage formula, or unusual stat block. The DM remains the final referee.

## Requirements

- **Roll20 Pro** subscription with access to **Mod Scripts** (formerly API Scripts).
- Roll20 **D&D 5e (2014 or 2024) character sheets** for the supported attack/spell workflows.
- Install these two **separate Roll20 Mod scripts** via the Roll20 Mod library:
  - **GroupCheck** (used to roll multiple saves; tested with v1.15).
  - **GroupInitiative** (for the included initiative and clear-initiative macros; tested with v0.9.42).

`TokenNameNumber` v0.5.12 is **already bundled** inside `CombatGremlin.js`. **Do not install a second TokenNameNumber copy** alongside Combat Gremlin. TokenMod is not required by Combat Gremlin.

## Install (custom Mod Script)

1. **Duplicate or back up your Roll20 game** before installing/updating.
2. Open **Settings → Mod (API) Scripts** for your game.
3. Make sure **GroupCheck** and **GroupInitiative** are installed and enabled.
4. Create **one** custom script named `Combat Gremlin`; paste the **entire** contents of [`CombatGremlin.js`](CombatGremlin.js).
5. **Remove/disable older Combat Gremlin scripts** so only one version is running. Restart the Mod sandbox.
6. As GM, type `!cg-help` to check the installation. Combat Gremlin installs the core GM macros on ready; if needed run `!cg-install` to install them again.
7. In Roll20 **Collections**, enable the macros you want with **In Bar**. Roll20 stores each player's personal Quickbar setup, so the player may have to enable or rename buttons on their own account.

**Important:** Keep the macro **internal names** `CG-Target`, `CG-MultiSave`, `CG-EndTurn`. Quickbar nicknames can use emojis or spaces, but renaming the underlying macro names can break Roll20's `#macro` invocation.

## How to play

### 🎯 Single-target attack

1. Click `CG-Target` (you may nickname it **🎯 TARGET MONSTER 🎯**).
2. Click the NPC token you want to attack.
3. Roll an attack from your **2014 or 2024 character sheet** and, when the 2024 sheet requires it, click its separate damage roll.
4. Read the hit/miss, damage type, defense adjustment, and HP changes in chat. GM receives an **Undo** link where supported.

Targets can persist until changed or turn end. Legitimate **off-turn** attacks are allowed.

### 🔥 Saving throw spell against multiple targets

1. Click `CG-MultiSave` (suggested nickname **🔥 MULTI-TARGET SAVE🔥**).
2. Choose the number of targets (**1–10**) from the chat menu and the outcome on a successful save: `Auto`, `Half`, `None`, or `Save only`.
3. Click each target token in Roll20.
4. Cast a supported **saving-throw spell** from the character sheet. For 2024 spells, roll **Damage** from the spell card when prompted.
5. Combat Gremlin asks GroupCheck to roll each save and then reports each creature's result, damage, and HP change. The DM can use **Undo**.

- **Auto** reads the 2024 spell card's on-success instructions when supported.
- **Half / None** let you supply the appropriate outcome, including for **2014 spells** whose template omits it.
- **Save only** rolls saves without changing HP, useful for spells such as *Hold Person*.

You do **not** need to select `CG-Target` to use Multi-Target Save, even for a single creature. They are separate workflows.

### ☄️ Example: mixed damage with rounding

*Meteor Swarm* rolls **62 Fire + 75 Bludgeoning** damage:

| Creature / result | Calculation | Damage |
| --- | --- | ---: |
| No defenses, failed save | 62 + 75 | **137** |
| No defenses, successful save | floor(62/2) + floor(75/2) = 31 + 37 | **68** |
| Fire immune and Bludgeoning resistant, failed save | 0 + floor(75/2) | **37** |
| Fire resistant, failed save | floor(62/2) + 75 | **106** |

The example above was verified in Roll20 using a player login and checked from the DM side. This is the script's deliberate **per-damage-type rounding convention**, rather than redistributing fractional damage between types.

## Macro/command reference

| Macro / command | What it does |
| --- | --- |
| `CG-Target` / `!cg-target @{target|token_id}` | Choose a persistent single target for attacks. |
| `CG-MultiSave` / `!cg-multi-menu` | Open the 1–10-target spell save workflow. |
| `CG-EndTurn` / `!cg-endturn` | Advance turn order with player/DM restrictions. |
| `CG-Init` | Call GroupInitiative to roll initiative. |
| `CG-Clear` | Clear initiative via GroupInitiative. |
| `CG-Saves` | GM manual GroupCheck + fixed-damage helper; separate from automatic spell parsing. |
| `!cg-help` | Show the built-in help (GM). |
| `!cg-install` | Install/refresh missing core macros (GM). |
| `!cg-extras` | Install optional status-marker and 2014 condition reference macros (GM). |
| `!cg-extras --sync` | Refresh optional macros/marker definitions (GM). |
| `!cg-cancel` | Clear your sticky attack target. |
| `!cg-defdiag @{target|token_id}` | DM diagnostic for NPC damage defenses. |

**Undo:** Use the **DM Undo** / **Undo** link on the Gremlin's chat message. The standalone `CG-Saves` manual helper does **not** provide the same automated Undo.

## Troubleshooting and limitations

- **No damage applied?** Ensure the target is an actual **token on the Objects layer**, with a **numeric Bar 1 HP** value and a represented character configured for the defense/AC data you want read.
- **2024 attack/spell card appears, but no damage?** Some 2024 sheets require a **separate Damage click** after casting or attacking. For AoE saves, wait for the Gremlin prompt before rolling damage.
- **Wrong or missing save results?** Verify GroupCheck is installed and configured for the active character-sheet generation. The Gremlin intentionally cancels on ambiguous parses or unsupported target data instead of guessing.
- **Macro prints `# ...` into chat?** Use safe **internal macro names** (`CG-Target`, `CG-MultiSave`, `CG-EndTurn`) and set cosmetic emojis only as Quickbar nicknames.
- **Conditions?** Save-only spells report rolls; they do **not** apply conditions automatically. The optional condition lookup is a **legacy 2014 reference**, not a 2024 rules oracle.
- **Sheet differences:** Not every custom/homebrew sheet, uncommon damage formula, or edge-case stat block is supported. Roll20 can change its sheet event format. Report reproducible problems with the spell/attack name, sheet generation, expected outcome, and a sanitized console log.
- **Security & privacy:** Only share **sanitized** Mod console logs publicly; they may otherwise contain player names, character IDs or game identifiers.

## Development and tests

No npm dependencies or build step are needed. The production script is plain JavaScript for Roll20's Mod API.

```bash
node --check CombatGremlin.js
node tests/rounding.test.cjs
node tests/save-card-routing.test.cjs
```

The two test scripts cover **17 per-type save/damage scenarios** and **10 attack/save-card routing scenarios**. Those tests use mocked Roll20 objects. Key 2024 attacks and Meteor Swarm saves (including player vs. DM permissions and special defenses) have additionally been tested in a real Roll20 game. Testing cannot guarantee compatibility with every campaign setup.

## License and credits

- The **Combat Gremlin original project code** is offered under the **MIT License**, see [`LICENSE`](LICENSE).
- The bundled **TokenNameNumber v0.5.12** is by **The Aaron (Arcane Scriptomancer)**, adapted from the Roll20 API community script. Its attribution and the upstream MIT license are preserved separately.
- The optional **2014 condition summaries/reference excerpts** include material from **SRD 5.1**, available under **CC BY 4.0**. See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) for the attribution and license references.

Not affiliated with or endorsed by **Roll20**, **Wizards of the Coast**, or **Dungeons & Dragons**.
