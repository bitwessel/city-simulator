interface MeterProps {
  /** 0..100 */
  value: number;
  color: string;
  /** Optional max for non-percentage meters (defaults to 100). */
  max?: number;
  className?: string;
  title?: string;
}

/** A thin horizontal fill bar, clamped to its track. */
export function Meter({ value, color, max = 100, className, title }: MeterProps) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={`mm-meter ${className ?? ''}`} title={title}>
      <div
        className="mm-meter__fill"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}

interface LabeledMeterProps {
  label: string;
  value: number;
  color: string;
  /** Text shown on the right (defaults to rounded value). */
  valueText?: string;
}

/** Meter with a label row above it; used in detail/faction panels. */
export function LabeledMeter({ label, value, color, valueText }: LabeledMeterProps) {
  return (
    <div className="labeled-meter">
      <div className="labeled-meter__head">
        <span>{label}</span>
        <span>{valueText ?? Math.round(value)}</span>
      </div>
      <Meter value={value} color={color} />
    </div>
  );
}
