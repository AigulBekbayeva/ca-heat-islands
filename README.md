# Are Central Asian cities heating up faster than their surroundings?

Interactive map for **#30DayMapChallenge 2026 · Day 9 · Urban–rural**.

The whole region is warming, so the countryside heats up too. Subtracting it from the city leaves what the city itself adds: buildings, asphalt, lost greenery. That gap is the **surface urban heat island (SUHI)**. The map shows how big it is in 30 cities of Kazakhstan, Uzbekistan, Kyrgyzstan, Tajikistan and Turkmenistan, and whether it grew between 2003 and 2025.

## What's on the map

- **Circle** = city. Size = urban core area (km²); colour = the selected measure.
- **Day / Night**: Aqua MODIS overpasses at ~13:30 and ~01:30 local time.
- **Change**: heat island trend, °C per decade. Faded circles = trend not statistically significant.
- **Now / Then**: mean heat island in 2021–2025 and 2003–2007.
- **Side panel**: "city − surroundings = heat island" for the selected city, a then-vs-now ranking, and the year-by-year chart.

What to expect: by day, desert and semi-desert cities are often *cool islands* (irrigation, trees and shade versus scorching bare ground). At night almost every city is warmer than its surroundings, as concrete and asphalt release stored heat.

## Data and method

| | |
|---|---|
| Land surface temperature | NASA MODIS **MYD11A2 v6.1** (Aqua), 8-day composites, 1 km. Only good-quality pixels by QC (or "other quality" with LST error ≤ 2 K) |
| Season | June–August, the same for every city, 2003–2025 |
| City | JRC **GHSL GHS-SMOD R2023A**, 2020 epoch: the contiguous urban centre (class 30) that contains the city point, within 25 km. If there is none, dense urban clusters (class ≥ 23) within 10 km |
| Surroundings | GHSL rural classes 11–13 within 50 km whose elevation is within ±100 m of the city's median elevation (SRTM), so mountains don't bias the comparison |
| Masks | fixed to 2020, so the same area is compared every year |
| Trend | Sen's slope; significance by Mann–Kendall test (p < 0.05). Years with fewer than 50 % of the city's median clear pixels are dropped |

**Caveats.** LST is the temperature of the ground and roofs, not the air. The gap also moves when the surroundings change: ploughing, irrigation or desertification (e.g. around Nukus and Kyzylorda as the Aral Sea dried up).



## Structure

```
index.html                         the map
assets/core.js                     CSV loading, statistics (Sen, Mann–Kendall), base map, charts
assets/style.css
data/region.json                   Natural Earth 1:50m country borders clipped to the region
data/demo_lst_summer_cities.csv    SYNTHETIC data for layout testing
gee/lst_cities.js                  Google Earth Engine script
scripts/make_demo_data.py          demo CSV generator
```

## Sources

- Wan, Z., Hook, S., Hulley, G. (2021). MODIS/Aqua LST/Emissivity 8-Day L3 Global 1km SIN Grid V061. NASA EOSDIS LP DAAC.
- Pesaresi M., Politis P. et al. (2023). GHS-SMOD R2023A — GHS settlement layers. European Commission, JRC.
- NASA SRTM v3 (USGS/SRTMGL1_003).
- Natural Earth via [world-atlas](https://github.com/topojson/world-atlas).
