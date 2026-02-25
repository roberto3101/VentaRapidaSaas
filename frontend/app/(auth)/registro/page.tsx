import { FormularioRegistro } from '../../../componentes/auth/formulario-registro';

export default function RegistroPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <div className="lg:hidden mb-8">
          <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-600 rounded-lg flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
        </div>
        <h2 className="text-2xl font-bold text-zinc-900">Crea tu negocio</h2>
        <p className="text-zinc-500">Configura tu sistema en 3 simples pasos</p>
      </div>
      <FormularioRegistro />
    </div>
  );
}
