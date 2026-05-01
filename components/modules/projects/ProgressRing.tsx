import { cn } from "@/lib/utils";

interface Props {
  value: number; // 0-100
  size?: number;
  stroke?: number;
  className?: string;
  showLabel?: boolean;
  trackColor?: string;
  strokeColor?: string;
}

export function ProgressRing({
  value,
  size = 96,
  stroke = 10,
  className,
  showLabel = true,
  trackColor = "#0B1B3B",
  strokeColor = "#C9A24B",
}: Props) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, value));
  const offset = c - (clamped / 100) * c;
  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={trackColor}
          strokeOpacity={0.14}
          strokeWidth={stroke}
          fill="transparent"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={strokeColor}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          fill="transparent"
          style={{ transition: "stroke-dashoffset 0.6s cubic-bezier(0.16,1,0.3,1)" }}
        />
      </svg>
      {showLabel && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-brand-navy font-serif text-2xl tabular-nums">
            {Math.round(clamped)}
            <span className="text-base font-normal">%</span>
          </span>
          <span className="text-muted-foreground text-[10px] uppercase tracking-wider">
            complete
          </span>
        </div>
      )}
    </div>
  );
}

export function MiniProgressBar({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn(
        "bg-muted relative h-2 w-full overflow-hidden rounded-full",
        className
      )}
    >
      <div
        className="bg-brand-gold h-full rounded-full"
        style={{ width: `${clamped}%`, transition: "width 0.4s ease" }}
      />
    </div>
  );
}
