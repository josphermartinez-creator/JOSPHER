'use client';

import { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Save, Loader2, User, Bell, Shield, Cpu } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface SettingsPanelProps {
  settings: any;
  account: any;
  onUpdate: () => void;
}

export function SettingsPanel({ settings, account, onUpdate }: SettingsPanelProps) {
  const [form, setForm] = useState<any>(settings || {});
  const [strategyConfig, setStrategyConfig] = useState<any>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(settings || {});
    try {
      setStrategyConfig(settings?.strategyConfig ? JSON.parse(settings.strategyConfig) : {});
    } catch {
      setStrategyConfig({});
    }
  }, [settings]);

  const update = (key: string, value: any) => {
    setForm((prev: any) => ({ ...prev, [key]: value }));
  };

  const updateStrategy = (key: string, value: any) => {
    setStrategyConfig((prev: any) => ({ ...prev, [key]: value }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          strategyConfig,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Ajustes guardados');
        onUpdate();
      } else toast.error(data.error);
    } catch (e) {
      toast.error('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-muted/30 flex items-center justify-center">
            <SettingsIcon className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <h2 className="font-black text-lg">Ajustes</h2>
            <p className="text-xs text-muted-foreground">Configuración general del bot</p>
          </div>
        </div>
        <Button onClick={save} disabled={saving} className="glow-primary" style={{
          background: 'linear-gradient(135deg, oklch(0.72 0.19 155), oklch(0.62 0.22 290))'
        }}>
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Guardar
        </Button>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Account info */}
        <Card className="glass-strong border-border/50 p-5">
          <div className="flex items-center gap-2 mb-4">
            <User className="w-4 h-4 text-accent" />
            <h3 className="font-bold text-sm">Información de Cuenta</h3>
          </div>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Email</Label>
              <Input value={account?.email || ''} disabled className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Tipo de cuenta</Label>
                <Input value={account?.accountType || ''} disabled className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Balance</Label>
                <Input value={`$${account?.balance?.toFixed(2) || 0}`} disabled className="mt-1" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Última conexión</Label>
              <Input
                value={account?.lastLogin ? new Date(account.lastLogin).toLocaleString('es-ES') : 'Nunca'}
                disabled
                className="mt-1"
              />
            </div>
          </div>
        </Card>

        {/* Strategy config */}
        <Card className="glass-strong border-border/50 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Cpu className="w-4 h-4 text-success" />
            <h3 className="font-bold text-sm">Estrategia Activa</h3>
          </div>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Estrategia</Label>
              <Select value={form.strategyName || 'INDECISION_FUERZA_CONTINUIDAD'} onValueChange={(v) => update('strategyName', v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="INDECISION_FUERZA_CONTINUIDAD">Indecisión, Fuerza y Continuidad</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="p-3 rounded-xl bg-accent/10 border border-accent/30">
              <div className="text-[10px] uppercase tracking-wider text-accent font-bold mb-1">
                Reglas de la estrategia
              </div>
              <ol className="text-[11px] text-muted-foreground space-y-1 ml-4 list-decimal">
                <li>Detectar impulso direccional previo (3+ velas)</li>
                <li>Identificar doji (cuerpo ≤15%, mechas en ambos lados)</li>
                <li>Vela de fuerza: 65-80% del doji + sobrepasa mecha</li>
                <li>Operar continuidad a favor de la vela fuerza</li>
                <li>Filtrar mercados laterales (no operar)</li>
              </ol>
            </div>
            <div>
              <Label className="text-xs">Confianza mínima para operar (%)</Label>
              <Input
                type="number"
                value={strategyConfig.minConfidence || 65}
                onChange={(e) => updateStrategy('minConfidence', parseInt(e.target.value))}
                className="mt-1"
                min={50}
                max={95}
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Solo se ejecutan señales con confianza ≥ a este valor
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full border-accent/40 text-accent hover:bg-accent/10"
              onClick={() => window.location.reload()}
            >
              Ir a panel de Estrategia →
            </Button>
          </div>
        </Card>

        {/* Notifications */}
        <Card className="glass-strong border-border/50 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Bell className="w-4 h-4 text-warning" />
            <h3 className="font-bold text-sm">Notificaciones</h3>
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
              <span>Notificar al abrir operación</span>
              <span className="text-success text-xs">Activado</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
              <span>Notificar al cerrar operación</span>
              <span className="text-success text-xs">Activado</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
              <span>Alerta de Stop Loss</span>
              <span className="text-success text-xs">Activado</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
              <span>Resumen diario</span>
              <span className="text-success text-xs">Activado</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
              <span>Notificar rachas (3+)</span>
              <span className="text-success text-xs">Activado</span>
            </div>
          </div>
        </Card>

        {/* System info */}
        <Card className="glass-strong border-border/50 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-4 h-4 text-danger" />
            <h3 className="font-bold text-sm">Sistema</h3>
          </div>
          <div className="space-y-2 text-xs">
            <SysRow label="Versión del bot" value="Quantum Bot v1.0.0" />
            <SysRow label="Framework" value="Next.js 16" />
            <SysRow label="Base de datos" value="SQLite / Prisma" />
            <SysRow label="Broker" value="IQ Options API" />
            <SysRow label="Estado de conexión" value="Conectado" status="success" />
            <SysRow label="Latencia" value="< 50ms" status="success" />
          </div>
        </Card>
      </div>
    </div>
  );
}

function SysRow({ label, value, status }: { label: string; value: string; status?: 'success' | 'warning' | 'danger' }) {
  return (
    <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn(
        'font-mono font-bold',
        status === 'success' ? 'text-success' :
        status === 'warning' ? 'text-warning' :
        status === 'danger' ? 'text-danger' : ''
      )}>{value}</span>
    </div>
  );
}
