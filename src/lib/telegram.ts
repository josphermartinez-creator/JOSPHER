// Telegram Bot API - Real HTTP client
import { db } from '@/lib/db';

interface TelegramMessage {
  text: string;
  parseMode?: 'HTML' | 'Markdown';
}

interface OperationNotification {
  title: string;
  pair: string;
  direction: 'CALL' | 'PUT';
  amount: number;
  payout: number;
  profit: number;
  confidence: number;
  expiry: number;
  reason: string;
  time: string;
  result?: 'WIN' | 'LOSS' | 'PENDING';
}

/**
 * Envía un mensaje real a Telegram vía Bot API
 */
export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string,
  parseMode: 'HTML' | 'Markdown' = 'HTML'
): Promise<{ success: boolean; error?: string }> {
  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: parseMode,
        disable_web_page_preview: true,
      }),
    });

    const data = await res.json();

    if (!data.ok) {
      return { success: false, error: data.description || 'Error desconocido de Telegram' };
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Error de conexión a Telegram' };
  }
}

/**
 * Verifica que un bot token sea válido llamando a getMe
 */
export async function verifyTelegramBot(botToken: string): Promise<{
  success: boolean;
  botInfo?: { username: string; first_name: string; id: number };
  error?: string;
}> {
  try {
    const url = `https://api.telegram.org/bot${botToken}/getMe`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.ok) {
      return { success: false, error: data.description || 'Token inválido' };
    }

    return {
      success: true,
      botInfo: {
        username: data.result.username,
        first_name: data.result.first_name,
        id: data.result.id,
      },
    };
  } catch (error: any) {
    return { success: false, error: error.message || 'Error de conexión' };
  }
}

/**
 * Formatea y envía una notificación de operación
 */
export async function sendOperationNotification(
  notif: OperationNotification
): Promise<{ success: boolean; error?: string }> {
  const account = await db.account.findFirst({ include: { settings: true } });
  if (!account?.settings?.telegramBotToken || !account?.settings?.telegramChatId) {
    return { success: false, error: 'Telegram no configurado' };
  }
  if (!account.settings.telegramEnabled) {
    return { success: false, error: 'Telegram desactivado' };
  }

  const resultIcon = notif.result === 'WIN' ? '✅' : notif.result === 'LOSS' ? '❌' : '⏳';
  const directionIcon = notif.direction === 'CALL' ? '📈' : '📉';
  const profitStr = notif.profit > 0
    ? `+<b>$${notif.profit.toFixed(2)}</b>`
    : `<b>$${notif.profit.toFixed(2)}</b>`;
  const profitColor = notif.profit >= 0 ? '🟢' : '🔴';

  const message = `
${resultIcon} <b>${notif.title}</b>

${directionIcon} <b>Par:</b> ${notif.pair}
${directionIcon} <b>Dirección:</b> ${notif.direction}
💰 <b>Monto:</b> $${notif.amount.toFixed(2)}
📊 <b>Payout:</b> ${notif.payout}%
${profitColor} <b>Profit:</b> ${profitStr}
🎯 <b>Confianza:</b> ${notif.confidence.toFixed(0)}%
⏱ <b>Expiración:</b> ${notif.expiry} min
🕐 <b>Hora:</b> ${notif.time}

📝 <b>Análisis:</b>
<i>${notif.reason}</i>

━━━━━━━━━━━━━━━
🤖 Quantum Bot · Trading Automático
`.trim();

  return sendTelegramMessage(
    account.settings.telegramBotToken,
    account.settings.telegramChatId,
    message,
    'HTML'
  );
}

/**
 * Envía un resumen diario
 */
export async function sendDailySummary(stats: any): Promise<{ success: boolean; error?: string }> {
  const account = await db.account.findFirst({ include: { settings: true } });
  if (!account?.settings?.telegramBotToken || !account?.settings?.telegramChatId) {
    return { success: false, error: 'Telegram no configurado' };
  }

  const message = `
📊 <b>RESUMEN DIARIO</b>

💰 <b>Balance actual:</b> $${stats.currentBalance.toFixed(2)}
📈 <b>Operaciones:</b> ${stats.total}
✅ <b>Ganadas:</b> ${stats.wins}
❌ <b>Perdidas:</b> ${stats.losses}
🎯 <b>Win Rate:</b> ${stats.winRate.toFixed(1)}%
💵 <b>Profit total:</b> ${stats.totalProfit >= 0 ? '+' : ''}$${stats.totalProfit.toFixed(2)}
🔥 <b>Mejor racha:</b> ${stats.longestWinStreak} ganadas
📉 <b>Peor racha:</b> ${stats.longestLossStreak} perdidas
⚡ <b>Profit Factor:</b> ${stats.profitFactor.toFixed(2)}

━━━━━━━━━━━━━━━
🤖 Quantum Bot
`.trim();

  return sendTelegramMessage(
    account.settings.telegramBotToken,
    account.settings.telegramChatId,
    message,
    'HTML'
  );
}
