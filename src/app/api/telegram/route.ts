import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  sendTelegramMessage,
  verifyTelegramBot,
  sendOperationNotification,
  sendDailySummary,
} from '@/lib/telegram';

// POST /api/telegram
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    if (action === 'verify') {
      // Verificar que el bot token es válido
      const { botToken } = body;
      if (!botToken) {
        return NextResponse.json(
          { success: false, error: 'Bot Token requerido' },
          { status: 400 }
        );
      }
      const result = await verifyTelegramBot(botToken);
      if (!result.success) {
        return NextResponse.json({ success: false, error: result.error }, { status: 400 });
      }
      return NextResponse.json({
        success: true,
        botInfo: result.botInfo,
        message: `Bot verificado: @${result.botInfo?.username}`,
      });
    }

    if (action === 'test') {
      const { botToken, chatId } = body;
      if (!botToken || !chatId) {
        return NextResponse.json(
          { success: false, error: 'Bot Token y Chat ID son obligatorios' },
          { status: 400 }
        );
      }

      // Verificar token primero
      const verify = await verifyTelegramBot(botToken);
      if (!verify.success) {
        return NextResponse.json({ success: false, error: verify.error }, { status: 400 });
      }

      // Enviar mensaje de prueba real
      const testMessage = `
🤖 <b>Quantum Bot - Test de Conexión</b>

✅ Conexión exitosa con Telegram
🤖 Bot: <b>@${verify.botInfo?.username}</b>
🕐 Hora: ${new Date().toLocaleString('es-ES')}
📡 Estado: Listo para recibir notificaciones

━━━━━━━━━━━━━━━
Recibirás aquí las alertas de cada operación del bot.
`.trim();

      const result = await sendTelegramMessage(botToken, chatId, testMessage, 'HTML');

      if (!result.success) {
        return NextResponse.json(
          { success: false, error: result.error || 'Error al enviar mensaje' },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        message: `Mensaje de prueba enviado a Telegram (@${verify.botInfo?.username})`,
      });
    }

    if (action === 'notify_operation') {
      const result = await sendOperationNotification(body.notification);
      if (!result.success) {
        return NextResponse.json({ success: false, error: result.error }, { status: 400 });
      }
      return NextResponse.json({ success: true, message: 'Notificación enviada a Telegram' });
    }

    if (action === 'daily_summary') {
      const result = await sendDailySummary(body.stats);
      if (!result.success) {
        return NextResponse.json({ success: false, error: result.error }, { status: 400 });
      }
      return NextResponse.json({ success: true, message: 'Resumen enviado a Telegram' });
    }

    return NextResponse.json({ success: false, error: 'Acción no válida' }, { status: 400 });
  } catch (error: any) {
    console.error('POST /api/telegram error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Error en Telegram' },
      { status: 500 }
    );
  }
}

// GET /api/telegram - verificar estado actual
export async function GET() {
  try {
    const account = await db.account.findFirst({ include: { settings: true } });
    if (!account?.settings) {
      return NextResponse.json({ success: true, configured: false });
    }
    const s = account.settings;
    const configured = !!(s.telegramBotToken && s.telegramChatId);

    let botInfo: { username: string; first_name: string; id: number } | null = null;
    if (configured) {
      const verify = await verifyTelegramBot(s.telegramBotToken!);
      if (verify.success && verify.botInfo) botInfo = verify.botInfo;
    }

    return NextResponse.json({
      success: true,
      configured,
      enabled: s.telegramEnabled,
      botInfo,
      chatId: s.telegramChatId,
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Error' }, { status: 500 });
  }
}
