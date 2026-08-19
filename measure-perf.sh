#!/usr/bin/env bash
#
# measure-perf.sh — tg_mac_electron (NextCalc) background footprint/CPU sampler
# task#100437 — reproducible before/after measurement for the O1/O2/O5/O6 perf batch.
#
# Replicates the method used in agent-hub/tasks/analysis-100435-memory-raw.txt:
#   - phys footprint via /usr/bin/footprint <pid>
#   - RSS + lifetime-avg %CPU via ps -o rss,%cpu
#   - instantaneous %CPU via top -l 2 (2nd sample is the real instantaneous reading)
#   - process type classified from argv (--type=gpu-process / utility / renderer)
#
# It samples every process in the NextCalc process tree at N time points INTERVAL
# seconds apart, all within a SINGLE app run. Per the analysis, the before/after
# comparison MUST be taken in the same "locked + background >=5min" state, so:
#   1. Launch NextCalc, unlock, then leave it idle & switched to another app so it
#      auto-locks (default idle 60s) and stays backgrounded.
#   2. Run this script pointed at the main NextCalc pid; keep the app backgrounded
#      for the whole sampling window.
#
# Usage:
#   ./measure-perf.sh <main-pid> [--points N] [--interval S] [--out FILE]
#   ./measure-perf.sh --auto     [--points N] [--interval S] [--out FILE]
#
#   <main-pid>   PID of the root NextCalc process (Contents/MacOS/NextCalc).
#   --auto       Auto-detect the main pid (root NextCalc process, no --type= arg).
#   --points N   Number of samples (default 6 -> spans 5 min at 60s interval).
#   --interval S Seconds between samples (default 60).
#   --out FILE   Also tee output to FILE (default: stdout only).
#
# Output: one line per process per sample:
#   PID  TYPE  RSS_MB  CPU%(inst)  CPU%(avg)  FOOTPRINT_MB
# plus a per-sample footprint total, and RSS total.

set -uo pipefail

POINTS=6
INTERVAL=60
OUT=""
ROOT_PID=""
AUTO=0

# ---- arg parse ----
while [ $# -gt 0 ]; do
  case "$1" in
    --points)   POINTS="$2"; shift 2 ;;
    --interval) INTERVAL="$2"; shift 2 ;;
    --out)      OUT="$2"; shift 2 ;;
    --auto)     AUTO=1; shift ;;
    -h|--help)  grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)          ROOT_PID="$1"; shift ;;
  esac
done

log() {
  if [ -n "$OUT" ]; then printf '%s\n' "$1" | tee -a "$OUT"; else printf '%s\n' "$1"; fi
}

# ---- resolve root pid ----
if [ "$AUTO" -eq 1 ] && [ -z "$ROOT_PID" ]; then
  # Root NextCalc process = has NextCalc.app/Contents/MacOS/NextCalc and NO --type= arg
  ROOT_PID="$(ps -Awwo pid=,command= \
    | grep -F 'NextCalc.app/Contents/MacOS/NextCalc' \
    | grep -v -- '--type=' \
    | grep -v 'measure-perf' \
    | awk '{print $1}' | head -1)"
fi

if [ -z "$ROOT_PID" ]; then
  echo "ERROR: no pid. Pass the main NextCalc pid, or use --auto while the app runs." >&2
  exit 2
fi

if ! ps -p "$ROOT_PID" >/dev/null 2>&1; then
  echo "ERROR: pid $ROOT_PID is not running." >&2
  exit 2
fi

# ---- collect the process tree (root + all descendants) ----
collect_tree() {
  local root="$1"; local pids="$root"; local frontier="$root" next child
  while [ -n "$frontier" ]; do
    next=""
    for p in $frontier; do
      for child in $(pgrep -P "$p" 2>/dev/null); do
        pids="$pids $child"; next="$next $child"
      done
    done
    frontier="$next"
  done
  echo "$pids"
}

# ---- classify a pid by its argv ----
classify() {
  local pid="$1" cmd
  cmd="$(ps -o command= -p "$pid" 2>/dev/null)"
  case "$cmd" in
    *--type=gpu-process*)                     echo "gpu" ;;
    *network.mojom.NetworkService*)           echo "net" ;;
    *--type=utility*)                         echo "utility" ;;
    *--first-renderer-process*|*--renderer-client-id=4*)
                                              echo "rend(calc-ui?)" ;;
    *--type=renderer*)                        echo "rend(tg?)" ;;
    *NextCalc.app/Contents/MacOS/NextCalc*)   echo "main" ;;
    *)                                        echo "other" ;;
  esac
}

# ---- footprint MB for a pid (via /usr/bin/footprint) ----
footprint_mb() {
  local pid="$1" line num unit
  line="$(/usr/bin/footprint "$pid" 2>/dev/null | grep -m1 'Footprint:')"
  # e.g. "NextCalc Helper (GPU) [63844]: 64-bit    Footprint: 732 MB (...)"
  #  or  "zsh [3443]: 64-bit    Footprint: 2304 KB (...)"
  num="$(echo "$line" | sed -En 's/.*Footprint: ([0-9]+) (KB|MB|GB).*/\1/p')"
  unit="$(echo "$line" | sed -En 's/.*Footprint: [0-9]+ (KB|MB|GB).*/\1/p')"
  [ -z "$num" ] && { echo 0; return; }
  case "$unit" in
    KB) echo $(( num / 1024 )) ;;
    GB) echo $(( num * 1024 )) ;;
    *)  echo "$num" ;;
  esac
}

# ---- instantaneous CPU% via top -l 2 (take 2nd sample), for all pids at once ----
# macOS ships bash 3.2, which has NO associative arrays (`declare -A`). Using one
# there fails silently and leaves CPU%_inst stuck at 0 (fake data). Stash the
# "pid cpu" rows in a temp file instead, and look each pid up with awk.
INST_CPU_FILE="$(mktemp -t measure-perf-cpu.XXXXXX)"
trap 'rm -f "$INST_CPU_FILE"' EXIT
sample_inst_cpu() {
  local pids="$1" args="" p
  for p in $pids; do args="$args -pid $p"; done
  # -l 2: first sample is a bogus cumulative reading; second is instantaneous.
  # Parse only lines after the 2nd "PID" header.
  local out; out="$(top -l 2 -stats pid,cpu $args 2>/dev/null)"
  # top -l 2 emits two blocks each headed by a "PID  CPU" line; the 2nd block holds
  # the real instantaneous readings. Count headers, keep numeric rows from block 2
  # on, and write one normalised "pid cpu" line per process to INST_CPU_FILE.
  echo "$out" | awk 'c>=2 && /^[0-9]/{print $1, $2} /^PID/{c++}' > "$INST_CPU_FILE"
}

# ---- look up a pid's instantaneous CPU% from the last sample_inst_cpu run ----
inst_cpu_for() {
  local pid="$1" val
  val="$(awk -v p="$pid" '$1==p{print $2; exit}' "$INST_CPU_FILE" 2>/dev/null)"
  [ -z "$val" ] && val="?"
  printf '%s' "$val"
}

PIDS="$(collect_tree "$ROOT_PID" | tr ' ' '\n' | sort -un | tr '\n' ' ')"

log "===================================================================="
log "measure-perf.sh — NextCalc perf sampler (task#100437)"
log "started : $(TZ=Asia/Taipei date '+%Y-%m-%d %H:%M:%S %Z')"
log "host    : $(hostname)  |  $(uname -sm)"
log "root pid: $ROOT_PID"
log "tree    : $PIDS"
log "plan    : $POINTS samples, ${INTERVAL}s apart (span $(( (POINTS-1)*INTERVAL ))s)"
log "NOTE    : keep NextCalc LOCKED + BACKGROUNDED for the whole window."
log "===================================================================="

for i in $(seq 1 "$POINTS"); do
  ts="$(TZ=Asia/Taipei date '+%Y-%m-%d %H:%M:%S')"
  # refresh tree in case renderers were (re)spawned
  PIDS="$(collect_tree "$ROOT_PID" | tr ' ' '\n' | sort -un | tr '\n' ' ')"
  sample_inst_cpu "$PIDS"

  log ""
  log "########## SAMPLE $i / $POINTS @ $ts ##########"
  log "$(printf '%-7s %-16s %8s %10s %10s %12s' PID TYPE RSS_MB 'CPU%_inst' 'CPU%_avg' FOOTPRINT_MB)"

  fp_total=0; rss_total_kb=0
  for pid in $PIDS; do
    ps -p "$pid" >/dev/null 2>&1 || continue
    type="$(classify "$pid")"
    read -r rss_kb cpu_avg < <(ps -o rss=,%cpu= -p "$pid" 2>/dev/null)
    [ -z "${rss_kb:-}" ] && continue
    rss_mb=$(( rss_kb / 1024 ))
    fp="$(footprint_mb "$pid")"; [ -z "$fp" ] && fp=0
    cpu_inst="$(inst_cpu_for "$pid")"
    fp_total=$(( fp_total + fp ))
    rss_total_kb=$(( rss_total_kb + rss_kb ))
    log "$(printf '%-7s %-16s %8s %10s %10s %12s' "$pid" "$type" "$rss_mb" "$cpu_inst" "$cpu_avg" "$fp")"
  done

  log "$(printf -- '-- totals: footprint=%s MB  rss=%s MB' "$fp_total" "$(( rss_total_kb / 1024 ))")"

  if [ "$i" -lt "$POINTS" ]; then sleep "$INTERVAL"; fi
done

log ""
log "done: $(TZ=Asia/Taipei date '+%Y-%m-%d %H:%M:%S %Z')"
