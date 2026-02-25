'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '../../hooks/use-auth';
import { PAISES } from '../../utils/constantes';
import { ApiError } from '../../servicios/api';
import type { RegistroTenantPayload } from '../../tipos/auth.tipos';
import {
  Store, Globe, Receipt, User, Mail, Lock, Eye, EyeOff, Loader2,
  ArrowRight, ArrowLeft, Check, Building2, Percent,
} from 'lucide-react';

type Paso = 1 | 2 | 3;

const PASO_TITULOS: Record<Paso, { titulo: string; subtitulo: string }> = {
  1: { titulo: 'Tu negocio', subtitulo: 'Datos de tu empresa o tienda' },
  2: { titulo: 'Configuración fiscal', subtitulo: 'Impuestos y moneda de tu país' },
  3: { titulo: 'Tu cuenta', subtitulo: 'Datos del administrador' },
};

export function FormularioRegistro() {
  const { registrarTenant } = useAuth();
  const [paso, setPaso] = useState<Paso>(1);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [mostrarPass, setMostrarPass] = useState(false);

  const [datos, setDatos] = useState({
    nombreNegocio: '',
    codigoPais: 'PE',
    nombreImpuesto: 'IGV',
    tasaImpuesto: 18,
    impuestoIncluido: true,
    nombreCompleto: '',
    email: '',
    contrasena: '',
    confirmarContrasena: '',
  });

  const paisActual = PAISES.find((p) => p.codigo === datos.codigoPais) || PAISES[0];

  const onChange = (field: string, value: any) => {
    setDatos((prev) => ({ ...prev, [field]: value }));
    setError('');
  };

  const alCambiarPais = (codigo: string) => {
    const pais = PAISES.find((p) => p.codigo === codigo);
    if (pais) {
      setDatos((prev) => ({
        ...prev,
        codigoPais: codigo,
        nombreImpuesto: pais.impuesto,
        tasaImpuesto: pais.tasa,
      }));
    }
  };

  const validarPaso = (): boolean => {
    if (paso === 1 && datos.nombreNegocio.length < 3) {
      setError('El nombre del negocio debe tener al menos 3 caracteres');
      return false;
    }
    if (paso === 3) {
      if (datos.nombreCompleto.length < 3) { setError('Ingresa tu nombre completo'); return false; }
      if (!datos.email.includes('@')) { setError('Ingresa un email válido'); return false; }
      if (datos.contrasena.length < 6) { setError('La contraseña debe tener al menos 6 caracteres'); return false; }
      if (datos.contrasena !== datos.confirmarContrasena) { setError('Las contraseñas no coinciden'); return false; }
    }
    return true;
  };

  const siguiente = () => {
    if (validarPaso()) setPaso((p) => Math.min(p + 1, 3) as Paso);
  };

  const anterior = () => setPaso((p) => Math.max(p - 1, 1) as Paso);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validarPaso()) return;

    setCargando(true);
    setError('');
    try {
      const payload: RegistroTenantPayload = {
        nombreNegocio: datos.nombreNegocio,
        codigoPais: datos.codigoPais,
        codigoMoneda: paisActual.moneda,
        simboloMoneda: paisActual.simbolo,
        zonaHoraria: paisActual.zona,
        nombreImpuesto: datos.nombreImpuesto,
        tasaImpuesto: datos.tasaImpuesto,
        impuestoIncluido: datos.impuestoIncluido,
        nombreCompleto: datos.nombreCompleto,
        email: datos.email,
        contrasena: datos.contrasena,
      };
      await registrarTenant(payload);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al registrar');
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Stepper */}
      <div className="flex items-center justify-between">
        {([1, 2, 3] as Paso[]).map((p) => (
          <div key={p} className="flex items-center gap-2 flex-1">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
              paso >= p
                ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md shadow-amber-500/30'
                : 'bg-zinc-100 text-zinc-400 border border-zinc-200'
            }`}>
              {paso > p ? <Check size={14} strokeWidth={3} /> : p}
            </div>
            {p < 3 && <div className={`flex-1 h-0.5 mx-2 transition-colors ${paso > p ? 'bg-amber-400' : 'bg-zinc-200'}`} />}
          </div>
        ))}
      </div>

      {/* Titulo del paso */}
      <div className="text-center">
        <h3 className="text-lg font-semibold text-zinc-800">{PASO_TITULOS[paso].titulo}</h3>
        <p className="text-sm text-zinc-500">{PASO_TITULOS[paso].subtitulo}</p>
      </div>

      {error && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* PASO 1 */}
        {paso === 1 && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-zinc-700">Nombre del negocio</label>
              <div className="relative">
                <Store size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  value={datos.nombreNegocio}
                  onChange={(e) => onChange('nombreNegocio', e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                  placeholder="Mi Bodega, Tienda Central..."
                  autoFocus
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-zinc-700">País</label>
              <div className="relative">
                <Globe size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                <select
                  value={datos.codigoPais}
                  onChange={(e) => alCambiarPais(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 appearance-none"
                >
                  {PAISES.map((p) => (
                    <option key={p.codigo} value={p.codigo}>
                      {p.nombre} ({p.simbolo} {p.moneda})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <p className="text-sm text-amber-800">
                <strong>Moneda:</strong> {paisActual.simbolo} ({paisActual.moneda}) — <strong>Zona:</strong> {paisActual.zona}
              </p>
            </div>
          </div>
        )}

        {/* PASO 2 */}
        {paso === 2 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-zinc-700">Nombre impuesto</label>
                <div className="relative">
                  <Receipt size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    value={datos.nombreImpuesto}
                    onChange={(e) => onChange('nombreImpuesto', e.target.value)}
                    className="w-full pl-11 pr-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-zinc-700">Tasa (%)</label>
                <div className="relative">
                  <Percent size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="number"
                    value={datos.tasaImpuesto}
                    onChange={(e) => onChange('tasaImpuesto', Number(e.target.value))}
                    className="w-full pl-11 pr-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                    min={0}
                    max={100}
                    step={0.01}
                  />
                </div>
              </div>
            </div>

            <label className="flex items-center gap-3 p-4 bg-zinc-50 border border-zinc-200 rounded-xl cursor-pointer hover:bg-zinc-100 transition-colors">
              <input
                type="checkbox"
                checked={datos.impuestoIncluido}
                onChange={(e) => onChange('impuestoIncluido', e.target.checked)}
                className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500/30"
              />
              <div>
                <span className="text-sm font-medium text-zinc-700">Impuesto incluido en precio</span>
                <p className="text-xs text-zinc-500">Los precios de venta ya incluyen el {datos.nombreImpuesto}</p>
              </div>
            </label>

            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <p className="text-sm text-blue-700">
                Puedes cambiar estas opciones más adelante desde <strong>Configuración</strong>.
              </p>
            </div>
          </div>
        )}

        {/* PASO 3 */}
        {paso === 3 && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-zinc-700">Nombre completo</label>
              <div className="relative">
                <User size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  value={datos.nombreCompleto}
                  onChange={(e) => onChange('nombreCompleto', e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                  placeholder="Juan Pérez"
                  autoFocus
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-zinc-700">Correo electrónico</label>
              <div className="relative">
                <Mail size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="email"
                  value={datos.email}
                  onChange={(e) => onChange('email', e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                  placeholder="tu@email.com"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-zinc-700">Contraseña</label>
              <div className="relative">
                <Lock size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type={mostrarPass ? 'text' : 'password'}
                  value={datos.contrasena}
                  onChange={(e) => onChange('contrasena', e.target.value)}
                  className="w-full pl-11 pr-12 py-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                  placeholder="Mínimo 6 caracteres"
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

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-zinc-700">Confirmar contraseña</label>
              <div className="relative">
                <Lock size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="password"
                  value={datos.confirmarContrasena}
                  onChange={(e) => onChange('confirmarContrasena', e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                  placeholder="Repite la contraseña"
                />
              </div>
            </div>
          </div>
        )}

        {/* Botones */}
        <div className="flex items-center justify-between mt-6">
          {paso > 1 ? (
            <button
              type="button"
              onClick={anterior}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-zinc-600 hover:text-zinc-800 hover:bg-zinc-100 rounded-xl transition-colors"
            >
              <ArrowLeft size={16} /> Anterior
            </button>
          ) : (
            <Link href="/login" className="text-sm text-zinc-500 hover:text-amber-600 transition-colors">
              Ya tengo cuenta
            </Link>
          )}

          {paso < 3 ? (
            <button
              type="button"
              onClick={siguiente}
              className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold rounded-xl hover:from-amber-600 hover:to-orange-600 shadow-lg shadow-amber-500/25 transition-all text-sm"
            >
              Siguiente <ArrowRight size={16} />
            </button>
          ) : (
            <button
              type="submit"
              disabled={cargando}
              className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold rounded-xl hover:from-amber-600 hover:to-orange-600 disabled:opacity-50 shadow-lg shadow-amber-500/25 transition-all text-sm"
            >
              {cargando ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
              {cargando ? 'Creando...' : 'Crear mi negocio'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
