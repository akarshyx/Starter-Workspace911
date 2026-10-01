import { getAuth } from "@clerk/express";
import {
  GetTelegramGiftsResponse,
  GetTelegramStatusResponse,
  SendTelegramGiftBody,
  SendTelegramGiftResponse,
} from "@workspace/api-zod";
import { Router, type IRouter, type RequestHandler } from "express";

const router: IRouter = Router();

type TelegramEnvelope<T> = {
  ok: boolean;
  result?: T;
  error_code?: number;
};

type TelegramBot = {
  first_name: string;
  username?: string;
};

type TelegramStarBalance = {
  amount: number;
};

type TelegramAvailableGift = {
  id: string;
  sticker?: {
    emoji?: string;
  };
  star_count: number;
  upgrade_star_count?: number;
  remaining_count?: number;
  total_count?: number;
};

class TelegramApiError extends Error {
  constructor(readonly telegramStatus?: number) {
    super("Telegram Bot API request failed.");
    this.name = "TelegramApiError";
  }
}

async function telegramCall<T>(
  method: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new TelegramApiError();

  let response: Response;
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new TelegramApiError();
  }

  const payload = (await response.json().catch(() => null)) as TelegramEnvelope<T> | null;
  if (!response.ok || !payload || payload.ok !== true || payload.result === undefined) {
    throw new TelegramApiError(payload?.error_code ?? response.status);
  }

  return payload.result;
}

async function getAvailableGifts(): Promise<TelegramAvailableGift[]> {
  const result = await telegramCall<{ gifts: TelegramAvailableGift[] }>(
    "getAvailableGifts",
  );
  return result.gifts;
}

async function getStarBalance(): Promise<number> {
  const result = await telegramCall<TelegramStarBalance>("getMyStarBalance");
  if (!Number.isSafeInteger(result.amount) || result.amount < 0) {
    throw new TelegramApiError();
  }
  return result.amount;
}

const requireAuth: RequestHandler = (req, res, next) => {
  if (!getAuth(req).userId) {
    res.status(401).json({ error: "Sign in to use Telegram collectibles." });
    return;
  }
  next();
};

router.use("/telegram", requireAuth);

router.get("/telegram/status", async (req, res): Promise<void> => {
  try {
    const [bot, starBalance] = await Promise.all([
      telegramCall<TelegramBot>("getMe"),
      getStarBalance(),
    ]);

    res.json(
      GetTelegramStatusResponse.parse({
        botName: bot.first_name,
        botUsername: bot.username ?? "",
        starBalance,
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Could not load Telegram bot status");
    res
      .status(502)
      .json({ error: "Could not load the bot's Telegram status." });
  }
});

router.get("/telegram/gifts", async (req, res): Promise<void> => {
  try {
    const available = await getAvailableGifts();
    const gifts = available.map((gift) => {
      const upgradeCost =
        Number.isSafeInteger(gift.upgrade_star_count) && (gift.upgrade_star_count ?? 0) > 0
          ? gift.upgrade_star_count!
          : null;
      return {
        id: gift.id,
        emoji: gift.sticker?.emoji ?? null,
        starCost: gift.star_count,
        upgradeCost,
        totalCost: gift.star_count + (upgradeCost ?? 0),
        remainingCount: gift.remaining_count ?? null,
        totalCount: gift.total_count ?? null,
        upgradeable: upgradeCost !== null,
      };
    });

    res.json(GetTelegramGiftsResponse.parse({ gifts }));
  } catch (error) {
    req.log.error({ err: error }, "Could not load Telegram gifts");
    res
      .status(502)
      .json({ error: "Could not load the bot's available gifts." });
  }
});

router.post("/telegram/gifts/send", async (req, res): Promise<void> => {
  const origin = req.get("origin");
  const forwardedHost = req.get("x-forwarded-host")?.split(",")[0]?.trim();
  const requestHost = forwardedHost || req.get("host");
  let originHost: string | undefined;
  try {
    originHost = origin ? new URL(origin).host : undefined;
  } catch {
    originHost = undefined;
  }
  if (!originHost || !requestHost || originHost !== requestHost) {
    res.status(403).json({ error: "Gift requests must come from the signed-in Daymark page." });
    return;
  }

  const parsed = SendTelegramGiftBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Choose a gift and enter a valid Telegram user ID." });
    return;
  }

  if (!parsed.data.approved) {
    res.status(400).json({ error: "Confirm the Stars purchase before sending." });
    return;
  }

  try {
    const currentGifts = await getAvailableGifts();
    const gift = currentGifts.find((item) => item.id === parsed.data.giftId);
    if (!gift || gift.remaining_count === 0) {
      res.status(409).json({ error: "That gift is no longer available. Refresh the list." });
      return;
    }

    const upgradeCost =
      Number.isSafeInteger(gift.upgrade_star_count) && (gift.upgrade_star_count ?? 0) > 0
        ? gift.upgrade_star_count!
        : null;
    if (upgradeCost === null) {
      res.status(400).json({ error: "This gift cannot be upgraded to collectible status." });
      return;
    }

    const starsSpent = gift.star_count + upgradeCost;
    const currentBalance = await getStarBalance();
    if (currentBalance < starsSpent) {
      res.status(409).json({ error: "The bot's current Stars balance is too low for this gift." });
      return;
    }

    try {
      const sent = await telegramCall<boolean>("sendGift", {
        user_id: parsed.data.recipientId,
        gift_id: gift.id,
        pay_for_upgrade: true,
      });
      if (!sent) throw new TelegramApiError();
    } catch (error) {
      if (error instanceof TelegramApiError && error.telegramStatus === 400) {
        res.status(409).json({ error: "Telegram could not send this gift. Refresh the list and check the recipient ID." });
        return;
      }
      throw error;
    }

    req.log.info({ giftId: gift.id, starsSpent }, "Telegram collectible gift sent");
    res.json(
      SendTelegramGiftResponse.parse({
        giftId: gift.id,
        recipientId: parsed.data.recipientId,
        starsSpent,
        remainingBalance: currentBalance - starsSpent,
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Could not send Telegram collectible gift");
    res
      .status(502)
      .json({ error: "Telegram could not confirm the gift request. Refresh the balance before trying again." });
  }
});

export default router;