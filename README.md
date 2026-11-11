# Combat Gremlin 👹

**Roll20 combat automation for D&D 5e (2014 and 2024 character sheets).**

Combat Gremlin is a single custom Roll20 Mod script that helps players and DMs resolve attacks and spell saving throws without repeatedly checking AC, adjusting hit points, or doing resistance math by hand. It handles **single-target attacks** and **saving-throw spells against 1–10 targets**, with transparent chat results and **DM-only Undo** for automated damage.

> **Version 1.0.0 · Initial public release · 2026-11-11** · Roll20 Pro Mod API · Tested with the Roll20 D&D 5e 2014 and 2024 sheets. This is a community project, not an official Roll20 or D&D product.

## What it does

- **Single-target attacks:** Pick a monster with `🎯TARGET-MONSTER🎯`, then roll from the character sheet. The Gremlin checks AC and applies supported damage to **Bar 1 HP**. Includes 2024 advantage/disadvantage, critical-hit and multi-component damage handling.
- **Multi-target spell saves:** `🔥SPELL-MULTI-SAVE🔥` lets you choose **1–10 creatures**, then cast a saving-throw spell from the character sheet. GroupCheck rolls the saves; the Gremlin compares them with the spell DC and applies damage to each target.
- **Damage defenses:** Accounts for supported Resistance, Immunity, and Vulnerability from NPC sheets. Mixed damage types (such as **Fire + Bludgeoning** from *Meteor Swarm*) remain separate.
- **Round down at every halving:** On a successful save, each grouped damage type is halved and **rounded down** first; then Resistance is applied to that type and **rounded down again**. This is Combat Gremlin's explicitly chosen per-type rounding convention.
- **Quality-of-life:** DM-only Undo links, automatic red X at 0 HP, numbered monster tokens (bundled TokenNameNumber), an End Turn button, and optional status-marker and **2024 condition quick-reference** macros.
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
3. Make sure **GroupCheck** and **GroupInitiative** are installed and enabled. **Configure GroupCheck before testing saves:**
   - When asked for a **character-sheet preset**, choose **Standard Roll20 D&D 5e (2014)**, not the 2024 preset.
   - In **GroupCheck's check configuration**, also **import the built-in `5E-OGL` checks data set**. Choosing the sheet preset alone is not enough if GroupCheck says there are no checks defined.
   - Confirm GroupCheck displays **`Data set 5E-OGL imported.`** This is the confirmation seen in our tested Roll20 setup.

   **Important:** These are **GroupCheck configuration choices only**. They do **not** prevent players from using supported **2024 character sheets** with Combat Gremlin.
4. Create **one** custom script named `Combat Gremlin`; paste the **entire** contents of [`CombatGremlin.js`](CombatGremlin.js).
5. **Remove/disable older Combat Gremlin scripts** so only one version is running. Restart the Mod sandbox.
6. As GM, type `!cg-help` to check the installation. Combat Gremlin installs the core GM macros on ready; if needed run `!cg-install` to install them again.
7. As GM, run **`!cg-extras --sync` once** after installing or updating. This migrates old script-managed Collection macros to the new decorated names and refreshes campaign-specific status markers and the `📖CONDITIONS📖` 2024 list (including Exhaustion).
8. In Roll20 **Collections**, enable the macros you want with **In Bar**. Roll20 stores each player's personal Quickbar setup, so each player must still enable their own buttons. Existing personally customized Quickbar nicknames may remain until the player removes or changes that nickname.

**Decorated macro names:** The names below are the **actual no-space Roll20 Collection macro names**, not just personal Quickbar nicknames. Their underlying Mod commands (`!cg-*`) remain unchanged. The seven names were confirmed visible in a live Roll20 game, and the renamed **status-marker** and **2024 condition** macros were used successfully. The other macro actions retain the previously tested commands; as always, test your setup in a duplicate game before using it at a table. If a macro ever prints `#name` into chat instead of executing, try its documented `!cg-*` action directly and report the exact name and steps.

## How to play

### 🎯 Single-target attack

1. Click `🎯TARGET-MONSTER🎯`.
2. Click the NPC token you want to attack.
3. Roll an attack from your **2014 or 2024 character sheet** and, when the 2024 sheet requires it, click its separate damage roll.
4. Read the hit/miss, damage type, defense adjustment, and HP changes in chat. GM receives an **Undo** link where supported.

Targets can persist until changed or turn end. Legitimate **off-turn** attacks are allowed.

### 🔥 Saving throw spell against multiple targets

1. Click `🔥SPELL-MULTI-SAVE🔥`.
2. Choose the number of targets (**1–10**) from the chat menu and the outcome on a successful save: `Auto`, `Half`, `None`, or `Save only`.
3. Click each target token in Roll20.
4. Cast a supported **saving-throw spell** from the character sheet. For 2024 spells, roll **Damage** from the spell card when prompted.
5. Combat Gremlin asks GroupCheck to roll each save and then reports each creature's result, damage, and HP change. The DM can use **Undo**.

- **Auto** reads the 2024 spell card's on-success instructions when supported.
- **Half / None** let you supply the appropriate outcome, including for **2014 spells** whose template omits it.
- **Save only** rolls saves without changing HP, useful for spells such as *Hold Person*.

You do **not** need to select `🎯TARGET-MONSTER🎯` to use Multi-Target Save, even for a single creature. They are separate workflows.

### 🛡️ Optional condition quick reference (2024)

Run `!cg-extras --sync` as GM after upgrading, then use `📖CONDITIONS📖` from Collections/Quickbar. Choose one of the **15 2024 conditions**, including Exhaustion. The response is a brief **SRD 5.2.1 summary** for tabletop reference only. `⚙️SET-STATUS⚙️` still handles markers separately; neither helper changes character-sheet statistics or automatically enforces a condition.

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
| `🎯TARGET-MONSTER🎯` / `!cg-target @{target|token_id}` | Choose a persistent single target for attacks. |
| `🔥SPELL-MULTI-SAVE🔥` / `!cg-multi-menu` | Open the 1–10-target spell save workflow. |
| `⏭END-TURN⏭` / `!cg-endturn` | Advance turn order with player/DM restrictions. |
| `🎲INITIATIVE🎲` | Call GroupInitiative to roll initiative. |
| `🧹CLEAR-INIT🧹` | Clear initiative via GroupInitiative. |
| `CG-Saves` (unchanged) | GM manual GroupCheck + fixed-damage helper; separate from automatic spell parsing. |
| `⚙️SET-STATUS⚙️` | GM-only dropdown to assign or remove campaign-specific token status markers. |
| `📖CONDITIONS📖` | GM-only 2024 SRD 5.2.1 condition reference. |
| `!cg-help` | Show the built-in help (GM). |
| `!cg-install` | Install/refresh missing core macros (GM). |
| `!cg-extras` | Install optional status-marker and **2024 condition reference** macros (GM). |
| `!cg-extras --sync` | Rename stock old Collection macros in place, and refresh the optional marker dropdown and 2024 condition reference (GM). |
| `!cg-cancel` | Clear your sticky attack target. |
| `!cg-defdiag @{target|token_id}` | DM diagnostic for NPC damage defenses. |

**Undo:** Use the **DM Undo** / **Undo** link on the Gremlin's chat message. The standalone `CG-Saves` manual helper does **not** provide the same automated Undo.

## Troubleshooting and limitations

- **No damage applied?** Ensure the target is an actual **token on the Objects layer**, with a **numeric Bar 1 HP** value and a represented character configured for the defense/AC data you want read.
- **2024 attack/spell card appears, but no damage?** Some 2024 sheets require a **separate Damage click** after casting or attacking. For AoE saves, wait for the Gremlin prompt before rolling damage.
- **GroupCheck says “There are no checks defined”?** Import its built-in **`5E-OGL` checks data set**. Look for **`Data set 5E-OGL imported.`** in chat after the import.
- **Wrong or missing save results?** Check **both** GroupCheck settings: the **Standard Roll20 D&D 5e (2014)** sheet preset (not 2024) **and** the imported **`5E-OGL` checks data set**. This GroupCheck setup was used in our tested save workflow even with 2024 character sheets. Combat Gremlin intentionally cancels on ambiguous parses or unsupported target data instead of guessing.
- **Macro prints `# ...` into chat?** Check that the Collection macro name has **no spaces**, and that your Quickbar button references the actual macro rather than a custom chat alias. You can run the documented ASCII `!cg-*` Mod action directly as a fallback. Personal Quickbar nicknames are independent of Collection macro names.
- **Conditions?** Save-only spells report rolls; they do **not** apply conditions automatically. The optional `📖CONDITIONS📖` lookup summarizes the **2024 rules (SRD 5.2.1)**; it does not enforce conditions or override the DM.
- **Sheet differences:** Not every custom/homebrew sheet, uncommon damage formula, or edge-case stat block is supported. Roll20 can change its sheet event format. Report reproducible problems with the spell/attack name, sheet generation, expected outcome, and a sanitized console log.
- **Security & privacy:** Only share **sanitized** Mod console logs publicly; they may otherwise contain player names, character IDs or game identifiers.

## Development and tests

No npm dependencies or build step are needed. The production script is plain JavaScript for Roll20's Mod API.

```bash
node --check CombatGremlin.js
node tests/rounding.test.cjs
node tests/save-card-routing.test.cjs
node tests/conditions-2024.test.cjs
node tests/macro-names.test.cjs
```

The combat tests cover **17 per-type save/damage scenarios** and **10 attack/save-card routing scenarios**. `tests/conditions-2024.test.cjs` checks the optional 2024 condition reference. `tests/macro-names.test.cjs` has **10 tests** for installation, migration, idempotence, existing macro IDs, permissions and backward compatibility. These are local simulations using mocked Roll20 objects. In an actual Roll20 game, single-target combat, multi-target *Meteor Swarm* saves with different defenses, GM Undo, the Collection emoji names, status markers and the 2024 conditions reference have been exercised. Not every macro and sheet variation has received a separate live regression test; testing cannot guarantee compatibility with every campaign.

## License and credits

- The **Combat Gremlin original project code** is offered under the **MIT License**, see [`LICENSE`](LICENSE).
- The bundled **TokenNameNumber v0.5.12** is by **The Aaron (Arcane Scriptomancer)**, adapted from the Roll20 API community script. Its attribution and the upstream MIT license are preserved separately.
- The optional **2024 condition summaries** are adapted from **SRD 5.2.1**, available under **CC BY 4.0** (not OGL 1.0a). See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) for the attribution and license references.

Not affiliated with or endorsed by **Roll20**, **Wizards of the Coast**, or **Dungeons & Dragons**.
