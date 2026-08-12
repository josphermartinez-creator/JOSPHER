'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart3, Trophy, Flame, Target, TrendingUp, TrendingDown,
  DollarSign, RefreshCw, PieChart, Activity, Coins, Loader2, Trash2
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart as RePieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend
} from 'recharts';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const CHART_COLORS = {
  success: 'oklch(0.72 0.19 155)',
  danger: 'oklch(0.65 0.22 25)',
  warning: 'oklch(0.82 0.18 80)',
  accent: 'oklch(0.62 0.22 290)',
  chart4: 'oklch(0.65 0.18 200)',
  chart5: 'oklch(0.769 0.188 70.08)',
};

export function StatisticsPanel() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/statistics');
      const data = await res.json();
      if (data.success) setStats(data.stats);
    } catch (e) {
      toast.error('Error al cargar estadísticas');
    } finally {
      setLoading(false);
    }
  };

  const resetStats = async () => {
    if (!confirm('¿Estás seguro de eliminar TODAS las estadísticas y operaciones? Esta acción no se puede deshacer.')) return;
    try {
      // Eliminar operaciones
      await fetch('/api/operations', { method: 'DELETE' });
      // Eliminar backtests
      const btRes = await fetch('/api/backtest');
      const btData = await btRes.json();
      if (btData.success) {
        for (const bt of btData.backtests) {
          await fetch(`/api/backtest?id=${bt.id}`, { method: 'DELETE' });
        }
      }
      toast.success('Estadísticas reiniciadas correctamente');
      load();
    } catch (e) {
      toast.error('Error al reiniciar estadísticas');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!stats || stats.total === 0) {
    return (
      <div className="text-center py-20">
        <BarChart3 className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
        <p className="text-muted-foreground">Sin operaciones registradas todavía</p>
        <p className="text-xs text-muted-foreground mt-1">Realiza operaciones para ver tus estadísticas aquí</p>
        <Button onClick={load} variant="outline" size="sm" className="mt-4">
          <RefreshCw className="w-3 h-3 mr-1" />
          Refrescar
        </Button>
      </div>
    );
  }

  const winLossData = [
    { name: 'Ganadas', value: stats.wins, color: CHART_COLORS.success },
    { name: 'Perdidas', value: stats.losses, color: CHART_COLORS.danger },
    { name: 'Empates', value: stats.draws, color: CHART_COLORS.warning },
  ];

  const directionData = [
    { name: 'CALL Ganadas', value: stats.byDirection.CALL.wins, color: CHART_COLORS.success },
    { name: 'CALL Perdidas', value: stats.byDirection.CALL.total - stats.byDirection.CALL.wins, color: CHART_COLORS.danger },
    { name: 'PUT Ganadas', value: stats.byDirection.PUT.wins, color: CHART_COLORS.chart4 },
    { name: 'PUT Perdidas', value: stats.byDirection.PUT.total - stats.byDirection.PUT.wins, color: CHART_COLORS.warning },
  ];

  const equityData = stats.equityCurve.map((e: any) => ({
    ...e,
    balance: parseFloat(e.balance.toFixed(2)),
  }));

  const pairData = stats.byPair.slice(0, 8).map((p: any) => ({
    name: p.pair.replace('-OTC', '*'),
    wins: p.wins,
    losses: p.losses,
    profit: parseFloat(p.profit.toFixed(2)),
  }));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-chart-5/15 flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-chart-5" />
          </div>
          <div>
            <h2 className="font-black text-lg">Estadísticas y Análisis</h2>
            <p className="text-xs text-muted-foreground">Resumen completo de tu rendimiento</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="w-3 h-3 mr-1" />
            Actualizar
          </Button>
          {stats.total > 0 && (
            <Button variant="outline" size="sm" onClick={resetStats} className="border-danger/40 text-danger hover:bg-danger/10">
              <Trash2 className="w-3 h-3 mr-1" />
              Reiniciar
            </Button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <StatCard icon={Activity} label="Operaciones" value={stats.total} color="accent" />
        <StatCard icon={Trophy} label="Ganadas" value={stats.wins} color="success" />
        <StatCard icon={TrendingDown} label="Perdidas" value={stats.losses} color="danger" />
        <StatCard icon={Target} label="Win Rate" value={`${stats.winRate.toFixed(1)}%`} color="warning" />
        <StatCard icon={DollarSign} label="Profit" value={`${stats.totalProfit >= 0 ? '+' : ''}$${stats.totalProfit.toFixed(2)}`} color={stats.totalProfit >= 0 ? 'success' : 'danger'} />
        <StatCard icon={TrendingUp} label="Profit Factor" value={stats.profitFactor.toFixed(2)} color="chart4" />
      </div>

      {/* Equity curve */}
      <Card className="glass-strong border-border/50 p-5">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-success" />
          <h3 className="font-bold text-sm">Curva de Capital</h3>
          <Badge variant="outline" className="ml-auto text-[10px]">
            Balance actual: ${stats.currentBalance.toFixed(2)}
          </Badge>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={equityData}>
              <defs>
                <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART_COLORS.success} stopOpacity={0.6} />
                  <stop offset="100%" stopColor={CHART_COLORS.success} stopOpacity={0} />
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
                stroke={CHART_COLORS.success}
                strokeWidth={2}
                fill="url(#equityGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Win/Loss pie */}
        <Card className="glass-strong border-border/50 p-5">
          <div className="flex items-center gap-2 mb-3">
            <PieChart className="w-4 h-4 text-accent" />
            <h3 className="font-bold text-sm">Distribución de Resultados</h3>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <RePieChart>
                <Pie
                  data={winLossData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                  label={(entry) => `${entry.name}: ${entry.value}`}
                  labelLine={false}
                  fontSize={11}
                >
                  {winLossData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: 'oklch(0.18 0.025 250)',
                    border: '1px solid oklch(1 0 0 / 0.1)',
                    borderRadius: '0.5rem',
                    fontSize: '12px',
                  }}
                />
              </RePieChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Direction stats */}
        <Card className="glass-strong border-border/50 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-4 h-4 text-warning" />
            <h3 className="font-bold text-sm">Por Dirección (CALL/PUT)</h3>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={directionData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 0.05)" horizontal={false} />
                <XAxis type="number" stroke="oklch(0.65 0.03 250)" fontSize={11} />
                <YAxis type="category" dataKey="name" stroke="oklch(0.65 0.03 250)" fontSize={10} width={90} />
                <Tooltip
                  contentStyle={{
                    background: 'oklch(0.18 0.025 250)',
                    border: '1px solid oklch(1 0 0 / 0.1)',
                    borderRadius: '0.5rem',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                  {directionData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Per pair breakdown */}
      <Card className="glass-strong border-border/50 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Coins className="w-4 h-4 text-chart-4" />
          <h3 className="font-bold text-sm">Rendimiento por Par</h3>
          <Badge variant="outline" className="ml-auto text-[10px]">Top 8</Badge>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={pairData}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 0.05)" />
              <XAxis dataKey="name" stroke="oklch(0.65 0.03 250)" fontSize={10} angle={-30} textAnchor="end" height={60} />
              <YAxis stroke="oklch(0.65 0.03 250)" fontSize={11} />
              <Tooltip
                contentStyle={{
                  background: 'oklch(0.18 0.025 250)',
                  border: '1px solid oklch(1 0 0 / 0.1)',
                  borderRadius: '0.5rem',
                  fontSize: '12px',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              <Bar dataKey="wins" name="Ganadas" fill={CHART_COLORS.success} radius={[4, 4, 0, 0]} />
              <Bar dataKey="losses" name="Perdidas" fill={CHART_COLORS.danger} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Streaks summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StreakCard
          icon={Flame}
          label="Racha actual"
          value={stats.currentStreak}
          type={stats.currentStreakType}
        />
        <StreakCard
          icon={Trophy}
          label="Mejor racha ganadora"
          value={stats.longestWinStreak}
          type="WIN"
        />
        <StreakCard
          icon={TrendingDown}
          label="Peor racha perdedora"
          value={stats.longestLossStreak}
          type="LOSS"
        />
        <StreakCard
          icon={DollarSign}
          label="Ganancia promedio"
          value={`$${stats.avgProfit.toFixed(2)}`}
          type={stats.avgProfit >= 0 ? 'WIN' : 'LOSS'}
          isText
        />
      </div>

      {/* Detailed pair table */}
      <Card className="glass-strong border-border/50 p-5">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="w-4 h-4 text-chart-5" />
          <h3 className="font-bold text-sm">Detalle por Par</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/50 text-muted-foreground">
                <th className="text-left py-2 px-2">Par</th>
                <th className="text-center py-2 px-2">Operaciones</th>
                <th className="text-center py-2 px-2">Ganadas</th>
                <th className="text-center py-2 px-2">Perdidas</th>
                <th className="text-center py-2 px-2">Win Rate</th>
                <th className="text-right py-2 px-2">Profit</th>
              </tr>
            </thead>
            <tbody>
              {stats.byPair.map((p: any) => (
                <tr key={p.pair} className="border-b border-border/20 hover:bg-muted/30">
                  <td className="py-2 px-2 font-bold">{p.pair}</td>
                  <td className="text-center py-2 px-2">{p.total}</td>
                  <td className="text-center py-2 px-2 text-success font-bold">{p.wins}</td>
                  <td className="text-center py-2 px-2 text-danger font-bold">{p.losses}</td>
                  <td className="text-center py-2 px-2">
                    <span className={cn(
                      'px-2 py-0.5 rounded-full text-[10px] font-bold',
                      p.winRate >= 60 ? 'bg-success/20 text-success' :
                      p.winRate >= 40 ? 'bg-warning/20 text-warning' :
                      'bg-danger/20 text-danger'
                    )}>
                      {p.winRate.toFixed(1)}%
                    </span>
                  </td>
                  <td className={cn('text-right py-2 px-2 font-bold', p.profit >= 0 ? 'text-success' : 'text-danger')}>
                    {p.profit >= 0 ? '+' : ''}${p.profit.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: any) {
  const colorMap: Record<string, string> = {
    success: 'text-success',
    danger: 'text-danger',
    warning: 'text-warning',
    accent: 'text-accent',
    chart4: 'text-chart-4',
    chart5: 'text-chart-5',
  };
  return (
    <Card className="glass-strong border-border/50 p-3 card-hover">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</span>
        <Icon className={cn('w-3.5 h-3.5', colorMap[color])} />
      </div>
      <div className={cn('text-lg font-black', colorMap[color])}>{value}</div>
    </Card>
  );
}

function StreakCard({ icon: Icon, label, value, type, isText }: any) {
  const colorClass = type === 'WIN' ? 'text-success' : type === 'LOSS' ? 'text-danger' : 'text-muted-foreground';
  const bgClass = type === 'WIN' ? 'bg-success/10 border-success/30' : type === 'LOSS' ? 'bg-danger/10 border-danger/30' : 'bg-muted/30 border-border/40';
  return (
    <Card className={cn('glass-strong p-4 border', bgClass)}>
      <div className="flex items-center justify-between mb-2">
        <Icon className={cn('w-4 h-4', colorClass)} />
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</span>
      </div>
      <div className={cn('text-2xl font-black', colorClass)}>
        {isText ? value : value}
        {!isText && <span className="text-xs ml-1">{type === 'WIN' ? 'ganadas' : type === 'LOSS' ? 'perdidas' : ''}</span>}
      </div>
    </Card>
  );
}
