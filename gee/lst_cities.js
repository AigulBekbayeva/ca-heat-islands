/******************************************************************************
 * #30DayMapChallenge 2026 · Day 9 · Urban–rural
 * Острова тепла Центральной Азии: насколько город горячее своих окрестностей
 * и как это меняется с 2003 по 2025 год.
 *
 * Google Earth Engine Code Editor script (https://code.earthengine.google.com)
 *
 * Для 30 городов Казахстана, Узбекистана, Кыргызстана, Таджикистана и
 * Туркменистана считает среднюю летнюю (июнь–август) температуру поверхности
 * (LST) за каждый год 2003–2025:
 *   • днём (≈13:30) и ночью (≈01:30) — Aqua MODIS MYD11A2 v6.1, 1 км;
 *   • в городе — связное «городское ядро» GHSL (smod 30), в котором стоит точка;
 *   • в окрестностях — сельские ячейки GHSL (smod 11–13) в радиусе 50 км
 *     с высотой, близкой к высоте города.
 * Остров тепла (SUHI) = город − окрестности. Тренды считает сам сайт.
 *
 * Результат: CSV в Google Drive → data/lst_summer_cities.csv в репозитории.
 ******************************************************************************/

// ---------------------------------------------------------------- ПАРАМЕТРЫ --
var FIRST_YEAR   = 2003;
var LAST_YEAR    = 2025;
var START_MONTH  = 6;      // июнь–август; у всех городов один и тот же сезон
var URBAN_MAX_R  = 25000;  // м: городское ядро не дальше этого от точки
var RURAL_R      = 50000;  // м: радиус поиска окрестностей
var ELEV_TOL     = 100;    // м: допустимая разница высот окрестностей и города
var EXPORT_NAME  = 'lst_summer_cities';

// [name_en, name_ru, country, lat, lon]
var CITIES = [
  ['Almaty',          'Алматы',          'Kazakhstan',   43.2389, 76.8897],
  ['Astana',          'Астана',          'Kazakhstan',   51.1694, 71.4491],
  ['Shymkent',        'Шымкент',         'Kazakhstan',   42.3417, 69.5901],
  ['Karaganda',       'Караганда',       'Kazakhstan',   49.8047, 73.1094],
  ['Aktobe',          'Актобе',          'Kazakhstan',   50.2839, 57.1670],
  ['Taraz',           'Тараз',           'Kazakhstan',   42.9000, 71.3667],
  ['Pavlodar',        'Павлодар',        'Kazakhstan',   52.2873, 76.9674],
  ['Oskemen',         'Усть-Каменогорск','Kazakhstan',   49.9483, 82.6279],
  ['Semey',           'Семей',           'Kazakhstan',   50.4111, 80.2275],
  ['Atyrau',          'Атырау',          'Kazakhstan',   47.0945, 51.9238],
  ['Kostanay',        'Костанай',        'Kazakhstan',   53.2144, 63.6246],
  ['Kyzylorda',       'Кызылорда',       'Kazakhstan',   44.8488, 65.4823],
  ['Oral',            'Уральск',         'Kazakhstan',   51.2333, 51.3667],
  ['Aktau',           'Актау',           'Kazakhstan',   43.6532, 51.1975],
  ['Petropavl',       'Петропавловск',   'Kazakhstan',   54.8667, 69.1500],
  ['Tashkent',        'Ташкент',         'Uzbekistan',   41.2995, 69.2401],
  ['Samarkand',       'Самарканд',       'Uzbekistan',   39.6542, 66.9597],
  ['Namangan',        'Наманган',        'Uzbekistan',   40.9983, 71.6726],
  ['Andijan',         'Андижан',         'Uzbekistan',   40.7821, 72.3442],
  ['Bukhara',         'Бухара',          'Uzbekistan',   39.7747, 64.4286],
  ['Nukus',           'Нукус',           'Uzbekistan',   42.4600, 59.6100],
  ['Fergana',         'Фергана',         'Uzbekistan',   40.3864, 71.7864],
  ['Qarshi',          'Карши',           'Uzbekistan',   38.8606, 65.7891],
  ['Bishkek',         'Бишкек',          'Kyrgyzstan',   42.8746, 74.5698],
  ['Osh',             'Ош',              'Kyrgyzstan',   40.5283, 72.7985],
  ['Dushanbe',        'Душанбе',         'Tajikistan',   38.5598, 68.7870],
  ['Khujand',         'Худжанд',         'Tajikistan',   40.2826, 69.6222],
  ['Ashgabat',        'Ашхабад',         'Turkmenistan', 37.9601, 58.3261],
  ['Turkmenabat',     'Туркменабат',     'Turkmenistan', 39.0733, 63.5786],
  ['Mary',            'Мары',            'Turkmenistan', 37.6000, 61.8333]
];

// ------------------------------------------------------------------ ДАННЫЕ --
var lstCol  = ee.ImageCollection('MODIS/061/MYD11A2');
var lstProj = lstCol.first().projection();

// Степень урбанизации GHSL, эпоха 2020 (1 км). Маска одна на все годы:
// меряем, как меняется температура одной и той же территории.
var smod     = ee.Image('JRC/GHSL/P2023A/GHS_SMOD_V2-0/2020').select('smod_code');
var smodProj = smod.projection();
var dem      = ee.Image('USGS/SRTMGL1_003').select('elevation');

// Связные «городские ядра»: у каждого пятна smod = 30 свой номер
var cores = smod.eq(30).selfMask()
    .connectedComponents(ee.Kernel.plus(1), 1024)
    .select('labels')
    .reproject(smodProj);

// QC: хорошее качество, либо «прочее» качество с ошибкой LST не больше 2 K
function qcOk(qc) {
  var mandatory = qc.bitwiseAnd(3);
  var lstErr = qc.rightShift(6).bitwiseAnd(3);
  return mandatory.eq(0).or(mandatory.eq(1).and(lstErr.lte(1)));
}

var lstC = lstCol.map(function (img) {
  var day = img.select('LST_Day_1km').multiply(0.02).subtract(273.15)
      .updateMask(qcOk(img.select('QC_Day'))).rename('day');
  var night = img.select('LST_Night_1km').multiply(0.02).subtract(273.15)
      .updateMask(qcOk(img.select('QC_Night'))).rename('night');
  return day.addBands(night).copyProperties(img, ['system:time_start']);
});

var REDUCER = ee.Reducer.mean().combine({reducer2: ee.Reducer.count(), sharedInputs: true});

function regionStats(img, mask, geom) {
  return img.updateMask(mask).reduceRegion({
    reducer: REDUCER, geometry: geom, crs: lstProj, scale: lstProj.nominalScale(),
    maxPixels: 1e9, tileScale: 2
  });
}

// ---------------------------------------------------------------- РАСЧЁТ ----
var cityFc = ee.FeatureCollection(CITIES.map(function (c) {
  return ee.Feature(ee.Geometry.Point([c[4], c[3]]),
    {city: c[0], city_ru: c[1], country: c[2], lat: c[3], lon: c[4]});
}));

function cityMasks(city) {
  var pt = city.geometry();
  var uGeom = pt.buffer(URBAN_MAX_R);
  // номер ядра, в котором стоит точка (смотрим в радиусе 3 км на случай неточной точки)
  var label = cores.reduceRegion({
    reducer: ee.Reducer.mode(), geometry: pt.buffer(3000), crs: smodProj, scale: 1000
  }).get('labels');
  // если ядра нет (город меньше порога GHSL) — берём плотные городские кластеры (smod ≥ 23) в 10 км
  var urbanMask = ee.Image(ee.Algorithms.If(label,
      cores.eq(ee.Number(label)).clip(uGeom),
      smod.gte(23).clip(pt.buffer(10000))));
  urbanMask = urbanMask.unmask(0).selfMask();

  var urbanElev = ee.Number(dem.updateMask(urbanMask).reduceRegion({
    reducer: ee.Reducer.median(), geometry: uGeom, scale: 1000, maxPixels: 1e9
  }).get('elevation'));
  var ruralMask = smod.gte(11).and(smod.lte(13))
      .and(dem.subtract(urbanElev).abs().lte(ELEV_TOL))
      .clip(pt.buffer(RURAL_R)).selfMask();

  var urbanKm2 = urbanMask.reduceRegion({
    reducer: ee.Reducer.count(), geometry: uGeom, crs: smodProj, scale: 1000, maxPixels: 1e9
  }).values().get(0);

  return {urban: urbanMask, rural: ruralMask, uGeom: uGeom, rGeom: pt.buffer(RURAL_R),
          urbanKm2: urbanKm2, urbanElev: urbanElev, coreFound: ee.Algorithms.If(label, 1, 0)};
}

var years = ee.List.sequence(FIRST_YEAR, LAST_YEAR);

var table = cityFc.map(function (city) {
  var m = cityMasks(city);
  return ee.FeatureCollection(years.map(function (y) {
    var start = ee.Date.fromYMD(ee.Number(y), START_MONTH, 1);
    var comp = lstC.filterDate(start, start.advance(3, 'month')).mean();
    var u = regionStats(comp, m.urban, m.uGeom);
    var r = regionStats(comp, m.rural, m.rGeom);
    return ee.Feature(null, {
      city: city.get('city'), city_ru: city.get('city_ru'), country: city.get('country'),
      lat: city.get('lat'), lon: city.get('lon'), season: 'Jun-Aug', year: ee.Number(y).int(),
      urban_day: u.get('day_mean'), urban_night: u.get('night_mean'),
      rural_day: r.get('day_mean'), rural_night: r.get('night_mean'),
      urban_px: u.get('day_count'), rural_px: r.get('day_count'),
      urban_km2: m.urbanKm2, urban_elev: m.urbanElev, core_found: m.coreFound
    });
  }));
}).flatten();

// ---------------------------------------------------------- ПРОВЕРКА/ЭКСПОРТ --
var CHECK_CITY = 'Almaty';   // поменяйте, чтобы посмотреть маски другого города
var check = cityFc.filter(ee.Filter.eq('city', CHECK_CITY)).first();
var cm = cityMasks(check);
Map.centerObject(check, 9);
Map.addLayer(cm.rural, {palette: ['5aa469']}, 'Окрестности (smod 11–13, ±' + ELEV_TOL + ' м)');
Map.addLayer(cm.urban, {palette: ['ff5533']}, 'Городское ядро');
Map.addLayer(cityFc, {color: 'ffffff'}, 'Точки городов');

var probe = table.filter(ee.Filter.eq('city', CHECK_CITY));
print(CHECK_CITY + ': первые строки', probe.limit(3));
print(ui.Chart.feature.byFeature(probe, 'year', ['urban_day', 'rural_day', 'urban_night', 'rural_night'])
  .setOptions({title: CHECK_CITY + ' · LST июнь–август, °C', lineWidth: 2, pointSize: 3}));

Export.table.toDrive({
  collection: table,
  description: EXPORT_NAME,
  fileNamePrefix: EXPORT_NAME,
  fileFormat: 'CSV',
  selectors: ['city', 'city_ru', 'country', 'lat', 'lon', 'season', 'year',
              'urban_day', 'urban_night', 'rural_day', 'rural_night',
              'urban_px', 'rural_px', 'urban_km2', 'urban_elev', 'core_found']
});
