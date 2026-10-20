import { create } from "zustand";

type UiState = { searchOpen: boolean; setSearchOpen: (open: boolean) => void };

export const useUiStore = create<UiState>((set) => ({
  searchOpen: false,
  setSearchOpen: (open) => set({ searchOpen: open }),
}));
