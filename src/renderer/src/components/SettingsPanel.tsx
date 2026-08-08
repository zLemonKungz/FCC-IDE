import type { ReactNode } from 'react';

// Card wrapper shared by every settings tab: a header (title + optional right
// slot) over grouped rows. Follows the project card language — `--bg-0` +
// `--border-1`, radius, no shadow.
export default function SettingsPanel({
  title,
  actions,
  children
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="settings-panel">
      <div className="settings-panel-head">
        <span className="settings-panel-title">{title}</span>
        {actions}
      </div>
      <div className="settings-panel-body">{children}</div>
    </section>
  );
}