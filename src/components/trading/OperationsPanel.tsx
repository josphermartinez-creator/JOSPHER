'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Activity, Trophy, TrendingDown, RefreshCw, Trash2, Filter,
  ArrowUpCircle, ArrowDownCircle, Clock, Loader2, X
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export function OperationsPanel() {
  const [ops, setOps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterResult, setFilterResult] = useState('ALL');
  const [filterPair, setFilterPair] = useState('ALL');

  useEffect(() => { load(); }, [filterResult, filterPair]);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (filterResult !== 'ALL') params.set('result', filterResult);
      if (filterPair !== 'ALL') params.set('pair', filterPair);
      const res = await fetch(`/api/operations?${params}`);
      const data = await res.json();
      if (data.success) setOps(data.operations);
    } catch (e) {
      toast.error('Error al cargar operaciones');
    } finally {
      setLoading(false);
    }
  };

  const clearHistory = async () => {
    if (!confirm('¿Eliminar todo el historial de operaciones?')) return;
    try {
      await fetch('/api/operations', { method: 'DELETE' });
      toast.success('Historial limpiado');
      load();
    } catch (e) {
      toast.error('Error al limpiar');
    }
  };

  const pairs = Array.from(new Set(ops.map(o => o.pair)));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-warning/15 flex items-center justify-center">
            <Activity className="w-5 h-5 text-warning" />
          </div>
          <div>
            <h2 className="font-black text-lg">Historial de Operaciones</h2>
            <p className="text-xs text-muted-foreground">{ops.length} operaciones registradas</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="w-3 h-3 mr-1" />
            Refrescar
          </Button>
          {ops.length > 0 && (
            <Button variant="outline" size="sm" onClick={clearHistory} className="border-danger/40 text-danger hover:bg-danger/10">
              <Trash2 className="w-3 h-3 mr-1" />
              Limpiar
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <Card className="glass-strong border-border/50 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs font-bold text-muted-foreground">Filtros:</span>
          <Select value={filterResult} onValueChange={setFilterResult}>
            <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="Resultado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos</SelectItem>
              <SelectItem value="WIN">Ganadas</SelectItem>
              <SelectItem value="LOSS">Perdidas</SelectItem>
              <SelectItem value="DRAW">Empates</SelectItem>
              <SelectItem value="PENDING">Pendientes</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterPair} onValueChange={setFilterPair}>
            <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="Par" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos los pares</SelectItem>
              {pairs.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Operations list */}
      {loading ? (
        <div className="text-center py-12">
          <Loader2 className="w-6 h-6 mx-auto animate-spin text-muted-foreground" />
        </div>
      ) : ops.length === 0 ? (
        <Card className="glass-strong border-border/50 p-12 text-center">
          <Activity className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground text-sm">No hay operaciones registradas</p>
          <p className="text-xs text-muted-foreground mt-1">Las operaciones aparecerán aquí cuando el bot esté activo</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {ops.map((op, i) => (
            <motion.div
              key={op.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: Math.min(i * 0.02, 0.4) }}
            >
              <Card className={cn(
                'glass border p-3 hover:bg-muted/20 transition-all',
                op.result === 'WIN' ? 'border-success/30' :
                op.result === 'LOSS' ? 'border-danger/30' :
                'border-border/40'
              )}>
                <div className="flex items-center gap-3">
                  {/* Icon */}
                  <div className={cn(
                    'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                    op.result === 'WIN' ? 'bg-success/15' :
                    op.result === 'LOSS' ? 'bg-danger/15' :
                    op.result === 'PENDING' ? 'bg-warning/15' :
                    'bg-muted/30'
                  )}>
                    {op.result === 'WIN' ? <Trophy className="w-5 h-5 text-success" /> :
                     op.result === 'LOSS' ? <TrendingDown className="w-5 h-5 text-danger" /> :
                     op.result === 'PENDING' ? <Clock className="w-5 h-5 text-warning" /> :
                     <Activity className="w-5 h-5 text-muted-foreground" />}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm">{op.pair}</span>
                      <Badge variant="outline" className={cn(
                        'text-[10px] px-1.5',
                        op.direction === 'CALL' ? 'border-success/40 text-success' : 'border-danger/40 text-danger'
                      )}>
                        {op.direction === 'CALL' ? <><ArrowUpCircle className="w-2.5 h-2.5 inline mr-0.5" />CALL</> : <><ArrowDownCircle className="w-2.5 h-2.5 inline mr-0.5" />PUT</>}
                      </Badge>
                      {op.martingaleLevel > 0 && (
                        <Badge variant="outline" className="text-[10px] px-1.5 border-warning/40 text-warning">
                          MG L{op.martingaleLevel}
                        </Badge>
                      )}
                      {op.confidence > 0 && (
                        <Badge variant="outline" className="text-[10px] px-1.5 border-accent/40 text-accent">
                          {op.confidence.toFixed(0)}% confianza
                        </Badge>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                      {op.reason || 'Operación manual'} · {op.strategy}
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="text-right shrink-0">
                    <div className="text-[10px] text-muted-foreground">${op.amount} · {op.expiry}m · {op.payout}%</div>
                    <div className={cn(
                      'font-bold text-sm',
                      op.result === 'WIN' ? 'text-success' :
                      op.result === 'LOSS' ? 'text-danger' :
                      'text-muted-foreground'
                    )}>
                      {op.result === 'PENDING' ? '—' :
                       op.profit >= 0 ? `+$${op.profit.toFixed(2)}` : `-$${Math.abs(op.profit).toFixed(2)}`}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {new Date(op.openedAt).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
