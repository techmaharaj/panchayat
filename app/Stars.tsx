"use client";

/**
 * 0 to 100 rendered as the 1 to 5 stars reviewers already think in.
 * Each star is worth 20, so clicking star 4 means 80 and the number next to
 * it always agrees with the stars. The analysis can land between steps, so
 * the stars round and the exact value is shown beside them.
 */
export function toStars(value: number): number {
  return Math.max(0, Math.min(5, Math.round(value / 20)));
}

export function fromStars(star: number): number {
  return Math.max(0, Math.min(5, star)) * 20;
}

export function Stars({
  value,
  onChange,
  size = 22,
}: {
  value: number;
  onChange?: (v: number) => void;
  size?: number;
}) {
  const filled = toStars(value);
  return (
    <div className="stars" role={onChange ? "radiogroup" : undefined}>
      {([1, 2, 3, 4, 5] as const).map((n) => (
        <button
          key={n}
          type="button"
          className={`star${n <= filled ? " on" : ""}${onChange ? " live" : ""}`}
          style={{ fontSize: size }}
          disabled={!onChange}
          aria-label={`${n} of 5`}
          onClick={() => onChange?.(fromStars(n))}
        >
          ★
        </button>
      ))}
    </div>
  );
}
