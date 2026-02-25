'use client';

import { useState, useEffect } from 'react';
import {
  FolderTree, Plus, Pencil, Trash2, Loader2, ChevronRight,
  ChevronDown, X, AlertCircle, FolderPlus,
} from 'lucide-react';
import { productosServicio } from '../../../servicios/productos.servicio';
import { ModalConfirmar } from '../../../componentes/productos/modal-confirmar';
import type { Categoria, CrearCategoriaPayload } from '../../../tipos/producto.tipos';

export default function CategoriasPage() {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [cargando, setCargando] = useState(true);
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());

  // Form state
  const [formVisible, setFormVisible] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [parentId, setParentId] = useState<string>('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  // Eliminar
  const [categoriaEliminar, setCategoriaEliminar] = useState<Categoria | null>(null);
  const [eliminando, setEliminando] = useState(false);

  const cargar = async () => {
    try {
      const arbol = await productosServicio.arbolCategorias();
      setCategorias(Array.isArray(arbol) ? arbol : []);
      // Expandir todo por defecto
      const ids = new Set<string>();
      const recoger = (cats: Categoria[]) => {
        cats.forEach((c) => {
          if (c.children?.length) { ids.add(c.id); recoger(c.children); }
        });
      };
      recoger(Array.isArray(arbol) ? arbol : []);
      setExpandidas(ids);
    } catch {
      setCategorias([]);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  const toggleExpand = (id: string) => {
    setExpandidas((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const resetForm = () => {
    setNombre(''); setDescripcion(''); setParentId('');
    setEditandoId(null); setFormVisible(false); setError('');
  };

  const editarCategoria = (cat: Categoria) => {
    setEditandoId(cat.id);
    setNombre(cat.name);
    setDescripcion(cat.description || '');
    setParentId(cat.parentId || '');
    setFormVisible(true);
    setError('');
  };

  const agregarSubcategoria = (parentCat: Categoria) => {
    resetForm();
    setParentId(parentCat.id);
    setFormVisible(true);
  };

  const guardar = async () => {
    if (!nombre.trim()) { setError('El nombre es obligatorio'); return; }
    setGuardando(true); setError('');
    try {
      const payload: CrearCategoriaPayload = {
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || undefined,
      categoriaPadreId: parentId || null,
      };
      if (editandoId) {
        await productosServicio.actualizarCategoria(editandoId, payload);
      } else {
        await productosServicio.crearCategoria(payload);
      }
      resetForm();
      setCargando(true);
      await cargar();
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Error al guardar';
      setError(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async () => {
    if (!categoriaEliminar) return;
    setEliminando(true);
    try {
      await productosServicio.eliminarCategoria(categoriaEliminar.id);
      setCategoriaEliminar(null);
      setCargando(true);
      await cargar();
    } catch (err: any) {
      console.error(err);
    } finally {
      setEliminando(false);
    }
  };

  // Flatten para el select de parent
  const flatten = (cats: Categoria[], nivel = 0, excluirId?: string): { id: string; nombre: string; nivel: number }[] => {
    const result: { id: string; nombre: string; nivel: number }[] = [];
    for (const c of cats) {
      if (c.id === excluirId) continue;
      result.push({ id: c.id, nombre: c.name, nivel });
      if (c.children?.length) result.push(...flatten(c.children, nivel + 1, excluirId));
    }
    return result;
  };

  const opcionesParent = flatten(categorias, 0, editandoId || undefined);

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Categorías</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Organiza tus productos en categorías jerárquicas</p>
        </div>
        {!formVisible && (
          <button
            onClick={() => { resetForm(); setFormVisible(true); }}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-b from-amber-400 to-amber-500 text-white text-sm font-medium rounded-xl shadow-sm shadow-amber-200 hover:from-amber-500 hover:to-amber-600 transition-all"
          >
            <Plus className="w-4 h-4" />
            Nueva categoría
          </button>
        )}
      </div>

      {/* Formulario */}
      {formVisible && (
        <div className="bg-white border border-zinc-200 rounded-2xl p-6 animate-in">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-base font-semibold text-zinc-800">
              {editandoId ? 'Editar categoría' : 'Nueva categoría'}
            </h3>
            <button onClick={resetForm} className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl mb-4 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">Nombre *</label>
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej: Bebidas"
                className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-400 transition-all"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">Categoría padre</label>
              <select
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-400 transition-all"
              >
                <option value="">Ninguna (raíz)</option>
                {opcionesParent.map((o) => (
                  <option key={o.id} value={o.id}>
                    {'─'.repeat(o.nivel)} {o.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">Descripción</label>
              <input
                type="text"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Descripción opcional..."
                className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-400 transition-all"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-5">
            <button
              onClick={resetForm}
              className="px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 rounded-xl transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={guardar}
              disabled={guardando}
              className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-gradient-to-b from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 rounded-xl shadow-sm shadow-amber-200 transition-all disabled:opacity-50"
            >
              {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {editandoId ? 'Guardar cambios' : 'Crear categoría'}
            </button>
          </div>
        </div>
      )}

      {/* Árbol de categorías */}
      {cargando ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-amber-500 animate-spin" />
        </div>
      ) : !categorias.length ? (
        <div className="bg-white border border-zinc-200 rounded-2xl p-12 text-center">
          <div className="w-16 h-16 bg-zinc-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <FolderTree className="w-8 h-8 text-zinc-400" />
          </div>
          <h3 className="text-base font-semibold text-zinc-700 mb-1">Sin categorías</h3>
          <p className="text-sm text-zinc-400">Crea tu primera categoría para organizar tus productos</p>
        </div>
      ) : (
        <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-zinc-100">
            <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Estructura de categorías</p>
          </div>
          <div className="divide-y divide-zinc-50">
            {categorias.map((cat) => (
              <NodoCategoria
                key={cat.id}
                categoria={cat}
                nivel={0}
                expandidas={expandidas}
                onToggle={toggleExpand}
                onEditar={editarCategoria}
                onEliminar={setCategoriaEliminar}
                onAgregarHijo={agregarSubcategoria}
              />
            ))}
          </div>
        </div>
      )}

      {/* Modal eliminar */}
      <ModalConfirmar
        abierto={!!categoriaEliminar}
        titulo="Eliminar categoría"
        mensaje={`¿Eliminar "${categoriaEliminar?.name}"? Los productos en esta categoría quedarán sin categoría asignada.${
          categoriaEliminar?.children?.length ? ' Las subcategorías también serán afectadas.' : ''
        }`}
        textoConfirmar="Sí, eliminar"
        cargando={eliminando}
        onConfirmar={eliminar}
        onCancelar={() => setCategoriaEliminar(null)}
      />
    </div>
  );
}

// ═══ NODO DEL ÁRBOL ═══
function NodoCategoria({
  categoria, nivel, expandidas, onToggle, onEditar, onEliminar, onAgregarHijo,
}: {
  categoria: Categoria;
  nivel: number;
  expandidas: Set<string>;
  onToggle: (id: string) => void;
  onEditar: (cat: Categoria) => void;
  onEliminar: (cat: Categoria) => void;
  onAgregarHijo: (cat: Categoria) => void;
}) {
  const tieneHijos = !!categoria.children?.length;
  const expandida = expandidas.has(categoria.id);
  const cantProductos = categoria._count?.products ?? 0;

  return (
    <div>
      <div
        className="group flex items-center gap-2 px-5 py-3 hover:bg-amber-50/30 transition-colors"
        style={{ paddingLeft: `${20 + nivel * 28}px` }}
      >
        {/* Expand toggle */}
        <button
          onClick={() => tieneHijos && onToggle(categoria.id)}
          className={`p-0.5 rounded transition-colors ${
            tieneHijos ? 'text-zinc-400 hover:text-zinc-600' : 'text-transparent'
          }`}
          disabled={!tieneHijos}
        >
          {expandida ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        {/* Icon + name */}
        <div className="flex-1 min-w-0 flex items-center gap-2.5">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
            nivel === 0 ? 'bg-amber-100 text-amber-600' : 'bg-zinc-100 text-zinc-500'
          }`}>
            <FolderTree className="w-3.5 h-3.5" />
          </div>
          <span className="text-sm font-medium text-zinc-800 truncate">{categoria.name}</span>
          {cantProductos > 0 && (
            <span className="text-xs text-zinc-400 flex-shrink-0">
              {cantProductos} {cantProductos === 1 ? 'producto' : 'productos'}
            </span>
          )}
          {categoria.description && (
            <span className="hidden md:inline text-xs text-zinc-400 truncate max-w-48">
              — {categoria.description}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onAgregarHijo(categoria)}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
            title="Agregar subcategoría"
          >
            <FolderPlus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onEditar(categoria)}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors"
            title="Editar"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onEliminar(categoria)}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 transition-colors"
            title="Eliminar"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Children */}
      {tieneHijos && expandida && (
        <div>
          {categoria.children!.map((hijo) => (
            <NodoCategoria
              key={hijo.id}
              categoria={hijo}
              nivel={nivel + 1}
              expandidas={expandidas}
              onToggle={onToggle}
              onEditar={onEditar}
              onEliminar={onEliminar}
              onAgregarHijo={onAgregarHijo}
            />
          ))}
        </div>
      )}
    </div>
  );
}
