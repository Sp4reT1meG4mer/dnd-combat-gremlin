# Changelog

## v1.0.0 · Initial release · 2026-11-11

- Rename the seven agreed Collection macros to the no-space display names: 🎯TARGET-MONSTER🎯, 🔥SPELL-MULTI-SAVE🔥, ⏭END-TURN⏭, ⚙️SET-STATUS⚙️, 📖CONDITIONS📖, 🎲INITIATIVE🎲, 🧹CLEAR-INIT🧹.
- Migrate stock `CG-*` Collection macros in place (same Roll20 macro ID) when exactly one managed legacy macro matches. Prior spaced decorative variants are recognized; modified custom actions are not overwritten. Do not silently delete ambiguous duplicates.
- Keep underlying macro actions, combat math, saving throws, status-marker logic, 2024 condition text, and undo unchanged. The separate `CG-Saves` manual GroupCheck helper was not included in the seven names and stays unchanged.
- Added 10 Roll20-mock macro installer tests. Core combat 17/17 and routing 10/10 regressions pass. The seven new names were observed in live Roll20 Collections, with status-marker and conditions macros working on the new names.

### Combat engine and feature set

Initial public release of Combat Gremlin for Roll20 Pro (D&D 5e 2014 + 2024 character sheets).

- Single-target AC attacks with damage handling, Advantage/Disadvantage, supported critical damage, multiple typed damage components, NPC defenses, and DM Undo.
- GroupCheck-driven saving throw spells against 1–10 selected targets, including 2014/2024 Fireball, Hold Person, and 2024 Meteor Swarm.
- Per-type damage rounding: **save first**, `Math.floor` per type, then resistance/immunity/vulnerability and final HP adjustment.
- Silence false attack parser warnings for recognized 2024 saving-throw spell announcement cards. Multi-Save remains independent of Single Target.
- Quickbar macro setup, no-space emoji Collection names and unchanged ASCII `!cg-*` actions, initiative helpers, End Turn, optional status-marker menus and 2024 SRD 5.2.1 condition summaries (including Exhaustion).
- Automatic red X at 0 HP, bundled TokenNameNumber v0.5.12, and per-cast DM Undo links where supported.
- Validated with 17 automated mixed-damage tests, 10 attack/save routing tests, and live player-to-DM Roll20 tests including 2024 Meteor Swarm against three monster types.

The pre-publication condition reference was updated from legacy 2014 text to 2024 SRD 5.2.1. Combat damage, targeting, save handling, marker handling, and Undo logic are unchanged.
