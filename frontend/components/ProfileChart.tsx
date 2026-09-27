"use client";
import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface SeriesSpec {
  key: string;
  label: string;
  color: string;
  values: (number | null)[];
  dots?: boolean; // observations are drawn as points, not a line
  dashed?: boolean;
}

const DEPTH_TICKS = [0, 20, 50, 100, 200, 300, 500, 700, 1000];
// Depth is plotted as y = sqrt(depth) on a linear axis (vertical layout puts the minimum at the top):
// surface at the top, upper ocean stretched.
export const toY = (z: number) => Math.sqrt(z);
export const fromY = (y: number) => Math.round(y * y);
export const Y_TICKS = DEPTH_TICKS.map(toY);

export default function ProfileChart({
  depths,
  main,
  band,
  others,
  height = 360,
}: {
  depths: number[];
  main: SeriesSpec;
  band?: { lo: (number | null)[]; hi: (number | null)[] } | null;
  others: SeriesSpec[];
  height?: number;
}) {
  const all = [main, ...others];
  const data = depths.map((z, k) => {
    const row: Record<string, number | null | [number, number]> = { depth: z, y: toY(z) };
    for (const s of all) row[s.key] = s.values[k] ?? null;
    if (band && band.lo[k] !== null && band.hi[k] !== null) row.band = [band.lo[k] as number, band.hi[k] as number];
    return row;
  });
  const vals = all.flatMap((s) => s.values).filter((v): v is number => v !== null);
  const lo = Math.floor(Math.min(...vals, ...(band?.lo.filter((v): v is number => v !== null) ?? [])) - 0.5);
  const hi = Math.ceil(Math.max(...vals, ...(band?.hi.filter((v): v is number => v !== null) ?? [])) + 0.5);
  return (
    <div style={{ height }} role="img" aria-label={`Temperature profile chart: ${all.map((s) => s.label).join(", ")}`}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart layout="vertical" data={data} margin={{ top: 8, right: 16, bottom: 20, left: 4 }}>
          <CartesianGrid stroke="#8a96a8" strokeOpacity={0.12} />
          <XAxis
            type="number"
            domain={[lo, hi]}
            tick={{ fill: "#8a96a8", fontSize: 11 }}
            stroke="#1e2836"
            label={{ value: "Temperature (°C)", position: "insideBottom", offset: -12, fill: "#8a96a8", fontSize: 11 }}
          />
          <YAxis
            type="number"
            dataKey="y"
            domain={[0, toY(1000)]}
            ticks={Y_TICKS}
            tickFormatter={(y: number) => String(fromY(y))}
            tick={{ fill: "#8a96a8", fontSize: 11 }}
            stroke="#1e2836"
            width={44}
            label={{ value: "Depth (m)", angle: -90, position: "insideLeft", fill: "#8a96a8", fontSize: 11, dy: 30 }}
          />
          <Tooltip
            contentStyle={{ background: "#111826", border: "1px solid #2ac3de", borderRadius: 4, fontSize: 12 }}
            labelStyle={{ color: "#e8edf4" }}
            itemStyle={{ color: "#e8edf4" }}
            labelFormatter={(y) => `${fromY(Number(y))} m`}
            formatter={(v, name) => {
              if (Array.isArray(v)) return [`${(v[0] as number).toFixed(2)} – ${(v[1] as number).toFixed(2)} °C`, "±1σ band"];
              return [typeof v === "number" ? `${v.toFixed(2)} °C` : "—", name];
            }}
          />
          <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 11, color: "#8a96a8" }} />
          {band && <Area dataKey="band" name="±1σ uncertainty" fill={main.color} fillOpacity={0.18} stroke="none" isAnimationActive={false} legendType="rect" />}
          {all.map((s) =>
            s.dots ? (
              <Line
                key={s.key}
                dataKey={s.key}
                name={s.label}
                stroke="none"
                dot={{ r: 4, fill: s.color, stroke: "#111826", strokeWidth: 2 }}
                activeDot={{ r: 6 }}
                isAnimationActive={false}
                connectNulls={false}
                legendType="circle"
              />
            ) : (
              <Line
                key={s.key}
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={s.key === main.key ? 2.5 : 2}
                strokeDasharray={s.dashed ? "5 4" : undefined}
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
            ),
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
