import os from "node:os";
import { execSync } from "node:child_process";
import type { SystemMetrics } from "@remote-subagent/shared";

let prevCpuInfo: { idle: number; total: number } | null = null;

function getCpuPercent(): number {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;

  for (const cpu of cpus) {
    idle += cpu.times.idle;
    total +=
      cpu.times.user +
      cpu.times.nice +
      cpu.times.sys +
      cpu.times.idle +
      cpu.times.irq;
  }

  if (prevCpuInfo) {
    const idleDiff = idle - prevCpuInfo.idle;
    const totalDiff = total - prevCpuInfo.total;
    prevCpuInfo = { idle, total };
    if (totalDiff === 0) return 0;
    return Math.round((1 - idleDiff / totalDiff) * 100 * 10) / 10;
  }

  prevCpuInfo = { idle, total };
  return 0;
}

function getDiskUsage(): { usedGB: number; totalGB: number } {
  try {
    if (process.platform === "win32") {
      const output = execSync(
        "wmic logicaldisk get size,freespace /format:csv",
        { encoding: "utf-8", timeout: 5000 },
      );
      const lines = output.trim().split("\n").filter((l) => l.trim());
      let totalBytes = 0;
      let freeBytes = 0;
      for (const line of lines.slice(1)) {
        const parts = line.split(",");
        if (parts.length >= 3) {
          const free = parseInt(parts[1], 10);
          const size = parseInt(parts[2], 10);
          if (!isNaN(free) && !isNaN(size)) {
            freeBytes += free;
            totalBytes += size;
          }
        }
      }
      const totalGB = Math.round((totalBytes / 1e9) * 10) / 10;
      const usedGB = Math.round(((totalBytes - freeBytes) / 1e9) * 10) / 10;
      return { usedGB, totalGB };
    } else {
      const output = execSync("df -k / | tail -1", {
        encoding: "utf-8",
        timeout: 5000,
      });
      const parts = output.trim().split(/\s+/);
      const totalKB = parseInt(parts[1], 10);
      const usedKB = parseInt(parts[2], 10);
      return {
        usedGB: Math.round((usedKB / 1e6) * 10) / 10,
        totalGB: Math.round((totalKB / 1e6) * 10) / 10,
      };
    }
  } catch {
    return { usedGB: 0, totalGB: 0 };
  }
}

export function collectMetrics(): SystemMetrics {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const disk = getDiskUsage();

  return {
    cpuPercent: getCpuPercent(),
    memoryUsedMB: Math.round((totalMem - freeMem) / 1e6),
    memoryTotalMB: Math.round(totalMem / 1e6),
    diskUsedGB: disk.usedGB,
    diskTotalGB: disk.totalGB,
    timestamp: new Date().toISOString(),
  };
}
