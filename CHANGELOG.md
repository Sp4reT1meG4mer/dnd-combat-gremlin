# Changelog

## v1.0.0 · Initial public release · 2026-11-10

Initial public release of Combat Gremlin for Roll20 Pro (D&D 5e 2014 + 2024 character sheets).

- Single-target AC attacks with damage handling, Advantage/Disadvantage, supported critical damage, multiple typed damage components, NPC defenses, and DM Undo.
- GroupCheck-driven saving throw spells against 1–10 selected targets, including 2014/2024 Fireball, Hold Person, and 2024 Meteor Swarm.
- Per-type damage rounding: **save first**, `Math.floor` per type, then resistance/immunity/vulnerability and final HP adjustment.
- Silence false attack parser warnings for recognized 2024 saving-throw spell announcement cards. Multi-Save remains independent of Single Target.
- Quickbar macro setup, safe ASCII internal names, initiative helpers, End Turn, optional status-marker menus and legacy condition reference.
- Automatic red X at 0 HP, bundled TokenNameNumber v0.5.12, and per-cast DM Undo links where supported.
- Validated with 17 automated mixed-damage tests, 10 attack/save routing tests, and live player-to-DM Roll20 tests including 2024 Meteor Swarm against three monster types.

Only release/version metadata and documentation were changed relative to the final tested v1.0.5 alpha; the combat logic is unchanged.
