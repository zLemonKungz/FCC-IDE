import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildStatus } from '../src/main/fcc-manager';

vi.mock('electron', () => ({ net: { request: vi.fn() }, BrowserWindow: class {} }));

describe('fcc-manager buildStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('reports online when http status is ok', () => {
    expect(buildStatus(true, 8082)).toEqual({ online: true, port: 8082 });
  });
  it('reports offline when request failed', () => {
    expect(buildStatus(false, 8082)).toEqual({ online: false, port: 8082 });
  });
});
