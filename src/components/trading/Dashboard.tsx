'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { io as ioClient, Socket } from 'socket.io-client';
import {
  TrendingUp, TrendingDown, Activity, DollarSign, Target,
  Flame, Trophy, Play, Square, Zap, AlertCircle, Loader2, RefreshCw, Trash2,
  Radio,
  Clock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface DashboardProps {
  account: any;
  settings: any;
  onSettingsUpdate: () => void;
  onAccountUpdate: () => void;
}

interface LiveOp {
  id: string;
  pair: string;
  direction: 'CALL' | 'PUT';
  amount: number;
  payout: number;
  confidence: number;
  reason: string;
  result?: 'WIN' | 'LOSS' | 'DRAW' | 'PENDING';
  profit?: number;
  time: string;
  simulated?: boolean;
}

const TICKER_PAIRS = [
  { pair: 'EUR/USD', price: '1.0856', change: '+0.12%', up: true },
  { pair: 'GBP/USD', price: '1.2734', change: '-0.08%', up: false },
  { pair: 'BTC/USD', price: '67,432', change: '+2.34%', up: true },
  { pair: 'ETH/USD', price: '3,521', change: '+1.87%', up: true },
  { pair: 'USD/JPY', price: '149.85', change: '+0.05%', up: true },
  { pair: 'XAU/USD', price: '2,034.50', change: '-0.32%', up: false },
  { pair: 'AUD/USD', price: '0.6589', change: '+0.21%', up: true },
  { pair: 'EUR/GBP', price: '0.8523', change: '-0.14%', up: false },
];

export function Dashboard({ account, settings, onSettingsUpdate, onAccountUpdate }: DashboardProps) {
  const [botActive, setBotActive] = useState(settings?.botActive || false);
  const [togglingBot, setTogglingBot] = useState(false);
  const [liveOps, setLiveOps] = useState<LiveOp[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [simulating, setSimulating] = useState(false);
  const [autoTraderActive, setAutoTraderActive] = useState(false);
  const [autoTraderMonitoring, setAutoTraderMonitoring] = useState(false);
  const [monitoringStatus, setMonitoringStatus] = useState<any>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    setBotActive(settings?.botActive || false);
  }, [settings]);

  useEffect(() => {
    loadStats();

    // Conectar al servicio auto-trader
    // En desarrollo local (Windows), conectarse directo al puerto 3004
    // En producción (con Caddy), usar el gateway en puerto 81
    const isLocalDev = typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    const socketUrl = isLocalDev
      ? `http://${window.location.hostname}:3004`
      : `${window.location.protocol}//${window.location.hostname}:81`;

    const socketOptions: any = {
      path: '/socket.io/',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
      timeout: 8000,
    };

    if (!isLocalDev) {
      socketOptions.query = { XTransformPort: '3004' };
    }

    const socket = ioClient(socketUrl, socketOptions);
    socketRef.current = socket;
    (window as any).__autoTraderSocket = socket;

    socket.on('connect', () => {
      console.log('[AutoTrader] Socket conectado:', socket.id);
      socket.emit('get-status');
    });

    socket.on('status', (status: any) => {
      setAutoTraderActive(status.botActive);
      setAutoTraderMonitoring(status.monitoring);
    });

    socket.on('monitoring-status', (status: any) => {
      setMonitoringStatus(status);
    });

    socket.on('bot-started', () => {
      console.log('[AutoTrader] Bot started event');
      setAutoTraderActive(true);
      setAutoTraderMonitoring(true);
    });

    socket.on('bot-stopped', () => {
      console.log('[AutoTrader] Bot stopped event');
      setAutoTraderActive(false);
      setAutoTraderMonitoring(false);
    });

    socket.on('signal-detected', (data: any) => {
      console.log('[AutoTrader] Signal detected:', data.pair);
      toast.info('🎯 Señal detectada', {
        description: `${data.pair} · ${data.signal.direction} · ${data.signal.confidence.toFixed(0)}% confianza`,
      });
    });

    socket.on('operation-opened', (data: any) => {
      const op: LiveOp = {
        id: data.orderId,
        pair: data.pair,
        direction: data.direction,
        amount: data.amount,
        payout: data.payout,
        confidence: data.confidence,
        reason: data.reason,
        result: 'PENDING',
        time: new Date().toLocaleTimeString('es-ES'),
      };
      setLiveOps(prev => [op, ...prev].slice(0, 8));
      toast.info('Orden enviada al broker', {
        description: `${data.pair} · ${data.direction} · $${Number(data.amount).toFixed(2)}`,
      });
    });

    socket.on('operation-executed', (data: any) => {
      console.log('[AutoTrader] Operation executed:', data.pair);
      const { pair, result, signal } = data;
      const closed: LiveOp = {
        id: result.operation?.id || Date.now().toString(),
        pair,
        direction: signal.direction,
        amount: result.operation?.amount || 0,
        payout: result.operation?.payout || 0,
        confidence: signal.confidence,
        reason: signal.reason,
        result: result.isWin ? 'WIN' : 'LOSS',
        profit: result.profit,
        time: new Date().toLocaleTimeString('es-ES'),
      };
      setLiveOps(prev => {
        const idx = prev.findIndex(o => o.result === 'PENDING' && o.pair === pair && o.direction === signal.direction);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = { ...copy[idx], result: closed.result, profit: closed.profit };
          return copy;
        }
        return [closed, ...prev].slice(0, 8);
      });
      onAccountUpdate();
      loadStats();
      toast(result.isWin ? '✅ ¡OPERACIÓN GANADA (AUTO)!' : '❌ Operación perdida (auto)', {
        description: `${pair} · ${signal.direction} · ${result.profit > 0 ? '+' : ''}$${result.profit.toFixed(2)}`,
      });
    });

    socket.on('connect_error', (err: any) => {
      console.log('[AutoTrader] Socket error:', err.message);
      setAutoTraderActive(false);
    });

    socket.on('disconnect', (reason: string) => {
      console.log('[AutoTrader] Socket disconnected:', reason);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const loadStats = async () => {
    setLoadingStats(true);
    try {
      const res = await fetch('/api/statistics');
      const data = await res.json();
      if (data.success) setStats(data.stats);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingStats(false);
    }
  };

  const toggleBot = async () => {
    setTogglingBot(true);
    try {
      const res = await fetch('/api/bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: botActive ? 'stop' : 'start' }),
      });
      const data = await res.json();
      if (data.success) {
        setBotActive(!botActive);
        onSettingsUpdate();
        toast.success(data.message);
      } else {
        toast.error(data.error);
      }
    } catch (e) {
      toast.error('Error');
    } finally {
      setTogglingBot(false);
    }
  };

  const simulateOp = async () => {
    setSimulating(true);
    try {
      const res = await fetch('/api/bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'simulate' }),
      });
      const data = await res.json();
      if (data.success) {
        const notif = data.notification;
        const op: LiveOp = {
          id: data.operation.id,
          pair: notif.pair,
          direction: notif.direction,
          amount: notif.amount,
          payout: notif.payout,
          confidence: notif.confidence,
          reason: notif.reason,
          result: notif.title.includes('GANADA') ? 'WIN' : 'LOSS',
          profit: notif.profit,
          time: notif.time,
          simulated: true,
        };
        setLiveOps(prev => [op, ...prev].slice(0, 8));
        loadStats();
        toast.info('Prueba de estrategia (no es real)', {
          description: `${op.pair} · ${op.direction} · no se envió al broker ni afecta al saldo`,
        });
      } else {
        toast.error(data.error || 'No se pudo simular');
      }
    } catch (e) {
      toast.error('Error al simular');
    } finally {
      setSimulating(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Live ticker */}
      <div className="overflow-hidden glass rounded-xl border border-border/50 py-2">
        <div className="flex ticker-scroll whitespace-nowrap">
          {[...TICKER_PAIRS, ...TICKER_PAIRS].map((t, i) => (
            <div key={i} className="flex items-center gap-2 px-4 text-xs">
              <span className="font-bold text-muted-foreground">{t.pair}</span>
              <span className="font-mono">{t.price}</span>
              <span className={cn('flex items-center gap-0.5', t.up ? 'text-success' : 'text-danger')}>
                {t.up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {t.change}
              </span>
              <span className="text-border">|</span>
            </div>
          ))}
        </div>
      </div>

      {/* Bot control */}
      <Card className="glass-strong border-border/50 p-5 card-hover">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              'w-12 h-12 rounded-2xl flex items-center justify-center transition-all',
              autoTraderActive ? 'glow-success bg-success/20' : botActive ? 'bg-warning/20' : 'bg-muted/40'
            )}>
              {autoTraderActive ? (
                <Radio className="w-6 h-6 text-success pulse-dot" />
              ) : botActive ? (
                <Activity className="w-6 h-6 text-warning" />
              ) : (
                <Zap className="w-6 h-6 text-muted-foreground" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-black text-lg">Estado del Bot</h2>
                <Badge variant={autoTraderActive ? 'default' : botActive ? 'secondary' : 'secondary'} className={cn(
                  'text-[10px]',
                  autoTraderActive && 'bg-success/20 text-success border-success/30',
                  !autoTraderActive && botActive && 'bg-success/20 text-success border-success/30'
                )}>
                  {botActive ? (autoTraderActive ? 'AUTO · EN VIVO' : 'AUTO · INICIANDO') : 'DETENIDO'}
                </Badge>
                {autoTraderMonitoring && (
                  <Badge variant="outline" className="text-[10px] border-success/40 text-success">
                    <span className="w-1.5 h-1.5 rounded-full bg-success pulse-dot mr-1" />
                    Monitoreando
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {botActive
                  ? '🤖 Operando en automático · Estrategia Indecisión-Fuerza-Continuidad'
                  : 'Activa el bot para operar en automático'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              onClick={simulateOp}
              disabled={simulating || !botActive}
              variant="outline"
              className="border-border/50 hover:border-warning/50 hover:bg-warning/10 hover:text-warning"
            >
              {simulating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Simular
            </Button>
            <Button
              onClick={toggleBot}
              disabled={togglingBot}
              className={cn(
                'flex-1 sm:flex-initial font-bold',
                botActive
                  ? 'bg-danger hover:bg-danger/90 text-danger-foreground glow-danger'
                  : 'glow-primary'
              )}
              style={!botActive ? {
                background: 'linear-gradient(135deg, oklch(0.72 0.19 155), oklch(0.62 0.22 290))'
              } : undefined}
            >
              {togglingBot ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : botActive ? (
                <Square className="w-4 h-4 mr-2" />
              ) : (
                <Play className="w-4 h-4 mr-2" />
              )}
              {botActive ? 'DETENER AUTO' : 'INICIAR AUTO'}
            </Button>
          </div>
        </div>
      </Card>

      {/* Pares en Monitoreo - solo visible cuando el bot está activo */}
      {autoTraderActive && monitoringStatus && (
        <Card className="glass-strong border-border/50 p-4">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-success pulse-dot" />
              <h3 className="font-bold text-sm">Pares en Monitoreo</h3>
              <Badge variant="outline" className="text-[10px] border-success/40 text-success">
                {monitoringStatus.pairs?.length || 0} pares
              </Badge>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">Operaciones hoy:</span>
                <span className="font-bold text-warning">
                  {monitoringStatus.todayOps}/{monitoringStatus.maxDailyOps}
                </span>
              </div>
              {monitoringStatus.cooldowns?.length > 0 && (
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3 text-muted-foreground" />
                  <span className="text-muted-foreground">{monitoringStatus.cooldowns.length} en cooldown</span>
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {monitoringStatus.pairs?.map((pair: string) => {
              const cooldown = monitoringStatus.cooldowns?.find((c: any) => c.pair === pair);
              const isInCooldown = cooldown && cooldown.remaining > 0;
              return (
                <div
                  key={pair}
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all',
                    isInCooldown
                      ? 'border-warning/30 bg-warning/5 text-muted-foreground'
                      : 'border-success/30 bg-success/10 text-success'
                  )}
                >
                  <span className={cn('w-1.5 h-1.5 rounded-full', isInCooldown ? 'bg-warning' : 'bg-success pulse-dot')} />
                  {pair}
                  {isInCooldown && (
                    <span className="text-[10px] text-muted-foreground">
                      ({Math.ceil(cooldown.remaining / 1000)}s)
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          {monitoringStatus.todayOps >= monitoringStatus.maxDailyOps && (
            <div className="mt-3 p-2 rounded-lg bg-warning/10 border border-warning/30 text-xs text-warning flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5" />
              Límite diario de operaciones alcanzado. El bot reanudará mañana.
            </div>
          )}
        </Card>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard
          icon={DollarSign}
          label="Balance"
          value={`$${account.balance.toFixed(2)}`}
          color="success"
          subtitle={account.accountType === 'PRACTICE' ? 'Cuenta demo' : 'Cuenta real'}
        />
        <KPICard
          icon={Target}
          label="Win Rate"
          value={loadingStats ? '...' : `${stats?.winRate.toFixed(1) || 0}%`}
          color="accent"
          subtitle={`${stats?.wins || 0}W / ${stats?.losses || 0}L`}
        />
        <KPICard
          icon={TrendingUp}
          label="Profit Total"
          value={loadingStats ? '...' : `${stats?.totalProfit >= 0 ? '+' : ''}$${(stats?.totalProfit || 0).toFixed(2)}`}
          color={stats?.totalProfit >= 0 ? 'success' : 'danger'}
          subtitle={`${stats?.total || 0} operaciones`}
        />
        <KPICard
          icon={Flame}
          label="Racha Actual"
          value={loadingStats ? '...' : `${stats?.currentStreak || 0}`}
          color={stats?.currentStreakType === 'WIN' ? 'success' : stats?.currentStreakType === 'LOSS' ? 'danger' : 'warning'}
          subtitle={stats?.currentStreakType === 'WIN' ? 'Ganadoras' : stats?.currentStreakType === 'LOSS' ? 'Perdedoras' : 'Sin racha'}
        />
      </div>

      {/* Recent operations & quick stats */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Recent ops */}
        <Card className="glass-strong border-border/50 p-4 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-warning" />
              <h3 className="font-bold text-sm">Operaciones Recientes</h3>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="text-xs h-7" onClick={loadStats}>
                <RefreshCw className="w-3 h-3 mr-1" />
                Refrescar
              </Button>
              {(stats?.total || 0) > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7 text-danger hover:bg-danger/10"
                  onClick={async () => {
                    if (!confirm('¿Eliminar todas las estadísticas y operaciones?')) return;
                    try {
                      await fetch('/api/operations', { method: 'DELETE' });
                      const btRes = await fetch('/api/backtest');
                      const btData = await btRes.json();
                      if (btData.success) {
                        for (const bt of btData.backtests) {
                          await fetch(`/api/backtest?id=${bt.id}`, { method: 'DELETE' });
                        }
                      }
                      setLiveOps([]);
                      toast.success('Estadísticas reiniciadas');
                      loadStats();
                      onAccountUpdate();
                    } catch (e) {
                      toast.error('Error al reiniciar');
                    }
                  }}
                >
                  <Trash2 className="w-3 h-3 mr-1" />
                  Reiniciar
                </Button>
              )}
            </div>
          </div>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            <AnimatePresence>
              {liveOps.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  No hay operaciones recientes
                  <div className="text-xs mt-1">Activa el bot y simula operaciones</div>
                </div>
              ) : (
                liveOps.map((op, i) => (
                  <motion.div
                    key={op.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ delay: i * 0.05 }}
                    className={cn(
                      'flex items-center gap-3 p-3 rounded-xl border transition-all',
                      op.result === 'WIN'
                        ? 'bg-success/10 border-success/30'
                        : 'bg-danger/10 border-danger/30'
                    )}
                  >
                    <div className={cn(
                      'w-9 h-9 rounded-lg flex items-center justify-center',
                      op.result === 'WIN' ? 'bg-success/20' : 'bg-danger/20'
                    )}>
                      {op.result === 'WIN' ? (
                        <Trophy className="w-4 h-4 text-success" />
                      ) : (
                        <TrendingDown className="w-4 h-4 text-danger" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm">{op.pair}</span>
                        <Badge variant="outline" className={cn(
                          'text-[10px] px-1.5',
                          op.direction === 'CALL' ? 'border-success/50 text-success' : 'border-danger/50 text-danger'
                        )}>
                          {op.direction === 'CALL' ? '▲ COMPRA' : '▼ VENTA'}
                        </Badge>
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate">{op.reason}</div>
                    </div>
                    <div className="text-right">
                      <div className={cn(
                        'font-bold text-sm',
                        op.result === 'WIN' ? 'text-success' : 'text-danger'
                      )}>
                        {op.profit && op.profit > 0 ? '+' : ''}${op.profit?.toFixed(2)}
                      </div>
                      <div className="text-[10px] text-muted-foreground">{op.time}</div>
                    </div>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>
        </Card>

        {/* Quick stats */}
        <Card className="glass-strong border-border/50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Trophy className="w-4 h-4 text-warning" />
            <h3 className="font-bold text-sm">Récords</h3>
          </div>
          <div className="space-y-3">
            <RecordRow
              icon={TrendingUp}
              label="Mayor racha ganadora"
              value={`${stats?.longestWinStreak || 0}`}
              color="success"
            />
            <RecordRow
              icon={TrendingDown}
              label="Mayor racha perdedora"
              value={`${stats?.longestLossStreak || 0}`}
              color="danger"
            />
            <RecordRow
              icon={Target}
              label="Profit Factor"
              value={`${(stats?.profitFactor || 0).toFixed(2)}`}
              color="accent"
            />
            <RecordRow
              icon={DollarSign}
              label="Ganancia bruta"
              value={`$${(stats?.grossProfit || 0).toFixed(2)}`}
              color="success"
            />
            <RecordRow
              icon={AlertCircle}
              label="Pérdida bruta"
              value={`-$${(stats?.grossLoss || 0).toFixed(2)}`}
              color="danger"
            />
          </div>
        </Card>
      </div>
    </div>
  );
}

function KPICard({ icon: Icon, label, value, color, subtitle }: any) {
  const colorMap: Record<string, string> = {
    success: 'text-success',
    danger: 'text-danger',
    warning: 'text-warning',
    accent: 'text-accent',
  };
  return (
    <Card className="glass-strong border-border/50 p-4 card-hover relative overflow-hidden">
      <div className="absolute -top-6 -right-6 w-20 h-20 rounded-full opacity-10" style={{
        background: `var(--${color === 'success' ? 'success' : color === 'danger' ? 'danger' : color === 'warning' ? 'warning' : 'accent'})`
      }} />
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</span>
        <Icon className={cn('w-4 h-4', colorMap[color])} />
      </div>
      <div className={cn('text-2xl font-black', colorMap[color])}>{value}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</div>
    </Card>
  );
}

function RecordRow({ icon: Icon, label, value, color }: any) {
  const colorMap: Record<string, string> = {
    success: 'text-success bg-success/10',
    danger: 'text-danger bg-danger/10',
    warning: 'text-warning bg-warning/10',
    accent: 'text-accent bg-accent/10',
  };
  return (
    <div className="flex items-center gap-3">
      <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', colorMap[color])}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 text-xs text-muted-foreground">{label}</div>
      <div className={cn('font-bold text-sm', colorMap[color].split(' ')[0])}>{value}</div>
    </div>
  );
}
