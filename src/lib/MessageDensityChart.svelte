<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import ApexCharts from 'apexcharts';


  let chartEl: HTMLDivElement;
  let chart: ApexCharts;
  let loading = $state(true);
  let filterBanned = $state(false);
  let zoomed = $state(false);
  let debugRange = $state('');

  // Non-reactive — avoid Svelte proxy overhead on 251K items
  let sortedTimestamps: number[];
  let allTimestamps: number[];
  let filteredTimestamps: number[] | null = null;
  let currentRange: { min?: number; max?: number } = {};
  let currentIntervalMs = 0;

  // Minimap
  const MINIMAP_BUCKETS = 100;
  let minimapCanvas = $state<HTMLCanvasElement>();
  let minimapData: number[] = [];

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

    const bucketCount = Math.ceil((end - start) / intervalMs) + 1;
    const counts = new Uint32Array(bucketCount);

    for (let i = lo; i < hi; i++) {
      const idx = Math.floor((timestamps[i] - start) / intervalMs);
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

  function buildSeries(rangeStart?: number, rangeEnd?: number): [number, number][] {
    const rangeMs = (rangeEnd ?? sortedTimestamps[sortedTimestamps.length - 1])
                  - (rangeStart ?? sortedTimestamps[0]);
    const interval = pickInterval(rangeMs);
    currentIntervalMs = interval;
    const data = bucketTimestamps(sortedTimestamps, interval, rangeStart, rangeEnd);
    debugRange = `${formatDuration(rangeMs)} · ${intervalLabel(interval)} · ${data.length} pts`;
    return data;
  }

  const TARGET_BUCKETS = 10;

  function pickInterval(rangeMs: number): number {
    return rangeMs / TARGET_BUCKETS;
  }

  let resetting = false;
  let updating = false;

  function handleZoomed(_ctx: any, { xaxis }: { xaxis: { min: number; max: number } }) {
    if (resetting) {
      resetting = false;
      return;
    }
    if (updating) return;
    currentRange = { min: xaxis.min, max: xaxis.max };
    zoomed = true;
    const data = buildSeries(xaxis.min, xaxis.max);
    updating = true;
    setTimeout(() => {
      chart.updateOptions({ series: [{ name: 'Wall Posts', data }], xaxis: { min: xaxis.min, max: xaxis.max } }, false, false);
      updating = false;
      drawMinimap();
    }, 0);
  }

  function handleResetZoom() {
    resetting = true;
    currentRange = {};
    zoomed = false;
    const data = buildSeries();
    setTimeout(() => {
      chart.updateOptions({ series: [{ name: 'Wall Posts', data }] }, false, false);
      drawMinimap();
    }, 0);
    return {
      xaxis: {
        min: sortedTimestamps[0],
        max: sortedTimestamps[sortedTimestamps.length - 1],
      },
    };
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
    chart.zoomX(newMin, newMax);
  }

  function resetZoom() {
    if (!chart) return;
    resetting = true;
    currentRange = {};
    zoomed = false;
    const data = buildSeries();
    const min = sortedTimestamps[0];
    const max = sortedTimestamps[sortedTimestamps.length - 1];
    chart.updateOptions({ series: [{ name: 'Wall Posts', data }], xaxis: { min, max } }, false, false);
    drawMinimap();
  }

  async function loadFiltered(): Promise<number[]> {
    if (filteredTimestamps) return filteredTimestamps;
    const res = await fetch('/data/rawTimestampsFiltered.json');
    const raw: number[] = await res.json();
    filteredTimestamps = raw.sort((a, b) => a - b);
    return filteredTimestamps;
  }

  async function swapDataset(useBanned: boolean) {
    if (useBanned) {
      sortedTimestamps = await loadFiltered();
    } else {
      sortedTimestamps = allTimestamps;
    }
    const data = buildSeries(currentRange.min, currentRange.max);
    const opts: any = { series: [{ name: 'Wall Posts', data }] };
    if (currentRange.min != null && currentRange.max != null) {
      opts.xaxis = { min: currentRange.min, max: currentRange.max };
    }
    chart.updateOptions(opts, false, false);
    computeMinimapData();
    drawMinimap();
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
        zoom: { enabled: true, type: 'x', autoScaleYaxis: true },
        events: {
          zoomed: handleZoomed,
          beforeResetZoom: handleResetZoom,
        },
      },
      series: [{ name: 'Wall Posts', data: initialData }],
      xaxis: {
        type: 'datetime',
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
    chart.render();
    computeMinimapData();
  });

  let initialized = false;
  $effect(() => {
    const banned = filterBanned;
    if (!chart || !allTimestamps) return;
    if (!initialized) {
      initialized = true;
      return;
    }
    swapDataset(banned);
  });

  onDestroy(() => {
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
      <label class="filter-toggle">
        <input type="checkbox" bind:checked={filterBanned} />
        <span>Filter banned accounts</span>
      </label>
      <div class="chart-btns">
        <button class="chart-btn" onclick={() => zoomBy(0.5)} aria-label="Zoom in">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </button>
      <button class="chart-btn" onclick={() => zoomBy(2)} aria-label="Zoom out">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </button>
      <button class="chart-btn" onclick={resetZoom} aria-label="Reset zoom">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter"><path d="M3 12a9 9 0 1 1 3 6.7"/><polyline points="3 22 3 16 9 16"/></svg>
      </button>
      </div>
    </div>
  {/if}
  <div class="chart-area" class:hidden={loading}>
    <div bind:this={chartEl} class="chart-container"></div>
    {#if zoomed}
      <canvas bind:this={minimapCanvas} class="minimap"></canvas>
    {/if}
  </div>
</div>

<style lang="scss">
  .chart-wrapper {
    max-height: 90vh;
    width: 95vw;
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
    padding: 0 25px;
  }

  .filter-toggle {
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

  .chart-btns {
    display: flex;
    gap: 0.5rem;
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

    @media (min-width: 768px) {
      width: 32px;
      height: 32px;
      font-size: 1rem;
      border-radius: 50%;
    }
  }

  .chart-area {
    position: relative;
    width: 100%;
    aspect-ratio: 3 / 2;

    &.hidden {
      visibility: hidden;
      height: 0;
      min-height: 0;
      overflow: hidden;
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
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.4);
    pointer-events: none;

    @media (max-width: 768px) {
      width: 100px;
      height: 28px;
    }
  }
</style>
