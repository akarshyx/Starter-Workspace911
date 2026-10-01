---
name: Telegram gift upgrades
description: Official Bot API semantics for listing and sending collectible gifts with a bot's Stars.
---

Use `getAvailableGifts` to read the live catalog. A gift is upgradeable when `upgrade_star_count` is present and positive; its full cost is `star_count + upgrade_star_count`. Sending the upgraded gift uses `sendGift` with `pay_for_upgrade: true`.

**Why:** Treating upgradeability as if a gift were already collectible can recommend the wrong items or misstate what the Stars purchase does.

**How to apply:** Keep upgradeability separate from cost in the UI, re-check balance and stock immediately before sending, and require an explicit approval for each Stars-spending call.