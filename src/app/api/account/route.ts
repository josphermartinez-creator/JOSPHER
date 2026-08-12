import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { IQ_SERVICE_URL, serviceWaitFor, serviceEmit, iqServiceHealth } from '@/lib/services';

/**
 * REGLA: `isConnected` significa "hay sesión viva en IQ Option".
 *
 * Antes, si el login real fallaba, esta ruta marcaba la cuenta como conectada
 * igualmente y ponía 10.000 $ de saldo ficticio. El panel decía "conectado", el
 * auto-trader arrancaba y ninguna orden llegaba nunca al broker.
 */

// GET /api/account
export async function GET() {
  try {
    let account = await db.account.findFirst({ include: { settings: true } });

    if (!account) {
      const created = await db.account.create({
        data: {
          email: 'sin-configurar@quantumbot.local',
          name: 'Sin conectar',
          balance: 0,
          currency: 'USD',
          accountType: 'PRACTICE',
          isConnected: false,
        },
      });
      await db.settings.create({ data: { accountId: created.id } });
      account = await db.account.findUnique({
        where: { id: created.id },
        include: { settings: true },
      });
    }

    const health = await iqServiceHealth();

    // Si el broker ya no tiene sesión, la cuenta no puede seguir "conectada"
    if (account?.isConnected && health.up && !health.bridgeConnected) {
      account = await db.account.update({
        where: { id: account.id },
        data: { isConnected: false },
        include: { settings: true },
      });
    }

    return NextResponse.json({
      success: true,
      account,
      iqService: {
        connected: health.up,
        bridgeUp: health.bridgeUp,
        bridgeConnected: health.bridgeConnected,
      },
    });
  } catch (error) {
    console.error('GET /api/account error:', error);
    return NextResponse.json(
      { success: false, error: 'Error al obtener la cuenta' },
      { status: 500 }
    );
  }
}

// POST /api/account - login REAL en IQ Option
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password, accountType } = body;

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: 'Email y contraseña son obligatorios' },
        { status: 400 }
      );
    }

    const type = accountType === 'REAL' ? 'REAL' : 'PRACTICE';

    const loginResult = await serviceWaitFor<any>(
      IQ_SERVICE_URL,
      'login',
      { email, password, accountType: type },
      'login-result',
      50000,
    );

    // Sin login real no hay sesión. Se avisa del motivo y se deja desconectado.
    if (!loginResult?.success) {
      const account = await db.account.findFirst();
      if (account) {
        await db.account.update({
          where: { id: account.id },
          data: { isConnected: false },
        });
      }
      return NextResponse.json(
        {
          success: false,
          error: loginResult?.error || 'No se pudo conectar con IQ Option',
        },
        { status: 401 }
      );
    }

    const profile = loginResult.profile || {};
    const balance = Number(profile.balance) || 0;

    let account = await db.account.findFirst();
    if (!account) {
      account = await db.account.create({
        data: {
          email,
          name: profile.name || email.split('@')[0],
          accountType: type,
          isConnected: true,
          lastLogin: new Date(),
          balance,
        },
      });
      await db.settings.create({ data: { accountId: account.id } });
    } else {
      account = await db.account.update({
        where: { id: account.id },
        data: {
          email,
          name: profile.name || email.split('@')[0],
          accountType: type,
          isConnected: true,
          lastLogin: new Date(),
          balance, // el saldo siempre viene del broker
        },
      });
    }

    return NextResponse.json({
      success: true,
      account,
      realConnection: true,
      message: `Conectado a IQ Options (${type}) · Saldo: $${balance.toFixed(2)}`,
    });
  } catch (error) {
    console.error('POST /api/account error:', error);
    return NextResponse.json(
      { success: false, error: 'Error al iniciar sesión' },
      { status: 500 }
    );
  }
}

// PUT /api/account - sincronizar el saldo REAL del broker
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const balance = Number(body?.balance);

    if (!Number.isFinite(balance)) {
      return NextResponse.json(
        { success: false, error: 'Saldo no válido' },
        { status: 400 }
      );
    }

    const account = await db.account.findFirst();
    if (!account) {
      return NextResponse.json({ success: false, error: 'Sin cuenta' }, { status: 404 });
    }

    const updated = await db.account.update({
      where: { id: account.id },
      data: { balance },
    });

    return NextResponse.json({ success: true, account: updated });
  } catch (error) {
    console.error('PUT /api/account error:', error);
    return NextResponse.json(
      { success: false, error: 'Error al sincronizar el saldo' },
      { status: 500 }
    );
  }
}

// DELETE /api/account - logout
export async function DELETE() {
  try {
    await serviceEmit(IQ_SERVICE_URL, 'logout');

    const account = await db.account.findFirst();
    if (account) {
      await db.account.update({
        where: { id: account.id },
        data: { isConnected: false },
      });
      if (account.id) {
        const settings = await db.settings.findUnique({ where: { accountId: account.id } });
        if (settings?.botActive) {
          await db.settings.update({ where: { id: settings.id }, data: { botActive: false } });
        }
      }
    }
    return NextResponse.json({ success: true, message: 'Sesión cerrada' });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Error al cerrar sesión' },
      { status: 500 }
    );
  }
}
