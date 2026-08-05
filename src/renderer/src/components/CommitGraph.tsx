import { useMemo, type ReactNode } from 'react';
import type { GitCommit } from '@shared/types';

const LANE_W = 22;
const ROW_H = 26;
const DOT = 4;

interface Row extends GitCommit {
  lane: number;
  parentLanes: number[];
}

// Lane layout: each commit gets a lane; its first parent continues that lane
// (the "backbone"), merge parents branch into fresh lanes. This is enough to
// draw a true woven graph (vertical backbones + horizontal merge joins).
function layout(commits: GitCommit[]): Row[] {
  const rows: Row[] = [];
  let laneCount = 0;
  const waiting = new Map<string, number>(); // parent short-hash -> lane awaiting it
  for (const c of commits) {
    let lane: number;
    if (waiting.has(c.hash)) {
      lane = waiting.get(c.hash)!;
      waiting.delete(c.hash);
    } else {
      lane = laneCount++;
    }
    const [first, ...rest] = c.parents;
    const parentLanes: number[] = [];
    if (first) waiting.set(first, lane);
    parentLanes.push(lane);
    for (const p of rest) {
      const pl = laneCount++;
      waiting.set(p, pl);
      parentLanes.push(pl);
    }
    rows.push({ ...c, lane, parentLanes });
  }
  return rows;
}

export default function CommitGraph({ commits }: { commits: GitCommit[] }) {
  const rows = useMemo(() => layout(commits), [commits]);
  const laneCount = rows.reduce((m, r) => Math.max(m, r.lane + 1), 1);
  const W = laneCount * LANE_W;
  const H = rows.length * ROW_H;
  const x = (lane: number): number => lane * LANE_W + LANE_W / 2;
  const y = (row: number): number => row * ROW_H + ROW_H / 2;

  const rowOf = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r, i) => m.set(r.hash, i));
    return m;
  }, [rows]);

  const lines: ReactNode[] = [];
  const dots: ReactNode[] = [];
  for (const r of rows) {
    const cx = x(r.lane);
    const cy = y(rows.indexOf(r));
    const [first, ...rest] = r.parents;
    if (first) {
      const pr = rowOf.get(first);
      if (pr !== undefined) {
        lines.push(<line key={`b-${r.hash}`} x1={cx} y1={cy} x2={cx} y2={y(pr)} className="scg-line" />);
      }
    }
    rest.forEach((p, i) => {
      const pl = r.parentLanes[i + 1];
      const pr = rowOf.get(p);
      if (pr === undefined) return;
      const px = x(pl);
      lines.push(<line key={`m-${r.hash}-${i}`} x1={cx} y1={cy} x2={px} y2={cy} className="scg-line" />);
      lines.push(<line key={`v-${r.hash}-${i}`} x1={px} y1={cy} x2={px} y2={y(pr)} className="scg-line" />);
    });
    const head = r.refs.includes('HEAD');
    dots.push(<circle key={`d-${r.hash}`} cx={cx} cy={cy} r={DOT} className={head ? 'scg-dot head' : 'scg-dot'} />);
  }

  return (
    <div className="scg">
      <svg width={W} height={H} className="scg-svg" aria-hidden="true">
        {lines}
        {dots}
      </svg>
      <div className="scg-labels">
        {rows.map((r) => (
          <div key={r.hash} className="scg-row" style={{ height: ROW_H }}>
            {r.refs && (
              <span className="scg-refs">
                {r.refs
                  .replace(/^\(|\)$/g, '')
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean)
                  .map((s, i) => (
                    <span key={i} className={`scg-ref${s.includes('HEAD') ? ' head' : s.startsWith('tag') ? ' tag' : ''}`}>
                      {s.replace(/^HEAD -> /, '')}
                    </span>
                  ))}
              </span>
            )}
            <span className="scg-subj">{r.subject}</span>
          </div>
        ))}
      </div>
    </div>
  );
}