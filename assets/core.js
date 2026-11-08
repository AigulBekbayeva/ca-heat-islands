/* Shared code for the three maps: data loading, statistics, base map, colour, charts. */
(function () {
  'use strict';

  const BASELINE = [2003, 2012];   // аномалии считаются относительно этого периода
  const EARLY = [2003, 2007];      // «тогда» для острова тепла
  const LATE = [2021, 2025];       // «сейчас»
  const MIN_PX_SHARE = 0.5;        // год отбрасывается, если ясных пикселей < 50 % медианы

  const METRICS = {
    urban_day:   { label: 'Город · день',      short: 'город, день' },
    urban_night: { label: 'Город · ночь',      short: 'город, ночь' },
    rural_day:   { label: 'Пригород · день',   short: 'пригород, день' },
    rural_night: { label: 'Пригород · ночь',   short: 'пригород, ночь' },
    suhi_day:    { label: 'Остров тепла · день', short: 'SUHI, день' },
    suhi_night:  { label: 'Остров тепла · ночь', short: 'SUHI, ночь' }
  };

  /* ------------------------------------------------------------ data --- */
  async function fetchCsv(path) {
    const res = await fetch(path, { cache: 'no-cache' });
    if (!res.ok) throw new Error(path + ' ' + res.status);
    const text = await res.text();
    if (!text.trim().startsWith('city')) throw new Error(path + ' is not the expected CSV');
    return d3.csvParse(text);
  }

  async function load() {
    let rows, demo = false;
    try {
      rows = await fetchCsv('data/lst_summer_cities.csv');
    } catch (e) {
      rows = await fetchCsv('data/demo_lst_summer_cities.csv');
      demo = true;
    }
    const region = await (await fetch('data/region.json')).json();
    const cities = d3.groups(rows, d => d.city).map(([name, rs]) => buildCity(name, rs));
    return { cities, demo, region };
  }

  const num = v => (v === '' || v == null || isNaN(+v)) ? null : +v;

  function buildCity(name, rows) {
    rows = rows.slice().sort((a, b) => a.year - b.year);
    const r0 = rows[0];
    const medU = d3.median(rows, r => num(r.urban_px)) || 0;
    const medR = d3.median(rows, r => num(r.rural_px)) || 0;
    const series = {};
    Object.keys(METRICS).forEach(k => (series[k] = []));
    rows.forEach(r => {
      const year = +r.year;
      const uOk = (num(r.urban_px) ?? medU) >= MIN_PX_SHARE * medU;
      const rOk = (num(r.rural_px) ?? medR) >= MIN_PX_SHARE * medR;
      const v = {
        urban_day: uOk ? num(r.urban_day) : null,
        urban_night: uOk ? num(r.urban_night) : null,
        rural_day: rOk ? num(r.rural_day) : null,
        rural_night: rOk ? num(r.rural_night) : null
      };
      v.suhi_day = v.urban_day != null && v.rural_day != null ? v.urban_day - v.rural_day : null;
      v.suhi_night = v.urban_night != null && v.rural_night != null ? v.urban_night - v.rural_night : null;
      Object.keys(series).forEach(k => { if (v[k] != null) series[k].push({ year, v: v[k] }); });
    });

    const trend = {}, anomaly = {}, period = {};
    Object.keys(series).forEach(k => {
      const s = series[k];
      trend[k] = trendStats(s);
      const base = d3.mean(s.filter(d => d.year >= BASELINE[0] && d.year <= BASELINE[1]), d => d.v);
      anomaly[k] = base == null ? [] : s.map(d => ({ year: d.year, v: d.v - base }));
      const early = d3.mean(s.filter(d => d.year >= EARLY[0] && d.year <= EARLY[1]), d => d.v);
      const late = d3.mean(s.filter(d => d.year >= LATE[0] && d.year <= LATE[1]), d => d.v);
      period[k] = { early, late, change: early != null && late != null ? late - early : null };
    });

    return {
      id: name.replace(/\W+/g, '-').toLowerCase(),
      name, ru: r0.city_ru || name, country: r0.country,
      lat: +r0.lat, lon: +r0.lon, season: r0.season,
      km2: num(r0.urban_km2) ?? medU, coreFound: r0.core_found !== '0',
      series, trend, anomaly, period
    };
  }

  /* Sen's slope + Mann–Kendall test; slope is reported per decade */
  function trendStats(s) {
    const n = s.length;
    if (n < 8) return { sen: null, ols: null, p: null, n, intercept: null };
    const slopes = [];
    let S = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const dv = s[j].v - s[i].v;
      slopes.push(dv / (s[j].year - s[i].year));
      S += Math.sign(dv);
    }
    const sen = d3.median(slopes);
    const intercept = d3.median(s, d => d.v - sen * d.year);
    const varS = n * (n - 1) * (2 * n + 5) / 18;
    const z = S > 0 ? (S - 1) / Math.sqrt(varS) : S < 0 ? (S + 1) / Math.sqrt(varS) : 0;
    const p = 2 * (1 - normCdf(Math.abs(z)));
    const mx = d3.mean(s, d => d.year), my = d3.mean(s, d => d.v);
    const ols = d3.sum(s, d => (d.year - mx) * (d.v - my)) / d3.sum(s, d => (d.year - mx) ** 2);
    return { sen: sen * 10, ols: ols * 10, p, n, intercept, senYr: sen };
  }

  function normCdf(x) { // Abramowitz–Stegun 7.1.26
    const t = 1 / (1 + 0.3275911 * x / Math.SQRT2);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x / 2);
    return 0.5 * (1 + y);
  }

  /* ----------------------------------------------------------- colour --- */
  // Diverging: cool blue ← neutral grey → warm red. Validated stops for the dark surface.
  const DIV_STOPS = ['#2f6fc4', '#6da7ec', '#b7d3f6', '#8a8985', '#f6b48f', '#ec6a42', '#c9301f'];
  function diverging(maxNeg, maxPos) {
    const neg = d3.scaleLinear().domain([-maxNeg, -maxNeg * 2 / 3, -maxNeg / 3, 0]).range(DIV_STOPS.slice(0, 4)).interpolate(d3.interpolateLab).clamp(true);
    const pos = d3.scaleLinear().domain([0, maxPos / 3, maxPos * 2 / 3, maxPos]).range(DIV_STOPS.slice(3)).interpolate(d3.interpolateLab).clamp(true);
    const f = v => v == null ? '#555' : (v < 0 ? neg(v) : pos(v));
    f.domain = [-maxNeg, maxPos];
    return f;
  }

  function legendBar(el, color, { title, ticks, unit }) {
    const w = 260, h = 10;
    const [a, b] = color.domain;
    const x = d3.scaleLinear().domain([a, b]).range([0, w]);
    const id = 'g' + Math.random().toString(36).slice(2);
    const stops = d3.range(0, 1.0001, 0.05).map(t => ({ t, c: color(a + (b - a) * t) }));
    el.innerHTML = `<div class="legend-title">${title}</div>
      <svg width="${w + 34}" height="34" role="img" aria-label="${title}">
        <defs><linearGradient id="${id}">${stops.map(s => `<stop offset="${s.t}" stop-color="${s.c}"/>`).join('')}</linearGradient></defs>
        <g transform="translate(10,2)">
          <rect width="${w}" height="${h}" rx="3" fill="url(#${id})"/>
          ${ticks.map(t => `<g transform="translate(${x(t)},0)"><line y1="${h}" y2="${h + 4}" stroke="currentColor" opacity=".5"/>
            <text y="${h + 16}" text-anchor="middle">${t > 0 ? '+' : ''}${t}${unit || ''}</text></g>`).join('')}
        </g></svg>`;
  }

  /* --------------------------------------------------------- base map --- */
  // Central Asia in a conic equal-area projection; countries from Natural Earth 1:50m.
  const PLACE_LABELS = [
    { t: 'КАЗАХСТАН', p: [67.5, 48.3], cls: 'ca' }, { t: 'УЗБЕКИСТАН', p: [63.6, 41.4], cls: 'ca' },
    { t: 'ТУРКМЕНИСТАН', p: [58.8, 39.4], cls: 'ca' }, { t: 'КЫРГЫЗСТАН', p: [75.2, 41.6], cls: 'ca' },
    { t: 'ТАДЖИКИСТАН', p: [71.4, 38.75], cls: 'ca' },
    { t: 'РОССИЯ', p: [66, 56.6], cls: 'nb' }, { t: 'КИТАЙ', p: [81.5, 41.3], cls: 'nb' },
    { t: 'АФГАНИСТАН', p: [66, 34.6], cls: 'nb' }, { t: 'ИРАН', p: [55.5, 34], cls: 'nb' },
    { t: 'МОНГОЛИЯ', p: [92, 47.5], cls: 'nb' },
    { t: 'Каспийское\nморе', p: [50.6, 41.6], cls: 'sea' }
  ];

  function baseMap(container, region, { onZoom } = {}) {
    container.innerHTML = '';
    const svg = d3.select(container).append('svg').attr('class', 'map-svg');
    const gWorld = svg.append('g').attr('class', 'world');
    const gPlace = svg.append('g').attr('class', 'place-labels');
    const gOverlay = svg.append('g').attr('class', 'overlay');
    const projection = d3.geoConicEqualArea().parallels([40, 52]).rotate([-67, 0]);
    const path = d3.geoPath(projection);
    const graticule = d3.geoGraticule().step([5, 5]).extent([[30, 25], [100, 62]]);
    const caFeatures = { type: 'FeatureCollection', features: region.features.filter(f => f.properties.ca) };
    let transform = d3.zoomIdentity;

    function resize() {
      const { width, height } = container.getBoundingClientRect();
      svg.attr('viewBox', [0, 0, width, height]).attr('width', width).attr('height', height);
      projection.fitExtent([[30, 56], [width - 30, height - 20]], caFeatures);
      gWorld.selectAll('*').remove();
      gWorld.append('rect').attr('class', 'sea-bg').attr('x', -width).attr('y', -height).attr('width', width * 3).attr('height', height * 3);
      gWorld.append('g').selectAll('path').data(region.features).join('path')
        .attr('class', d => 'country' + (d.properties.ca ? ' ca' : '')).attr('d', path);
      gWorld.append('path').datum(graticule()).attr('class', 'graticule').attr('d', path);
      gPlace.selectAll('text').data(PLACE_LABELS).join('text').attr('class', d => 'place ' + d.cls)
        .each(function (d) {
          const lines = d.t.split('\n');
          d3.select(this).selectAll('tspan').data(lines).join('tspan').attr('x', 0).attr('dy', (l, i) => (i ? '1.15em' : 0)).text(l => l);
        });
      zoom.extent([[0, 0], [width, height]]).translateExtent([[-width * 0.3, -height * 0.3], [width * 1.3, height * 1.3]]);
      apply();
    }

    function apply() {
      gWorld.attr('transform', transform);
      gPlace.selectAll('text').attr('transform', d => `translate(${transform.apply(projection(d.p))})`);
      if (onZoom) onZoom(api);
    }

    const zoom = d3.zoom().scaleExtent([1, 10]).on('zoom', e => { transform = e.transform; apply(); });
    svg.call(zoom).on('dblclick.zoom', null);

    const api = {
      svg, gOverlay, projection,
      get k() { return transform.k; },
      xy(lon, lat) { return transform.apply(projection([lon, lat])); },
      zoomTo(lon, lat, k = 4) {
        const [x, y] = projection([lon, lat]);
        const { width, height } = container.getBoundingClientRect();
        svg.transition().duration(750).call(zoom.transform, d3.zoomIdentity.translate(width / 2 - x * k, height / 2 - y * k).scale(k));
      },
      reset() { svg.transition().duration(600).call(zoom.transform, d3.zoomIdentity); },
      resize
    };
    new ResizeObserver(() => resize()).observe(container);
    resize();
    return api;
  }

  /* ---------------------------------------------------------- tooltip --- */
  const tip = (() => {
    let el;
    function ensure() { if (!el) { el = document.createElement('div'); el.className = 'tooltip'; document.body.appendChild(el); } return el; }
    return {
      show(html, event) {
        const t = ensure(); t.innerHTML = html; t.style.opacity = 1;
        const pad = 14, r = t.getBoundingClientRect();
        let x = event.clientX + pad, y = event.clientY + pad;
        if (x + r.width > innerWidth - 8) x = event.clientX - r.width - pad;
        if (y + r.height > innerHeight - 8) y = event.clientY - r.height - pad;
        t.style.transform = `translate(${x}px,${y}px)`;
      },
      hide() { if (el) el.style.opacity = 0; }
    };
  })();

  /* ------------------------------------------------- detail line chart --- */
  // series: [{name, color, values:[{year,v}], dash?}], opts: {trend:{senYr,intercept}, unit, zero, yLabel}
  function lineChart(el, series, opts = {}) {
    el.innerHTML = '';
    const W = el.clientWidth || 320, H = opts.height || 190;
    const m = { t: 12, r: 12, b: 24, l: 36 };
    const all = series.flatMap(s => s.values);
    if (!all.length) { el.innerHTML = '<p class="muted">Нет данных</p>'; return; }
    const x = d3.scaleLinear().domain(d3.extent(all, d => d.year)).range([m.l, W - m.r]);
    let ext = d3.extent(all, d => d.v);
    if (opts.zero) ext = [Math.min(0, ext[0]), Math.max(0, ext[1])];
    const y = d3.scaleLinear().domain(ext).nice(5).range([H - m.b, m.t]);
    const svg = d3.select(el).append('svg').attr('width', W).attr('height', H).attr('class', 'chart');
    svg.append('g').attr('class', 'grid').selectAll('line').data(y.ticks(5)).join('line')
      .attr('x1', m.l).attr('x2', W - m.r).attr('y1', d => y(d)).attr('y2', d => y(d));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l - 6},0)`)
      .selectAll('text').data(y.ticks(5)).join('text').attr('y', d => y(d)).attr('dy', '0.32em').attr('text-anchor', 'end')
      .text(d => d + (opts.unit || ''));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - 6})`)
      .selectAll('text').data(x.ticks(5).filter(Number.isInteger)).join('text').attr('x', d => x(d)).attr('text-anchor', 'middle').text(d => d);
    if (opts.zero && ext[0] < 0 && ext[1] > 0) svg.append('line').attr('class', 'zero').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(0)).attr('y2', y(0));

    if (opts.band && series.length === 2) {
      const [a, b] = series; const bm = new Map(b.values.map(d => [d.year, d.v]));
      const both = a.values.filter(d => bm.has(d.year)).map(d => ({ year: d.year, a: d.v, b: bm.get(d.year) }));
      // warm fill where series A (city) is above B, cool fill where it is below
      svg.append('path').attr('class', 'band').attr('fill', a.color).attr('d', d3.area().x(d => x(d.year)).y0(d => y(d.b)).y1(d => y(Math.max(d.a, d.b)))(both));
      svg.append('path').attr('class', 'band').attr('fill', b.color).attr('d', d3.area().x(d => x(d.year)).y0(d => y(d.a)).y1(d => y(Math.max(d.a, d.b)))(both));
    }
    if (opts.trend && opts.trend.senYr != null) {
      const [x0, x1] = x.domain();
      svg.append('line').attr('class', 'trendline')
        .attr('x1', x(x0)).attr('x2', x(x1))
        .attr('y1', y(opts.trend.intercept + opts.trend.senYr * x0)).attr('y2', y(opts.trend.intercept + opts.trend.senYr * x1));
    }
    const line = d3.line().defined(d => d.v != null).x(d => x(d.year)).y(d => y(d.v));
    series.forEach(s => {
      svg.append('path').attr('class', 'series').attr('stroke', s.color).attr('stroke-dasharray', s.dash || null).attr('d', line(s.values));
      if (opts.directLabels) {
        const last = s.values[s.values.length - 1];
        svg.append('text').attr('class', 'dlabel').attr('x', x(last.year) - 2).attr('y', y(last.v) - 8).attr('text-anchor', 'end').text(s.name);
      }
    });
    // crosshair + tooltip
    const cross = svg.append('line').attr('class', 'cross').attr('y1', m.t).attr('y2', H - m.b).style('opacity', 0);
    const dots = svg.append('g');
    svg.append('rect').attr('x', m.l).attr('y', 0).attr('width', W - m.l - m.r).attr('height', H).attr('fill', 'transparent')
      .on('mousemove', e => {
        const yr = Math.round(x.invert(d3.pointer(e)[0]));
        cross.attr('x1', x(yr)).attr('x2', x(yr)).style('opacity', 1);
        const rows = series.map(s => ({ s, d: s.values.find(d => d.year === yr) })).filter(r => r.d);
        dots.selectAll('circle').data(rows).join('circle').attr('r', 4).attr('cx', r => x(yr)).attr('cy', r => y(r.d.v))
          .attr('fill', r => r.s.color).attr('stroke', 'var(--surface)').attr('stroke-width', 2);
        tip.show(`<b>${yr}</b>${rows.map(r => `<div><i style="background:${r.s.color}"></i>${r.s.name}: <b>${fmt(r.d.v, opts.signed)}${opts.unit || ''}</b></div>`).join('')}`, e);
      })
      .on('mouseleave', () => { cross.style('opacity', 0); dots.selectAll('*').remove(); tip.hide(); });
  }

  /* ------------------------------------------------------------ misc --- */
  function fmt(v, signed, digits = 1) {
    if (v == null || isNaN(v)) return '—';
    if (Math.abs(v) < 0.5 * 10 ** -digits) v = 0;
    const s = v.toFixed(digits).replace('-', '−');
    return signed && v > 0 ? '+' + s : s;
  }

  function demoBanner(isDemo) {
    if (!isDemo) return;
    const b = document.createElement('div');
    b.className = 'demo-banner';
    b.innerHTML = '<b>ДЕМО-ДАННЫЕ.</b> Значения синтетические, чтобы проверить вёрстку. Запустите <code>gee/lst_cities.js</code> в Earth Engine и положите CSV в <code>data/lst_summer_cities.csv</code> — баннер исчезнет.';
    (document.querySelector('.panel') || document.body).prepend(b);
  }

  function segmented(el, options, value, onChange) {
    el.innerHTML = options.map(o => `<button type="button" data-v="${o.v}" aria-pressed="${o.v === value}">${o.label}</button>`).join('');
    el.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      el.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
      onChange(b.dataset.v);
    });
  }

  window.LST = { load, METRICS, BASELINE, EARLY, LATE, diverging, legendBar, baseMap, tip, lineChart, fmt, demoBanner, segmented };
})();
