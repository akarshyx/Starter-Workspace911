---
name: Telegram bot Stars spending
description: Premium gifting and safe routing for incoming Telegram bot commands.
---

Telegram bots can gift Premium directly with the Bot API method `giftPremiumSubscription`; this uses the bot's Stars balance and does not require a personal-account API session. Incoming commands are delivered through either a webhook or `getUpdates` polling, not both. Switching to polling with `deleteWebhook` replaces any existing webhook, so preserve pending updates and migrate any commands that must remain available.

**Why:** A bot's Stars balance is shared, and a gift send is a paid action. An unrestricted command can let any chat sender spend it; retrying a timed-out send can also risk a duplicate.

**How to apply:** Gate paid commands by a configured owner Telegram user ID, check the live Stars balance before sending, state the charge before collecting the recipient ID, and avoid automatic retries when Telegram's send result is uncertain.