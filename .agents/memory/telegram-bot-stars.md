---
name: Telegram bot Stars spending
description: Premium gifting and safe routing for incoming Telegram bot commands.
---

Telegram bots can gift Premium directly with the Bot API method `giftPremiumSubscription`; this uses the bot's Stars balance and does not require a personal-account API session. Incoming commands are delivered through either a webhook or `getUpdates` polling, not both. Switching to polling with `deleteWebhook` replaces any existing webhook, so preserve pending updates and migrate any commands that must remain available. The Premium gift method reports success, but Bot API cannot retrieve or screenshot the recipient's private Telegram chat.

**Why:** A bot's Stars balance is shared, and a gift send is a paid action. An unrestricted command can let any chat sender spend it; retrying a timed-out send can also risk a duplicate. Claiming an app-generated image is a real screenshot of the recipient's chat would be misleading.

**How to apply:** Gate paid commands by a configured owner Telegram user ID, check the live Stars balance before sending, state the charge before collecting the recipient ID, and avoid automatic retries when Telegram's send result is uncertain. Send a text receipt or a clearly labeled generated receipt card, never a purported recipient-chat screenshot.