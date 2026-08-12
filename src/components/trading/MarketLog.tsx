'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { io as ioClient } from 'socket.io-client';
import {
  Terminal, Trash2, Activity, Zap, Eye, TrendingUp, TrendingDown,
  CheckCircle2, XCircle, AlertCircle, Loader2, RefreshCw, Radio,
  ArrowUpCircle, ArrowDownCircle, Clock, Filter
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';

export interface LogEntry {
  id: string;
  timestamp: Date;
  type: 'INFO' | 'SIGNAL' | 'OPERATION' | 'ERROR' | 'SUCCESS' | 'WARNING' | 'MARKET';
  pair?: string;
  message: string;
  details?: any;
}

interface MarketLogProps {
  entries: LogEntry[];
  onClear: () => void;
  autoScroll?: boolean;
  maxHeight?: number;
}

const TYPE_CONFIG: Record<string, { color: string; bg: string; icon: any; label: string }> = {
  INFO: { color: 'text-muted-foreground', bg: 'bg-muted/20', icon: Activity, label: 'INFO' },
  SIGNAL: { color: 'text-accent', bg: 'bg-accent/10', icon: Zap, label: 'SEÑAL' },
  OPERATION: { color: 'text-warning', bg: 'bg-warning/10', icon: ArrowUpCircle, label: 'OPER' },
  ERROR: { color: 'text-danger', bg: 'bg-danger/10', icon: XCircle, label: 'ERROR' },
  SUCCESS: { color: 'text-success', bg: 'bg-success/10', icon: CheckCircle2, label: 'OK' },
  WARNING: { color: 'text-warning', bg: 'bg-warning/10', icon: AlertCircle, label: 'WARN' },
  MARKET: { color: 'text-chart-4', bg: 'bg-chart-4/10', icon: TrendingUp, label: 'MERCADO' },
};

export function MarketLog({ entries, onClear, autoScroll = true, maxHeight = 400 }: MarketLogProps) {
  const [filter, setFilter] = useState<string>('ALL');
  const [autoscroll, setAutoscroll] = useState(autoScroll);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoscroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [entries, autoscroll]);

  const filtered = filter === 'ALL' ? entries : entries.filter(e => e.type === filter);

  return (
    <Card className="glass-strong border-border/50 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-accent" />
          <h3 className="font-bold text-sm">Log de Análisis</h3>
          <Badge variant="outline" className="text-[10px]">
            {entries.length} eventos
          </Badge>
          {entries.length > 0 && (
            <span className="text-[10px] text-muted-foreground">
              último: {entries[entries.length - 1].timestamp.toLocaleTimeString('es-ES')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoscroll(!autoscroll)}
            className={cn('h-7 text-xs', autoscroll && 'border-success/40 text-success')}
          >
            <Radio className={cn('w-3 h-3 mr-1', autoscroll && 'pulse-dot')} />
            Auto-scroll
          </Button>
          <Button variant="outline" size="sm" onClick={onClear} className="h-7 text-xs border-danger/40 text-danger hover:bg-danger/10">
            <Trash2 className="w-3 h-3 mr-1" />
            Limpiar
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-3 flex items-center gap-2 flex-wrap">
        <Filter className="w-3 h-3 text-muted-foreground" />
        <ToggleGroup type="single" value={filter} onValueChange={(v) => v && setFilter(v)} variant="outline" className="flex-wrap">
          <ToggleGroupItem value="ALL" className="text-[10px] h-7 px-2">Todos</ToggleGroupItem>
          <ToggleGroupItem value="MARKET" className="text-[10px] h-7 px-2">Mercado</ToggleGroupItem>
          <ToggleGroupItem value="SIGNAL" className="text-[10px] h-7 px-2">Señales</ToggleGroupItem>
          <ToggleGroupItem value="OPERATION" className="text-[10px] h-7 px-2">Operaciones</ToggleGroupItem>
          <ToggleGroupItem value="SUCCESS" className="text-[10px] h-7 px-2">Éxitos</ToggleGroupItem>
          <ToggleGroupItem value="ERROR" className="text-[10px] h-7 px-2">Errores</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Log entries */}
      <div
        ref={containerRef}
        className="space-y-1 overflow-y-auto font-mono text-xs"
        style={{ maxHeight: `${maxHeight}px` }}
      >
        {filtered.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Terminal className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-xs">Sin eventos registrados</p>
            <p className="text-[10px] mt-1">Inicia el bot para ver el análisis en tiempo real</p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {filtered.slice().reverse().map((entry) => {
              const cfg = TYPE_CONFIG[entry.type] || TYPE_CONFIG.INFO;
              const Icon = cfg.icon;
              return (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  className={cn('rounded-lg p-2 border border-border/30', cfg.bg)}
                >
                  <div className="flex items-start gap-2">
                    <Icon className={cn('w-3.5 h-3.5 mt-0.5 shrink-0', cfg.color)} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] text-muted-foreground">
                          {entry.timestamp.toLocaleTimeString('es-ES')}
                        </span>
                        <Badge variant="outline" className={cn('text-[9px] px-1 py-0 h-4', cfg.color, 'border-current/30')}>
                          {cfg.label}
                        </Badge>
                        {entry.pair && (
                          <span className="text-[10px] font-bold text-foreground">{entry.pair}</span>
                        )}
                      </div>
                      <div className="text-[11px] text-foreground mt-0.5 break-words">
                        {entry.message}
                      </div>
                      {entry.details && (
                        <div className="text-[10px] text-muted-foreground mt-0.5 pl-2 border-l border-border/30">
                          {typeof entry.details === 'string'
                            ? entry.details
                            : JSON.stringify(entry.details)}
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </Card>
  );
}

export interface MonitoringStatus {
  pairs: string[];
  todayOps: number;
  maxDailyOps: number;
  cooldowns: Array<{ pair: string; remaining: number }>;
  stats: any;
}

/**
 * Hook personalizado para mantener el log en memoria
 * Escucha eventos del autotrader-service vía socket.io
 */
export function useMarketLog() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [monitoring, setMonitoring] = useState<MonitoringStatus | null>(null);
  const socketRef = useRef<any>(null);
  const lastErrorTime = useRef<number>(0);

  const addEntry = (type: LogEntry['type'], message: string, pair?: string, details?: any) => {
    const entry: LogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      timestamp: new Date(),
      type,
      message,
      pair,
      details,
    };
    setEntries(prev => [...prev.slice(-200), entry]); // mantener último 200
  };

  const clear = () => setEntries([]);

  useEffect(() => {
    // Conectar al autotrader service para escuchar eventos
    let socket: any;
    try {
      // En desarrollo local (Windows), conectarse directo al puerto 3004
      // En producción (con Caddy), usar el gateway en puerto 81
      const isLocalDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      const socketUrl = isLocalDev
        ? `http://${window.location.hostname}:3004`
        : `${window.location.protocol}//${window.location.hostname}:81`;

      const socketOptions: any = {
        path: '/socket.io/',
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 3000,
        reconnectionDelayMax: 10000,
        timeout: 10000,
      };

      if (isLocalDev) {
        // Conexión directa, sin gateway
        socket = ioClient(socketUrl, socketOptions);
      } else {
        // Conexión vía gateway Caddy
        socketOptions.query = { XTransformPort: '3004' };
        socket = ioClient(socketUrl, socketOptions);
      }
      socketRef.current = socket;

      socket.on('connect', () => {
        addEntry('INFO', 'Conectado al servicio de auto-trading');
      });

      socket.on('bot-started', () => {
        addEntry('SUCCESS', '🤖 Bot automático iniciado - monitoreando mercado');
      });

      socket.on('bot-stopped', (data: any) => {
        addEntry('WARNING', `Bot detenido: ${data.reason || 'por usuario'}`);
      });

      // Escuchar logs del autotrader
      socket.on('log', (data: any) => {
        const type = (data.type || 'INFO') as LogEntry['type'];
        addEntry(type, data.message, data.pair, data.details);
      });

      // Escuchar estado de monitoreo
      socket.on('monitoring-status', (status: MonitoringStatus) => {
        setMonitoring(status);
      });

      socket.on('signal-detected', (data: any) => {
        addEntry('SIGNAL',
          `🎯 Señal ${data.signal.direction} detectada (${data.signal.confidence.toFixed(0)}% confianza)`,
          data.pair,
          data.signal.reason
        );
      });

      socket.on('operation-executed', (data: any) => {
        const win = data.result.isWin;
        const profit = data.result.profit;
        addEntry('OPERATION',
          `💰 ${win ? 'GANADA' : 'PERDIDA'}: ${data.signal.direction} · ${profit > 0 ? '+' : ''}$${profit.toFixed(2)}`,
          data.pair,
          { realOrder: data.result.realOrder, reason: data.signal.reason }
        );
        addEntry(win ? 'SUCCESS' : 'ERROR',
          `${win ? '✅' : '❌'} Resultado: ${win ? 'GANADA' : 'PERDIDA'} · Profit: $${profit.toFixed(2)}`,
          data.pair
        );
      });

      socket.on('connect_error', (err: any) => {
        // Solo loggear error de conexión cada 30s para no saturar
        const now = Date.now();
        if (now - lastErrorTime.current > 30000) {
          lastErrorTime.current = now;
          // No loggear como error, solo como info para no asustar al usuario
          // addEntry('WARNING', `Reintentando conexión al auto-trader...`);
        }
      });

      socket.on('disconnect', (reason: string) => {
        if (reason === 'io server disconnect' || reason === 'transport close') {
          // Reconexión automática activada
        }
      });
    } catch (e) {
      // socket.io-client no disponible
    }

    return () => {
      if (socket) socket.disconnect();
    };
  }, []);

  return { entries, addEntry, clear, monitoring, setMonitoring };
}
