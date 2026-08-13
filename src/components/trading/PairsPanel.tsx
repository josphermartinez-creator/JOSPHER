'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Coins, Search, Filter, Check, Zap, TrendingUp, Bitcoin, Building2, Gem
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Pair {
  id: string;
  name: string;
  type: 'NORMAL' | 'OTC';
  category: string;
  payout: number;
  available: boolean;
}

interface PairsPanelProps {
  settings: any;
  onUpdate: () => void;
}

const CATEGORY_ICONS: Record<string, any> = {
  FOREX: TrendingUp,
  STOCK: Building2,
  CRYPTO: Bitcoin,
  COMMODITY: Gem,
  OTHER: Building2,
};

const CATEGORY_COLORS: Record<string, string> = {
  FOREX: 'text-success',
  STOCK: 'text-warning',
  CRYPTO: 'text-chart-4',
  COMMODITY: 'text-chart-5',
  OTHER: 'text-muted-foreground',
};

// Los pares vienen del broker y pueden traer categorias que no estan en las
// tablas de arriba. Sin esto, React recibe un icono `undefined` y la pantalla
// entera revienta con "Element type is invalid".
function iconoDe(categoria: string) {
  return CATEGORY_ICONS[categoria] || CATEGORY_ICONS.OTHER;
}

function colorDe(categoria: string) {
  return CATEGORY_COLORS[categoria] || CATEGORY_COLORS.OTHER;
}

export function PairsPanel({ settings, onUpdate }: PairsPanelProps) {
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [source, setSource] = useState<'broker' | 'fallback'>('fallback');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'NORMAL' | 'OTC'>('ALL');
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadPairs();
  }, []);

  useEffect(() => {
    try {
      const parsed = settings?.selectedPairs ? JSON.parse(settings.selectedPairs) : [];
      setSelected(Array.isArray(parsed) ? parsed : []);
    } catch {
      setSelected([]);
    }
  }, [settings]);

  const loadPairs = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/pairs');
      const data = await res.json();
      if (data.success) {
        setPairs(data.pairs);
        setSource(data.source || 'fallback');
        if (data.source === 'fallback') {
          // Sin broker no se sabe qué mercados están abiertos: elegir un par
          // cerrado hace que el bot no pueda entrar.
          toast.warning('No se pudo leer la lista del broker', {
            description: data.warning || 'No se puede saber qué pares están abiertos.',
            duration: 8000,
          });
        }
      }
    } catch (e) {
      toast.error('Error al cargar pares');
    } finally {
      setLoading(false);
    }
  };

  const filtered = pairs.filter(p => {
    if (filterType !== 'ALL' && p.type !== filterType) return false;
    if (filterCategory !== 'ALL' && p.category !== filterCategory) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.id.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Asegurar que selected siempre sea un array
  const safeSelected = Array.isArray(selected) ? selected : [];

  const togglePair = (id: string) => {
    setSelected(prev => {
      const arr = Array.isArray(prev) ? prev : [];
      return arr.includes(id) ? arr.filter(p => p !== id) : [...arr, id];
    });
  };

  // Los botones de seleccion rapida solo cogen mercados ABIERTOS: un par cerrado
  // hace que el broker rechace la orden y el bot parezca que "no entra".
  const openOnly = (list: Pair[]) => list.filter(p => p.available || source !== 'broker');

  const selectAll = () => setSelected(openOnly(filtered).map(p => p.id));
  const clearAll = () => setSelected([]);
  const selectAllOTC = () => setSelected(openOnly(pairs.filter(p => p.type === 'OTC')).map(p => p.id));
  const selectAllNormal = () => setSelected(openOnly(pairs.filter(p => p.type === 'NORMAL')).map(p => p.id));

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedPairs: safeSelected }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`${safeSelected.length} pares seleccionados`);
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-chart-4/15 flex items-center justify-center">
            <Coins className="w-5 h-5 text-chart-4" />
          </div>
          <div>
            <h2 className="font-black text-lg">Selección de Pares</h2>
            <p className="text-xs text-muted-foreground">
              {safeSelected.length} de {pairs.length} pares seleccionados
            </p>
          </div>
        </div>
        <Button onClick={save} disabled={saving} className="glow-primary" style={{
          background: 'linear-gradient(135deg, oklch(0.72 0.19 155), oklch(0.62 0.22 290))'
        }}>
          Guardar selección
        </Button>
      </div>

      {/* Filters */}
      <Card className="glass-strong border-border/50 p-4 space-y-3">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar par..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <ToggleGroup type="single" value={filterType} onValueChange={(v) => v && setFilterType(v as any)} variant="outline">
            <ToggleGroupItem value="ALL" className="text-xs">Todos</ToggleGroupItem>
            <ToggleGroupItem value="NORMAL" className="text-xs">Normales</ToggleGroupItem>
            <ToggleGroupItem value="OTC" className="text-xs">OTC</ToggleGroupItem>
          </ToggleGroup>
          <ToggleGroup type="single" value={filterCategory} onValueChange={(v) => v && setFilterCategory(v)} variant="outline">
            <ToggleGroupItem value="ALL" className="text-xs">Todo</ToggleGroupItem>
            <ToggleGroupItem value="FOREX" className="text-xs">Forex</ToggleGroupItem>
            <ToggleGroupItem value="STOCK" className="text-xs">Acciones</ToggleGroupItem>
            <ToggleGroupItem value="CRYPTO" className="text-xs">Crypto</ToggleGroupItem>
            <ToggleGroupItem value="COMMODITY" className="text-xs">Comm.</ToggleGroupItem>
          </ToggleGroup>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={selectAll} className="text-xs h-7">
            <Check className="w-3 h-3 mr-1" />
            Seleccionar todo
          </Button>
          <Button variant="outline" size="sm" onClick={selectAllOTC} className="text-xs h-7 border-warning/40 text-warning">
            <Zap className="w-3 h-3 mr-1" />
            Todos OTC
          </Button>
          <Button variant="outline" size="sm" onClick={selectAllNormal} className="text-xs h-7 border-success/40 text-success">
            <TrendingUp className="w-3 h-3 mr-1" />
            Todos normales
          </Button>
          <Button variant="outline" size="sm" onClick={clearAll} className="text-xs h-7 border-danger/40 text-danger">
            Limpiar
          </Button>
        </div>
      </Card>

      {/* Pair grid */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl shimmer bg-muted/30" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map((pair, i) => {
            const isSelected = safeSelected.includes(pair.id);
            const Icon = iconoDe(pair.category);
            return (
              <motion.div
                key={pair.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: Math.min(i * 0.02, 0.5) }}
              >
                <Card
                  onClick={() => togglePair(pair.id)}
                  className={cn(
                    'p-3 cursor-pointer transition-all relative overflow-hidden card-hover',
                    isSelected
                      ? 'glass-strong border-primary glow-primary'
                      : 'glass border-border/40'
                  )}
                >
                  {isSelected && (
                    <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                      <Check className="w-3 h-3 text-primary-foreground" strokeWidth={3} />
                    </div>
                  )}
                  <div className="flex items-start gap-2 mb-2">
                    <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center bg-muted/40', colorDe(pair.category))}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm truncate">{pair.name}</div>
                      <div className="text-[10px] text-muted-foreground">{pair.id}</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className={cn(
                      'text-[10px] px-1.5',
                      pair.type === 'OTC'
                        ? 'border-warning/50 text-warning bg-warning/10'
                        : 'border-success/50 text-success bg-success/10'
                    )}>
                      {pair.type === 'OTC' ? 'OTC' : 'NORMAL'}
                    </Badge>
                    <div className="text-right">
                      <div className="text-[10px] text-muted-foreground">
                        {source === 'broker' ? (pair.available ? 'Payout' : 'Cerrado') : 'Payout'}
                      </div>
                      <div className={cn(
                        'text-xs font-bold',
                        source === 'broker' && !pair.available ? 'text-muted-foreground' : 'text-success'
                      )}>
                        {pair.payout > 0 ? `${pair.payout}%` : '—'}
                      </div>
                    </div>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Summary */}
      <Card className="glass-strong border-border/50 p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-2xl font-black text-success">{safeSelected.filter(id => pairs.find(p => p.id === id)?.type === 'NORMAL').length}</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Pares normales</div>
          </div>
          <div>
            <div className="text-2xl font-black text-warning">{safeSelected.filter(id => pairs.find(p => p.id === id)?.type === 'OTC').length}</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Pares OTC</div>
          </div>
          <div>
            <div className="text-2xl font-black text-accent">
              {safeSelected.length > 0
                ? (safeSelected.reduce((s, id) => s + (pairs.find(p => p.id === id)?.payout || 0), 0) / safeSelected.length).toFixed(1)
                : 0}%
            </div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Payout promedio</div>
          </div>
          <div>
            <div className="text-2xl font-black text-chart-5">{safeSelected.length}</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total activos</div>
          </div>
        </div>
      </Card>
    </div>
  );
}
