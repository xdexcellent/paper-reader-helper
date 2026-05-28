type CircularProgressProps = {
  percentage: number // 0 to 100
  size?: number // default 120
  strokeWidth?: number // default 8
}

/**
 * SVG-based circular progress indicator with percentage text.
 * Renders a background track and a progress arc that starts from the top (12 o'clock).
 */
export function CircularProgress({
  percentage,
  size = 120,
  strokeWidth = 8,
}: CircularProgressProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (percentage / 100) * circumference

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg
        width={size}
        height={size}
        style={{ transform: 'rotate(-90deg)' }}
      >
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#E2E8F0"
          strokeWidth={strokeWidth}
        />
        {/* Progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#2563EB"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
        />
      </svg>
      {/* Center percentage text */}
      <span className="absolute font-bold text-2xl text-[#0F172A]">
        {percentage}%
      </span>
    </div>
  )
}
