import { Logo } from '../../componentes/layout/logo';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex">
      {/* Panel izquierdo — decorativo */}
      <div className="hidden lg:flex lg:w-[45%] bg-zinc-950 relative overflow-hidden flex-col justify-between p-12">
        {/* Pattern de fondo */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }} />

        {/* Glow */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-amber-500/10 rounded-full blur-[120px]" />

        <div className="relative z-10">
          <Logo />
        </div>

        <div className="relative z-10 space-y-6">
          <h1 className="text-4xl font-bold text-white leading-tight">
            Gestiona tu inventario
            <br />
            <span className="text-amber-400">sin complicaciones</span>
          </h1>
          <p className="text-zinc-400 text-lg max-w-md leading-relaxed">
            Control total de stock, precios, sedes y transferencias. 
            Diseñado para negocios en Latinoamérica.
          </p>
          <div className="flex items-center gap-8 pt-4">
            <div>
              <p className="text-2xl font-bold text-white">Multi-sede</p>
              <p className="text-sm text-zinc-500">Varias ubicaciones</p>
            </div>
            <div className="w-px h-10 bg-zinc-800" />
            <div>
              <p className="text-2xl font-bold text-white">Multi-moneda</p>
              <p className="text-sm text-zinc-500">PEN, VES, USD...</p>
            </div>
            <div className="w-px h-10 bg-zinc-800" />
            <div>
              <p className="text-2xl font-bold text-white">Tiempo real</p>
              <p className="text-sm text-zinc-500">Stock actualizado</p>
            </div>
          </div>
        </div>

        <p className="relative z-10 text-xs text-zinc-600">
          © 2026 VentaRápida. Todos los derechos reservados.
        </p>
      </div>

      {/* Panel derecho — formulario */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {children}
        </div>
      </div>
    </div>
  );
}
