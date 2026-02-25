'use client';

import { useState, useEffect } from 'react';
import { useAuthContexto } from '../../../contextos/auth.contexto';
import { api } from '../../../servicios/api';
import { IndicadorCarga } from '../../../componentes/compartidos/indicador-carga';
import type { Tenant } from '../../../tipos/tenant.tipos';
import {
  Settings, Building2, Receipt, ShieldCheck, Save, Loader2,
  Globe, DollarSign, Percent, Package, AlertTriangle,
} from 'lucide-react';

export default function ConfiguracionesPage() {
  const { usuario, cargarPerfil } = useAuthContexto();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState('');

  const [form, setForm] = useState({
    nombre: '',
    nombreImpuesto: '',
    tasaImpuesto: 0,
    impuestoIncluido: true,
    permitirStockNegativo: false,
    umbralStockBajo: 10,
    requiereReferenciaVenta: false,
    requiereReferenciaCompra: false,
  });

  useEffect(() => {
    if (!usuario?.tenantId) return;
    api.get<Tenant>(`/tenants/${usuario.tenantId}`)
      .then((t) => {
        setTenant(t);
        setForm({
          nombre: t.name,
          nombreImpuesto: t.taxName || '',
          tasaImpuesto: t.taxRate || 0,
          impuestoIncluido: t.taxIncluded ?? true,
          permitirStockNegativo: t.allowNegativeStock ?? false,
          umbralStockBajo: t.lowStockThreshold ?? 10,
          requiereReferenciaVenta: t.requireReferenceOnSale ?? false,
          requiereReferenciaCompra: t.requireReferenceOnPurchase ?? false,
        });
      })
      .catch(console.error)
      .finally(() => setCargando(false));
  }, [usuario?.tenantId]);

  const guardar = async () => {
    if (!usuario?.tenantId) return;
    setGuardando(true);
    setMensaje('');
    try {
      await api.patch(`/tenants/${usuario.tenantId}`, form);
      setMensaje('Configuración guardada correctamente');
      await cargarPerfil();
      setTimeout(() => setMensaje(''), 3000);
    } catch (err: any) {
      setMensaje(`Error: ${err.message}`);
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) return <IndicadorCarga texto="Cargando configuración..." className="py-20" />;

  return (
    <div className="max-w-3xl space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 flex items-center gap-3">
            <Settings size={28} className="text-zinc-400" />
            Configuración
          </h1>
          <p className="text-zinc-500 mt-1">Ajustes generales de tu negocio</p>
        </div>
        <button
          onClick={guardar}
          disabled={guardando}
          className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold rounded-xl hover:from-amber-600 hover:to-orange-600 disabled:opacity-50 shadow-lg shadow-amber-500/25 transition-all text-sm"
        >
          {guardando ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          {guardando ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>

      {mensaje && (
        <div className={`px-4 py-3 rounded-xl text-sm ${mensaje.includes('Error') ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-emerald-50 text-emerald-600 border border-emerald-200'}`}>
          {mensaje}
        </div>
      )}

      {/* Datos del negocio */}
      <section className="bg-white border border-zinc-200 rounded-2xl p-6 space-y-5">
        <h2 className="text-lg font-semibold text-zinc-800 flex items-center gap-2">
          <Building2 size={20} className="text-zinc-400" /> Datos del negocio
        </h2>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-zinc-700">Nombre del negocio</label>
          <input
            type="text"
            value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 bg-zinc-50 rounded-xl text-center">
            <Globe size={20} className="mx-auto text-zinc-400 mb-1" />
            <p className="text-sm font-semibold text-zinc-700">{tenant?.countryCode}</p>
            <p className="text-xs text-zinc-400">País</p>
          </div>
          <div className="p-4 bg-zinc-50 rounded-xl text-center">
            <DollarSign size={20} className="mx-auto text-zinc-400 mb-1" />
            <p className="text-sm font-semibold text-zinc-700">{tenant?.currencySymbol} {tenant?.currencyCode}</p>
            <p className="text-xs text-zinc-400">Moneda</p>
          </div>
          <div className="p-4 bg-zinc-50 rounded-xl text-center">
            <Package size={20} className="mx-auto text-zinc-400 mb-1" />
            <p className="text-sm font-semibold text-zinc-700">{tenant?.plan?.toUpperCase()}</p>
            <p className="text-xs text-zinc-400">Plan</p>
          </div>
        </div>
      </section>

      {/* Configuración fiscal */}
      <section className="bg-white border border-zinc-200 rounded-2xl p-6 space-y-5">
        <h2 className="text-lg font-semibold text-zinc-800 flex items-center gap-2">
          <Receipt size={20} className="text-zinc-400" /> Configuración fiscal
        </h2>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-zinc-700">Nombre del impuesto</label>
            <input
              type="text"
              value={form.nombreImpuesto}
              onChange={(e) => setForm({ ...form, nombreImpuesto: e.target.value })}
              className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-zinc-700">Tasa (%)</label>
            <input
              type="number"
              value={form.tasaImpuesto}
              onChange={(e) => setForm({ ...form, tasaImpuesto: Number(e.target.value) })}
              className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
              min={0} max={100} step={0.01}
            />
          </div>
        </div>

        <label className="flex items-center gap-3 p-4 bg-zinc-50 border border-zinc-200 rounded-xl cursor-pointer hover:bg-zinc-100 transition-colors">
          <input
            type="checkbox"
            checked={form.impuestoIncluido}
            onChange={(e) => setForm({ ...form, impuestoIncluido: e.target.checked })}
            className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500/30"
          />
          <div>
            <span className="text-sm font-medium text-zinc-700">Impuesto incluido en precios</span>
            <p className="text-xs text-zinc-500">Los precios de venta ya incluyen el impuesto</p>
          </div>
        </label>
      </section>

      {/* Inventario */}
      <section className="bg-white border border-zinc-200 rounded-2xl p-6 space-y-5">
        <h2 className="text-lg font-semibold text-zinc-800 flex items-center gap-2">
          <ShieldCheck size={20} className="text-zinc-400" /> Reglas de inventario
        </h2>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-zinc-700">Umbral de stock bajo</label>
          <input
            type="number"
            value={form.umbralStockBajo}
            onChange={(e) => setForm({ ...form, umbralStockBajo: Number(e.target.value) })}
            className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
            min={0}
          />
          <p className="text-xs text-zinc-400">Productos con stock igual o menor recibirán alerta</p>
        </div>

        <label className="flex items-center gap-3 p-4 bg-zinc-50 border border-zinc-200 rounded-xl cursor-pointer hover:bg-zinc-100 transition-colors">
          <input
            type="checkbox"
            checked={form.permitirStockNegativo}
            onChange={(e) => setForm({ ...form, permitirStockNegativo: e.target.checked })}
            className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500/30"
          />
          <div>
            <span className="text-sm font-medium text-zinc-700">Permitir stock negativo</span>
            <p className="text-xs text-zinc-500">Permite ventas aunque no haya stock suficiente</p>
          </div>
        </label>

        <label className="flex items-center gap-3 p-4 bg-zinc-50 border border-zinc-200 rounded-xl cursor-pointer hover:bg-zinc-100 transition-colors">
          <input
            type="checkbox"
            checked={form.requiereReferenciaVenta}
            onChange={(e) => setForm({ ...form, requiereReferenciaVenta: e.target.checked })}
            className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500/30"
          />
          <div>
            <span className="text-sm font-medium text-zinc-700">Referencia obligatoria en ventas</span>
            <p className="text-xs text-zinc-500">Exige número de boleta/factura al registrar ventas</p>
          </div>
        </label>

        <label className="flex items-center gap-3 p-4 bg-zinc-50 border border-zinc-200 rounded-xl cursor-pointer hover:bg-zinc-100 transition-colors">
          <input
            type="checkbox"
            checked={form.requiereReferenciaCompra}
            onChange={(e) => setForm({ ...form, requiereReferenciaCompra: e.target.checked })}
            className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500/30"
          />
          <div>
            <span className="text-sm font-medium text-zinc-700">Referencia obligatoria en compras</span>
            <p className="text-xs text-zinc-500">Exige número de guía/factura al registrar compras</p>
          </div>
        </label>
      </section>

      {/* Plan info */}
      <section className="bg-gradient-to-br from-zinc-900 to-zinc-800 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-lg">Plan {tenant?.plan?.toUpperCase()}</h3>
            <p className="text-zinc-400 text-sm mt-1">
              {tenant?.maxLocations} sedes · {tenant?.maxUsers} usuarios · {tenant?.maxProducts} productos
            </p>
          </div>
          <button className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-xl transition-colors">
            Mejorar plan
          </button>
        </div>
      </section>
    </div>
  );
}
