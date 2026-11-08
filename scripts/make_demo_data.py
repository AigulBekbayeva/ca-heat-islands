"""Генерирует ДЕМО-данные в формате экспорта GEE (data/demo_lst_summer_cities.csv).

Это синтетика для проверки вёрстки — НЕ реальные измерения. Числа подобраны
правдоподобно (пустынные города днём «прохладнее» окрестностей, ночью все
города теплее), но сами тренды выдуманы. Когда в data/ появится настоящий
lst_summer_cities.csv из Earth Engine, сайт перестанет читать этот файл.

    python scripts/make_demo_data.py
"""
import csv
import random
from pathlib import Path

random.seed(9)

# name_en, name_ru, country, lat, lon, urban_km2,
# urban_day, suhi_day, urban_night, suhi_night (°C)
CITIES = [
    ("Almaty", "Алматы", "Kazakhstan", 43.2389, 76.8897, 320, 38, 1.5, 21, 2.4),
    ("Astana", "Астана", "Kazakhstan", 51.1694, 71.4491, 190, 35, 1.8, 16, 1.9),
    ("Shymkent", "Шымкент", "Kazakhstan", 42.3417, 69.5901, 150, 43, -0.8, 22, 2.1),
    ("Karaganda", "Караганда", "Kazakhstan", 49.8047, 73.1094, 110, 36, 1.2, 16, 1.5),
    ("Aktobe", "Актобе", "Kazakhstan", 50.2839, 57.1670, 90, 37, 0.9, 17, 1.6),
    ("Taraz", "Тараз", "Kazakhstan", 42.9000, 71.3667, 60, 41, -0.4, 20, 1.6),
    ("Pavlodar", "Павлодар", "Kazakhstan", 52.2873, 76.9674, 70, 34, 1.6, 15, 1.4),
    ("Oskemen", "Усть-Каменогорск", "Kazakhstan", 49.9483, 82.6279, 65, 33, 2.0, 15, 1.7),
    ("Semey", "Семей", "Kazakhstan", 50.4111, 80.2275, 55, 36, 0.8, 16, 1.4),
    ("Atyrau", "Атырау", "Kazakhstan", 47.0945, 51.9238, 50, 44, -2.6, 22, 1.8),
    ("Kostanay", "Костанай", "Kazakhstan", 53.2144, 63.6246, 55, 33, 1.7, 15, 1.3),
    ("Kyzylorda", "Кызылорда", "Kazakhstan", 44.8488, 65.4823, 45, 45, -2.2, 22, 1.5),
    ("Oral", "Уральск", "Kazakhstan", 51.2333, 51.3667, 55, 34, 1.4, 16, 1.4),
    ("Aktau", "Актау", "Kazakhstan", 43.6532, 51.1975, 40, 45, -3.4, 25, 1.2),
    ("Petropavl", "Петропавловск", "Kazakhstan", 54.8667, 69.1500, 45, 31, 1.9, 14, 1.2),
    ("Tashkent", "Ташкент", "Uzbekistan", 41.2995, 69.2401, 420, 42, 0.6, 24, 2.8),
    ("Samarkand", "Самарканд", "Uzbekistan", 39.6542, 66.9597, 95, 42, 0.2, 22, 2.0),
    ("Namangan", "Наманган", "Uzbekistan", 40.9983, 71.6726, 80, 40, 1.4, 22, 1.8),
    ("Andijan", "Андижан", "Uzbekistan", 40.7821, 72.3442, 70, 39, 1.6, 22, 1.7),
    ("Bukhara", "Бухара", "Uzbekistan", 39.7747, 64.4286, 55, 46, -1.8, 24, 1.9),
    ("Nukus", "Нукус", "Uzbekistan", 42.4600, 59.6100, 50, 44, -1.5, 22, 1.6),
    ("Fergana", "Фергана", "Uzbekistan", 40.3864, 71.7864, 60, 40, 1.1, 22, 1.7),
    ("Qarshi", "Карши", "Uzbekistan", 38.8606, 65.7891, 45, 47, -2.0, 24, 1.6),
    ("Bishkek", "Бишкек", "Kyrgyzstan", 42.8746, 74.5698, 170, 37, 1.9, 20, 2.3),
    ("Osh", "Ош", "Kyrgyzstan", 40.5283, 72.7985, 60, 38, 1.3, 21, 1.8),
    ("Dushanbe", "Душанбе", "Tajikistan", 38.5598, 68.7870, 120, 41, 0.9, 23, 2.2),
    ("Khujand", "Худжанд", "Tajikistan", 40.2826, 69.6222, 50, 43, -0.3, 24, 1.8),
    ("Ashgabat", "Ашхабад", "Turkmenistan", 37.9601, 58.3261, 160, 47, -3.0, 27, 2.5),
    ("Turkmenabat", "Туркменабат", "Turkmenistan", 39.0733, 63.5786, 45, 46, -2.4, 24, 1.5),
    ("Mary", "Мары", "Turkmenistan", 37.6000, 61.8333, 40, 47, -2.1, 24, 1.4),
]

YEARS = range(2003, 2026)
out = Path(__file__).resolve().parent.parent / "data" / "demo_lst_summer_cities.csv"

with out.open("w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["city", "city_ru", "country", "lat", "lon", "season", "year",
                "urban_day", "urban_night", "rural_day", "rural_night",
                "urban_px", "rural_px", "urban_km2", "urban_elev", "core_found"])
    for (en, ru, cc, lat, lon, km2, ud, sd, un, sn) in CITIES:
        regional = random.uniform(0.3, 0.8)          # потепление региона, °C/10 лет
        grow_day = random.gauss(0.25, 0.3)           # рост острова тепла днём, °C/10 лет
        grow_night = random.gauss(0.2, 0.15)         # и ночью
        rpx = random.randint(800, 3500)
        for y in YEARS:
            t = (y - 2014) / 10
            weather = random.gauss(0, 1.1)
            night_w = random.gauss(0, 0.6)
            r_day = ud - sd + regional * t + weather + random.gauss(0, 0.25)
            u_day = r_day + sd + grow_day * t + random.gauss(0, 0.35)
            r_night = un - sn + regional * 0.8 * t + night_w + random.gauss(0, 0.15)
            u_night = r_night + sn + grow_night * t + random.gauss(0, 0.2)
            w.writerow([en, ru, cc, lat, lon, "Jun-Aug", y,
                        round(u_day, 3), round(u_night, 3), round(r_day, 3), round(r_night, 3),
                        km2, rpx, km2, "", 1])
print("written", out)
