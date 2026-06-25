/**
 * Skeleton loading states for the dashboard.
 * Shows animated placeholder blocks while data loads.
 */

function Pulse({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-[#F1F5F9] ${className}`} />
}

export function KpiSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="rounded-[14px] border border-[#F1F5F9] bg-white px-4 py-3.5 flex items-center justify-between">
          <div className="space-y-2">
            <Pulse className="h-7 w-16" />
            <Pulse className="h-3 w-12" />
            <Pulse className="h-2.5 w-20" />
          </div>
          <Pulse className="h-11 w-11 rounded-full" />
        </div>
      ))}
    </div>
  )
}

export function PrioritySkeleton() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5">
        <Pulse className="h-5 w-40" />
        <Pulse className="h-5 w-28 rounded-full" />
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="rounded-[16px] border border-[#F1F5F9] bg-white p-4 flex gap-4">
            <div className="space-y-2">
              <Pulse className="h-6 w-6 rounded-md" />
              <Pulse className="h-[72px] w-[92px] rounded-lg" />
            </div>
            <div className="flex-1 space-y-2">
              <Pulse className="h-4 w-full" />
              <Pulse className="h-3 w-3/4" />
              <Pulse className="h-3 w-1/2" />
              <div className="flex gap-1.5 pt-1">
                <Pulse className="h-4 w-12 rounded-full" />
                <Pulse className="h-4 w-14 rounded-full" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function PaperListSkeleton() {
  return (
    <div className="space-y-2.5 mt-4">
      <div className="flex items-center justify-between">
        <Pulse className="h-5 w-48" />
        <Pulse className="h-5 w-20" />
      </div>
      <div className="flex gap-1.5 mt-3">
        <Pulse className="h-7 w-16 rounded-full" />
        <Pulse className="h-7 w-16 rounded-full" />
        <Pulse className="h-7 w-16 rounded-full" />
      </div>
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="rounded-[14px] border border-[#F1F5F9] bg-white p-4 flex gap-4">
          <Pulse className="h-[80px] w-[102px] rounded-lg shrink-0" />
          <div className="flex-1 space-y-2">
            <Pulse className="h-4 w-4/5" />
            <Pulse className="h-3 w-2/3" />
            <Pulse className="h-3 w-full" />
            <div className="flex gap-1.5 pt-1">
              <Pulse className="h-4 w-10 rounded-full" />
              <Pulse className="h-4 w-12 rounded-full" />
              <Pulse className="h-4 w-14 rounded-full" />
            </div>
          </div>
          <Pulse className="h-6 w-10 self-start" />
        </div>
      ))}
    </div>
  )
}

export function ProgressSkeleton() {
  return (
    <div className="rounded-[16px] bg-white p-5 space-y-3" style={{ boxShadow: '0 4px 20px rgba(15,23,42,0.04)' }}>
      <Pulse className="h-4 w-20" />
      <Pulse className="h-2.5 w-16" />
      <div className="flex justify-center py-4">
        <Pulse className="h-[100px] w-[100px] rounded-full" />
      </div>
      <div className="flex justify-between px-2">
        <Pulse className="h-8 w-14" />
        <Pulse className="h-8 w-14" />
        <Pulse className="h-8 w-14" />
      </div>
      <Pulse className="h-[160px] w-full rounded-lg" />
    </div>
  )
}

export function SuggestionsSkeleton() {
  return (
    <div className="rounded-[16px] bg-white p-5 space-y-2.5" style={{ boxShadow: '0 4px 20px rgba(15,23,42,0.04)' }}>
      <div className="flex justify-between">
        <Pulse className="h-4 w-16" />
        <Pulse className="h-3 w-20" />
      </div>
      {[1, 2, 3].map(i => (
        <div key={i} className="rounded-[12px] border border-[#F1F5F9] p-3.5 space-y-2">
          <div className="flex gap-3">
            <Pulse className="h-6 w-6 rounded-md shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Pulse className="h-3 w-16 rounded-full" />
              <Pulse className="h-3.5 w-full" />
              <Pulse className="h-3 w-4/5" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export function DashboardContentSkeleton() {
  return (
    <div className="grid grid-cols-[1fr_320px] gap-5 p-5">
      <div className="flex flex-col gap-5 min-w-0">
        {/* Page header skeleton */}
        <div className="mb-1 space-y-1.5">
          <Pulse className="h-6 w-48" />
          <Pulse className="h-3.5 w-80" />
          <div className="flex gap-2 mt-2">
            <Pulse className="h-3 w-20" />
            <Pulse className="h-3 w-12" />
            <Pulse className="h-3 w-24" />
          </div>
        </div>
        <KpiSkeleton />
        <PrioritySkeleton />
        <PaperListSkeleton />
      </div>
      <div className="flex flex-col gap-4">
        <ProgressSkeleton />
        <SuggestionsSkeleton />
      </div>
    </div>
  )
}
