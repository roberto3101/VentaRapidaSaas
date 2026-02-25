'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '../../hooks/use-auth';
import { Eye, EyeOff, Loader2, Mail, Lock } from 'lucide-react';
import { ApiError } from '../../servicios/api';

export function FormularioLogin() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [mostrarPass, setMostrarPass] = useState(false);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setCargando(true);
    try {
      await login({ email, contrasena });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al iniciar sesión');
    } finally {
      setCargando(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 animate-in fade-in">
          {error}
        </div>
      )}

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-zinc-700">Correo electrónico</label>
        <div className="relative">
          <Mail size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-all"
            placeholder="tu@email.com"
            required
            autoFocus
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-zinc-700">Contraseña</label>
        <div className="relative">
          <Lock size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type={mostrarPass ? 'text' : 'password'}
            value={contrasena}
            onChange={(e) => setContrasena(e.target.value)}
            className="w-full pl-11 pr-12 py-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-all"
            placeholder="••••••••"
            required
            minLength={6}
          />
          <button
            type="button"
            onClick={() => setMostrarPass(!mostrarPass)}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
          >
            {mostrarPass ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </div>

      <button
        type="submit"
        disabled={cargando}
        className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold rounded-xl hover:from-amber-600 hover:to-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-amber-500/25 flex items-center justify-center gap-2"
      >
        {cargando ? <Loader2 size={20} className="animate-spin" /> : null}
        {cargando ? 'Ingresando...' : 'Iniciar sesión'}
      </button>

      <p className="text-center text-sm text-zinc-500">
        ¿No tienes cuenta?{' '}
        <Link href="/registro" className="text-amber-600 font-medium hover:text-amber-700 transition-colors">
          Registra tu negocio
        </Link>
      </p>
    </form>
  );
}
