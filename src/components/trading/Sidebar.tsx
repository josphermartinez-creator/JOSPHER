'use client';

import { motion } from 'framer-motion';
import {
  LayoutDashboard, Activity, Shield, FlaskConical,
  Coins, BarChart3, Send, Settings, LogOut, TrendingUp, Wifi, CandlestickChart
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type TabId =
  | 'dashboard' | 'strategy' | 'risk' | 'backtest' | 'pairs'
  | 'statistics' | 'telegram' | 'operations' | 'settings';

interface SidebarProps {
  active: TabId;
  onChange: (tab: TabId) => void;
  account: any;
  botActive: boolean;
  onLogout: () => void;
}

export const NAV_ITEMS: { id: TabId; label: string; icon: any; color: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, color: 'text-success' },
  { id: 'strategy', label: 'Estrategia', icon: CandlestickChart, color: 'text-accent' },
  { id: 'operations', label: 'Operaciones', icon: Activity, color: 'text-warning' },
  { id: 'pairs', label: 'Pares', icon: Coins, color: 'text-chart-4' },
  { id: 'risk', label: 'Gestión de Riesgo', icon: Shield, color: 'text-danger' },
  { id: 'backtest', label: 'Backtesting', icon: FlaskConical, color: 'text-accent' },
  { id: 'statistics', label: 'Estadísticas', icon: BarChart3, color: 'text-chart-5' },
  { id: 'telegram', label: 'Telegram', icon: Send, color: 'text-chart-3' },
  { id: 'settings', label: 'Ajustes', icon: Settings, color: 'text-muted-foreground' },
];

export function Sidebar({ active, onChange, account, botActive, onLogout }: SidebarProps) {
  return (
    <aside className="hidden lg:flex flex-col w-64 glass-strong border-r border-border/50 h-screen sticky top-0">
      {/* Logo */}
      <div className="p-5 border-b border-border/30">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center glow-primary"
            style={{ background: 'linear-gradient(135deg, oklch(0.72 0.19 155), oklch(0.62 0.22 290))' }}
          >
            <TrendingUp className="w-5 h-5 text-white" strokeWidth={2.5} />
          </div>
          <div>
            <div className="font-black text-sm tracking-tight text-gradient-trading">QUANTUM BOT</div>
            <div className="text-[10px] text-muted-foreground flex items-center gap-1">
              <span className={cn('w-1.5 h-1.5 rounded-full pulse-dot', botActive ? 'bg-success' : 'bg-muted-foreground')} />
              {botActive ? 'BOT ACTIVO' : 'BOT INACTIVO'}
            </div>
          </div>
        </div>
      </div>

      {/* Account info */}
      <div className="p-4 border-b border-border/30">
        <div className="glass rounded-xl p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Balance</span>
            <span className={cn(
              'text-[10px] px-1.5 py-0.5 rounded-full font-bold',
              account.accountType === 'REAL' ? 'bg-danger/20 text-danger' : 'bg-warning/20 text-warning'
            )}>
              {account.accountType === 'REAL' ? 'REAL' : 'PRÁCTICA'}
            </span>
          </div>
          <div className="font-bold text-xl text-gradient-success">
            ${account.balance.toFixed(2)}
          </div>
          <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
            <Wifi className="w-3 h-3 text-success" />
            <span className="truncate">{account.email}</span>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {NAV_ITEMS.map((item) => {
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onChange(item.id)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all relative group',
                isActive
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="active-tab"
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full"
                  style={{ background: 'linear-gradient(180deg, oklch(0.72 0.19 155), oklch(0.62 0.22 290))' }}
                />
              )}
              <item.icon className={cn('w-4 h-4', isActive ? item.color : '')} />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="p-3 border-t border-border/30">
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:bg-danger/10 hover:text-danger transition-all"
        >
          <LogOut className="w-4 h-4" />
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
