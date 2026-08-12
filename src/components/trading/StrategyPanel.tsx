'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CandlestickChart, RefreshCw, Loader2, Activity, Target, Zap,
  AlertCircle, TrendingUp, TrendingDown, ArrowUpCircle, ArrowDownCircle,
  Settings2, Eye, Shield, CheckCircle2, XCircle, Play
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { CandleChart } from './CandleChart';
import { MarketLog, useMarketLog } from './MarketLog';

interface StrategyPanelProps {
  settings: any;
  onSettingsUpdate: () => void;
}

const PAIRS = [
  'EURUSD-OTC', 'GBPUSD-OTC', 'USDJPY-OTC', 'AUDUSD-OTC', 'EURGBP-OTC',
  'BTCUSD-OTC', 'ETHUSD-OTC', 'XAUUSD-OTC', 'AUDCAD-OTC',
  'EURUSD', 'GBPUSD', 'USDJPY', 'BTCUSD',
];

export function StrategyPanel({ settings, onSettingsUpdate }: StrategyPanelProps) {
  // Inicializar el par desde settings o localStorage para persistencia
  const [pair, setPair] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('strategy-selected-pair');
      if (saved) return saved;
    }
    return 'EURUSD-OTC';
  });

  const handlePairChange = (newPair: string) => {
    setPair(newPair);
    if (typeof window !== 'undefined') {
      localStorage.setItem('strategy-selected-pair', newPair);
    }
  };

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const { entries: logEntries, addEntry: addLog, clear: clearLog } = useMarketLog();
  const lastSignalRef = useRef<any>(null);

  // Config form
  const [config, setConfig] = useState<any>({});
  const [savingConfig, setSavingConfig] = useState(false);

  useEffect(() => {
    if (settings?.strategyConfig) {
      try {
        setConfig(JSON.parse(settings.strategyConfig));
      } catch {
        setConfig({});
      }
    }
  }, [settings]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/strategy?pair=${pair}&candles=80`);
      const d = await res.json();
      if (d.success) {
        setData(d);

        // Registrar en log: estado del mercado
        if (d.isLateral) {
          addLog('MARKET', `Mercado lateral detectado (score: ${d.lateralScore.toFixed(0)}/100) - no se opera`, pair);
        } else if (d.signals?.length === 0) {
          // No registrar "sin señales" en cada refresh para no saturar
        }

        // Registrar nueva señal detectada
        if (d.lastSignal && (!lastSignalRef.current || lastSignalRef.current.index !== d.lastSignal.index || lastSignalRef.current.confidence !== d.lastSignal.confidence)) {
          addLog('SIGNAL',
            `Señal ${d.lastSignal.direction} detectada (${d.lastSignal.confidence.toFixed(0)}% confianza)`,
            pair,
            d.lastSignal.reason
          );
          lastSignalRef.current = d.lastSignal;
        }
      } else {
        // Sin velas del broker no se pinta nada: antes se rellenaba con velas
        // inventadas y el gráfico parecía real.
        setData(null);
        addLog('ERROR', d.error || 'No hay velas reales del broker', pair);
      }
    } catch (e) {
      toast.error('Error al cargar estrategia');
    } finally {
      setLoading(false);
    }
  }, [pair]);

  useEffect(() => {
    load();
  }, [load]);

  // Auto-refresh cada 60 segundos (1 vela M1)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [autoRefresh, load]);

  const refresh = async () => {
    await fetch('/api/strategy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'analyze', pair }),
    });
    load();
  };

  const executeSignal = async () => {
    if (!data?.lastSignal) {
      toast.error('No hay señal válida para ejecutar');
      addLog('WARNING', 'Intento de ejecutar señal sin señal válida detectada', pair);
      return;
    }
    setExecuting(true);
    addLog('OPERATION', `Ejecutando operación ${data.lastSignal.direction} manualmente...`, pair, data.lastSignal.reason);
    try {
      const res = await fetch('/api/strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'execute_signal', pair }),
      });
      const d = await res.json();
      if (d.success) {
        // La orden queda ABIERTA en el broker. El resultado llega al expirar,
        // lo confirma el auto-trader y aparece solo en el historial.
        addLog('OPERATION',
          `Orden ${d.signal.direction} enviada al broker · esperando resultado`,
          pair,
          { reason: d.signal.reason, operationId: d.operationId }
        );
        toast.success('Orden enviada al broker', {
          description: `${pair} · ${d.signal.direction} · el resultado llegará al expirar`,
        });
        onSettingsUpdate();
        load();
      } else {
        addLog('ERROR', `Error al ejecutar: ${d.error}`, pair);
        toast.error(d.error);
      }
    } catch (e) {
      addLog('ERROR', `Error de conexión al ejecutar señal`, pair);
      toast.error('Error al ejecutar señal');
    } finally {
      setExecuting(false);
    }
  };

  const saveConfig = async () => {
    setSavingConfig(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategyConfig: config, strategyName: 'INDECISION_FUERZA_CONTINUIDAD' }),
      });
      const d = await res.json();
      if (d.success) {
        toast.success('Configuración de estrategia guardada');
        onSettingsUpdate();
        load();
      } else toast.error(d.error);
    } catch (e) {
      toast.error('Error al guardar');
    } finally {
      setSavingConfig(false);
    }
  };

  const updateConfig = (key: string, value: any) => {
    setConfig((prev: any) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center">
            <CandlestickChart className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h2 className="font-black text-lg">Estrategia: Indecisión, Fuerza y Continuidad</h2>
            <p className="text-xs text-muted-foreground">Detección de doji · vela gatillo · continuación</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={pair} onValueChange={handlePairChange}>
            <SelectTrigger className="w-36 h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAIRS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={cn('h-9', autoRefresh && 'border-success/40 text-success')}
          >
            <Activity className={cn('w-3.5 h-3.5 mr-1', autoRefresh && 'pulse-dot')} />
            {autoRefresh ? 'LIVE · 1min' : 'OFF'}
          </Button>
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading} className="h-9">
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowConfig(!showConfig)} className="h-9">
            <Settings2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Strategy rules summary */}
      <Card className="glass-strong border-border/50 p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <RuleCard
            step="1"
            icon={TrendingDown}
            title="Impulso"
            desc="Movimiento direccional previo (3+ velas)"
            color="warning"
          />
          <RuleCard
            step="2"
            icon={Eye}
            title="Doji (Indecisión)"
            desc="Cuerpo ≤15% · mechas en ambos lados"
            color="accent"
          />
          <RuleCard
            step="3"
            icon={Zap}
            title="Vela de Fuerza"
            desc="Sobrepasa mecha · 65-80% del doji"
            color="success"
          />
          <RuleCard
            step="4"
            icon={Activity}
            title="Continuidad"
            desc="Operar a favor en segundo :00"
            color="chart4"
          />
        </div>
      </Card>

      {/* Config panel */}
      <AnimatePresence>
        {showConfig && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <Card className="glass-strong border-border/50 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Settings2 className="w-4 h-4 text-accent" />
                  <h3 className="font-bold text-sm">Configuración de la Estrategia</h3>
                </div>
                <Button onClick={saveConfig} disabled={savingConfig} size="sm" className="glow-primary" style={{
                  background: 'linear-gradient(135deg, oklch(0.72 0.19 155), oklch(0.62 0.22 290))'
                }}>
                  {savingConfig ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                  Guardar
                </Button>
              </div>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                <ConfigSlider
                  label="Doji: cuerpo máximo (%)"
                  value={config.dojiMaxBodyPct ?? 15}
                  onChange={(v) => updateConfig('dojiMaxBodyPct', v)}
                  min={5} max={30} step={1}
                  hint="Cuerpo debe ser ≤ este % del rango"
                />
                <ConfigSlider
                  label="Doji: mecha mínima (%)"
                  value={config.dojiMinWickBothSides ?? 15}
                  onChange={(v) => updateConfig('dojiMinWickBothSides', v)}
                  min={5} max={40} step={1}
                  hint="Cada mecha ≥ este % del rango"
                />
                <ConfigSlider
                  label="Impulso: velas mínimas"
                  value={config.impulseMinCandles ?? 3}
                  onChange={(v) => updateConfig('impulseMinCandles', v)}
                  min={2} max={10} step={1}
                  hint="Velas mínimas del impulso"
                />
                <ConfigSlider
                  label="Fuerza: cuerpo mínimo (%)"
                  value={config.forceMinBodyPct ?? 65}
                  onChange={(v) => updateConfig('forceMinBodyPct', v)}
                  min={50} max={80} step={1}
                  hint="Cuerpo fuerza ≥ este % del doji"
                />
                <ConfigSlider
                  label="Fuerza: cuerpo máximo (%)"
                  value={config.forceMaxBodyPct ?? 80}
                  onChange={(v) => updateConfig('forceMaxBodyPct', v)}
                  min={70} max={100} step={1}
                  hint="Si excede = agotamiento"
                />
                <ConfigSlider
                  label="Filtro lateral: lookback"
                  value={config.lateralLookback ?? 14}
                  onChange={(v) => updateConfig('lateralLookback', v)}
                  min={5} max={30} step={1}
                  hint="Velas para evaluar lateralidad"
                />
                <div className="flex items-center justify-between p-3 rounded-xl bg-muted/30">
                  <div>
                    <div className="text-xs font-bold">Vela fuerza debe romper mecha</div>
                    <div className="text-[10px] text-muted-foreground">Si no, validar solo cuerpo</div>
                  </div>
                  <Switch
                    checked={config.forceMustBreakWick ?? true}
                    onCheckedChange={(v) => updateConfig('forceMustBreakWick', v)}
                  />
                </div>
                <div className="flex items-center justify-between p-3 rounded-xl bg-muted/30">
                  <div>
                    <div className="text-xs font-bold">Filtro mercado lateral</div>
                    <div className="text-[10px] text-muted-foreground">No operar en lateral</div>
                  </div>
                  <Switch
                    checked={config.lateralFilterEnabled ?? true}
                    onCheckedChange={(v) => updateConfig('lateralFilterEnabled', v)}
                  />
                </div>
                <div className="flex items-center justify-between p-3 rounded-xl bg-muted/30">
                  <div>
                    <div className="text-xs font-bold">Alinear con tendencia</div>
                    <div className="text-[10px] text-muted-foreground">Validar dirección impulso</div>
                  </div>
                  <Switch
                    checked={config.requireTrendAlignment ?? true}
                    onCheckedChange={(v) => updateConfig('requireTrendAlignment', v)}
                  />
                </div>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chart */}
      <Card className="glass-strong border-border/50 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <CandlestickChart className="w-4 h-4 text-accent" />
            <h3 className="font-bold text-sm">{pair} · M1</h3>
            <Badge variant="outline" className="text-[10px]">
              {data?.candles?.length || 0} velas
            </Badge>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-warning" />
              <span className="text-muted-foreground">Impulso</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-chart-3" />
              <span className="text-muted-foreground">Doji</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-success" />
              <span className="text-muted-foreground">Fuerza</span>
            </div>
            <div className="flex items-center gap-1">
              <ArrowUpCircle className="w-3 h-3 text-success" />
              <ArrowDownCircle className="w-3 h-3 text-danger" />
              <span className="text-muted-foreground">Señal</span>
            </div>
          </div>
        </div>
        {loading && !data ? (
          <div className="flex items-center justify-center h-96">
            <Loader2 className="w-6 h-6 animate-spin text-accent" />
          </div>
        ) : data?.candles ? (
          <CandleChart
            candles={data.candles}
            patterns={data.patterns}
            signals={data.signals}
            height={420}
          />
        ) : (
          <div className="flex items-center justify-center h-96 text-muted-foreground text-sm">
            Sin datos
          </div>
        )}
      </Card>

      {/* Current signal */}
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className={cn(
          'glass-strong border p-5 lg:col-span-2',
          data?.lastSignal
            ? data.lastSignal.direction === 'CALL' ? 'border-success/40 glow-success' : 'border-danger/40 glow-danger'
            : 'border-border/50'
        )}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-accent" />
              <h3 className="font-bold text-sm">Señal Actual</h3>
            </div>
            {data?.isLateral && (
              <Badge variant="outline" className="text-[10px] border-warning/40 text-warning bg-warning/10">
                <AlertCircle className="w-3 h-3 mr-1" />
                Mercado lateral
              </Badge>
            )}
          </div>
          {data?.lastSignal ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className={cn(
                  'w-14 h-14 rounded-2xl flex items-center justify-center',
                  data.lastSignal.direction === 'CALL' ? 'bg-success/20' : 'bg-danger/20'
                )}>
                  {data.lastSignal.direction === 'CALL' ? (
                    <ArrowUpCircle className="w-7 h-7 text-success" />
                  ) : (
                    <ArrowDownCircle className="w-7 h-7 text-danger" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-black">
                      {data.lastSignal.direction === 'CALL' ? 'COMPRA' : 'VENTA'}
                    </span>
                    <Badge variant="outline" className={cn(
                      'text-[10px]',
                      data.lastSignal.direction === 'CALL' ? 'border-success/40 text-success' : 'border-danger/40 text-danger'
                    )}>
                      {data.lastSignal.direction}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Confianza: <span className="font-bold text-warning">{data.lastSignal.confidence.toFixed(0)}%</span>
                    {' · '}
                    Precio: <span className="font-mono">{data.lastSignal.entryPrice.toFixed(5)}</span>
                  </div>
                </div>
                <Button
                  onClick={executeSignal}
                  disabled={executing || data.isLateral}
                  size="lg"
                  className={cn(
                    'font-bold',
                    data.lastSignal.direction === 'CALL'
                      ? 'bg-success hover:bg-success/90 text-success-foreground glow-success'
                      : 'bg-danger hover:bg-danger/90 text-danger-foreground glow-danger'
                  )}
                >
                  {executing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                  EJECUTAR
                </Button>
              </div>

              {/* Pattern breakdown */}
              <div className="grid grid-cols-3 gap-2">
                <PatternStep
                  step="1"
                  label="Impulso"
                  value={data.lastSignal.pattern.impulseRange}
                  icon={TrendingDown}
                  color="warning"
                />
                <PatternStep
                  step="2"
                  label="Doji"
                  value={data.lastSignal.pattern.dojiDescription}
                  icon={Eye}
                  color="accent"
                />
                <PatternStep
                  step="3"
                  label="Fuerza"
                  value={data.lastSignal.pattern.forceDescription}
                  icon={Zap}
                  color="success"
                />
              </div>

              {/* Reason */}
              <div className="p-3 rounded-xl bg-muted/30 border border-border/40">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Análisis completo</div>
                <div className="text-xs">{data.lastSignal.reason}</div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <AlertCircle className="w-10 h-10 mx-auto mb-2 text-muted-foreground opacity-50" />
              <p className="text-sm text-muted-foreground">
                {data?.isLateral ? 'Mercado lateral - no hay señal válida' : 'No hay señal detectada'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Esperando patrón: Impulso → Doji → Vela de Fuerza
              </p>
            </div>
          )}
        </Card>

        {/* Market state */}
        <Card className="glass-strong border-border/50 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-chart-4" />
            <h3 className="font-bold text-sm">Estado del Mercado</h3>
          </div>
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">Lateralidad</span>
                <span className={cn(
                  'text-xs font-bold',
                  data?.isLateral ? 'text-warning' : 'text-success'
                )}>
                  {data?.isLateral ? 'LATERAL' : 'DIRECCIONAL'}
                </span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn(
                    'h-full transition-all',
                    (data?.lateralScore || 0) > 60 ? 'bg-warning' : 'bg-success'
                  )}
                  style={{ width: `${data?.lateralScore || 0}%` }}
                />
              </div>
              <div className="text-[10px] text-muted-foreground mt-1">
                Score: {(data?.lateralScore || 0).toFixed(0)} / 100
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <StatBox
                label="Señales totales"
                value={data?.signals?.length || 0}
                color="accent"
              />
              <StatBox
                label="Confianza media"
                value={
                  data?.signals?.length > 0
                    ? `${(data.signals.reduce((s: number, x: any) => s + x.confidence, 0) / data.signals.length).toFixed(0)}%`
                    : '—'
                }
                color="warning"
              />
            </div>

            <div className="pt-3 border-t border-border/30">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                Reglas activas
              </div>
              <div className="space-y-1.5">
                <RuleStatus
                  active={config.lateralFilterEnabled ?? true}
                  label="Filtro mercado lateral"
                />
                <RuleStatus
                  active={config.forceMustBreakWick ?? true}
                  label="Vela fuerza rompe mecha"
                />
                <RuleStatus
                  active={config.requireTrendAlignment ?? true}
                  label="Alineación con tendencia"
                />
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Signal history */}
      {data?.signals && data.signals.length > 0 && (
        <Card className="glass-strong border-border/50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-4 h-4 text-chart-5" />
            <h3 className="font-bold text-sm">Señales Detectadas ({data.signals.length})</h3>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {data.signals.slice().reverse().map((sig: any, i: number) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                className="flex items-center gap-3 p-2.5 rounded-xl bg-muted/30 border border-border/40 hover:bg-muted/50"
              >
                <div className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                  sig.direction === 'CALL' ? 'bg-success/15' : 'bg-danger/15'
                )}>
                  {sig.direction === 'CALL' ? (
                    <ArrowUpCircle className="w-4 h-4 text-success" />
                  ) : (
                    <ArrowDownCircle className="w-4 h-4 text-danger" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-bold">{sig.direction === 'CALL' ? 'CALL' : 'PUT'}</span>
                    <span className="text-muted-foreground">@ vela #{sig.pattern.continuityIndex}</span>
                    <Badge variant="outline" className="text-[9px] px-1">
                      {sig.confidence.toFixed(0)}% conf
                    </Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate">{sig.reason}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </Card>
      )}

      {/* Market Log */}
      <MarketLog entries={logEntries} onClear={clearLog} maxHeight={350} />
    </div>
  );
}

function RuleCard({ step, icon: Icon, title, desc, color }: any) {
  const colorMap: Record<string, string> = {
    success: 'text-success bg-success/10 border-success/30',
    danger: 'text-danger bg-danger/10 border-danger/30',
    warning: 'text-warning bg-warning/10 border-warning/30',
    accent: 'text-accent bg-accent/10 border-accent/30',
    chart4: 'text-chart-4 bg-chart-4/10 border-chart-4/30',
  };
  return (
    <div className={cn('rounded-xl p-3 border', colorMap[color])}>
      <div className="flex items-center gap-2 mb-1">
        <div className="w-6 h-6 rounded-full bg-background/50 flex items-center justify-center text-[10px] font-black">
          {step}
        </div>
        <Icon className="w-4 h-4" />
        <span className="text-xs font-bold">{title}</span>
      </div>
      <div className="text-[10px] text-muted-foreground">{desc}</div>
    </div>
  );
}

function ConfigSlider({ label, value, onChange, min, max, step, hint }: any) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        <span className="text-sm font-bold text-accent">{value}</span>
      </div>
      <Slider value={[value]} onValueChange={(v) => onChange(v[0])} min={min} max={max} step={step} />
      <div className="text-[10px] text-muted-foreground">{hint}</div>
    </div>
  );
}

function PatternStep({ step, label, value, icon: Icon, color }: any) {
  const colorMap: Record<string, string> = {
    success: 'text-success border-success/30 bg-success/10',
    danger: 'text-danger border-danger/30 bg-danger/10',
    warning: 'text-warning border-warning/30 bg-warning/10',
    accent: 'text-accent border-accent/30 bg-accent/10',
  };
  return (
    <div className={cn('rounded-xl p-2.5 border', colorMap[color])}>
      <div className="flex items-center gap-1 mb-0.5">
        <span className="text-[9px] font-black bg-background/50 rounded-full w-4 h-4 flex items-center justify-center">{step}</span>
        <Icon className="w-3 h-3" />
        <span className="text-[10px] font-bold uppercase">{label}</span>
      </div>
      <div className="text-[10px] font-mono">{value}</div>
    </div>
  );
}

function StatBox({ label, value, color }: any) {
  const colorMap: Record<string, string> = {
    accent: 'text-accent',
    warning: 'text-warning',
    success: 'text-success',
    danger: 'text-danger',
  };
  return (
    <div className="rounded-xl p-2 bg-muted/30 border border-border/30">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn('text-lg font-black', colorMap[color])}>{value}</div>
    </div>
  );
}

function RuleStatus({ active, label }: { active: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      {active ? (
        <CheckCircle2 className="w-3.5 h-3.5 text-success" />
      ) : (
        <XCircle className="w-3.5 h-3.5 text-muted-foreground" />
      )}
      <span className={cn(active ? 'text-foreground' : 'text-muted-foreground line-through')}>{label}</span>
    </div>
  );
}
