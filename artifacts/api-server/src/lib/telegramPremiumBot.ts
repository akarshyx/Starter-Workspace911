import { logger } from "./logger";

const TELEGRAM_API = "https://api.telegram.org";
const POLL_TIMEOUT_SECONDS = 25;

type PremiumPlan = {
  months: number;
  starCost: number;
};

const PREMIUM_PLANS: Record<string, PremiumPlan> = {
  "/premium": { months: 3, starCost: 1000 },
  "/premium_year": { months: 12, starCost: 2500 },
};

type TelegramEnvelope<T> = {
  ok: boolean;
  result?: T;
  error_code?: number;
};

type TelegramStarBalance = {
  amount: number;
};

type TelegramUpdate = {
  update_id: number;
  message?: {
    from?: { id: number };
    chat: { id: number; type: string };
    text?: string;
  };
};

class TelegramBotApiError extends Error {
  constructor(
    readonly telegramStatus?: number,
    readonly outcomeMayBeUnknown = false,
  ) {
    super("Telegram Bot API request failed.");
    this.name = "TelegramBotApiError";
  }
}

async function telegramCall<T>(
  token: string,
  method: string,
  body?: Record<string, unknown>,
  timeoutMs = 15_000,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new TelegramBotApiError(undefined, true);
  }

  const envelope = (await response.json().catch(() => null)) as
    | TelegramEnvelope<T>
    | null;
  if (
    !response.ok ||
    !envelope ||
    envelope.ok !== true ||
    envelope.result === undefined
  ) {
    throw new TelegramBotApiError(
      envelope?.error_code ?? response.status,
      response.status >= 500,
    );
  }

  return envelope.result;
}

function parseTelegramId(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function commandName(text: string): string {
  const firstWord = text.trim().split(/\s+/, 1)[0] ?? "";
  return (firstWord.split("@", 1)[0] ?? "").toLowerCase();
}

async function sendMessage(
  token: string,
  chatId: number,
  text: string,
): Promise<void> {
  await telegramCall(token, "sendMessage", {
    chat_id: chatId,
    text,
  });
}

async function sendPremiumGift(
  token: string,
  ownerChatId: number,
  recipientId: number,
  plan: PremiumPlan,
): Promise<void> {
  let balance: TelegramStarBalance;
  try {
    balance = await telegramCall<TelegramStarBalance>(
      token,
      "getMyStarBalance",
    );
  } catch {
    await sendMessage(
      token,
      ownerChatId,
      "I couldn't check the bot's Stars balance, so no gift was sent. Try again in a moment.",
    );
    return;
  }

  if (
    !Number.isSafeInteger(balance.amount) ||
    balance.amount < plan.starCost
  ) {
    await sendMessage(
      token,
      ownerChatId,
      `A ${plan.months}-month Premium gift costs ${plan.starCost.toLocaleString()} Stars. The bot has ${Number.isSafeInteger(balance.amount) ? balance.amount.toLocaleString() : "an unavailable"} Stars, so nothing was sent.`,
    );
    return;
  }

  try {
    const sent = await telegramCall<boolean>(
      token,
      "giftPremiumSubscription",
      {
        user_id: recipientId,
        month_count: plan.months,
        star_count: plan.starCost,
      },
      20_000,
    );

    if (!sent) {
      await sendMessage(
        token,
        ownerChatId,
        "Telegram did not confirm the Premium gift. Check the bot chat before trying again.",
      );
      return;
    }
  } catch (error) {
    if (
      error instanceof TelegramBotApiError &&
      error.outcomeMayBeUnknown
    ) {
      await sendMessage(
        token,
        ownerChatId,
        "I couldn't confirm the result with Telegram. Check the recipient's chat before retrying, in case the gift went through.",
      );
      logger.warn(
        { method: "giftPremiumSubscription" },
        "Telegram Premium gift result could not be confirmed",
      );
      return;
    }

    await sendMessage(
      token,
      ownerChatId,
      "Telegram rejected the Premium gift request. Check the recipient ID and try again; no successful send was confirmed.",
    );
    logger.warn(
      {
        method: "giftPremiumSubscription",
        telegramStatus:
          error instanceof TelegramBotApiError
            ? error.telegramStatus
            : undefined,
      },
      "Telegram rejected a Premium gift request",
    );
    return;
  }

  await sendMessage(
    token,
    ownerChatId,
      `The ${plan.months}-month Telegram Premium gift was sent successfully to user ID ${recipientId}. ${plan.starCost.toLocaleString()} Stars used.`,
  );
  logger.info(
    { months: plan.months, starCost: plan.starCost },
    "Telegram Premium gift sent",
  );
}

async function handleUpdate(
  token: string,
  ownerId: number,
  update: TelegramUpdate,
  awaitingRecipientId: Map<number, PremiumPlan>,
): Promise<void> {
  const message = update.message;
  const senderId = message?.from?.id;
  const text = message?.text?.trim();
  if (!message || !Number.isSafeInteger(senderId) || !text) return;

  const command = commandName(text);
  if (senderId !== ownerId) {
    if (command in PREMIUM_PLANS) {
      await sendMessage(
        token,
        message.chat.id,
        "Only the bot owner can use Premium gifting.",
      );
    }
    return;
  }

  if (message.chat.type !== "private") {
    if (command in PREMIUM_PLANS) {
      await sendMessage(
        token,
        message.chat.id,
        "Please use /premium in a private chat with this bot.",
      );
    }
    return;
  }

  const selectedPlan = PREMIUM_PLANS[command];
  if (selectedPlan) {
    awaitingRecipientId.set(message.chat.id, selectedPlan);
    await sendMessage(
      token,
      message.chat.id,
      `Send the recipient's numeric Telegram user ID. This will immediately send ${selectedPlan.months} months of Premium for ${selectedPlan.starCost.toLocaleString()} Stars. Use /premium for 3 months or /premium_year for 12 months. Send /cancel to stop.`,
    );
    return;
  }

  if (command === "/cancel") {
    if (awaitingRecipientId.delete(message.chat.id)) {
      await sendMessage(token, message.chat.id, "Premium gift cancelled.");
    } else {
      await sendMessage(
        token,
        message.chat.id,
        "There isn't a Premium gift waiting for a recipient ID.",
      );
    }
    return;
  }

  if (command === "/start") {
    await sendMessage(
      token,
      message.chat.id,
      "Use /premium to send 3 months of Premium, or /premium_year to send 12 months.",
    );
    return;
  }

  const plan = awaitingRecipientId.get(message.chat.id);
  if (!plan) return;

  const recipientId = parseTelegramId(text);
  if (recipientId === null) {
    await sendMessage(
      token,
      message.chat.id,
      "Please send a numeric Telegram user ID. Nothing was sent. Use /cancel to stop.",
    );
    return;
  }

  awaitingRecipientId.delete(message.chat.id);
  await sendPremiumGift(token, message.chat.id, recipientId, plan);
}

function enqueueUpdates(
  queue: TelegramUpdate[],
  queuedIds: Set<number>,
  updates: TelegramUpdate[],
): void {
  for (const update of updates) {
    if (!queuedIds.has(update.update_id)) {
      queue.push(update);
      queuedIds.add(update.update_id);
    }
  }
}

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

async function pollUpdates(token: string, ownerId: number): Promise<void> {
  let offset: number | undefined;
  const queue: TelegramUpdate[] = [];
  const queuedIds = new Set<number>();
  const awaitingRecipientId = new Map<number, PremiumPlan>();

  while (true) {
    try {
      if (queue.length === 0) {
        const updates = await telegramCall<TelegramUpdate[]>(
          token,
          "getUpdates",
          {
            ...(offset === undefined ? {} : { offset }),
            timeout: POLL_TIMEOUT_SECONDS,
            allowed_updates: ["message"],
          },
          (POLL_TIMEOUT_SECONDS + 10) * 1000,
        );
        enqueueUpdates(queue, queuedIds, updates);
        continue;
      }

      const update = queue.shift();
      if (!update) continue;
      queuedIds.delete(update.update_id);
      const nextOffset = update.update_id + 1;

      // Acknowledge this update before any Stars-spending call so a restart
      // cannot replay the same paid action.
      const laterUpdates = await telegramCall<TelegramUpdate[]>(
        token,
        "getUpdates",
        {
          offset: nextOffset,
          timeout: 0,
          allowed_updates: ["message"],
        },
      );
      offset = nextOffset;
      enqueueUpdates(queue, queuedIds, laterUpdates);

      await handleUpdate(token, ownerId, update, awaitingRecipientId);
    } catch (error) {
      if (error instanceof TelegramBotApiError) {
        logger.warn(
          { telegramStatus: error.telegramStatus },
          "Telegram bot polling request failed; retrying",
        );
      } else {
        logger.error(
          { err: error },
          "Telegram bot update handler failed; retrying",
        );
      }
      await wait(3000);
    }
  }
}

export function startTelegramPremiumBot(): void {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const ownerId = parseTelegramId(process.env.TELEGRAM_OWNER_USER_ID);

  if (!token) {
    logger.warn(
      "Telegram Premium bot is disabled because TELEGRAM_BOT_TOKEN is not configured",
    );
    return;
  }

  if (ownerId === null) {
    logger.warn(
      "Telegram Premium bot is disabled until TELEGRAM_OWNER_USER_ID is configured",
    );
    return;
  }

  void (async () => {
    try {
      await telegramCall<boolean>(token, "deleteWebhook", {
        drop_pending_updates: false,
      });
      logger.info(
        "Telegram webhook cleared; starting Premium command polling",
      );
    } catch (error) {
      logger.error(
        {
          telegramStatus:
            error instanceof TelegramBotApiError
              ? error.telegramStatus
              : undefined,
        },
        "Could not prepare Telegram bot polling",
      );
      return;
    }

    await pollUpdates(token, ownerId);
  })();
}