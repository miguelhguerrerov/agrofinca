// ============================================
// AgroFinca - Canvas Charts (No Dependencies)
// Lightweight charts using native Canvas API
// ============================================

const Charts = (() => {
  const COLORS = [
    '#2E7D32', '#FFA000', '#795548', '#2196F3', '#F44336',
    '#9C27B0', '#FF5722', '#607D8B', '#4CAF50', '#FF9800'
  ];

  function getColor(index) {
    return COLORS[index % COLORS.length];
  }

  // Create canvas element
  function createCanvas(container, width, height) {
    if (typeof container === 'string') {
      container = document.getElementById(container);
    }
    if (!container) return null;
    container.innerHTML = '';
    const canvas = document.createElement('canvas');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    container.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    return { canvas, ctx, width, height };
  }

  // ---- BAR CHART (vertical + horizontal + stacked) ----
  function barChart(containerId, data, options = {}) {
    const {
      title = '',
      height = 250,
      showValues = true,
      horizontal = false,
      stacked = false
    } = options;

    const container = document.getElementById(containerId);
    if (!container) return;
    const cWidth = container.clientWidth || 320;

    if (horizontal) {
      return horizontalBarChart(container, data, { title, height: Math.max(height, data.labels.length * 32 + 60), showValues, cWidth });
    }

    const { ctx, width } = createCanvas(container, cWidth, height);
    if (!ctx) return;

    const padding = { top: title ? 40 : 20, right: 15, bottom: 50, left: 55 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    // Title
    if (title) {
      ctx.fillStyle = '#212121';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(title, width / 2, 18);
    }

    if (!data.labels || data.labels.length === 0) {
      ctx.fillStyle = '#9E9E9E';
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Sin datos disponibles', width / 2, height / 2);
      return;
    }

    const datasets = Array.isArray(data.datasets) ? data.datasets : [{ values: data.values || [], color: COLORS[0] }];

    // Calculate max value
    let maxVal = 0;
    if (stacked) {
      for (let i = 0; i < data.labels.length; i++) {
        let sum = 0;
        datasets.forEach(ds => { sum += (ds.values[i] || 0); });
        maxVal = Math.max(maxVal, sum);
      }
    } else {
      datasets.forEach(ds => {
        ds.values.forEach(v => { maxVal = Math.max(maxVal, Math.abs(v) || 0); });
      });
    }
    maxVal = maxVal || 1;

    // Check for negative values
    let minVal = 0;
    datasets.forEach(ds => {
      ds.values.forEach(v => { minVal = Math.min(minVal, v || 0); });
    });

    const range = (maxVal * 1.1) - (minVal < 0 ? minVal * 1.1 : 0);
    const yScale = chartH / range;
    const zeroY = padding.top + (maxVal * 1.1 * yScale);

    // Y axis grid
    ctx.strokeStyle = '#E0E0E0';
    ctx.lineWidth = 0.5;
    const ySteps = 5;
    for (let i = 0; i <= ySteps; i++) {
      const y = padding.top + chartH - (chartH / ySteps * i);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + chartW, y);
      ctx.stroke();

      const val = minVal < 0
        ? (minVal * 1.1) + (range / ySteps * i)
        : (maxVal * 1.1 / ySteps * i);
      ctx.fillStyle = '#9E9E9E';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(Math.abs(val) >= 1000 ? (val / 1000).toFixed(1) + 'k' : Math.round(val), padding.left - 5, y + 3);
    }

    // Zero line for mixed pos/neg
    if (minVal < 0) {
      ctx.strokeStyle = '#9E9E9E';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padding.left, zeroY);
      ctx.lineTo(padding.left + chartW, zeroY);
      ctx.stroke();
    }

    // Bars
    const groupWidth = chartW / data.labels.length;
    const barPadding = groupWidth * 0.15;
    const barWidth = stacked
      ? groupWidth - barPadding * 2
      : (groupWidth - barPadding * 2) / datasets.length;

    data.labels.forEach((label, i) => {
      let stackY = 0;
      datasets.forEach((ds, di) => {
        const val = ds.values[i] || 0;
        const barH = Math.abs(val) * yScale;
        const x = stacked
          ? padding.left + i * groupWidth + barPadding
          : padding.left + i * groupWidth + barPadding + di * barWidth;
        const y = val >= 0
          ? zeroY - barH - (stacked ? stackY * yScale : 0)
          : zeroY + (stacked ? stackY * yScale : 0);
        const bw = stacked ? barWidth : barWidth - 1;

        // Color: green for positive, red for negative (single dataset)
        const color = datasets.length === 1 && val < 0 ? '#F44336' : (ds.color || getColor(di));
        ctx.fillStyle = color;
        ctx.fillRect(x, y, bw, barH);

        if (showValues && Math.abs(val) > 0 && barH > 14) {
          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 9px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(Math.abs(val) >= 1000 ? (val / 1000).toFixed(1) + 'k' : Math.round(val), x + bw / 2, y + barH / 2 + 3);
        }

        if (stacked) stackY += Math.abs(val);
      });

      // X label
      ctx.fillStyle = '#616161';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.save();
      ctx.translate(padding.left + i * groupWidth + groupWidth / 2, height - 5);
      ctx.rotate(-0.4);
      ctx.fillText(label.length > 10 ? label.substring(0, 10) + '..' : label, 0, 0);
      ctx.restore();
    });

    // Axes
    ctx.strokeStyle = '#9E9E9E';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, padding.top + chartH);
    ctx.lineTo(padding.left + chartW, padding.top + chartH);
    ctx.stroke();

    // Legend
    if (datasets.length > 1 && datasets[0].label) {
      let lx = padding.left;
      const ly = height - 2;
      ctx.font = '10px sans-serif';
      datasets.forEach((ds, i) => {
        ctx.fillStyle = ds.color || getColor(i);
        ctx.fillRect(lx, ly - 8, 10, 10);
        ctx.fillStyle = '#616161';
        ctx.textAlign = 'left';
        ctx.fillText(ds.label || '', lx + 13, ly);
        lx += ctx.measureText(ds.label || '').width + 25;
      });
    }
  }

  // ---- HORIZONTAL BAR CHART ----
  function horizontalBarChart(container, data, opts) {
    const { title = '', height, showValues = true, cWidth } = opts;
    const { ctx, width } = createCanvas(container, cWidth, height);
    if (!ctx) return;

    const padding = { top: title ? 35 : 15, right: 20, bottom: 15, left: 100 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    if (title) {
      ctx.fillStyle = '#212121';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(title, width / 2, 18);
    }

    if (!data.labels || data.labels.length === 0) {
      ctx.fillStyle = '#9E9E9E';
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Sin datos disponibles', width / 2, height / 2);
      return;
    }

    const datasets = Array.isArray(data.datasets) ? data.datasets : [{ values: data.values || [], color: COLORS[0] }];
    let maxVal = 0;
    datasets.forEach(ds => ds.values.forEach(v => { maxVal = Math.max(maxVal, Math.abs(v) || 0); }));
    maxVal = maxVal || 1;

    const barHeight = Math.min(28, (chartH / data.labels.length) * 0.7);
    const barGap = (chartH / data.labels.length) - barHeight;
    const xScale = chartW / (maxVal * 1.15);

    data.labels.forEach((label, i) => {
      const y = padding.top + i * (barHeight + barGap);
      const val = datasets[0].values[i] || 0;
      const barW = Math.abs(val) * xScale;
      const color = val >= 0 ? (datasets[0].color || '#2196F3') : '#F44336';

      // Label
      ctx.fillStyle = '#616161';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(label.length > 12 ? label.substring(0, 12) + '..' : label, padding.left - 8, y + barHeight / 2 + 4);

      // Bar
      ctx.fillStyle = color;
      ctx.fillRect(padding.left, y, barW, barHeight);

      // Value
      if (showValues) {
        ctx.fillStyle = barW > 50 ? '#FFFFFF' : '#616161';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = barW > 50 ? 'right' : 'left';
        const valText = Math.abs(val) >= 1000 ? (val / 1000).toFixed(1) + 'k' : Format.money(val);
        ctx.fillText(valText, barW > 50 ? padding.left + barW - 5 : padding.left + barW + 5, y + barHeight / 2 + 4);
      }
    });

    // Baseline
    ctx.strokeStyle = '#9E9E9E';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, padding.top + chartH);
    ctx.stroke();
  }

  // ---- LINE CHART ----
  function lineChart(containerId, data, options = {}) {
    const { title = '', height = 220, fill = true } = options;
    const container = document.getElementById(containerId);
    if (!container) return;
    const cWidth = container.clientWidth || 320;
    const { ctx, width } = createCanvas(container, cWidth, height);
    if (!ctx) return;

    const padding = { top: title ? 40 : 20, right: 15, bottom: 45, left: 55 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    if (title) {
      ctx.fillStyle = '#212121';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(title, width / 2, 18);
    }

    if (!data.labels || data.labels.length === 0) {
      ctx.fillStyle = '#9E9E9E';
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Sin datos disponibles', width / 2, height / 2);
      return;
    }

    const datasets = Array.isArray(data.datasets) ? data.datasets : [{ values: data.values, color: COLORS[0] }];
    let maxVal = 0;
    datasets.forEach(ds => ds.values.forEach(v => { maxVal = Math.max(maxVal, v || 0); }));
    maxVal = maxVal || 1;

    // Grid
    ctx.strokeStyle = '#E0E0E0';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + chartH - (chartH / 4 * i);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + chartW, y);
      ctx.stroke();
      ctx.fillStyle = '#9E9E9E';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'right';
      const val = maxVal * 1.1 / 4 * i;
      ctx.fillText(Math.round(val), padding.left - 5, y + 3);
    }

    const xStep = chartW / Math.max(data.labels.length - 1, 1);
    const yScale = chartH / (maxVal * 1.1);

    datasets.forEach((ds, di) => {
      const color = ds.color || getColor(di);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();

      const points = [];
      ds.values.forEach((val, i) => {
        const x = padding.left + i * xStep;
        const y = padding.top + chartH - (val || 0) * yScale;
        points.push({ x, y });
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      // Fill area
      if (fill) {
        ctx.fillStyle = color.replace(')', ', 0.1)').replace('rgb', 'rgba');
        if (!color.startsWith('rgba')) {
          ctx.globalAlpha = 0.1;
          ctx.fillStyle = color;
        }
        ctx.beginPath();
        ctx.moveTo(points[0].x, padding.top + chartH);
        points.forEach(p => ctx.lineTo(p.x, p.y));
        ctx.lineTo(points[points.length - 1].x, padding.top + chartH);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // Dots
      points.forEach(p => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
      });
    });

    // X labels
    data.labels.forEach((label, i) => {
      const x = padding.left + i * xStep;
      ctx.fillStyle = '#616161';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label.length > 8 ? label.substring(0, 8) : label, x, padding.top + chartH + 18);
    });

    // Axes
    ctx.strokeStyle = '#9E9E9E';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, padding.top + chartH);
    ctx.lineTo(padding.left + chartW, padding.top + chartH);
    ctx.stroke();

    // Legend
    if (datasets.length > 1 && datasets[0].label) {
      let lx = padding.left;
      const ly = height - 2;
      ctx.font = '10px sans-serif';
      datasets.forEach((ds, i) => {
        ctx.fillStyle = ds.color || getColor(i);
        ctx.fillRect(lx, ly - 8, 10, 10);
        ctx.fillStyle = '#616161';
        ctx.textAlign = 'left';
        ctx.fillText(ds.label || '', lx + 13, ly);
        lx += ctx.measureText(ds.label || '').width + 25;
      });
    }
  }

  // ---- PIE / DONUT CHART ----
  function pieChart(containerId, data, options = {}) {
    const { title = '', height = 220, donut = true } = options;
    const container = document.getElementById(containerId);
    if (!container) return;
    const cWidth = container.clientWidth || 320;
    const { ctx, width } = createCanvas(container, cWidth, height);
    if (!ctx) return;

    if (title) {
      ctx.fillStyle = '#212121';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(title, width / 2, 18);
    }

    if (!data.labels || data.labels.length === 0 || !data.values.some(v => v > 0)) {
      ctx.fillStyle = '#9E9E9E';
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Sin datos disponibles', width / 2, height / 2);
      return;
    }

    const total = data.values.reduce((s, v) => s + (v || 0), 0);
    if (total === 0) return;

    const cx = width * 0.35;
    const cy = (title ? 35 : 10) + (height - (title ? 35 : 10)) / 2;
    const radius = Math.min(cx - 15, cy - (title ? 35 : 10) - 5, 80);
    const innerRadius = donut ? radius * 0.55 : 0;

    let startAngle = -Math.PI / 2;

    data.values.forEach((val, i) => {
      if (!val) return;
      const sliceAngle = (val / total) * Math.PI * 2;
      ctx.fillStyle = data.colors ? data.colors[i] : getColor(i);
      ctx.beginPath();
      ctx.moveTo(cx + innerRadius * Math.cos(startAngle), cy + innerRadius * Math.sin(startAngle));
      ctx.arc(cx, cy, radius, startAngle, startAngle + sliceAngle);
      ctx.arc(cx, cy, innerRadius, startAngle + sliceAngle, startAngle, true);
      ctx.closePath();
      ctx.fill();
      startAngle += sliceAngle;
    });

    // Center text for donut
    if (donut) {
      ctx.fillStyle = '#212121';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(Format.money(total), cx, cy + 2);
      ctx.font = '10px sans-serif';
      ctx.fillStyle = '#9E9E9E';
      ctx.fillText('Total', cx, cy + 16);
    }

    // Legend (right side)
    let ly = (title ? 40 : 15);
    const lx = width * 0.65;
    ctx.font = '11px sans-serif';
    data.labels.forEach((label, i) => {
      if (!data.values[i]) return;
      ctx.fillStyle = data.colors ? data.colors[i] : getColor(i);
      ctx.fillRect(lx, ly - 8, 10, 10);
      ctx.fillStyle = '#616161';
      ctx.textAlign = 'left';
      const pct = ((data.values[i] / total) * 100).toFixed(0);
      ctx.fillText(`${label} (${pct}%)`, lx + 14, ly);
      ly += 18;
    });
  }

  // ---- PROGRESS BAR ----
  function progressBar(containerId, value, max, options = {}) {
    const { label = '', color = '#2E7D32', height = 24, showPercent = true } = options;
    const container = document.getElementById(containerId);
    if (!container) return;
    const pct = Math.min(100, Math.max(0, (value / max) * 100));
    container.innerHTML = `
      <div style="margin-bottom:4px;display:flex;justify-content:space-between;font-size:0.82rem;">
        <span style="color:#616161;">${label}</span>
        ${showPercent ? `<span style="font-weight:600;">${pct.toFixed(0)}%</span>` : ''}
      </div>
      <div style="background:#E0E0E0;border-radius:${height / 2}px;height:${height}px;overflow:hidden;">
        <div style="background:${color};height:100%;width:${pct}%;border-radius:${height / 2}px;transition:width 0.5s ease;"></div>
      </div>
    `;
  }

  return { barChart, lineChart, pieChart, progressBar, getColor, COLORS };
})();
