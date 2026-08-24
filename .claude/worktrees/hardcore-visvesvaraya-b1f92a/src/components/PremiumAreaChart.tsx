"use client";

import React, { useMemo, useState } from "react";

type Point = { label: string; value: number };

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export default function PremiumAreaChart({
  title,
  subtitle,
  data,
  height = 220,
}: {
  title: string;
  subtitle?: string;
  data: Point[];
  height?: number;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const { w, h, padX, padY, maxV, minV, pts, pathLine, pathArea, gridYs } =
    useMemo(() => {
      const w = 720; // viewBox width (responsivo)
      const h = height;

      const padX = 28;
      const padY = 18;

      const values = data.map((d) => d.value);
      const maxV = Math.max(1, ...values);
      const minV = Math.min(...values, 0);

      const innerW = w - padX * 2;
      const innerH = h - padY * 2;

      const xStep = data.length > 1 ? innerW / (data.length - 1) : innerW;

      const mapY = (v: number) => {
        const t = (v - minV) / (maxV - minV || 1);
        return padY + (1 - t) * innerH;
      };

      const pts = data.map((d, i) => {
        const x = padX + i * xStep;
        const y = mapY(d.value);
        return { ...d, x, y };
      });

      const pathLine =
        pts.length === 0
          ? ""
          : "M " + pts.map((p) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" L ");

      const baselineY = mapY(minV);
      const pathArea =
        pts.length === 0
          ? ""
          : [
              `M ${pts[0].x.toFixed(2)} ${baselineY.toFixed(2)}`,
              `L ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`,
              pts.slice(1).map((p) => `L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" "),
              `L ${pts[pts.length - 1].x.toFixed(2)} ${baselineY.toFixed(2)}`,
              "Z",
            ].join(" ");

      // grid lines (3)
      const gridYs = [0.25, 0.5, 0.75].map((t) => padY + t * innerH);

      return { w, h, padX, padY, maxV, minV, pts, pathLine, pathArea, gridYs };
    }, [data, height]);

  const active = hoverIndex != null ? pts[hoverIndex] : null;

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="px-5 pt-5 pb-3 flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-black text-slate-900">{title}</div>
          {subtitle ? <div className="text-xs text-slate-500">{subtitle}</div> : null}
        </div>

        <div className="text-xs px-2.5 py-1 rounded-full border border-slate-200 bg-slate-50 text-slate-600">
          Últimos {data.length} pontos
        </div>
      </div>

      <div className="px-5 pb-5">
        <div className="relative rounded-3xl border border-slate-200 bg-slate-50/40 p-3">
          {/* Tooltip */}
          {active ? (
            <div
              className="absolute z-10 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-md text-xs"
              style={{
                left: clamp((active.x / w) * 100, 6, 80) + "%",
                top: 10,
              }}
            >
              <div className="font-bold text-slate-900">{active.label}</div>
              <div className="text-slate-500">
                Valor: <span className="font-semibold text-slate-800">{active.value}</span>
              </div>
            </div>
          ) : null}

          <svg
            viewBox={`0 0 ${w} ${h}`}
            className="w-full h-auto"
            onMouseLeave={() => setHoverIndex(null)}
          >
            {/* Defs */}
            <defs>
              <linearGradient id="fillGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(37,99,235,0.28)" />
                <stop offset="100%" stopColor="rgba(37,99,235,0.02)" />
              </linearGradient>

              <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="rgba(99,102,241,1)" />
                <stop offset="100%" stopColor="rgba(37,99,235,1)" />
              </linearGradient>

              <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="12" stdDeviation="10" floodColor="rgba(15,23,42,0.14)" />
              </filter>
            </defs>

            {/* Grid */}
            {gridYs.map((y, i) => (
              <line
                key={i}
                x1={padX}
                x2={w - padX}
                y1={y}
                y2={y}
                stroke="rgba(148,163,184,0.25)"
                strokeDasharray="4 6"
              />
            ))}

            {/* Area */}
            <path d={pathArea} fill="url(#fillGrad)" />

            {/* Line */}
            <path
              d={pathLine}
              fill="none"
              stroke="url(#lineGrad)"
              strokeWidth="3"
              filter="url(#softShadow)"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Points + hit areas */}
            {pts.map((p, i) => (
              <g key={i}>
                {/* hit area */}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={18}
                  fill="transparent"
                  onMouseMove={() => setHoverIndex(i)}
                />
                {/* visible dot */}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={hoverIndex === i ? 6 : 4}
                  fill={hoverIndex === i ? "rgba(37,99,235,1)" : "rgba(99,102,241,0.95)"}
                />
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={hoverIndex === i ? 10 : 8}
                  fill="rgba(37,99,235,0.10)"
                />
              </g>
            ))}

            {/* X labels (só alguns pra não poluir) */}
            {pts.map((p, i) => {
              const show = i === 0 || i === pts.length - 1 || i === Math.floor(pts.length / 2);
              if (!show) return null;
              return (
                <text
                  key={i}
                  x={p.x}
                  y={h - 6}
                  textAnchor="middle"
                  fontSize="12"
                  fill="rgba(100,116,139,0.95)"
                >
                  {p.label}
                </text>
              );
            })}
          </svg>
        </div>

        <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
          <div>
            Mín: <span className="font-semibold text-slate-700">{minV}</span>
          </div>
          <div>
            Máx: <span className="font-semibold text-slate-700">{maxV}</span>
          </div>
        </div>
      </div>
    </div>
  );
}