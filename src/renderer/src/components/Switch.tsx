// A styled on/off toggle switch (replaces the raw checkbox in the settings
// rows). The native input stays for a11y/accessibility; the track + knob are
// drawn with CSS driven by :checked.
export default function Switch({
  checked,
  onChange,
  disabled
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className={`switch${disabled ? ' disabled' : ''}`}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled} />
      <span className="switch-track">
        <span className="switch-knob" />
      </span>
    </label>
  );
}
