<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import ApexCharts from 'apexcharts';

  type GraphHistoryRange = {
    min: number;
    max: number;
  };

  type GraphHistoryState = {
    filterBanned: boolean;
    targetBuckets: number;
    range?: GraphHistoryRange;
  };

  type PartialGraphHistoryState = Partial<GraphHistoryState>;

  function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function clampTargetBuckets(value: unknown): number {
    if (!isFiniteNumber(value)) return 20;
    return Math.min(200, Math.max(20, Math.round(value)));
  }

  function parseGraphHistoryState(raw: unknown): PartialGraphHistoryState | null {
    if (!raw || typeof raw !== 'object') return null;
    const candidate = raw as Record<string, unknown>;
    const parsed: PartialGraphHistoryState = {};

    if (typeof candidate.filterBanned === 'boolean') {
      parsed.filterBanned = candidate.filterBanned;
    }

    if (isFiniteNumber(candidate.targetBuckets)) {
      parsed.targetBuckets = clampTargetBuckets(candidate.targetBuckets);
    }

    if (candidate.range && typeof candidate.range === 'object') {
      const range = candidate.range as Record<string, unknown>;
      if (isFiniteNumber(range.min) && isFiniteNumber(range.max) && range.max > range.min) {
        parsed.range = { min: range.min, max: range.max };
      }
    }

    return Object.keys(parsed).length ? parsed : null;
  }

  function readGraphHistoryState(): PartialGraphHistoryState | null {
    if (typeof window === 'undefined') return null;
    const state = window.history.state;
    if (!state || typeof state !== 'object') return null;
    return parseGraphHistoryState((state as Record<string, unknown>).graphView);
  }

  function graphRangesEqual(a?: GraphHistoryRange, b?: GraphHistoryRange): boolean {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return a.min === b.min && a.max === b.max;
  }

  function graphStatesEqual(prev: PartialGraphHistoryState | null, next: GraphHistoryState): boolean {
    if (!prev) return false;
    const prevFilterBanned = typeof prev.filterBanned === 'boolean' ? prev.filterBanned : false;
    const prevTargetBuckets = clampTargetBuckets(prev.targetBuckets);
    return (
      prevFilterBanned === next.filterBanned &&
      prevTargetBuckets === next.targetBuckets &&
      graphRangesEqual(prev.range, next.range)
    );
  }

  const initialGraphHistoryState = readGraphHistoryState();

  let chartEl: HTMLDivElement;
  let chart: ApexCharts;
  let loading = $state(true);
  let filterBanned = $state(initialGraphHistoryState?.filterBanned ?? false);
  let zoomed = $state(false);
  let navigatingToPosts = $state(false);
  let debugRange = $state('');
  let targetBuckets = $state(clampTargetBuckets(initialGraphHistoryState?.targetBuckets));

  // Non-reactive — avoid Svelte proxy overhead on 251K items
  let sortedTimestamps: number[];
  let allTimestamps: number[];
  let filteredTimestamps: number[] | null = null;
  let filteredTimestampsPromise: Promise<number[]> | null = null;
  let currentRange: { min?: number; max?: number } = {};
  let currentViewRange: { min?: number; max?: number } = {};
  let currentIntervalMs = 0;
  const ZOOM_EPSILON_MS = 1;
  let lastAppliedFilterBanned: boolean | null = null;

  function persistGraphHistoryState() {
    if (typeof window === 'undefined' || window.location.pathname !== '/graph') return;

    const baseState = (window.history.state && typeof window.history.state === 'object')
      ? (window.history.state as Record<string, unknown>)
      : {};

    const nextGraphState: GraphHistoryState = {
      filterBanned,
      targetBuckets: clampTargetBuckets(targetBuckets),
    };

    if (
      currentRange.min != null &&
      currentRange.max != null &&
      hasNonZeroZoom(currentRange)
    ) {
      nextGraphState.range = { min: currentRange.min, max: currentRange.max };
    }

    const previousGraphState = parseGraphHistoryState(baseState.graphView);
    if (graphStatesEqual(previousGraphState, nextGraphState)) return;

    window.history.replaceState(
      { ...baseState, graphView: nextGraphState },
      '',
      window.location.href
    );
  }

  // Minimap
  const MINIMAP_BUCKETS = 100;
  let minimapCanvas = $state<HTMLCanvasElement>();
  let minimapData: number[] = [];
  let minimapDragging = false;
  let minimapPointerId: number | null = null;
  let minimapDragWindowSpan: number | null = null;
  let pendingMinimapClientX: number | null = null;
  let minimapPanFrame = 0;
  let minimapVisible = $state(true);
  let minimapFadeTimer: ReturnType<typeof setTimeout> | null = null;

  function resetMinimapFadeTimer() {
    minimapVisible = true;
    if (minimapFadeTimer) clearTimeout(minimapFadeTimer);
    minimapFadeTimer = setTimeout(() => { minimapVisible = false; }, 4000);
  }

  function lowerBound(arr: number[], target: number): number {
    let lo = 0, hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (arr[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  function upperBound(arr: number[], target: number): number {
    let lo = 0, hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (arr[mid] <= target) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  function hasNonZeroZoom(range: { min?: number; max?: number }): boolean {
    if (!sortedTimestamps?.length || range.min == null || range.max == null) return false;

    const fullMin = sortedTimestamps[0];
    const fullMax = sortedTimestamps[sortedTimestamps.length - 1];

    return (
      range.min > fullMin + ZOOM_EPSILON_MS ||
      range.max < fullMax - ZOOM_EPSILON_MS
    );
  }

  function formatTimestampForSearch(ts: number): string {
    return new Date(ts).toISOString();
  }

  function viewPostsInCurrentRange() {
    if (!hasNonZeroZoom(currentRange) || currentViewRange.min == null || currentViewRange.max == null) return;

    const after = formatTimestampForSearch(currentViewRange.min);
    const before = formatTimestampForSearch(currentViewRange.max);
    const searchQuery = `after:${after} before:${before}`;
    const params = new URLSearchParams({ search: searchQuery });

    persistGraphHistoryState();
    navigatingToPosts = true;
    const currentState = (window.history.state && typeof window.history.state === 'object')
      ? { ...(window.history.state as Record<string, unknown>) }
      : {};
    window.history.pushState(currentState, '', `/?${params.toString()}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }

  function bucketTimestamps(
    timestamps: number[],
    intervalMs: number,
    rangeStart?: number,
    rangeEnd?: number
  ): [number, number][] {
    const start = rangeStart ?? timestamps[0];
    const end = rangeEnd ?? timestamps[timestamps.length - 1];

    const lo = rangeStart != null ? lowerBound(timestamps, start) : 0;
    const hi = rangeEnd != null ? upperBound(timestamps, end) : timestamps.length;

    // Keep exactly the visible buckets. A trailing +1 creates an extra bucket at `end`
    // that usually has no events, which surfaces as a misleading right-edge zero.
    const bucketCount = Math.max(1, Math.ceil((end - start) / intervalMs));
    const counts = new Uint32Array(bucketCount);

    for (let i = lo; i < hi; i++) {
      // Clamp boundary values (for example ts === end) into the final bucket.
      const idx = Math.min(bucketCount - 1, Math.floor((timestamps[i] - start) / intervalMs));
      if (idx >= 0 && idx < bucketCount) counts[idx]++;
    }

    const result: [number, number][] = new Array(bucketCount);
    for (let i = 0; i < bucketCount; i++) {
      result[i] = [start + i * intervalMs, counts[i]];
    }
    return result;
  }

  function formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const years = Math.floor(days / 365);
    const remDays = days % 365;
    const remHours = hours % 24;
    const remMinutes = minutes % 60;

    const parts: string[] = [];
    if (years) parts.push(`${years}y`);
    if (remDays) parts.push(`${remDays}d`);
    if (remHours) parts.push(`${remHours}h`);
    if (remMinutes) parts.push(`${remMinutes}m`);
    return parts.join(' ') || '0m';
  }

  function intervalLabel(ms: number): string {
    return formatDuration(ms) + '/bucket';
  }

  function formatDate(ts: number): string {
    const d = new Date(ts);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const M = months[d.getUTCMonth()];
    const day = d.getUTCDate();
    const year = d.getUTCFullYear();
    const h = String(d.getUTCHours()).padStart(2, '0');
    const m = String(d.getUTCMinutes()).padStart(2, '0');

    const DAY = 86_400_000;
    if (currentIntervalMs >= 365 * DAY) return `${year}`;
    if (currentIntervalMs >= 28 * DAY) return `${M} ${year}`;
    if (currentIntervalMs >= DAY) return `${M} ${day}, ${year}`;
    return `${M} ${day}, ${year} ${h}:${m}`;
  }

  function tooltipXFormatter(val: number): string {
    return `${formatDate(val)} – ${formatDate(val + currentIntervalMs)}`;
  }

  type BuiltSeries = {
    data: [number, number][];
    min: number; // Actual data range used for bucketing
    max: number; // Actual data range used for bucketing
    viewMin: number; // Plotted x-axis bounds (bucket timestamps)
    viewMax: number; // Plotted x-axis bounds (bucket timestamps)
    viewEnd: number; // End timestamp for the plotted range (exclusive)
  };

  function buildSeries(rangeStart?: number, rangeEnd?: number): BuiltSeries {
    const requestedMin = rangeStart ?? sortedTimestamps[0];
    const requestedMax = rangeEnd ?? sortedTimestamps[sortedTimestamps.length - 1];

    const lo = lowerBound(sortedTimestamps, requestedMin);
    const hi = upperBound(sortedTimestamps, requestedMax);

    const min = hi > lo ? sortedTimestamps[lo] : requestedMin;
    const max = hi > lo ? sortedTimestamps[hi - 1] : requestedMax;
    const rangeMs = max - min;
    const interval = pickInterval(rangeMs);
    currentIntervalMs = interval;
    const data = bucketTimestamps(sortedTimestamps, interval, min, max);
    debugRange = `${formatDuration(rangeMs)} · ${intervalLabel(interval)} · ${data.length} pts`;
    const viewMin = data[0]?.[0] ?? min;
    const viewMax = data[data.length - 1]?.[0] ?? max;
    const viewEnd = viewMax + interval;
    currentViewRange = { min: viewMin, max: viewEnd };
    return { data, min, max, viewMin, viewMax, viewEnd };
  }

  function pickInterval(rangeMs: number): number {
    return Math.max(1, rangeMs / targetBuckets);
  }

  let resetting = false;
  let updating = false;

  function handleZoomed(_ctx: any, { xaxis }: { xaxis: { min: number; max: number } }) {
    if (resetting) {
      resetting = false;
      const fullMin = sortedTimestamps[0];
      const fullMax = sortedTimestamps[sortedTimestamps.length - 1];
      const fullInterval = pickInterval(fullMax - fullMin);
      const fullViewMax = fullMin + (targetBuckets - 1) * fullInterval;
      // Ignore only the zoom event that corresponds to a full reset.
      // If a stale reset flag leaks through, we still want real zooms to update.
      if (xaxis.min <= fullMin && xaxis.max >= fullViewMax) return;
    }
    if (updating) return;
    // xaxis.max corresponds to the last plotted bucket timestamp (bucket start),
    // so extend by one bucket width to include that bucket's full time window.
    const built = buildSeries(xaxis.min, xaxis.max + currentIntervalMs);
    currentRange = { min: built.min, max: built.max };
    zoomed = hasNonZeroZoom(currentRange);
    persistGraphHistoryState();
    updating = true;
    setTimeout(() => {
      chart.updateOptions({
        series: [{ name: 'Wall Posts', data: built.data }],
        xaxis: { min: built.viewMin, max: built.viewMax },
      }, false, false);
      updating = false;
      drawMinimap();
    }, 0);
  }

  function handleResetZoom(): void {
    resetting = true;
    currentRange = {};
    zoomed = false;
    persistGraphHistoryState();
    const built = buildSeries();
    setTimeout(() => {
      chart.updateOptions({
        series: [{ name: 'Wall Posts', data: built.data }],
        xaxis: { min: built.viewMin, max: built.viewMax },
      }, false, false);
      drawMinimap();
    }, 0);
  }

  function zoomBy(factor: number) {
    if (!chart) return;
    const min = currentRange.min ?? sortedTimestamps[0];
    const max = currentRange.max ?? sortedTimestamps[sortedTimestamps.length - 1];
    const mid = (min + max) / 2;
    const half = (max - min) / 2 * factor;
    const newMin = Math.max(sortedTimestamps[0], mid - half);
    const newMax = Math.min(sortedTimestamps[sortedTimestamps.length - 1], mid + half);
    if (newMin <= sortedTimestamps[0] && newMax >= sortedTimestamps[sortedTimestamps.length - 1]) {
      resetZoom();
      return;
    }
    resetMinimapFadeTimer();
    chart.zoomX(newMin, newMax);
  }

  function resetZoom() {
    if (!chart) return;
    resetting = true;
    currentRange = {};
    zoomed = false;
    persistGraphHistoryState();
    const built = buildSeries();
    chart.updateOptions({
      series: [{ name: 'Wall Posts', data: built.data }],
      xaxis: { min: built.viewMin, max: built.viewMax },
    }, false, false);
    drawMinimap();
  }

  async function loadFiltered(): Promise<number[]> {
    if (filteredTimestamps) return filteredTimestamps;
    if (!filteredTimestampsPromise) {
      filteredTimestampsPromise = fetch('/data/rawTimestampsFiltered.json')
        .then((res) => res.json())
        .then((raw: number[]) => {
          filteredTimestamps = raw.sort((a, b) => a - b);
          return filteredTimestamps;
        })
        .catch((err) => {
          filteredTimestampsPromise = null;
          throw err;
        });
    }
    return filteredTimestampsPromise;
  }

  function preloadFiltered() {
    const doPreload = () => {
      void loadFiltered().catch(() => {
        // If preloading fails, we'll retry on the next toggle.
        console.warn('Failed to preload filtered timestamps')
      });
    };

    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: () => void) => number;
    };

    if (idleWindow.requestIdleCallback) {
      idleWindow.requestIdleCallback(doPreload);
    } else {
      setTimeout(doPreload, 0);
    }
  }

  async function swapDataset(useBanned: boolean) {
    if (useBanned) {
      sortedTimestamps = await loadFiltered();
    } else {
      sortedTimestamps = allTimestamps;
    }
    const built = buildSeries(currentRange.min, currentRange.max);
    currentRange = { min: built.min, max: built.max };
    zoomed = hasNonZeroZoom(currentRange);
    const opts: any = {
      series: [{ name: 'Wall Posts', data: built.data }],
      xaxis: { min: built.viewMin, max: built.viewMax },
    };
    chart.updateOptions(opts, false, false);
    computeMinimapData();
    drawMinimap();
    persistGraphHistoryState();
  }

  function refreshSeriesForResolution() {
    if (!chart || !sortedTimestamps) return;
    const built = buildSeries(currentRange.min, currentRange.max);
    if (currentRange.min != null && currentRange.max != null) {
      currentRange = { min: built.min, max: built.max };
    }
    chart.updateOptions({
      series: [{ name: 'Wall Posts', data: built.data }],
      xaxis: { min: built.viewMin, max: built.viewMax },
    }, false, false);
    drawMinimap();
    persistGraphHistoryState();
  }

  function restoreRangeFromHistory(range?: GraphHistoryRange) {
    if (!chart || !sortedTimestamps || !range) return;
    const built = buildSeries(range.min, range.max);
    currentRange = { min: built.min, max: built.max };
    zoomed = hasNonZeroZoom(currentRange);
    chart.updateOptions({
      series: [{ name: 'Wall Posts', data: built.data }],
      xaxis: { min: built.viewMin, max: built.viewMax },
    }, false, false);
    drawMinimap();
    persistGraphHistoryState();
  }

  function computeMinimapData() {
    const fullRange = sortedTimestamps[sortedTimestamps.length - 1] - sortedTimestamps[0];
    const interval = fullRange / MINIMAP_BUCKETS;
    const buckets = bucketTimestamps(sortedTimestamps, interval);
    minimapData = buckets.map(b => b[1]);
  }

  function drawMinimap() {
    if (!minimapCanvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = minimapCanvas.clientWidth;
    const h = minimapCanvas.clientHeight;
    minimapCanvas.width = w * dpr;
    minimapCanvas.height = h * dpr;
    const ctx = minimapCanvas.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    if (minimapData.length === 0) return;

    // Draw sparkline
    const max = Math.max(...minimapData);
    if (max === 0) return;
    const step = w / (minimapData.length - 1);

    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let i = 0; i < minimapData.length; i++) {
      ctx.lineTo(i * step, h - (minimapData[i] / max) * h * 0.9);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = 'rgba(108, 149, 255, 0.3)';
    ctx.fill();

    ctx.beginPath();
    for (let i = 0; i < minimapData.length; i++) {
      const x = i * step;
      const y = h - (minimapData[i] / max) * h * 0.9;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = 'rgba(108, 149, 255, 0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Draw zoom indicator
    if (currentRange.min != null && currentRange.max != null) {
      const fullMin = sortedTimestamps[0];
      const fullMax = sortedTimestamps[sortedTimestamps.length - 1];
      const fullRange = fullMax - fullMin;
      const x1 = ((currentRange.min - fullMin) / fullRange) * w;
      const x2 = ((currentRange.max - fullMin) / fullRange) * w;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.fillRect(x1, 0, x2 - x1, h);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x1, 0, x2 - x1, h);
    }
  }

  function panZoomWindowAtClientX(clientX: number) {
    if (!chart || !minimapCanvas) return;
    if (currentRange.min == null || currentRange.max == null) return;

    const fullMin = sortedTimestamps[0];
    const fullMax = sortedTimestamps[sortedTimestamps.length - 1];
    const fullRange = fullMax - fullMin;
    if (fullRange <= 0) return;

    const windowSpan = minimapDragWindowSpan ?? (currentRange.max - currentRange.min);
    if (windowSpan <= 0 || windowSpan >= fullRange) return;

    const rect = minimapCanvas.getBoundingClientRect();
    if (rect.width <= 0) return;

    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const ratio = x / rect.width;
    const center = fullMin + ratio * fullRange;

    let newMin = center - windowSpan / 2;
    let newMax = center + windowSpan / 2;

    if (newMin < fullMin) {
      newMin = fullMin;
      newMax = fullMin + windowSpan;
    } else if (newMax > fullMax) {
      newMax = fullMax;
      newMin = fullMax - windowSpan;
    }

    chart.zoomX(newMin, newMax);
  }

  function scheduleMinimapPan(clientX: number) {
    pendingMinimapClientX = clientX;
    if (minimapPanFrame) return;
    minimapPanFrame = requestAnimationFrame(() => {
      minimapPanFrame = 0;
      if (pendingMinimapClientX == null) return;
      panZoomWindowAtClientX(pendingMinimapClientX);
      pendingMinimapClientX = null;
    });
  }

  function stopMinimapDrag() {
    minimapDragging = false;
    minimapPointerId = null;
    minimapDragWindowSpan = null;
  }

  function handleMinimapPointerDown(event: PointerEvent) {
    if (!minimapCanvas || event.button !== 0) return;
    if (currentRange.min == null || currentRange.max == null) return;

    resetMinimapFadeTimer();
    minimapDragWindowSpan = currentRange.max - currentRange.min;
    minimapDragging = true;
    minimapPointerId = event.pointerId;
    minimapCanvas.setPointerCapture(event.pointerId);
    scheduleMinimapPan(event.clientX);
    event.preventDefault();
  }

  function handleMinimapPointerMove(event: PointerEvent) {
    if (!minimapDragging) return;
    if (minimapPointerId !== event.pointerId) return;
    resetMinimapFadeTimer();
    scheduleMinimapPan(event.clientX);
    event.preventDefault();
  }

  function handleMinimapPointerUp(event: PointerEvent) {
    if (!minimapDragging) return;
    if (minimapPointerId !== event.pointerId) return;
    minimapCanvas?.releasePointerCapture(event.pointerId);
    stopMinimapDrag();
  }

  function handleMinimapPointerCancel(event: PointerEvent) {
    if (minimapPointerId === event.pointerId) {
      stopMinimapDrag();
    }
  }

  onMount(async () => {
    const res = await fetch('/data/rawTimestamps.json');
    const raw: number[] = await res.json();
    allTimestamps = raw.sort((a, b) => a - b);
    sortedTimestamps = allTimestamps;

    const initialData = buildSeries();
    loading = false;
    await tick();

    const options: ApexCharts.ApexOptions = {
      chart: {
        type: 'area',
        height: '100%',
        background: 'transparent',
        foreColor: 'rgba(255, 255, 255, 0.87)',
        fontFamily: 'system-ui, Avenir, Helvetica, Arial, sans-serif',
        animations: { enabled: false },
        toolbar: { show: false },
        zoom: { enabled: window.innerWidth > 900, type: 'x', autoScaleYaxis: true },
        events: {
          zoomed: handleZoomed,
          beforeResetZoom: handleResetZoom,
        },
      },
      series: [{ name: 'Wall Posts', data: initialData.data }],
      xaxis: {
        type: 'datetime',
        min: initialData.viewMin,
        max: initialData.viewMax,
        tooltip: { enabled: false },
        labels: { style: { colors: 'rgba(255, 255, 255, 0.6)' } },
      },
      yaxis: {
        title: { text: 'Wall Posts' },
        labels: { style: { colors: 'rgba(255, 255, 255, 0.6)' } },
      },
      dataLabels: { enabled: false },
      stroke: { curve: 'smooth', width: 2 },
      colors: ['rgb(108, 149, 255)'],
      fill: {
        type: 'gradient',
        gradient: {
          shadeIntensity: 1,
          opacityFrom: 0.45,
          opacityTo: 0.05,
          stops: [0, 100],
        },
      },
      grid: {
        borderColor: '#2d2d2d',
        strokeDashArray: 3,
      },
      tooltip: {
        theme: 'dark',
        x: { formatter: tooltipXFormatter },
      },
      theme: { mode: 'dark' },
    };

    chart = new ApexCharts(chartEl, options);
    await chart.render();

    if (filterBanned) {
      await swapDataset(true);
    } else {
      computeMinimapData();
      drawMinimap();
      persistGraphHistoryState();
    }

    restoreRangeFromHistory(initialGraphHistoryState?.range);
    lastAppliedFilterBanned = filterBanned;
    preloadFiltered();
  });

  $effect(() => {
    const banned = filterBanned;
    if (!chart || !allTimestamps || lastAppliedFilterBanned === null) return;
    if (banned === lastAppliedFilterBanned) return;
    lastAppliedFilterBanned = banned;
    void swapDataset(banned);
  });

  let resolutionInitialized = false;
  $effect(() => {
    const _targetBuckets = targetBuckets;
    if (!chart || !sortedTimestamps) return;
    if (!resolutionInitialized) {
      resolutionInitialized = true;
      return;
    }
    refreshSeriesForResolution();
  });

  $effect(() => {
    if (zoomed) {
      resetMinimapFadeTimer();
    } else {
      if (minimapFadeTimer) { clearTimeout(minimapFadeTimer); minimapFadeTimer = null; }
      minimapVisible = true;
    }
  });

  onDestroy(() => {
    if (minimapPanFrame) cancelAnimationFrame(minimapPanFrame);
    if (minimapFadeTimer) clearTimeout(minimapFadeTimer);
    chart?.destroy();
  });
</script>

<div class="chart-wrapper">
  {#if loading}
    <div class="chart-loading">
      <div class="spinner"></div>
      <p>Processing timestamps...</p>
    </div>
  {/if}
  {#if !loading}
    <div class="chart-controls">
      <div class="chart-btns">
        <div class="zoom-btns">
          <button class="chart-btn" onclick={() => zoomBy(2)} aria-label="Zoom out">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
          <button class="chart-btn" onclick={() => zoomBy(0.5)} aria-label="Zoom in">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
          <button class="chart-btn" onclick={resetZoom} aria-label="Reset zoom">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter"><path d="M3 12a9 9 0 1 1 3 6.7"/><polyline points="3 22 3 16 9 16"/></svg>
          </button>
        </div>
        <button
          class="view-posts-btn"
          class:is-hidden={!zoomed}
          onclick={viewPostsInCurrentRange}
          disabled={!zoomed || navigatingToPosts}
          aria-hidden={!zoomed}
        >
          {#if navigatingToPosts}
            <span class="view-posts-btn__spinner" aria-hidden="true"></span>
            Loading posts...
          {:else}
            View these posts
          {/if}
        </button>
      </div>
      <label class="resolution-control" for="resolution-slider">
        <span>Resolution: {targetBuckets}</span>
        <input
          id="resolution-slider"
          type="range"
          min="20"
          max="200"
          step="1"
          bind:value={targetBuckets}
          style="--fill: {((targetBuckets - 20) / (200 - 20)) * 100}%"
        />
      </label>
      <label class="filter-toggle">
        <input type="checkbox" bind:checked={filterBanned} />
        <span>Exclude banned accounts</span>
      </label>
    </div>
  {/if}
  <div class="chart-area" class:hidden={loading}>
    <div bind:this={chartEl} class="chart-container"></div>
    {#if zoomed}
      <canvas
        bind:this={minimapCanvas}
        class="minimap"
        class:faded={!minimapVisible}
        onpointerdown={handleMinimapPointerDown}
        onpointermove={handleMinimapPointerMove}
        onpointerup={handleMinimapPointerUp}
        onpointercancel={handleMinimapPointerCancel}
      ></canvas>
    {/if}
  </div>
</div>

<style lang="scss">
  .chart-wrapper {
    max-height: 90vh;
    width: 100%;
    max-width: 95vw;
    margin: 2rem auto;

    @media (min-width: 1500px) {
        margin-top: 78px;
    }
  }

  .chart-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 400px;
    gap: 1rem;

    p {
      color: rgba(255, 255, 255, 0.6);
      font-size: 0.9rem;
    }
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid #2d2d2d;
    border-top-color: rgb(108, 149, 255);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .chart-controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.5rem;
    padding: 0 15px 0 25px;
  }

  .filter-toggle {
    order: 1;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    color: rgba(255, 255, 255, 0.6);
    font-size: 0.85rem;
    user-select: none;

    input {
      accent-color: rgb(108, 149, 255);
      cursor: pointer;
    }
  }

  .resolution-control {
    order: 2;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: rgba(255, 255, 255, 0.6);
    font-size: 0.85rem;
    user-select: none;

    input {
      width: 180px;
      accent-color: rgb(108, 149, 255);
      cursor: pointer;

      @media (max-width: 900px) {
        width: 120px;
      }
    }
  }

  .chart-btns {
    order: 3;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 0.75rem;
  }

  .zoom-btns {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    order: 2;
  }

  .chart-btn {
    width: 44px;
    height: 44px;
    border: none;
    border-radius: 50%;
    background: #fff;
    color: #000;
    font-size: 1.4rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;

    @media (min-width: 901px) {
      width: 32px;
      height: 32px;
      font-size: 1rem;
      border-radius: 50%;
    }
  }

  .view-posts-btn {
    order: 1;
    border: none;
    border-radius: 9999px;
    background: rgb(108, 149, 255);
    color: #fff;
    padding: 0.45rem 0.85rem;
    min-width: 136px;
    white-space: nowrap;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: background-color 0.2s ease;

    &:hover {
      background: rgb(92, 131, 230);
    }

    &.is-hidden {
      visibility: hidden;
      pointer-events: none;
    }
  }

  .view-posts-btn__spinner {
    width: 12px;
    height: 12px;
    border: 2px solid rgba(255, 255, 255, 0.5);
    border-top-color: #fff;
    border-radius: 50%;
    display: inline-block;
    margin-right: 0.45rem;
    vertical-align: text-bottom;
    animation: spin 0.7s linear infinite;
  }

  .chart-area {
    position: relative;
    width: 100%;
    max-height: 90vh;
    aspect-ratio: 3 / 2;

    &.hidden {
      visibility: hidden;
      height: 0;
      min-height: 0;
      overflow: hidden;
    }
  }

  @media (max-width: 900px) {
    .chart-wrapper {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .chart-area {
      order: 1;
    }

    .chart-controls {
      order: 2;
      display: grid;
      grid-template-columns: 1fr;
      grid-template-rows: auto auto auto;
      gap: 0.75rem;
      padding: 0 0.5rem;
      margin-bottom: 0;
    }

    .filter-toggle {
      order: 3;
      justify-self: start;
      font-size: 0.95rem;
      padding: 0.45rem 0.75rem;
      border-radius: 9999px;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.15);

      &:has(input:checked) {
        background: rgba(108, 149, 255, 0.25);
        border-color: rgba(108, 149, 255, 0.6);
        color: rgb(180, 200, 255);
      }

      input {
        width: 1.1rem;
        height: 1.1rem;
      }
    }

    .resolution-control {
      order: 2;
      width: 100%;
      display: grid;
      grid-template-columns: 1fr;
      gap: 0.35rem;
      justify-items: start;

      input {
        width: 100%;
        max-width: none;
        -webkit-appearance: none;
        appearance: none;
        height: 6px;
        margin-block: 0.5rem;
        border-radius: 9999px;
        background: linear-gradient(
          to right,
          rgb(108, 149, 255) var(--fill),
          rgba(255, 255, 255, 0.15) var(--fill)
        );
        outline: none;

        &::-webkit-slider-runnable-track {
          height: 6px;
          border-radius: 9999px;
        }

        &::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: rgb(108, 149, 255);
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
          cursor: pointer;
          margin-top: -8px;
        }

        &::-moz-range-track {
          height: 6px;
          border-radius: 9999px;
          background: transparent;
        }

        &::-moz-range-thumb {
          width: 22px;
          height: 22px;
          border: none;
          border-radius: 50%;
          background: rgb(108, 149, 255);
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
          cursor: pointer;
        }
      }
    }

    .chart-btns {
      order: 1;
      width: 100%;
      gap: 0.5rem;
    }

    .zoom-btns {
      order: 2;
      justify-content: flex-end;
      flex-shrink: 0;
      margin-left: auto;
    }

    .view-posts-btn {
      order: 1;
      margin-left: 0;
    }
  }

  .chart-container {
    position: absolute;
    inset: 0;
  }

  .minimap {
    position: absolute;
    top: 12px;
    right: 12px;
    width: 160px;
    height: 40px;
    background: rgba(0, 0, 0, 0.4);
    pointer-events: auto;
    touch-action: none;
    cursor: grab;
    opacity: 1;
    transition: opacity 0.6s ease;

    &.faded {
      opacity: 0;
    }

    @media (max-width: 900px) {
      width: 180px;
      height: 50px;
    }
  }
</style>
