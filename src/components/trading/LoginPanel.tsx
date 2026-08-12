'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Lock, Mail, Eye, EyeOff, ShieldCheck, Zap, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from 'sonner';

interface LoginPanelProps {
  onLoginSuccess: (account: any) => void;
}

export function LoginPanel({ onLoginSuccess }: LoginPanelProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [accountType, setAccountType] = useState('PRACTICE');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      toast.error('Completa todos los campos');
      return;
    }
    if (!email.includes('@')) {
      toast.error('Email inválido');
      return;
    }
    if (password.length < 4) {
      toast.error('La contraseña debe tener al menos 4 caracteres');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, accountType }),
      });
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error);
        return;
      }
      toast.success(data.message);
      onLoginSuccess(data.account);
    } catch (e) {
      toast.error('Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 grid-bg">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 200, delay: 0.2 }}
            className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-4 glow-primary"
            style={{
              background: 'linear-gradient(135deg, oklch(0.72 0.19 155), oklch(0.62 0.22 290))',
            }}
          >
            <TrendingUp className="w-10 h-10 text-white" strokeWidth={2.5} />
          </motion.div>
          <h1 className="text-4xl font-black tracking-tight text-gradient-trading">
            QUANTUM BOT
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Trading de opciones binarias · IQ Options
          </p>
        </div>

        <div className="glass-strong rounded-2xl p-6 shadow-2xl border border-border/50">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-1.5 h-6 rounded-full" style={{ background: 'linear-gradient(180deg, oklch(0.72 0.19 155), oklch(0.62 0.22 290))' }} />
            <h2 className="text-lg font-bold">Iniciar Sesión</h2>
            <ShieldCheck className="w-4 h-4 text-success ml-auto" />
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Email de IQ Options
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="email"
                  placeholder="tu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 bg-input/50 border-border/50 focus:border-primary"
                  disabled={loading}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Contraseña
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type={showPass ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 pr-10 bg-input/50 border-border/50 focus:border-primary"
                  disabled={loading}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                />
                <button
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  type="button"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Tipo de cuenta
              </Label>
              <RadioGroup
                value={accountType}
                onValueChange={setAccountType}
                className="grid grid-cols-2 gap-2"
              >
                <div className={`relative rounded-xl border-2 p-3 cursor-pointer transition-all ${accountType === 'PRACTICE' ? 'border-primary bg-primary/10' : 'border-border/50 hover:border-border'}`}>
                  <RadioGroupItem value="PRACTICE" id="practice" className="sr-only" />
                  <Label htmlFor="practice" className="cursor-pointer flex items-center gap-2">
                    <Zap className="w-4 h-4 text-warning" />
                    <div>
                      <div className="font-bold text-sm">Práctica</div>
                      <div className="text-[10px] text-muted-foreground">$10.000 demo</div>
                    </div>
                  </Label>
                </div>
                <div className={`relative rounded-xl border-2 p-3 cursor-pointer transition-all ${accountType === 'REAL' ? 'border-danger bg-danger/10' : 'border-border/50 hover:border-border'}`}>
                  <RadioGroupItem value="REAL" id="real" className="sr-only" />
                  <Label htmlFor="real" className="cursor-pointer flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-danger" />
                    <div>
                      <div className="font-bold text-sm">Real</div>
                      <div className="text-[10px] text-muted-foreground">Dinero real</div>
                    </div>
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <Button
              onClick={handleLogin}
              disabled={loading}
              className="w-full h-11 font-bold text-base glow-primary"
              style={{
                background: 'linear-gradient(135deg, oklch(0.72 0.19 155), oklch(0.62 0.22 290))',
              }}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Conectando...
                </>
              ) : (
                'Conectar con IQ Options'
              )}
            </Button>
          </div>

          <div className="mt-4 pt-4 border-t border-border/30 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="w-3 h-3" />
            <span>Conexión cifrada · Tus datos están protegidos</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-6">
          {[
            { icon: Zap, label: 'Tiempo real', color: 'text-warning' },
            { icon: TrendingUp, label: 'Multi-par', color: 'text-success' },
            { icon: ShieldCheck, label: 'Risk Mgmt', color: 'text-accent' },
          ].map((f, i) => (
            <div key={i} className="glass rounded-xl p-3 text-center">
              <f.icon className={`w-5 h-5 mx-auto mb-1 ${f.color}`} />
              <div className="text-[10px] text-muted-foreground font-medium">{f.label}</div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
