'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FlaskConical, Play, Trash2, Loader2, TrendingUp, TrendingDown,
  Trophy, Target, Activity, DollarSign, Flame, ChevronDown, ChevronUp
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell
} from 'recharts';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const CHART_COLORS = {
  success: 'oklch(0.72 0.19 155)',
  danger: 'oklch(0.65 0.22 25)',
  warning: 'oklch(0.82 0.18 80)',
  accent: 'oklch(0.62 0.22 290)',
};

const STRATEGIES = [
  { id: 'INDECISION_FUERZA_CONTINUIDAD', name: 'Indecisión-Fuerza-Continuidad', desc: 'Doji + vela gatillo + continuación' },
];

const PERIODS = [
  { id: '7D', name: '7 días' },
  { id: '30D', name: '30 días' },
  { id: '90D', name: '90 días' },
  { id: '180D', name: '6 meses' },
  { id: '1Y', name: '1 año' },
];

export function BacktestPanel() {
  const [backtests, setBacktests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  // form
  const [name, setName] = useState('');
  const [pair, setPair] = useState('EURUSD-OTC');
  const [strategy, setStrategy] = useState('INDECISION_FUERZA_CONTINUIDAD');
  const [period, setPeriod] = useState('30D');
  const [amount, setAmount] = useState('25');
  const [payout, setPayout] = useState('87');

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/backtest');
      const data = await res.json();
      if (data.success) setBacktests(data.backtests);
    } catch (e) {
      toast.error('Error al cargar backtests');
    } finally {
      setLoading(false);
    }
  };

  const run = async () => {
    setRunning(true);
    try {
      const res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name || `Backtest ${pair} ${strategy}`,
          pair,
          strategy,
          period,
          config: { amount: parseFloat(amount), payout: parseFloat(payout) },
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Backtest completado');
        load();
      } else toast.error(data.error);
    } catch (e) {
      toast.error('Error al ejecutar backtest');
    } finally {
      setRunning(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await fetch(`/api/backtest?id=${id}`, { method: 'DELETE' });
      toast.success('Backtest eliminado');
      load();
    } catch (e) {
      toast.error('Error al eliminar');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center">
          <FlaskConical className="w-5 h-5 text-accent" />
        </div>
        <div>
          <h2 className="font-black text-lg">Backtesting</h2>
          <p className="text-xs text-muted-foreground">Prueba estrategias con datos históricos</p>
        </div>
      </div>

      {/* Config card */}
      <Card className="glass-strong border-border/50 p-5">
        <div className="grid md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div>
            <Label className="text-xs">Nombre</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Mi backtest"
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Par</Label>
            <Input
              value={pair}
              onChange={(e) => setPair(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Estrategia</Label>
            <Select value={strategy} onValueChange={setStrategy}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STRATEGIES.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Periodo</Label>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PERIODS.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Monto</Label>
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Payout %</Label>
            <Input value={payout} onChange={(e) => setPayout(e.target.value)} className="mt-1" />
          </div>
        </div>
        <Button
          onClick={run}
          disabled={running}
          className="w-full mt-4 glow-primary"
          style={{ background: 'linear-gradient(135deg, oklch(0.72 0.19 155), oklch(0.62 0.22 290))' }}
        >
          {running ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Ejecutando backtest...
            </>
          ) : (
            <>
              <Play className="w-4 h-4 mr-2" />
              Ejecutar Backtest
            </>
          )}
        </Button>
      </Card>

      {/* Results */}
      {loading ? (
        <div className="text-center py-12">
          <Loader2 className="w-6 h-6 mx-auto animate-spin text-muted-foreground" />
        </div>
      ) : backtests.length === 0 ? (
        <Card className="glass-strong border-border/50 p-12 text-center">
          <FlaskConical className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground text-sm">No hay backtests ejecutados todavía</p>
          <p className="text-xs text-muted-foreground mt-1">Configura los parámetros y ejecuta tu primer backtest</p>
        </Card>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm">Historial de Backtests</h3>
            <Badge variant="outline" className="text-[10px]">{backtests.length} resultados</Badge>
          </div>
          <AnimatePresence>
            {backtests.map((bt, i) => {
              const isOpen = expanded === bt.id;
              const details = JSON.parse(bt.details || '[]');
              const equityData = details.map((d: any) => ({ ...d, balance: parseFloat(d.balance.toFixed(2)) }));
              return (
                <motion.div
                  key={bt.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Card className="glass-strong border-border/50 overflow-hidden">
                    <div
                      onClick={() => setExpanded(isOpen ? null : bt.id)}
                      className="p-4 cursor-pointer hover:bg-muted/20"
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          'w-10 h-10 rounded-xl flex items-center justify-center',
                          bt.profit >= 0 ? 'bg-success/15' : 'bg-danger/15'
                        )}>
                          {bt.profit >= 0 ? <TrendingUp className="w-5 h-5 text-success" /> : <TrendingDown className="w-5 h-5 text-danger" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm truncate">{bt.name}</span>
                            <Badge variant="outline" className="text-[10px]">{bt.pair}</Badge>
                            <Badge variant="outline" className="text-[10px] text-accent border-accent/40">{bt.strategy}</Badge>
                            <Badge variant="outline" className="text-[10px]">{bt.period}</Badge>
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            {bt.totalOperations} ops · {bt.wins}W / {bt.losses}L · {bt.winRate.toFixed(1)}% win rate
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={cn('font-bold', bt.profit >= 0 ? 'text-success' : 'text-danger')}>
                            {bt.profit >= 0 ? '+' : ''}${bt.profit.toFixed(2)}
                          </div>
                          <div className="text-[10px] text-muted-foreground">PF: {bt.profitFactor.toFixed(2)}</div>
                        </div>
                        {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                        <button
                          onClick={(e) => { e.stopPropagation(); remove(bt.id); }}
                          className="p-1.5 rounded-lg hover:bg-danger/15 hover:text-danger text-muted-foreground"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    {isOpen && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="border-t border-border/30 p-4 space-y-4"
                      >
                        {/* KPIs */}
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                          <BTStat icon={Activity} label="Operaciones" value={bt.totalOperations} color="accent" />
                          <BTStat icon={Trophy} label="Ganadas" value={bt.wins} color="success" />
                          <BTStat icon={TrendingDown} label="Perdidas" value={bt.losses} color="danger" />
                          <BTStat icon={Target} label="Win Rate" value={`${bt.winRate.toFixed(1)}%`} color="warning" />
                          <BTStat icon={DollarSign} label="Profit" value={`${bt.profit >= 0 ? '+' : ''}$${bt.profit.toFixed(2)}`} color={bt.profit >= 0 ? 'success' : 'danger'} />
                          <BTStat icon={Flame} label="Max DD" value={`${bt.maxDrawdown.toFixed(1)}%`} color="danger" />
                          <BTStat icon={Trophy} label="Mejor racha" value={`${bt.longestWinStreak}W`} color="success" />
                          <BTStat icon={TrendingDown} label="Peor racha" value={`${bt.longestLossStreak}L`} color="danger" />
                        </div>

                        {/* Equity curve */}
                        <div>
                          <div className="text-xs font-bold mb-2 text-muted-foreground">Curva de Capital</div>
                          <div className="h-56">
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={equityData}>
                                <defs>
                                  <linearGradient id={`bt-${bt.id}`} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor={bt.profit >= 0 ? CHART_COLORS.success : CHART_COLORS.danger} stopOpacity={0.6} />
                                    <stop offset="100%" stopColor={bt.profit >= 0 ? CHART_COLORS.success : CHART_COLORS.danger} stopOpacity={0} />
                                  </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 0.05)" />
                                <XAxis dataKey="index" stroke="oklch(0.65 0.03 250)" fontSize={11} />
                                <YAxis stroke="oklch(0.65 0.03 250)" fontSize={11} />
                                <Tooltip
                                  contentStyle={{
                                    background: 'oklch(0.18 0.025 250)',
                                    border: '1px solid oklch(1 0 0 / 0.1)',
                                    borderRadius: '0.5rem',
                                    fontSize: '12px',
                                  }}
                                />
                                <Area
                                  type="monotone"
                                  dataKey="balance"
                                  stroke={bt.profit >= 0 ? CHART_COLORS.success : CHART_COLORS.danger}
                                  strokeWidth={2}
                                  fill={`url(#bt-${bt.id})`}
                                />
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>
                        </div>

                        {/* Win/Loss distribution bar */}
                        <div>
                          <div className="text-xs font-bold mb-2 text-muted-foreground">Distribución Win/Loss</div>
                          <div className="h-8 rounded-lg overflow-hidden flex">
                            <div
                              className="bg-success flex items-center justify-center text-[10px] font-bold text-success-foreground"
                              style={{ width: `${(bt.wins / bt.totalOperations) * 100}%` }}
                            >
                              {bt.wins}W ({((bt.wins / bt.totalOperations) * 100).toFixed(0)}%)
                            </div>
                            <div
                              className="bg-danger flex items-center justify-center text-[10px] font-bold text-danger-foreground"
                              style={{ width: `${(bt.losses / bt.totalOperations) * 100}%` }}
                            >
                              {bt.losses}L ({((bt.losses / bt.totalOperations) * 100).toFixed(0)}%)
                            </div>
                            {bt.draws > 0 && (
                              <div
                                className="bg-warning flex items-center justify-center text-[10px] font-bold text-warning-foreground"
                                style={{ width: `${(bt.draws / bt.totalOperations) * 100}%` }}
                              >
                                {bt.draws}D
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

function BTStat({ icon: Icon, label, value, color }: any) {
  const colorMap: Record<string, string> = {
    success: 'text-success',
    danger: 'text-danger',
    warning: 'text-warning',
    accent: 'text-accent',
  };
  return (
    <div className="glass rounded-lg p-2">
      <div className="flex items-center justify-between mb-0.5">
        <Icon className={cn('w-3 h-3', colorMap[color])} />
        <span className="text-[9px] uppercase text-muted-foreground">{label}</span>
      </div>
      <div className={cn('text-sm font-bold', colorMap[color])}>{value}</div>
    </div>
  );
}
