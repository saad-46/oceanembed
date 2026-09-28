/** TCHP gauge with the 50 kJ/cm² reference mark; shared by Analysis and the guided tour. */
export default function Gauge({ value, max = 150 }: { value: number | null; max?: number }) {
  const v = value === null ? 0 : Math.min(value, max);
  const a = Math.PI * (1 - v / max);
  const x = 100 + 80 * Math.cos(a), y = 100 - 80 * Math.sin(a);
  const t50 = Math.PI * (1 - 50 / max);
  const hot = v >= 50;
  return (
    <svg viewBox="0 0 200 124" className="w-full max-w-[280px]" role="img" aria-label={`TCHP gauge ${value === null ? "no data" : value.toFixed(0) + " kJ/cm²"}`}>
      <defs>
        <linearGradient id="gaugeHot" x1="0" x2="1">
          <stop offset="0" stopColor="#3987e5" />
          <stop offset="0.45" stopColor="#f0b429" />
          <stop offset="1" stopColor="#ec5a3a" />
        </linearGradient>
      </defs>
      <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="#1c2c42" strokeWidth="14" strokeLinecap="round" />
      {value !== null && <path d={`M20 100 A80 80 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)}`} fill="none" stroke={hot ? "url(#gaugeHot)" : "#3987e5"} strokeWidth="14" strokeLinecap="round" style={{ transition: "all .35s ease" }} />}
      <line x1={100 + 64 * Math.cos(t50)} y1={100 - 64 * Math.sin(t50)} x2={100 + 96 * Math.cos(t50)} y2={100 - 96 * Math.sin(t50)} stroke="#e8edf4" strokeWidth="1.5" strokeDasharray="3 2" />
      <text x={100 + 104 * Math.cos(t50)} y={100 - 104 * Math.sin(t50)} textAnchor="end" fill="#8a96a8" fontSize="8">
        50
      </text>
      <text x="100" y="90" textAnchor="middle" fill="#e8edf4" fontSize="30" fontFamily="var(--font-plex-mono)">
        {value === null ? "—" : value.toFixed(0)}
      </text>
      <text x="100" y="106" textAnchor="middle" fill="#8a96a8" fontSize="9.5">
        kJ/cm² ocean heat content
      </text>
      <text x="100" y="121" textAnchor="middle" fill={value === null ? "#8a96a8" : hot ? "#f0b429" : "#7fa8d8"} fontSize="9.5" fontWeight="600">
        {value === null ? "no ocean value here" : hot ? "above the 50 kJ/cm² reference level" : "below the 50 kJ/cm² reference level"}
      </text>
    </svg>
  );
}
