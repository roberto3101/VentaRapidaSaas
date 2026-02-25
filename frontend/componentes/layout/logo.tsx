export function Logo({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-9 h-9 bg-gradient-to-br from-amber-500 to-orange-600 rounded-lg flex items-center justify-center shadow-lg shadow-amber-500/20">
        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      </div>
      {!collapsed && (
        <div className="flex flex-col">
          <span className="text-[15px] font-bold tracking-tight text-zinc-100 leading-none">VentaRápida</span>
          <span className="text-[10px] text-zinc-500 font-medium tracking-widest uppercase">Inventario</span>
        </div>
      )}
    </div>
  );
}
