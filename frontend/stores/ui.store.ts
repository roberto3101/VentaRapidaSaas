import { create } from 'zustand';

interface UiState {
  sidebarAbierto: boolean;
  toggleSidebar: () => void;
  setSidebar: (abierto: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  sidebarAbierto: true,
  toggleSidebar: () => set((s) => ({ sidebarAbierto: !s.sidebarAbierto })),
  setSidebar: (abierto) => set({ sidebarAbierto: abierto }),
}));
