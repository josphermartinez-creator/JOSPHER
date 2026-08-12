'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, TrendingUp, LogOut, Activity } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { NAV_ITEMS, type TabId } from './Sidebar';

interface MobileNavProps {
  active: TabId;
  onChange: (tab: TabId) => void;
  account: any;
  botActive: boolean;
  onLogout: () => void;
}

export function MobileNav({ active, onChange, account, botActive, onLogout }: MobileNavProps) {
  const [open, setOpen] = useState(false);

  const handleTabChange = (tab: TabId) => {
    onChange(tab);
    setOpen(false);
  };

  const handleLogout = () => {
    setOpen(false);
    onLogout();
  };

  return (
    <>
      {/* Top bar */}
      <div className="lg:hidden sticky top-0 z-40 glass-strong border-b border-border/50">
        <div className="flex items-center justify-between p-3">
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, oklch(0.72 0.19 155), oklch(0.62 0.22 290))' }}
            >
              <TrendingUp className="w-4 h-4 text-white" strokeWidth={2.5} />
            </div>
            <div className="font-black text-sm text-gradient-trading">QUANTUM BOT</div>
            <span className={cn(
              'w-2 h-2 rounded-full ml-1 pulse-dot',
              botActive ? 'bg-success' : 'bg-muted-foreground'
            )} />
          </div>
          <div className="flex items-center gap-2">
            <div className="text-right">
              <div className="text-[10px] text-muted-foreground leading-none">Balance</div>
              <div className="text-sm font-bold text-success">${account.balance.toFixed(2)}</div>
            </div>
            <button
              onClick={() => setOpen(true)}
              className="p-2 rounded-lg glass border border-border/40"
              aria-label="Abrir menú"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Drawer móvil - overlay */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="lg:hidden fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="lg:hidden fixed top-0 right-0 bottom-0 z-50 w-72 glass-strong border-l border-border/50 overflow-y-auto"
            >
              {/* Header del drawer */}
              <div className="p-4 border-b border-border/30 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg, oklch(0.72 0.19 155), oklch(0.62 0.22 290))' }}
                  >
                    <TrendingUp className="w-4 h-4 text-white" strokeWidth={2.5} />
                  </div>
                  <div className="font-black text-sm text-gradient-trading">QUANTUM BOT</div>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="p-2 rounded-lg glass border border-border/40"
                  aria-label="Cerrar menú"
                >
                  <X className="w-4 h-4" />
                </button>
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
                    <Activity className={cn('w-3 h-3', botActive ? 'text-success' : 'text-muted-foreground')} />
                    <span className="truncate">{account.email}</span>
                  </div>
                </div>
              </div>

              {/* Nav items */}
              <nav className="flex-1 p-3 space-y-1">
                {NAV_ITEMS.map((item) => {
                  const isActive = active === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleTabChange(item.id)}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all relative',
                        isActive
                          ? 'bg-primary/15 text-primary'
                          : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                      )}
                    >
                      {isActive && (
                        <div
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
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:bg-danger/10 hover:text-danger transition-all"
                >
                  <LogOut className="w-4 h-4" />
                  Cerrar sesión
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
