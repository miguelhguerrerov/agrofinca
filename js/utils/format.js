// ============================================
// AgroFinca - Format Utilities
// Currency, units, and display formatting
// ============================================

const Format = (() => {
  const CURRENCY = 'USD';
  const LOCALE = 'es-EC';

  function money(amount, decimals = 2) {
    if (amount == null || isNaN(amount)) return '$0.00';
    return new Intl.NumberFormat(LOCALE, {
      style: 'currency',
      currency: CURRENCY,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(amount);
  }

  function number(value, decimals = 2) {
    if (value == null || isNaN(value)) return '0';
    return new Intl.NumberFormat(LOCALE, {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals
    }).format(value);
  }

  function percent(value, decimals = 1) {
    if (value == null || isNaN(value)) return '0%';
    return `${number(value, decimals)}%`;
  }

  function unit(value, unitName) {
    const unitLabels = {
      'racimos': 'racimos',
      'kg': 'kg',
      'atados': 'atados',
      'litros': 'litros',
      'sacos': 'sacos',
      'unidades': 'und.',
      'libras': 'lb',
      'quintales': 'qq',
      'galones': 'gal',
      'ml': 'ml',
      'gramos': 'g',
      'toneladas': 'ton'
    };
    const label = unitLabels[unitName] || unitName || '';
    return `${number(value)} ${label}`;
  }

  function date(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString(LOCALE, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function dateShort(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString(LOCALE, { month: 'short', day: 'numeric' });
  }

  function dateTime(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString(LOCALE, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  function dateInput(dateStr) {
    if (!dateStr) return new Date().toISOString().split('T')[0];
    return new Date(dateStr).toISOString().split('T')[0];
  }

  function timeAgo(dateStr) {
    if (!dateStr) return '';
    const now = new Date();
    const d = new Date(dateStr);
    const diff = Math.floor((now - d) / 1000);
    if (diff < 60) return 'hace un momento';
    if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
    if (diff < 604800) return `hace ${Math.floor(diff / 86400)} días`;
    return date(dateStr);
  }

  function area(m2) {
    if (!m2 || isNaN(m2)) return '0 m²';
    if (m2 >= 10000) {
      return `${number(m2 / 10000)} ha`;
    }
    return `${number(m2, 0)} m²`;
  }

  function truncate(str, maxLen = 50) {
    if (!str) return '';
    return str.length > maxLen ? str.substring(0, maxLen) + '...' : str;
  }

  function initials(name) {
    if (!name) return '??';
    return name.split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 2);
  }

  function slug(str) {
    return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }

  // Crop type labels
  function cropType(tipo) {
    const labels = {
      'perenne': 'Perenne',
      'estacional': 'Estacional',
      'rotacion_rapida': 'Rotación rápida',
      'apicola': 'Apícola',
      'compostaje': 'Compostaje',
      'frutal': 'Frutal',
      'hortaliza': 'Hortaliza',
      'cereal': 'Cereal',
      'leguminosa': 'Leguminosa',
      'otro': 'Otro'
    };
    return labels[tipo] || tipo;
  }

  // Cost category labels
  function costCategory(cat) {
    const labels = {
      'insumo': 'Insumo',
      'mano_obra_contratada': 'Mano de obra contratada',
      'mano_obra_familiar': 'Mano de obra familiar',
      'herramienta': 'Herramienta',
      'infraestructura': 'Infraestructura',
      'transporte': 'Transporte',
      'fitosanitario': 'Fitosanitario',
      'riego': 'Riego',
      'empaque': 'Empaque',
      'otro': 'Otro'
    };
    return labels[cat] || cat;
  }

  return {
    money, number, percent, unit, date, dateShort, dateTime, dateInput,
    timeAgo, area, truncate, initials, slug, cropType, costCategory
  };
})();
