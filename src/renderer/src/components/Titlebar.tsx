import Logo from './Logo';

export default function Titlebar() {
  return (
    <div className="titlebar">
      <span className="titlebar-brand">
        <Logo width={13} height={13} style={{ color: 'var(--accent)' }} />
        FCC Studio
      </span>
    </div>
  );
}
