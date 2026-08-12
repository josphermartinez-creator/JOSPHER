'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Shield, AlertTriangle, Target, TrendingUp, DollarSign,
  Save, Loader2, RotateCcw, Zap, Percent, Layers
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface RiskPanelProps {
  settings: any;
  onUpdate: () => void;
}

export function RiskPanel({ settings, onUpdate }: RiskPanelProps) {
  const [form, setForm] = useState<any>(settings || {});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(settings || {});
  }, [settings]);

  const update = (key: string, value: any) => {
    setForm((prev: any) => ({ ...prev, [key]: value }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Configuración guardada');
        onUpdate();
      } else {
        toast.error(data.error);
      }
    } catch (e) {
      toast.error('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setForm({
      initialCapital: 1000,
      riskPerOperation: 2,
      maxDailyLoss: 10,
      maxDailyOperations: 20,
      martingaleEnabled: false,
      martingaleFactor: 2,
      martingaleLevels: 2,
      stopLossEnabled: true,
      stopLossValue: 5,
      takeProfitEnabled: false,
      takeProfitValue: 10,
      defaultAmount: 25,
      defaultExpiry: 1,
      operationType: 'BINARY',
    });
    toast.info('Valores reiniciados (no guardados)');
  };

  const riskAmount = (form.initialCapital || 1000) * (form.riskPerOperation || 0) / 100;
  const maxLossAmount = (form.initialCapital || 1000) * (form.maxDailyLoss || 0) / 100;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-danger/15 flex items-center justify-center">
            <Shield className="w-5 h-5 text-danger" />
          </div>
          <div>
            <h2 className="font-black text-lg">Gestión de Riesgo</h2>
            <p className="text-xs text-muted-foreground">Configura tus límites y reglas de seguridad</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={reset} disabled={saving}>
            <RotateCcw className="w-3 h-3 mr-1" />
            Reiniciar
          </Button>
          <Button onClick={save} disabled={saving} className="glow-primary" style={{
            background: 'linear-gradient(135deg, oklch(0.72 0.19 155), oklch(0.62 0.22 290))'
          }}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Guardar
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Capital & Risk */}
        <Card className="glass-strong border-border/50 p-5">
          <div className="flex items-center gap-2 mb-4">
            <DollarSign className="w-4 h-4 text-success" />
            <h3 className="font-bold text-sm">Capital y Riesgo</h3>
          </div>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Capital inicial</Label>
              <div className="relative mt-1">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="number"
                  value={form.initialCapital || ''}
                  onChange={(e) => update('initialCapital', e.target.value)}
                  className="pl-10"
                  placeholder="1000"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs flex items-center gap-1">
                  <Percent className="w-3 h-3" />
                  Riesgo por operación
                </Label>
                <span className="text-sm font-bold text-warning">{form.riskPerOperation || 0}%</span>
              </div>
              <Slider
                value={[form.riskPerOperation || 0]}
                onValueChange={(v) => update('riskPerOperation', v[0])}
                min={0.5}
                max={10}
                step={0.5}
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>Conservador (0.5%)</span>
                <span className="text-warning font-bold">= ${riskAmount.toFixed(2)}</span>
                <span>Arriesgado (10%)</span>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Pérdida máxima diaria
                </Label>
                <span className="text-sm font-bold text-danger">{form.maxDailyLoss || 0}%</span>
              </div>
              <Slider
                value={[form.maxDailyLoss || 0]}
                onValueChange={(v) => update('maxDailyLoss', v[0])}
                min={1}
                max={30}
                step={1}
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>Limite = -${maxLossAmount.toFixed(2)}</span>
                <span>El bot se detiene al alcanzarlo</span>
              </div>
            </div>

            <div>
              <Label className="text-xs">Máx. operaciones diarias</Label>
              <Input
                type="number"
                value={form.maxDailyOperations || ''}
                onChange={(e) => update('maxDailyOperations', e.target.value)}
                className="mt-1"
                placeholder="20"
              />
            </div>
          </div>
        </Card>

        {/* Stop Loss / Take Profit */}
        <Card className="glass-strong border-border/50 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Target className="w-4 h-4 text-accent" />
            <h3 className="font-bold text-sm">Stop Loss & Take Profit</h3>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-xl bg-danger/10 border border-danger/30">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-danger/20 flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4 text-danger" />
                </div>
                <div>
                  <div className="text-sm font-bold">Stop Loss</div>
                  <div className="text-[10px] text-muted-foreground">Detiene el bot al perder X%</div>
                </div>
              </div>
              <Switch
                checked={form.stopLossEnabled}
                onCheckedChange={(v) => update('stopLossEnabled', v)}
              />
            </div>
            {form.stopLossEnabled && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-xs">Stop Loss en %</Label>
                  <span className="text-sm font-bold text-danger">{form.stopLossValue || 0}%</span>
                </div>
                <Slider
                  value={[form.stopLossValue || 0]}
                  onValueChange={(v) => update('stopLossValue', v[0])}
                  min={1}
                  max={25}
                  step={1}
                />
              </motion.div>
            )}

            <div className="flex items-center justify-between p-3 rounded-xl bg-success/10 border border-success/30">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-success/20 flex items-center justify-center">
                  <Target className="w-4 h-4 text-success" />
                </div>
                <div>
                  <div className="text-sm font-bold">Take Profit</div>
                  <div className="text-[10px] text-muted-foreground">Detiene el bot al ganar X%</div>
                </div>
              </div>
              <Switch
                checked={form.takeProfitEnabled}
                onCheckedChange={(v) => update('takeProfitEnabled', v)}
              />
            </div>
            {form.takeProfitEnabled && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-xs">Take Profit en %</Label>
                  <span className="text-sm font-bold text-success">{form.takeProfitValue || 0}%</span>
                </div>
                <Slider
                  value={[form.takeProfitValue || 0]}
                  onValueChange={(v) => update('takeProfitValue', v[0])}
                  min={1}
                  max={50}
                  step={1}
                />
              </motion.div>
            )}
          </div>
        </Card>

        {/* Martingale */}
        <Card className="glass-strong border-border/50 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Layers className="w-4 h-4 text-warning" />
            <h3 className="font-bold text-sm">Martingala</h3>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-xl bg-warning/10 border border-warning/30">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-warning/20 flex items-center justify-center">
                  <Layers className="w-4 h-4 text-warning" />
                </div>
                <div>
                  <div className="text-sm font-bold">Activar Martingala</div>
                  <div className="text-[10px] text-muted-foreground">Duplicar apuesta tras pérdida</div>
                </div>
              </div>
              <Switch
                checked={form.martingaleEnabled}
                onCheckedChange={(v) => update('martingaleEnabled', v)}
              />
            </div>
            {form.martingaleEnabled && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                <div>
                  <Label className="text-xs">Factor multiplicador</Label>
                  <Select value={String(form.martingaleFactor || 2)} onValueChange={(v) => update('martingaleFactor', v)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1.5">1.5x (suave)</SelectItem>
                      <SelectItem value="2">2x (clásica)</SelectItem>
                      <SelectItem value="2.5">2.5x (agresiva)</SelectItem>
                      <SelectItem value="3">3x (peligrosa)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Niveles máximos</Label>
                  <Select value={String(form.martingaleLevels || 2)} onValueChange={(v) => update('martingaleLevels', v)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 nivel</SelectItem>
                      <SelectItem value="2">2 niveles</SelectItem>
                      <SelectItem value="3">3 niveles</SelectItem>
                      <SelectItem value="5">5 niveles</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="p-3 rounded-xl bg-muted/30 border border-border/50">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Simulación (monto base $25)</div>
                  <div className="grid grid-cols-5 gap-1 text-center">
                    {[1, 2, 3, 4, 5].map(level => {
                      const amount = 25 * Math.pow(form.martingaleFactor || 2, level - 1);
                      return (
                        <div key={level} className={cn(
                          'p-2 rounded-lg border',
                          level <= (form.martingaleLevels || 2) ? 'border-warning/40 bg-warning/10' : 'border-border/30 opacity-40'
                        )}>
                          <div className="text-[10px] text-muted-foreground">N{level}</div>
                          <div className="text-xs font-bold">${amount.toFixed(0)}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        </Card>

        {/* Operation defaults */}
        <Card className="glass-strong border-border/50 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-4 h-4 text-success" />
            <h3 className="font-bold text-sm">Operación por Defecto</h3>
          </div>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Monto por operación</Label>
              <div className="relative mt-1">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="number"
                  value={form.defaultAmount || ''}
                  onChange={(e) => update('defaultAmount', e.target.value)}
                  className="pl-10"
                  placeholder="25"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Expiración (minutos)</Label>
              <Select value={String(form.defaultExpiry || 1)} onValueChange={(v) => update('defaultExpiry', v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 minuto (M1)</SelectItem>
                  <SelectItem value="5">5 minutos (M5)</SelectItem>
                  <SelectItem value="15">15 minutos (M15)</SelectItem>
                  <SelectItem value="30">30 minutos (M30)</SelectItem>
                  <SelectItem value="60">1 hora (H1)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Tipo de operación</Label>
              <Select value={form.operationType || 'BINARY'} onValueChange={(v) => update('operationType', v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BINARY">Opciones Binarias</SelectItem>
                  <SelectItem value="DIGITAL">Opciones Digitales</SelectItem>
                  <SelectItem value="FOREX">Forex</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
