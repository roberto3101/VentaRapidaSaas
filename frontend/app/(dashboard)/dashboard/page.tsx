'use client';

import { useEffect, useState } from 'react';
import { useAuthContexto } from '../../../contextos/auth.contexto';
import { api } from '../../../servicios/api';
import { TarjetaEstadistica } from '../../../componentes/compartidos/tarjeta-estadistica';
import { IndicadorCarga } from '../../../componentes/compartidos/indicador-carga';
import {
  Package, Boxes, MapPin, Users, TrendingUp, TrendingDown,
  AlertTriangle, XCircle, ArrowUpRight, Activity,
} from 'lucide-react';

interface DashboardData {
  resumen: { totalProductos: number; totalVariantes: number; totalSedes: number; totalUsuarios: number };
  movimientos: { hoy: number; estaSemana: number; esteMes: number };
  alertas: { stockBajo: number; stockAgotado: number };
}

export default function DashboardPage() {
  const { usuario } = useAuthContexto();
  const [data, setData] = useState<DashboardData | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    api.get<DashboardData>('/reportes/dashboard')
      .then(setData)
      .catch(console.error)
      .finally(() => setCargando(false));
  }, []);

  const hora = new Date().getHours();
  const saludo = hora < 12 ? 'Buenos días' : hora < 18 ? 'Buenas tardes' : 'Buenas noches';

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">
          {saludo}, {usuario?.fullName?.split(' ')[0]} 👋
        </h1>
        <p className="text-zinc-500 mt-1">
          Este es el resumen de <strong>{usuario?.tenant?.name}</strong>
        </p>
      </div>

      {cargando ? (
        <IndicadorCarga texto="Cargando dashboard..." className="py-20" />
      ) : data ? (
        <>
          {/* Tarjetas principales */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <TarjetaEstadistica
              titulo="Productos"
              valor={data.resumen.totalProductos}
              subtitulo={`${data.resumen.totalVariantes} variantes`}
              icono={Package}
              color="amber"
            />
            <TarjetaEstadistica
              titulo="Sedes"
              valor={data.resumen.totalSedes}
              icono={MapPin}
              color="blue"
            />
            <TarjetaEstadistica
              titulo="Usuarios"
              valor={data.resumen.totalUsuarios}
              icono={Users}
              color="purple"
            />
            <TarjetaEstadistica
              titulo="Mov. hoy"
              valor={data.movimientos.hoy}
              subtitulo={`${data.movimientos.estaSemana} esta semana`}
              icono={Activity}
              color="green"
            />
          </div>

          {/* Alertas */}
          {(data.alertas.stockBajo > 0 || data.alertas.stockAgotado > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {data.alertas.stockBajo > 0 && (
                <div className="flex items-center gap-4 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
                  <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                    <AlertTriangle size={20} className="text-amber-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-amber-800">{data.alertas.stockBajo} productos con stock bajo</p>
                    <p className="text-xs text-amber-600">Requieren reabastecimiento pronto</p>
                  </div>
                </div>
              )}
              {data.alertas.stockAgotado > 0 && (
                <div className="flex items-center gap-4 p-4 bg-red-50 border border-red-200 rounded-2xl">
                  <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                    <XCircle size={20} className="text-red-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-red-800">{data.alertas.stockAgotado} productos agotados</p>
                    <p className="text-xs text-red-600">Sin stock disponible</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Actividad del mes */}
          <div className="bg-white border border-zinc-200 rounded-2xl p-6">
            <h3 className="text-lg font-semibold text-zinc-800 mb-4">Actividad del mes</h3>
            <div className="grid grid-cols-3 gap-6">
              <div className="text-center p-4 bg-zinc-50 rounded-xl">
                <p className="text-3xl font-bold text-zinc-900">{data.movimientos.hoy}</p>
                <p className="text-sm text-zinc-500 mt-1">Hoy</p>
              </div>
              <div className="text-center p-4 bg-zinc-50 rounded-xl">
                <p className="text-3xl font-bold text-zinc-900">{data.movimientos.estaSemana}</p>
                <p className="text-sm text-zinc-500 mt-1">Esta semana</p>
              </div>
              <div className="text-center p-4 bg-zinc-50 rounded-xl">
                <p className="text-3xl font-bold text-zinc-900">{data.movimientos.esteMes}</p>
                <p className="text-sm text-zinc-500 mt-1">Este mes</p>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="text-center py-20 text-zinc-500">No se pudo cargar el dashboard</div>
      )}
    </div>
  );
}
