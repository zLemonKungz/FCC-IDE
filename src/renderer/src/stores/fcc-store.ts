import { create } from 'zustand';
import type { FccStatus } from '@shared/types';

interface FccState {
  status: FccStatus | null;
  refresh: () => Promise<void>;
  start: () => Promise<void>;
}

export const useFccStore = create<FccState>((set) => ({
  status: null,
  refresh: async () => {
    try {
      set({ status: await window.fcc.fccStatus() });
    } catch {
      set({ status: null });
    }
  },
  start: async () => {
    set({ status: await window.fcc.fccStart() });
  }
}));
