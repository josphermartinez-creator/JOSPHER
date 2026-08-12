'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Send, MessageCircle, Bot, Check, Loader2, Bell, BellRing,
  Copy, ExternalLink, Zap, Shield, Activity
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface TelegramPanelProps {
  settings: any;
  onUpdate: () => void;
}

export function TelegramPanel({ settings, onUpdate }: TelegramPanelProps) {
  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setBotToken(settings?.telegramBotToken || '');
    setChatId(settings?.telegramChatId || '');
    setEnabled(settings?.telegramEnabled || false);
  }, [settings]);

  const save = async () => {
    if (enabled && (!botToken || !chatId)) {
      toast.error('Completa Bot Token y Chat ID');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegramEnabled: enabled,
          telegramBotToken: botToken,
          telegramChatId: chatId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Configuración guardada');
        onUpdate();
      } else toast.error(data.error);
    } catch (e) {
      toast.error('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    if (!botToken || !chatId) {
      toast.error('Completa Bot Token y Chat ID primero');
      return;
    }
    setTesting(true);
    try {
      const res = await fetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botToken, chatId, action: 'test' }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('✅ Mensaje enviado a Telegram', {
          description: data.message,
        });
      } else {
        toast.error('❌ Error de Telegram', {
          description: data.error,
        });
      }
    } catch (e) {
      toast.error('Error al enviar test');
    } finally {
      setTesting(false);
    }
  };

  const verify = async () => {
    if (!botToken) {
      toast.error('Ingresa el Bot Token primero');
      return;
    }
    setTesting(true);
    try {
      const res = await fetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botToken, action: 'verify' }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('✅ Bot verificado', {
          description: data.message,
        });
      } else {
        toast.error('❌ Token inválido', {
          description: data.error,
        });
      }
    } catch (e) {
      toast.error('Error al verificar');
    } finally {
      setTesting(false);
    }
  };

  const previewNotification = {
    title: 'OPERACIÓN GANADA',
    pair: 'EUR/USD OTC',
    direction: 'CALL ▲',
    amount: '$25.00',
    payout: '87%',
    profit: '+$21.75',
    confidence: '92%',
    expiry: '1 min',
    time: new Date().toLocaleTimeString('es-ES'),
    reason: 'RSI sobrevendido + cruce MACD alcista',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-chart-3/15 flex items-center justify-center">
          <Send className="w-5 h-5 text-chart-3" />
        </div>
        <div>
          <h2 className="font-black text-lg">Bot de Telegram</h2>
          <p className="text-xs text-muted-foreground">Recibe notificaciones de cada operación en tiempo real</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Config */}
        <Card className="glass-strong border-border/50 p-5 space-y-4">
          {/* Enable toggle */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-chart-3/10 border border-chart-3/30">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-chart-3/20 flex items-center justify-center">
                {enabled ? <BellRing className="w-4 h-4 text-chart-3" /> : <Bell className="w-4 h-4 text-muted-foreground" />}
              </div>
              <div>
                <div className="text-sm font-bold">Notificaciones activas</div>
                <div className="text-[10px] text-muted-foreground">Recibe alertas de cada operación</div>
              </div>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          {/* Bot Token */}
          <div>
            <Label className="text-xs flex items-center gap-1">
              <Bot className="w-3 h-3" />
              Bot Token
            </Label>
            <Input
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
              placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
              className="mt-1 font-mono text-xs"
              type="password"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Obtén tu token desde <span className="text-chart-3">@BotFather</span> en Telegram
            </p>
          </div>

          {/* Chat ID */}
          <div>
            <Label className="text-xs flex items-center gap-1">
              <MessageCircle className="w-3 h-3" />
              Chat ID
            </Label>
            <Input
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              placeholder="123456789"
              className="mt-1 font-mono text-xs"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Usa <span className="text-chart-3">@userinfobot</span> para obtener tu Chat ID
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={test}
              disabled={testing}
              variant="outline"
              className="flex-1 border-chart-3/40 text-chart-3 hover:bg-chart-3/10"
            >
              {testing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
              Enviar test
            </Button>
            <Button
              onClick={save}
              disabled={saving}
              className="flex-1 glow-primary"
              style={{ background: 'linear-gradient(135deg, oklch(0.72 0.19 155), oklch(0.62 0.22 290))' }}
            >
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
              Guardar
            </Button>
          </div>

          <Button
            onClick={verify}
            disabled={testing || !botToken}
            variant="outline"
            size="sm"
            className="w-full border-success/40 text-success hover:bg-success/10"
          >
            {testing ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : <Shield className="w-3 h-3 mr-2" />}
            Verificar token (getMe)
          </Button>

          {/* Help section */}
          <div className="rounded-xl bg-muted/30 border border-border/40 p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold">
              <Shield className="w-3 h-3 text-success" />
              Cómo configurar tu bot
            </div>
            <ol className="text-[11px] text-muted-foreground space-y-1 ml-4 list-decimal">
              <li>Abre Telegram y busca <span className="text-chart-3 font-bold">@BotFather</span></li>
              <li>Envía <code className="bg-muted px-1 rounded">/newbot</code> y sigue las instrucciones</li>
              <li>Copia el Bot Token que te proporciona</li>
              <li>Busca <span className="text-chart-3 font-bold">@userinfobot</span> para obtener tu Chat ID</li>
              <li>Pega ambos valores arriba y guarda</li>
            </ol>
          </div>
        </Card>

        {/* Preview */}
        <Card className="glass-strong border-border/50 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-4 h-4 text-success" />
            <h3 className="font-bold text-sm">Vista previa de notificación</h3>
            <Badge variant="outline" className="ml-auto text-[10px] text-success border-success/40">
              EN VIVO
            </Badge>
          </div>

          {/* Telegram-style message */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-2xl p-4 border"
            style={{
              background: 'linear-gradient(135deg, oklch(0.18 0.04 200 / 0.6), oklch(0.18 0.04 230 / 0.6))',
              borderColor: 'oklch(0.65 0.18 200 / 0.3)',
            }}
          >
            <div className="flex items-center gap-2 mb-3 pb-3 border-b border-border/30">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, oklch(0.72 0.19 155), oklch(0.62 0.22 290))' }}
              >
                <Send className="w-3.5 h-3.5 text-white" />
              </div>
              <div>
                <div className="text-xs font-bold">QUANTUM BOT</div>
                <div className="text-[10px] text-muted-foreground">{previewNotification.time}</div>
              </div>
              <div className="ml-auto">
                <Badge className="bg-success/20 text-success border-success/40 text-[10px]">
                  {previewNotification.title}
                </Badge>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <Row label="Par" value={previewNotification.pair} highlight />
              <Row label="Dirección" value={previewNotification.direction} highlight={previewNotification.direction.includes('CALL')} />
              <Row label="Monto" value={previewNotification.amount} />
              <Row label="Payout" value={previewNotification.payout} />
              <Row label="Profit" value={previewNotification.profit} highlight={previewNotification.profit.startsWith('+')} />
              <Row label="Confianza" value={previewNotification.confidence} />
              <Row label="Expiración" value={previewNotification.expiry} />
              <div className="pt-2 mt-2 border-t border-border/30">
                <div className="text-[10px] uppercase text-muted-foreground mb-1">Señal detectada</div>
                <div className="text-xs">{previewNotification.reason}</div>
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-border/30 text-[10px] text-muted-foreground text-center">
              Mensaje enviado automáticamente por Quantum Bot
            </div>
          </motion.div>

          {/* Notification types */}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <NotifType icon={Zap} title="Entrada" desc="Al abrir operación" />
            <NotifType icon={Check} title="Resultado" desc="Win/Loss al cerrar" />
            <NotifType icon={Bell} title="Alertas" desc="Stop loss / Take profit" />
            <NotifType icon={Activity} title="Resumen" desc="Diario y semanal" />
          </div>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('font-mono font-bold', highlight && value.startsWith('+') ? 'text-success' : highlight === false ? 'text-danger' : '')}>
        {value}
      </span>
    </div>
  );
}

function NotifType({ icon: Icon, title, desc }: any) {
  return (
    <div className="glass rounded-lg p-2.5">
      <Icon className="w-3.5 h-3.5 text-chart-3 mb-1" />
      <div className="text-xs font-bold">{title}</div>
      <div className="text-[10px] text-muted-foreground">{desc}</div>
    </div>
  );
}
