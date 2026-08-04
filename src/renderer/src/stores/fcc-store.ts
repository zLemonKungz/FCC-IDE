import { create } from 'zustand';
import type { FccInstallStatus, FccStatus } from '@shared/types';

interface FccState {
  status: FccStatus | null;
  /** Result of the install probe; null until the first detect() resolves. */
  install: FccInstallStatus | null;
  /** Whether the FCC setup modal is open (shared by status bar + chat banner). */
  setupOpen: boolean;
  setSetupOpen: (v: boolean) => void;
  refresh: () => Promise<void>;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  detect: () => Promise<void>;
}

export const useFccStore = create<FccState>((set) => ({
  status: null,
  install: null,
  setupOpen: false,
  setSetupOpen: (v) => set({ setupOpen: v }),
  refresh: async () => {
    try {
      set({ status: await window.fcc.fccStatus() });
    } catch {
      set({ status: null });
    }
  },
  stop: async () => {
    try {
      set({ status: await window.fcc.fccStop() });
    } catch {
      /* keep prior status */
    }
  },
  start: async () => {
    // Detect first: if FCC isn't installed, route to the setup guide instead
    // of spawning a phantom command.
    const inst = await window.fcc.fccDetect().catch(() => null);
    set({ install: inst });
    if (!inst?.installed) {
      set({ setupOpen: true });
      return;
    }
    try {
      set({ status: await window.fcc.fccStart() });
    } catch {
      /* keep prior status */
    }
  },
  detect: async () => {
    try {
      set({ install: await window.fcc.fccDetect() });
    } catch {
      set({ install: null });
    }
  }
}));
