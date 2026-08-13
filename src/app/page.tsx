'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { LoginPanel } from '@/components/trading/LoginPanel';
import { Sidebar, type TabId } from '@/components/trading/Sidebar';
import { MobileNav } from '@/components/trading/MobileNav';
import { Dashboard } from '@/components/trading/Dashboard';
import { StrategyPanel } from '@/components/trading/StrategyPanel';
import { RiskPanel } from '@/components/trading/RiskPanel';
import { BacktestPanel } from '@/components/trading/BacktestPanel';
import { PairsPanel } from '@/components/trading/PairsPanel';
import { StatisticsPanel } from '@/components/trading/StatisticsPanel';
import { TelegramPanel } from '@/components/trading/TelegramPanel';
import { OperationsPanel } from '@/components/trading/OperationsPanel';
import { SettingsPanel } from '@/components/trading/SettingsPanel';
import { toast } from 'sonner';

export default function Home() {
  const [account, setAccount] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');

  const loadAccount = useCallback(async () => {
    try {
      const res = await fetch('/api/account');
      const data = await res.json();
      if (data.success) {
        setAccount(data.account);
        setSettings(data.account?.settings);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAccount();
  }, [loadAccount]);

  const handleLogout = async () => {
    try {
      await fetch('/api/account', { method: 'DELETE' });
      setAccount(null);
      setSettings(null);
      toast.success('Sesión cerrada');
    } catch (e) {
      toast.error('Error al cerrar sesión');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!account || !account.isConnected) {
    return <LoginPanel onLoginSuccess={loadAccount} />;
  }

  return (
    <div className="min-h-screen flex">
      <Sidebar
        active={activeTab}
        onChange={setActiveTab}
        account={account}
        botActive={settings?.botActive || false}
        onLogout={handleLogout}
      />

      <div className="flex-1 min-w-0">
        <MobileNav
          active={activeTab}
          onChange={setActiveTab}
          account={account}
          botActive={settings?.botActive || false}
          onLogout={handleLogout}
        />

        <main className="p-4 lg:p-6 max-w-7xl mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {activeTab === 'dashboard' && (
                <Dashboard
                  account={account}
                  settings={settings}
                  onSettingsUpdate={loadAccount}
                  onAccountUpdate={loadAccount}
                />
              )}
              {activeTab === 'strategy' && (
                <StrategyPanel settings={settings} onSettingsUpdate={loadAccount} />
              )}
              {activeTab === 'operations' && <OperationsPanel />}
              {activeTab === 'pairs' && (
                <PairsPanel settings={settings} onUpdate={loadAccount} />
              )}
              {activeTab === 'risk' && (
                <RiskPanel settings={settings} onUpdate={loadAccount} />
              )}
              {activeTab === 'backtest' && <BacktestPanel />}
              {activeTab === 'statistics' && <StatisticsPanel />}
              {activeTab === 'telegram' && (
                <TelegramPanel settings={settings} onUpdate={loadAccount} />
              )}
              {activeTab === 'settings' && (
                <SettingsPanel settings={settings} account={account} onUpdate={loadAccount} />
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
