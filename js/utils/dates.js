// ============================================
// AgroFinca - Date Utilities
// Weekend scheduling, cycle calculations
// ============================================

const DateUtils = (() => {

  function today() {
    return new Date().toISOString().split('T')[0];
  }

  function now() {
    return new Date().toISOString();
  }

  // Get next weekend dates (Saturday + Sunday)
  function nextWeekend() {
    const d = new Date();
    const day = d.getDay();
    const satDiff = day === 6 ? 0 : (6 - day);
    const sat = new Date(d);
    sat.setDate(d.getDate() + satDiff);
    const sun = new Date(sat);
    sun.setDate(sat.getDate() + 1);
    return {
      saturday: sat.toISOString().split('T')[0],
      sunday: sun.toISOString().split('T')[0]
    };
  }

  // Check if a date is weekend
  function isWeekend(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    return d.getDay() === 0 || d.getDay() === 6;
  }

  // Get all weekend dates in a month
  function weekendsInMonth(year, month) {
    const dates = [];
    const d = new Date(year, month, 1);
    while (d.getMonth() === month) {
      if (d.getDay() === 0 || d.getDay() === 6) {
        dates.push(d.toISOString().split('T')[0]);
      }
      d.setDate(d.getDate() + 1);
    }
    return dates;
  }

  // Get all weekend dates between two dates
  function weekendsBetween(startStr, endStr) {
    const dates = [];
    const start = new Date(startStr + 'T12:00:00');
    const end = new Date(endStr + 'T12:00:00');
    const d = new Date(start);
    while (d <= end) {
      if (d.getDay() === 0 || d.getDay() === 6) {
        dates.push(d.toISOString().split('T')[0]);
      }
      d.setDate(d.getDate() + 1);
    }
    return dates;
  }

  // Calculate days between two dates
  function daysBetween(startStr, endStr) {
    const start = new Date(startStr);
    const end = new Date(endStr || today());
    return Math.floor((end - start) / (1000 * 60 * 60 * 24));
  }

  // Add days to a date
  function addDays(dateStr, days) {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  }

  // Get estimated harvest date based on cycle days
  function estimatedHarvest(startDate, cycleDays) {
    if (!cycleDays || cycleDays === 0) return null; // perennial
    return addDays(startDate, cycleDays);
  }

  // Get cycle progress percentage
  function cycleProgress(startDate, cycleDays) {
    if (!cycleDays || cycleDays === 0) return null;
    const elapsed = daysBetween(startDate, today());
    return Math.min(100, Math.max(0, (elapsed / cycleDays) * 100));
  }

  // Get current month range
  function currentMonthRange() {
    const d = new Date();
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0]
    };
  }

  // Get current year range
  function currentYearRange() {
    const y = new Date().getFullYear();
    return {
      start: `${y}-01-01`,
      end: `${y}-12-31`
    };
  }

  // Get last N months range
  function lastMonths(n) {
    const end = new Date();
    const start = new Date();
    start.setMonth(start.getMonth() - n);
    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0]
    };
  }

  // Get month name
  function monthName(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('es-EC', { month: 'long' });
  }

  // Get month/year label
  function monthYear(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('es-EC', { month: 'short', year: 'numeric' });
  }

  // Group dates by month
  function groupByMonth(records, dateField = 'fecha') {
    const groups = {};
    for (const r of records) {
      const key = r[dateField] ? r[dateField].substring(0, 7) : 'sin-fecha';
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    }
    return groups;
  }

  // Get the next N weekend dates starting from today
  function nextNWeekends(n) {
    const dates = [];
    const d = new Date();
    while (dates.length < n * 2) {
      if (d.getDay() === 0 || d.getDay() === 6) {
        dates.push(d.toISOString().split('T')[0]);
      }
      d.setDate(d.getDate() + 1);
    }
    return dates;
  }

  // Format date for display as weekday
  function weekdayName(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('es-EC', { weekday: 'long' });
  }

  return {
    today, now, nextWeekend, isWeekend, weekendsInMonth, weekendsBetween,
    daysBetween, addDays, estimatedHarvest, cycleProgress,
    currentMonthRange, currentYearRange, lastMonths,
    monthName, monthYear, groupByMonth, nextNWeekends, weekdayName
  };
})();
