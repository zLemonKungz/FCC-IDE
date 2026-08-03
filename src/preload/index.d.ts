import type { FccApi } from './index';

declare global {
  interface Window {
    fcc: FccApi;
  }
}

export {};
