import { monitorNeedsAttention } from "./config";
import type { CompletedMonitorState, ProcmonMonitorState } from "./types";

export function monitorHealth(
  monitor: ProcmonMonitorState,
  previous?: CompletedMonitorState,
  now = Date.now(),
): { needsAttention: boolean; active: boolean; completedState?: CompletedMonitorState } {
  if (!monitor.enabled || monitor.status === "disabled") {
    return { needsAttention: false, active: false };
  }
  const finishedAt = Date.parse(monitor.last_check_finished_at ?? "");
  // Go durations can contain multiple units (e.g. 1m30s). Invalid intervals
  // use a conservative fallback. Allow a five-minute execution grace without
  // truncating legitimate long intervals, and tolerate 30 seconds of clock skew.
  const interval = durationMs(monitor.interval) ?? 60000;
  const freshness = interval * 2 + 300000;
  const fresh = Number.isFinite(finishedAt) && finishedAt <= now + 30000 && now - finishedAt <= freshness;
  if (monitor.status !== "checking") {
    const needsAttention = monitorNeedsAttention(monitor.status);
    return {
      needsAttention: needsAttention || !fresh,
      active: fresh,
      completedState: { needsAttention, finishedAt: monitor.last_check_finished_at },
    };
  }

  const sameCompletion = !previous?.finishedAt || previous.finishedAt === monitor.last_check_finished_at;
  const known = fresh && sameCompletion && previous !== undefined;
  return {
    needsAttention: known ? previous.needsAttention : true,
    active: known,
    completedState: previous,
  };
}

function durationMs(value?: string): number | undefined {
  if (!value || !/^(?:\d+(?:\.\d+)?(?:ns|us|\u00b5s|\u03bcs|ms|s|m|h))+$/.test(value)) {
    return undefined;
  }
  const units: Record<string, number> = { ns: 0.000001, us: 0.001, "\u00b5s": 0.001, "\u03bcs": 0.001, ms: 1, s: 1000, m: 60000, h: 3600000 };
  let result = 0;
  for (const match of value.matchAll(/(\d+(?:\.\d+)?)(ns|us|\u00b5s|\u03bcs|ms|s|m|h)/g)) {
    result += Number(match[1]) * units[match[2]];
  }
  return Number.isFinite(result) && result > 0 ? result : undefined;
}
