/* =========================================================================
   TALENOVA WEATHER PRO 3.5 — Complete Static Engine (GitHub Pages Ready)
   Zero API keys • Open-Meteo API • Three.js 3D Earth • Chart.js • Tactical Map
   ========================================================================= */
(() => {
  'use strict';

  const DEFAULT_CITIES = [
    { id: 'yokohama', name: 'Yokohama', country: 'Japan', lat: 35.4437, lon: 139.638 },
    { id: 'tokyo', name: 'Tokyo', country: 'Japan', lat: 35.6762, lon: 139.6503 },
    { id: 'osaka', name: 'Osaka', country: 'Japan', lat: 34.6937, lon: 135.5023 },
    { id: 'new-york', name: 'New York', country: 'USA', lat: 40.7128, lon: -74.006 },
    { id: 'london', name: 'London', country: 'UK', lat: 51.5072, lon: -0.1276 },
  ];

  const I18N = {
    en: {
      navHome: 'Home',
      navMap: 'Weather Map',
      navForecast: 'Forecast',
      navAI: 'AI Assistant',
      navSettings: 'Settings',
      savedCities: 'Saved Cities',
      feelsLike: 'Feels like',
      high: 'High',
      low: 'Low',
      windSpeed: 'Wind Speed',
      precipitation: 'Precipitation',
      visibility: 'Visibility',
      opticalRange: 'Optical Range',
      sunCycle: 'Sunrise / Sunset',
      hourlyForecast: 'Hourly Forecast (24h)',
      scrollHint: 'Swipe / Scroll →',
      sevenDayForecast: '7-Day Weather Forecast',
      tapDayDetails: 'Click a day for details',
      weatherMap: 'Weather Radar Map',
      viewMap: 'View Map',
      tempChart24h: '24-Hour Temperature Curve',
      atmosphericMatrix: 'Atmospheric & Air Quality Intelligence',
      humidity: 'Humidity',
      pressure: 'Pressure',
      cloudCover: 'Cloud Cover',
      windGusts: 'Wind Gusts',
      moonPhase: 'Moon Phase',
      aiTitle: 'Weather AI Assistant',
      aiSubtitle: 'Ask about rain, clothing, UV, travel, or compare cities!',
      offlineBanner: 'Offline mode: displaying cached weather telemetry.',
    },
    ja: {
      navHome: 'ホーム',
      navMap: '気象マップ',
      navForecast: '週間・分析',
      navAI: 'AIアシスタント',
      navSettings: '設定',
      savedCities: '登録都市',
      feelsLike: '体感温度',
      high: '最高',
      low: '最低',
      windSpeed: '風速・風向',
      precipitation: '降水量',
      visibility: '視程',
      opticalRange: '光学視界',
      sunCycle: '日の出 / 日の入',
      hourlyForecast: '24時間予報',
      scrollHint: '横スクロール →',
      sevenDayForecast: '7日間天気予報',
      tapDayDetails: '日付をタップして詳細表示',
      weatherMap: '気象レーダーマップ',
      viewMap: 'マップを開く',
      tempChart24h: '24時間気温グラフ',
      atmosphericMatrix: '大気・大気質インテリジェンス',
      humidity: '湿度',
      pressure: '気圧',
      cloudCover: '雲量',
      windGusts: '最大瞬間風速',
      moonPhase: '月齢',
      aiTitle: 'AI気象アシスタント',
      aiSubtitle: '雨の確率・服装・紫外線・旅行の天気を質問できます',
      offlineBanner: 'オフラインモード：キャッシュされた気象データを表示中',
    },
  };

  // Persistent State
  const state = {
    cities: loadJSON('talenova_cities', DEFAULT_CITIES),
    activeCityId: localStorage.getItem('talenova_active_city') || 'yokohama',
    weatherByCity: loadJSON('talenova_weather_cache', {}),
    tempUnit: localStorage.getItem('talenova_temp_unit') || 'C',
    windUnit: localStorage.getItem('talenova_wind_unit') || 'kmh',
    lang: localStorage.getItem('talenova_lang') || 'en',
    theme: localStorage.getItem('talenova_theme') || 'dark',
    activeView: 'home',
    selectedDayIdx: 0,
    voiceSpeak: true,
    ollama: loadJSON('talenova_ollama', { enabled: false, url: 'http://localhost:11434', model: 'llama3.2' }),
    globeOpts: { clouds: true, fx: true, grid: false, orbits: true },
    mapOpts: {
      basemap: 'satellite',
      layers: { precip: true, wind: true, clouds: false, temp: false, pressure: false, sweep: true },
      lat: 35.4437,
      lon: 139.638,
      zoom: 5,
      hourOffset: 0,
      playing: false,
    },
  };

  const inflightRequests = new Map();
  let searchController = null;
  let charts = { homeTemp: null, weeklyTrend: null, precipHumidity: null };
  let globeAPI = null;
  let mapAPI = null;

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function saveState() {
    try {
      localStorage.setItem('talenova_cities', JSON.stringify(state.cities));
      localStorage.setItem('talenova_active_city', state.activeCityId);
      localStorage.setItem('talenova_temp_unit', state.tempUnit);
      localStorage.setItem('talenova_wind_unit', state.windUnit);
      localStorage.setItem('talenova_lang', state.lang);
      localStorage.setItem('talenova_theme', state.theme);
      localStorage.setItem('talenova_ollama', JSON.stringify(state.ollama));
      localStorage.setItem('talenova_weather_cache', JSON.stringify(state.weatherByCity));
    } catch {
      // Ignore storage quota errors
    }
  }

  // Meteorological Helpers
  function mapWmoCode(code, isDay = 1) {
    const c = Number(code);
    if (c === 0) return { en: 'Clear Sky', ja: '快晴', icon: isDay ? '☀️' : '🌙', fx: 'sunny' };
    if (c === 1) return { en: 'Mainly Clear', ja: '晴れ', icon: isDay ? '🌤️' : '🌙', fx: 'sunny' };
    if (c === 2) return { en: 'Partly Cloudy', ja: '晴れ時々曇り', icon: isDay ? '⛅' : '☁️', fx: 'cloudy' };
    if (c === 3) return { en: 'Overcast', ja: '曇り', icon: '☁️', fx: 'cloudy' };
    if (c === 45 || c === 48) return { en: 'Foggy', ja: '霧', icon: '🌫️', fx: 'cloudy' };
    if ([51, 53, 55, 56, 57].includes(c)) return { en: 'Drizzle', ja: '霧雨', icon: '🌦️', fx: 'rain' };
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(c)) return { en: 'Rain', ja: '雨', icon: '🌧️', fx: 'rain' };
    if ([71, 73, 75, 77, 85, 86].includes(c)) return { en: 'Snow', ja: '雪', icon: '❄️', fx: 'snow' };
    if ([95, 96, 99].includes(c)) return { en: 'Thunderstorm', ja: '雷雨', icon: '⛈️', fx: 'rain' };
    return { en: 'Unavailable', ja: '不明', icon: '🌡️', fx: 'cloudy' };
  }

  function degToCompass(deg) {
    if (deg == null || Number.isNaN(deg)) return 'N/A';
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return dirs[Math.round(deg / 45) % 8];
  }

  function fmtTemp(c) {
    if (c == null || Number.isNaN(c)) return 'N/A';
    const val = state.tempUnit === 'F' ? (c * 9) / 5 + 32 : c;
    return `${Math.round(val)}°${state.tempUnit}`;
  }

  function rawTemp(c) {
    if (c == null || Number.isNaN(c)) return null;
    return state.tempUnit === 'F' ? Number(((c * 9) / 5 + 32).toFixed(1)) : Number(c.toFixed(1));
  }

  function fmtWind(kmh) {
    if (kmh == null || Number.isNaN(kmh)) return 'N/A';
    if (state.windUnit === 'mph') return `${Math.round(kmh * 0.621371)} mph`;
    if (state.windUnit === 'ms') return `${(kmh / 3.6).toFixed(1)} m/s`;
    return `${Math.round(kmh)} km/h`;
  }

  function getMoonPhase() {
    const synodic = 29.53058867;
    const knownNew = Date.UTC(2000, 0, 6, 18, 14, 0);
    const phase = (((Date.now() - knownNew) / 86400000) % synodic + synodic) % synodic;
    if (phase < 1.85) return '🌑 New Moon';
    if (phase < 7.38) return '🌒 Waxing Crescent';
    if (phase < 9.23) return '🌓 First Quarter';
    if (phase < 14.77) return '🌔 Waxing Gibbous';
    if (phase < 16.61) return '🌕 Full Moon';
    if (phase < 22.15) return '🌖 Waning Gibbous';
    if (phase < 24.0) return '🌗 Last Quarter';
    return '🌘 Waning Crescent';
  }

  function getAqiLabel(aqi) {
    if (aqi == null) return 'Unavailable';
    if (aqi <= 50) return 'Good';
    if (aqi <= 100) return 'Moderate';
    if (aqi <= 150) return 'Sensitive';
    return 'Unhealthy';
  }

  function getUvLabel(uv) {
    if (uv == null) return 'Unavailable';
    if (uv < 3) return 'Low';
    if (uv < 6) return 'Moderate';
    if (uv < 8) return 'High';
    return 'Very High';
  }

  function getActiveCity() {
    return state.cities.find((c) => c.id === state.activeCityId) || state.cities[0];
  }

  function showStatusError(msg, retryFn) {
    const bar = document.getElementById('api-status-bar');
    bar.classList.remove('hidden');
    bar.innerHTML = `<span>${msg}</span>${retryFn ? '<button id="retry-api-btn" class="chip-btn">Retry</button>' : ''}`;
    if (retryFn) {
      document.getElementById('retry-api-btn')?.addEventListener('click', () => {
        bar.classList.add('hidden');
        retryFn();
      });
    }
  }

  function hideStatusError() {
    document.getElementById('api-status-bar')?.classList.add('hidden');
  }

  // =========================================================================
  // OPEN-METEO API ENGINE (Forecast + 7-Day + Air Quality + Deduplication)
  // =========================================================================
  async function fetchCityWeather(city, force = false) {
    const cached = state.weatherByCity[city.id];
    if (!force && cached && Date.now() - cached.fetchedAt < 5 * 60 * 1000) {
      return cached;
    }
    if (inflightRequests.has(city.id)) {
      return inflightRequests.get(city.id);
    }

    const promise = (async () => {
      const fUrl =
        `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}` +
        `&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m` +
        `&hourly=temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,weather_code,cloud_cover,visibility,wind_speed_10m,wind_direction_10m,uv_index` +
        `&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max` +
        `&timezone=auto&forecast_days=7`;

      const aqiUrl =
        `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${city.lat}&longitude=${city.lon}` +
        `&current=us_aqi,pm2_5,pm10&timezone=auto`;

      const [fRes, aqiRes] = await Promise.all([
        fetch(fUrl),
        fetch(aqiUrl).catch(() => null),
      ]);

      if (!fRes.ok) throw new Error(`Open-Meteo HTTP ${fRes.status}`);
      const fData = await fRes.json();
      const aqiData = aqiRes && aqiRes.ok ? await aqiRes.json() : null;

      // Align 24h hourly slice to city's local current timestamp
      const curTime = fData.current?.time || '';
      const curHourPrefix = curTime.slice(0, 13);
      let startIdx = (fData.hourly?.time || []).findIndex((t) => t.startsWith(curHourPrefix));
      if (startIdx < 0) startIdx = 0;

      const hourly24 = [];
      for (let i = startIdx; i < Math.min(startIdx + 24, (fData.hourly?.time || []).length); i++) {
        hourly24.push({
          time: fData.hourly.time[i],
          hourLabel: i === startIdx ? (state.lang === 'ja' ? '現在' : 'Now') : fData.hourly.time[i].slice(11, 16),
          temp: fData.hourly.temperature_2m?.[i] ?? null,
          humidity: fData.hourly.relative_humidity_2m?.[i] ?? null,
          precipProb: fData.hourly.precipitation_probability?.[i] ?? null,
          precip: fData.hourly.precipitation?.[i] ?? null,
          code: fData.hourly.weather_code?.[i] ?? null,
          cloud: fData.hourly.cloud_cover?.[i] ?? null,
          visibility: fData.hourly.visibility?.[i] ?? null,
          wind: fData.hourly.wind_speed_10m?.[i] ?? null,
          windDir: fData.hourly.wind_direction_10m?.[i] ?? null,
          uv: fData.hourly.uv_index?.[i] ?? null,
        });
      }

      const daily7 = (fData.daily?.time || []).map((dateStr, i) => ({
        date: dateStr,
        code: fData.daily.weather_code?.[i] ?? null,
        max: fData.daily.temperature_2m_max?.[i] ?? null,
        min: fData.daily.temperature_2m_min?.[i] ?? null,
        sunrise: fData.daily.sunrise?.[i]?.slice(11, 16) ?? 'N/A',
        sunset: fData.daily.sunset?.[i]?.slice(11, 16) ?? 'N/A',
        uvMax: fData.daily.uv_index_max?.[i] ?? null,
        precipSum: fData.daily.precipitation_sum?.[i] ?? null,
        precipProb: fData.daily.precipitation_probability_max?.[i] ?? null,
        windMax: fData.daily.wind_speed_10m_max?.[i] ?? null,
      }));

      const normalized = {
        fetchedAt: Date.now(),
        timezone: fData.timezone || 'Local',
        current: {
          time: curTime,
          temp: fData.current?.temperature_2m ?? null,
          feels: fData.current?.apparent_temperature ?? null,
          humidity: fData.current?.relative_humidity_2m ?? null,
          isDay: fData.current?.is_day ?? 1,
          precip: fData.current?.precipitation ?? null,
          code: fData.current?.weather_code ?? null,
          cloud: fData.current?.cloud_cover ?? null,
          pressure: fData.current?.surface_pressure ?? null,
          wind: fData.current?.wind_speed_10m ?? null,
          windDir: fData.current?.wind_direction_10m ?? null,
          gusts: fData.current?.wind_gusts_10m ?? null,
          visibility: hourly24[0]?.visibility ?? null,
          uv: hourly24[0]?.uv ?? null,
          precipProb: hourly24[0]?.precipProb ?? null,
        },
        aqi: {
          usAqi: aqiData?.current?.us_aqi ?? null,
          pm25: aqiData?.current?.pm2_5 ?? null,
          pm10: aqiData?.current?.pm10 ?? null,
        },
        hourly24,
        daily7,
      };

      state.weatherByCity[city.id] = normalized;
      saveState();
      return normalized;
    })();

    inflightRequests.set(city.id, promise);
    try {
      return await promise;
    } finally {
      inflightRequests.delete(city.id);
    }
  }

  // =========================================================================
  // UI RENDERING
  // =========================================================================
  function applyThemeAndLang() {
    document.documentElement.setAttribute('data-theme', state.theme);
    document.getElementById('btn-unit').textContent = `°${state.tempUnit}`;
    document.getElementById('btn-lang').textContent = state.lang.toUpperCase();
    document.getElementById('set-temp-unit').value = state.tempUnit;
    document.getElementById('set-wind-unit').value = state.windUnit;
    document.getElementById('set-lang').value = state.lang;
    document.getElementById('set-theme').value = state.theme;
    document.getElementById('set-ollama-enabled').checked = !!state.ollama.enabled;
    document.getElementById('set-ollama-url').value = state.ollama.url || 'http://localhost:11434';
    document.getElementById('set-ollama-model').value = state.ollama.model || 'llama3.2';

    const dict = I18N[state.lang] || I18N.en;
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (dict[key]) el.textContent = dict[key];
    });
  }

  function renderCityLists() {
    const sideList = document.getElementById('sidebar-city-list');
    const mobileChips = document.getElementById('mobile-city-chips');
    sideList.innerHTML = '';
    mobileChips.innerHTML = '';

    state.cities.forEach((city) => {
      const w = state.weatherByCity[city.id];
      const tempText = w ? fmtTemp(w.current.temp) : '--°';
      const isActive = city.id === state.activeCityId;

      const row = document.createElement('button');
      row.className = `city-row${isActive ? ' active' : ''}`;
      row.innerHTML = `<span class="city-row-name">${city.name}</span><span class="city-row-temp">${tempText}</span>`;
      row.addEventListener('click', () => selectCity(city.id));
      sideList.appendChild(row);

      const chip = document.createElement('button');
      chip.className = `chip-btn${isActive ? ' active' : ''}`;
      chip.textContent = `${city.name} ${tempText}`;
      chip.addEventListener('click', () => selectCity(city.id));
      mobileChips.appendChild(chip);
    });
  }

  function renderDashboard() {
    const city = getActiveCity();
    const w = state.weatherByCity[city.id];
    document.getElementById('current-city-name').textContent = `${city.name}, ${city.country}`;
    document.getElementById('globe-target-label').textContent = `TARGET: ${city.name.toUpperCase()}`;

    if (!w) {
      document.getElementById('current-temp').textContent = '--°';
      document.getElementById('current-condition').textContent = 'Unavailable / Loading...';
      return;
    }

    const meta = mapWmoCode(w.current.code, w.current.isDay);
    const today = w.daily7[0] || {};

    document.getElementById('current-weather-icon').textContent = meta.icon;
    document.getElementById('current-temp').textContent = fmtTemp(w.current.temp);
    document.getElementById('current-condition').textContent = state.lang === 'ja' ? meta.ja : meta.en;
    document.getElementById('current-feels').textContent = fmtTemp(w.current.feels);
    document.getElementById('current-high').textContent = fmtTemp(today.max);
    document.getElementById('current-low').textContent = fmtTemp(today.min);
    document.getElementById('current-local-time').textContent = w.current.time ? w.current.time.slice(11, 16) : '--:--';
    document.getElementById('current-updated').textContent = `Updated ${new Date(w.fetchedAt).toLocaleTimeString()} (${w.timezone})`;
    document.getElementById('globe-cloud-readout').textContent = `Cloud Cover: ${w.current.cloud ?? 'N/A'}%`;

    // 4 Weather Intelligence Cards
    document.getElementById('intel-wind').textContent = fmtWind(w.current.wind);
    document.getElementById('intel-wind-dir').textContent = `${degToCompass(w.current.windDir)} (${w.current.windDir ?? '--'}°)`;
    document.getElementById('intel-precip').textContent = w.current.precip != null ? `${w.current.precip} mm` : 'N/A';
    document.getElementById('intel-precip-prob').textContent = `${w.current.precipProb ?? '--'}% probability`;
    document.getElementById('intel-visibility').textContent =
      w.current.visibility != null ? `${(w.current.visibility / 1000).toFixed(1)} km` : 'Unavailable';
    document.getElementById('intel-sunrise').textContent = `☀ ${today.sunrise || 'N/A'}`;
    document.getElementById('intel-sunset').textContent = `🌇 ${today.sunset || 'N/A'}`;

    // Atmospheric Matrix
    document.getElementById('m-aqi').textContent = w.aqi.usAqi ?? 'N/A';
    document.getElementById('m-aqi-label').textContent = getAqiLabel(w.aqi.usAqi);
    document.getElementById('m-uv').textContent = w.current.uv != null ? w.current.uv.toFixed(1) : 'N/A';
    document.getElementById('m-uv-label').textContent = getUvLabel(w.current.uv);
    document.getElementById('m-humidity').textContent = w.current.humidity != null ? `${w.current.humidity}%` : 'N/A';
    document.getElementById('m-pressure').textContent = w.current.pressure != null ? `${Math.round(w.current.pressure)} hPa` : 'N/A';
    document.getElementById('m-cloud').textContent = w.current.cloud != null ? `${w.current.cloud}%` : 'N/A';
    document.getElementById('m-gusts').textContent = fmtWind(w.current.gusts);
    document.getElementById('m-pm').textContent =
      w.aqi.pm25 != null ? `${w.aqi.pm25.toFixed(1)} / ${(w.aqi.pm10 ?? 0).toFixed(1)}` : 'N/A';
    document.getElementById('m-moon').textContent = getMoonPhase();

    // 24-Hour Strip
    const strip = document.getElementById('hourly-strip');
    strip.innerHTML = '';
    w.hourly24.forEach((h, idx) => {
      const hm = mapWmoCode(h.code, 1);
      const card = document.createElement('div');
      card.className = `hour-card${idx === 0 ? ' active' : ''}`;
      card.innerHTML = `
        <span class="muted-xs">${h.hourLabel}</span>
        <span style="font-size:1.5rem">${hm.icon}</span>
        <strong>${fmtTemp(h.temp)}</strong>
        <span class="muted-xs" style="color:#38bdf8">${h.precipProb ?? 0}%</span>
      `;
      card.addEventListener('click', () => {
        strip.querySelectorAll('.hour-card').forEach((c) => c.classList.remove('active'));
        card.classList.add('active');
      });
      strip.appendChild(card);
    });

    // 7-Day Forecast Rail
    const rail = document.getElementById('seven-day-rail');
    rail.innerHTML = '';
    w.daily7.forEach((d, idx) => {
      const dm = mapWmoCode(d.code, 1);
      const dt = new Date(`${d.date}T12:00:00`);
      const dayName = idx === 0 ? (state.lang === 'ja' ? '今日' : 'Today') : dt.toLocaleDateString(state.lang === 'ja' ? 'ja-JP' : 'en-US', { weekday: 'short' });
      const card = document.createElement('div');
      card.className = `day-card${idx === state.selectedDayIdx ? ' active' : ''}`;
      card.innerHTML = `
        <strong>${dayName}</strong>
        <span class="muted-xs">${d.date.slice(5)}</span>
        <span style="font-size:1.7rem">${dm.icon}</span>
        <span class="muted-xs">${state.lang === 'ja' ? dm.ja : dm.en}</span>
        <div><strong>${fmtTemp(d.max)}</strong> <span class="muted-xs">${fmtTemp(d.min)}</span></div>
        <span class="muted-xs" style="color:#38bdf8">💧 ${d.precipProb ?? 0}% (${d.precipSum ?? 0}mm)</span>
      `;
      card.addEventListener('click', () => {
        state.selectedDayIdx = idx;
        renderDashboard();
      });
      rail.appendChild(card);
    });

    // Selected Day Expandable Detail Drawer
    const selDay = w.daily7[state.selectedDayIdx] || w.daily7[0];
    const drawer = document.getElementById('seven-day-detail');
    if (selDay) {
      drawer.classList.remove('hidden');
      drawer.innerHTML = `
        <div><span class="muted-xs">Date</span><div><strong>${selDay.date}</strong></div></div>
        <div><span class="muted-xs">Max / Min</span><div><strong>${fmtTemp(selDay.max)} / ${fmtTemp(selDay.min)}</strong></div></div>
        <div><span class="muted-xs">Rain Sum &amp; Prob</span><div><strong>${selDay.precipSum ?? 0} mm (${selDay.precipProb ?? 0}%)</strong></div></div>
        <div><span class="muted-xs">Peak Wind</span><div><strong>${fmtWind(selDay.windMax)}</strong></div></div>
        <div><span class="muted-xs">Max UV Index</span><div><strong>${selDay.uvMax ?? 'N/A'}</strong></div></div>
        <div><span class="muted-xs">Daylight</span><div><strong>${selDay.sunrise} – ${selDay.sunset}</strong></div></div>
      `;
    }

    renderCharts(w);
    renderComparisonTable();
    renderHomeMapPreview(city, w);

    if (globeAPI) {
      globeAPI.focusCity(city, w);
    }
    if (mapAPI) {
      mapAPI.updateWeather(city, w);
    }
  }

  // =========================================================================
  // CHART.JS VISUALIZATIONS (24h Temp, 7-Day Trend, Rain/Humidity)
  // =========================================================================
  function renderCharts(w) {
    if (typeof Chart === 'undefined' || !w) return;
    document.getElementById('chart-unit-label').textContent = `°${state.tempUnit}`;
    const tickColor = state.theme === 'light' ? '#4a648a' : '#a9c5e8';
    const gridColor = state.theme === 'light' ? 'rgba(15,45,95,0.08)' : 'rgba(148,197,255,0.12)';

    // 1. 24-Hour Temperature Chart
    const ctx1 = document.getElementById('home-temp-chart');
    if (ctx1) {
      charts.homeTemp?.destroy();
      const labels = w.hourly24.filter((_, i) => i % 2 === 0).map((h) => h.hourLabel);
      const temps = w.hourly24.filter((_, i) => i % 2 === 0).map((h) => rawTemp(h.temp));
      charts.homeTemp = new Chart(ctx1, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: `Temp (°${state.tempUnit})`,
            data: temps,
            borderColor: '#00d9ff',
            backgroundColor: 'rgba(0, 217, 255, 0.18)',
            borderWidth: 2.5,
            fill: true,
            tension: 0.42,
            pointRadius: 3.5,
            pointBackgroundColor: '#ffffff',
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: tickColor }, grid: { color: gridColor } },
            y: { ticks: { color: tickColor }, grid: { color: gridColor } },
          },
        },
      });
    }

    // 2. 7-Day High/Low Trend
    const ctx2 = document.getElementById('weekly-trend-chart');
    if (ctx2) {
      charts.weeklyTrend?.destroy();
      charts.weeklyTrend = new Chart(ctx2, {
        type: 'line',
        data: {
          labels: w.daily7.map((d) => d.date.slice(5)),
          datasets: [
            { label: 'High', data: w.daily7.map((d) => rawTemp(d.max)), borderColor: '#38bdf8', tension: 0.35, borderWidth: 2.5 },
            { label: 'Low', data: w.daily7.map((d) => rawTemp(d.min)), borderColor: '#818cf8', tension: 0.35, borderWidth: 2.5 },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { labels: { color: tickColor } } },
          scales: {
            x: { ticks: { color: tickColor }, grid: { color: gridColor } },
            y: { ticks: { color: tickColor }, grid: { color: gridColor } },
          },
        },
      });
    }

    // 3. 12-Hour Precipitation & Humidity
    const ctx3 = document.getElementById('precip-humidity-chart');
    if (ctx3) {
      charts.precipHumidity?.destroy();
      const slice12 = w.hourly24.slice(0, 12);
      charts.precipHumidity = new Chart(ctx3, {
        type: 'bar',
        data: {
          labels: slice12.map((h) => h.hourLabel),
          datasets: [
            { label: 'Rain Prob %', data: slice12.map((h) => h.precipProb ?? 0), backgroundColor: 'rgba(0, 217, 255, 0.72)', borderRadius: 6 },
            { label: 'Humidity %', data: slice12.map((h) => h.humidity ?? 0), backgroundColor: 'rgba(8, 124, 255, 0.45)', borderRadius: 6 },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { labels: { color: tickColor } } },
          scales: {
            x: { ticks: { color: tickColor }, grid: { color: gridColor } },
            y: { max: 100, ticks: { color: tickColor }, grid: { color: gridColor } },
          },
        },
      });
    }
  }

  function renderComparisonTable() {
    const tbody = document.getElementById('cities-comparison-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    state.cities.forEach((city) => {
      const w = state.weatherByCity[city.id];
      const tr = document.createElement('tr');
      const cond = w ? mapWmoCode(w.current.code, w.current.isDay) : null;
      const today = w?.daily7?.[0];
      tr.innerHTML = `
        <td><strong>${city.name}</strong> <span class="muted-xs">${city.country}</span></td>
        <td>${cond ? `${cond.icon} ${state.lang === 'ja' ? cond.ja : cond.en}` : 'Loading...'}</td>
        <td><strong>${w ? fmtTemp(w.current.temp) : '--'}</strong></td>
        <td>${today ? `${fmtTemp(today.max)} / ${fmtTemp(today.min)}` : '--'}</td>
        <td>${w ? fmtWind(w.current.wind) : '--'}</td>
        <td>${w?.current.precipProb != null ? `${w.current.precipProb}%` : '--'}</td>
        <td><button class="chip-btn">Focus</button></td>
      `;
      tr.querySelector('button').addEventListener('click', () => {
        selectCity(city.id);
        switchView('home');
      });
      tbody.appendChild(tr);
    });
  }

  // =========================================================================
  // INTERACTIVE 3D HOLOGRAPHIC EARTH (Three.js, Procedural High-Res, Zero 404s)
  // =========================================================================
  function initEarth3D() {
    const container = document.getElementById('earth-canvas-container');
    if (!container || typeof THREE === 'undefined') return null;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, container.clientWidth / container.clientHeight, 0.1, 100);
    camera.position.set(0, 0, 4.1);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.96;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Lighting
    scene.add(new THREE.AmbientLight(0x8bb8ff, 0.52));
    const sunLight = new THREE.DirectionalLight(0xffffff, 1.45);
    sunLight.position.set(5, 2.5, 4.5);
    scene.add(sunLight);

    // Procedural Satellite Earth Texture (2048x1024 — zero external CDN 404s)
    const earthCanvas = document.createElement('canvas');
    earthCanvas.width = 1024;
    earthCanvas.height = 512;
    const ectx = earthCanvas.getContext('2d');
    const oceanGrad = ectx.createLinearGradient(0, 0, 0, 512);
    oceanGrad.addColorStop(0, '#09234a');
    oceanGrad.addColorStop(0.5, '#051a3d');
    oceanGrad.addColorStop(1, '#09234a');
    ectx.fillStyle = oceanGrad;
    ectx.fillRect(0, 0, 1024, 512);

    // Simplified realistic continents (lon -> x, lat -> y)
    const ll = (lon, lat) => [((lon + 180) / 360) * 1024, ((90 - lat) / 180) * 512];
    const landPolys = [
      // North America
      [[-168,66],[-140,70],[-95,68],[-60,50],[-75,35],[-82,25],[-98,20],[-105,20],[-124,42],[-135,58]],
      // South America
      [[-80,10],[-60,8],[-35,-6],[-42,-24],[-58,-38],[-68,-54],[-74,-40],[-81,-5]],
      // Europe
      [[-10,36],[0,44],[10,56],[28,68],[50,65],[45,46],[28,40],[14,42],[0,36]],
      // Africa
      [[-16,16],[10,36],[32,31],[43,12],[51,10],[40,-12],[20,-35],[12,-18],[8,4],[-8,6]],
      // Asia
      [[35,42],[60,68],[110,72],[168,66],[142,50],[122,38],[120,22],[105,10],[98,20],[78,8],[66,24],[48,28]],
      // Japan
      [[130,31],[136,34],[141,36],[145,44],[140,42],[135,36]],
      // Australia
      [[114,-22],[132,-12],[152,-25],[148,-38],[132,-34],[115,-34]],
      // Greenland
      [[-52,60],[-20,72],[-25,82],[-55,78]],
    ];

    ectx.lineJoin = 'round';
    landPolys.forEach((poly) => {
      ectx.beginPath();
      poly.forEach(([lo, la], i) => {
        const [x, y] = ll(lo, la);
        if (i === 0) ectx.moveTo(x, y);
        else ectx.lineTo(x, y);
      });
      ectx.closePath();
      ectx.strokeStyle = 'rgba(34, 211, 238, 0.35)';
      ectx.lineWidth = 5;
      ectx.stroke();
      const lg = ectx.createLinearGradient(0, 60, 0, 440);
      lg.addColorStop(0, '#4f6d48');
      lg.addColorStop(0.35, '#3b6e42');
      lg.addColorStop(0.55, '#8c7a52');
      lg.addColorStop(0.8, '#2d5a3b');
      lg.addColorStop(1, '#d8e4f0');
      ectx.fillStyle = lg;
      ectx.fill();
    });

    // Polar Ice Caps
    ectx.fillStyle = 'rgba(226, 240, 255, 0.85)';
    ectx.fillRect(0, 0, 1024, 24);
    ectx.fillRect(0, 482, 1024, 30);

    const earthTex = new THREE.CanvasTexture(earthCanvas);
    earthTex.colorSpace = THREE.SRGBColorSpace;

    // Cloud Texture with Cyclone Swirls
    const cloudCanvas = document.createElement('canvas');
    cloudCanvas.width = 1024;
    cloudCanvas.height = 512;
    const cctx = cloudCanvas.getContext('2d');
    for (let i = 0; i < 420; i++) {
      const cx = Math.random() * 1024;
      const cy = 40 + Math.random() * 430;
      const rx = 18 + Math.random() * 65;
      const ry = 6 + Math.random() * 20;
      const g = cctx.createRadialGradient(cx, cy, 2, cx, cy, rx);
      g.addColorStop(0, 'rgba(255,255,255,0.42)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      cctx.fillStyle = g;
      cctx.beginPath();
      cctx.ellipse(cx, cy, rx, ry, (Math.random() - 0.5) * 0.5, 0, Math.PI * 2);
      cctx.fill();
    }
    const cloudTex = new THREE.CanvasTexture(cloudCanvas);

    const segs = window.innerWidth < 768 ? 48 : 64;
    const globeGroup = new THREE.Group();
    scene.add(globeGroup);

    const earthMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1.34, segs, segs),
      new THREE.MeshPhongMaterial({ map: earthTex, specular: new THREE.Color(0x1e40af), shininess: 18 })
    );
    globeGroup.add(earthMesh);

    const cloudMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1.365, segs, segs),
      new THREE.MeshLambertMaterial({ map: cloudTex, transparent: true, opacity: 0.65, depthWrite: false })
    );
    globeGroup.add(cloudMesh);

    // Subtle Cyan Atmospheric Rim
    const atmoMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1.42, 48, 48),
      new THREE.MeshBasicMaterial({ color: 0x00d9ff, transparent: true, opacity: 0.14, side: THREE.BackSide })
    );
    globeGroup.add(atmoMesh);

    // Holographic Lat/Lon Wireframe Grid
    const gridMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1.375, 24, 12),
      new THREE.MeshBasicMaterial({ color: 0x00d9ff, wireframe: true, transparent: true, opacity: 0.18 })
    );
    gridMesh.visible = state.globeOpts.grid;
    globeGroup.add(gridMesh);

    // Glowing Orbital Rings
    const orbitGroup = new THREE.Group();
    const ringGeo1 = new THREE.RingGeometry(1.62, 1.635, 96);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00d9ff, side: THREE.DoubleSide, transparent: true, opacity: 0.45 });
    const ring1 = new THREE.Mesh(ringGeo1, ringMat);
    ring1.rotation.x = Math.PI / 2.3;
    ring1.rotation.y = 0.25;
    orbitGroup.add(ring1);

    const ring2 = new THREE.Mesh(new THREE.RingGeometry(1.76, 1.77, 96), ringMat.clone());
    ring2.material.opacity = 0.25;
    ring2.rotation.x = Math.PI / 1.8;
    ring2.rotation.y = -0.35;
    orbitGroup.add(ring2);
    globeGroup.add(orbitGroup);

    // Target City Beacon
    const markerGroup = new THREE.Group();
    const pinDot = new THREE.Mesh(
      new THREE.SphereGeometry(0.036, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0x00ffff })
    );
    const pinRing = new THREE.Mesh(
      new THREE.RingGeometry(0.055, 0.08, 24),
      new THREE.MeshBasicMaterial({ color: 0x00d9ff, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
    );
    markerGroup.add(pinDot, pinRing);
    globeGroup.add(markerGroup);

    // Weather-Responsive 3D Particle System (Rain / Snow / Solar Motes)
    const fxCount = 140;
    const fxPos = new Float32Array(fxCount * 3);
    for (let i = 0; i < fxCount; i++) {
      const r = 1.46 + Math.random() * 0.36;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      fxPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      fxPos[i * 3 + 1] = r * Math.cos(phi);
      fxPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const fxGeo = new THREE.BufferGeometry();
    fxGeo.setAttribute('position', new THREE.BufferAttribute(fxPos, 3));
    const fxMat = new THREE.PointsMaterial({ color: 0x38bdf8, size: 0.035, transparent: true, opacity: 0.75 });
    const fxPoints = new THREE.Points(fxGeo, fxMat);
    scene.add(fxPoints);

    function latLonToVec3(lat, lon, r) {
      const phi = (90 - lat) * (Math.PI / 180);
      const theta = (lon + 180) * (Math.PI / 180);
      return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
    }

    let targetRotY = 0;
    let targetRotX = 0.25;
    let dragging = false;
    let prevX = 0;
    let prevY = 0;
    let isVisible = true;
    let fxMode = 'cloudy';

    const dom = renderer.domElement;
    dom.addEventListener('pointerdown', (e) => {
      dragging = true;
      prevX = e.clientX;
      prevY = e.clientY;
    });
    window.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      targetRotY += (e.clientX - prevX) * 0.008;
      targetRotX = Math.max(-1.1, Math.min(1.1, targetRotX + (e.clientY - prevY) * 0.008));
      prevX = e.clientX;
      prevY = e.clientY;
    });
    window.addEventListener('pointerup', () => { dragging = false; });
    dom.addEventListener('wheel', (e) => {
      e.preventDefault();
      camera.position.z = Math.max(2.6, Math.min(6.0, camera.position.z + e.deltaY * 0.002));
    }, { passive: false });

    const observer = new IntersectionObserver((entries) => {
      isVisible = entries[0]?.isIntersecting ?? true;
    });
    observer.observe(container);

    window.addEventListener('resize', () => {
      if (!container.clientWidth) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    });

    function animate() {
      requestAnimationFrame(animate);
      if (!isVisible || document.hidden) return;
      if (!dragging) targetRotY += 0.0014;

      globeGroup.rotation.y += (targetRotY - globeGroup.rotation.y) * 0.07;
      globeGroup.rotation.x += (targetRotX - globeGroup.rotation.x) * 0.07;
      cloudMesh.rotation.y += 0.0006;
      orbitGroup.rotation.z += 0.0012;

      if (state.globeOpts.fx) {
        fxPoints.visible = true;
        fxPoints.rotation.y += fxMode === 'rain' ? 0.012 : 0.004;
      } else {
        fxPoints.visible = false;
      }
      renderer.render(scene, camera);
    }
    animate();

    return {
      focusCity(city, w) {
        const pos = latLonToVec3(city.lat, city.lon, 1.36);
        markerGroup.position.copy(pos);
        markerGroup.lookAt(0, 0, 0);
        targetRotY = -((city.lon + 90) * Math.PI) / 180;
        targetRotX = (city.lat * Math.PI) / 240;

        if (w) {
          const meta = mapWmoCode(w.current.code, w.current.isDay);
          fxMode = meta.fx;
          const cloudFrac = (w.current.cloud ?? 40) / 100;
          cloudMesh.material.opacity = state.globeOpts.clouds ? Math.max(0.12, Math.min(0.88, cloudFrac)) : 0;
          fxMat.color.setHex(fxMode === 'sunny' ? 0xfbbf24 : fxMode === 'snow' ? 0xffffff : 0x38bdf8);
          document.getElementById('globe-fx-badge').textContent = `3D FX: ${meta.en} • Cloud ${w.current.cloud ?? 0}%`;
        }
      },
      syncToggles() {
        cloudMesh.visible = state.globeOpts.clouds;
        gridMesh.visible = state.globeOpts.grid;
        orbitGroup.visible = state.globeOpts.orbits;
        fxPoints.visible = state.globeOpts.fx;
      },
    };
  }

  // =========================================================================
  // GLOBAL WEATHER & FORECAST RADAR TACTICAL MAP (Slippy Tiles + Vector Fallback)
  // =========================================================================
  const BASEMAPS = {
    satellite: {
      url: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
      maxNativeZoom: 16,
      attr: 'Tiles: Esri World Imagery • Forecast Field: Open-Meteo (CC BY 4.0)',
    },
    dark: {
      url: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/${z}/${y}/${x}`,
      maxNativeZoom: 16,
      attr: 'Tiles: Esri Dark Gray Canvas • Forecast Field: Open-Meteo (CC BY 4.0)',
    },
    street: {
      url: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/${z}/${y}/${x}`,
      maxNativeZoom: 17,
      attr: 'Tiles: Esri World Street Map • Forecast Field: Open-Meteo (CC BY 4.0)',
    },
    terrain: {
      url: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Physical_Map/MapServer/tile/${z}/${y}/${x}`,
      maxNativeZoom: 8,
      attr: 'Tiles: Esri World Physical • Forecast Field: Open-Meteo (CC BY 4.0)',
    },
    vector: {
      url: null,
      maxNativeZoom: 12,
      attr: 'Offline Vector Coastlines • Forecast Field: Open-Meteo (CC BY 4.0)',
    },
  };

  function initTacticalMap() {
    const canvas = document.getElementById('tactical-map-canvas');
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    const tileCache = new Map();
    let tileErrors = 0;
    let sweepAngle = 0;
    let dragging = false;
    let dragStart = null;
    let playTimer = null;

    const particles = Array.from({ length: 85 }, () => ({
      x: Math.random(),
      y: Math.random(),
      age: Math.random() * 60,
    }));

    function resize() {
      const rect = canvas.parentElement.getBoundingClientRect();
      canvas.width = Math.max(300, rect.width);
      canvas.height = Math.max(300, rect.height);
    }

    function lon2x(lon, z) {
      return ((lon + 180) / 360) * Math.pow(2, z) * 256;
    }
    function lat2y(lat, z) {
      const rad = (lat * Math.PI) / 180;
      return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, z) * 256;
    }
    function screenToLatLon(sx, sy) {
      const z = state.mapOpts.zoom;
      const cx = lon2x(state.mapOpts.lon, z);
      const cy = lat2y(state.mapOpts.lat, z);
      const wx = cx + (sx - canvas.width / 2);
      const wy = cy + (sy - canvas.height / 2);
      const n = Math.pow(2, z) * 256;
      const lon = (wx / n) * 360 - 180;
      const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * wy) / n)));
      return { lat: (latRad * 180) / Math.PI, lon };
    }

    function draw() {
      requestAnimationFrame(draw);
      if (state.activeView !== 'map' || document.hidden) return;
      if (canvas.width < 10) resize();

      const w = canvas.width;
      const h = canvas.height;
      const z = state.mapOpts.zoom;
      const bm = BASEMAPS[state.mapOpts.basemap] || BASEMAPS.satellite;
      const effZ = Math.min(z, bm.maxNativeZoom);
      const scale = Math.pow(2, z - effZ);
      const cx = lon2x(state.mapOpts.lon, z);
      const cy = lat2y(state.mapOpts.lat, z);

      ctx.fillStyle = '#031024';
      ctx.fillRect(0, 0, w, h);

      // Draw Slippy Map Tiles
      if (bm.url) {
        const tilePx = 256 * scale;
        const minTX = Math.floor((cx - w / 2) / tilePx);
        const maxTX = Math.floor((cx + w / 2) / tilePx);
        const minTY = Math.floor((cy - h / 2) / tilePx);
        const maxTY = Math.floor((cy + h / 2) / tilePx);
        const maxIdx = Math.pow(2, effZ);

        for (let tx = minTX; tx <= maxTX; tx++) {
          for (let ty = minTY; ty <= maxTY; ty++) {
            if (ty < 0 || ty >= maxIdx) continue;
            const wrapX = ((tx % maxIdx) + maxIdx) % maxIdx;
            const key = `${state.mapOpts.basemap}_${effZ}_${wrapX}_${ty}`;
            let img = tileCache.get(key);
            if (!img) {
              img = new Image();
              img.crossOrigin = 'anonymous';
              img.onerror = () => {
                tileErrors++;
                if (tileErrors >= 3) document.getElementById('map-tile-warning').classList.remove('hidden');
              };
              img.src = bm.url(effZ, wrapX, ty);
              tileCache.set(key, img);
            }
            const dx = Math.round(tx * tilePx - cx + w / 2);
            const dy = Math.round(ty * tilePx - cy + h / 2);
            if (img.complete && img.naturalWidth > 0) {
              ctx.drawImage(img, dx, dy, Math.ceil(tilePx), Math.ceil(tilePx));
            }
          }
        }
      } else {
        // Offline Vector Grid
        ctx.strokeStyle = 'rgba(0, 217, 255, 0.16)';
        ctx.lineWidth = 1;
        for (let lon = -180; lon <= 180; lon += 15) {
          const sx = lon2x(lon, z) - cx + w / 2;
          ctx.beginPath();
          ctx.moveTo(sx, 0);
          ctx.lineTo(sx, h);
          ctx.stroke();
        }
        for (let lat = -75; lat <= 75; lat += 15) {
          const sy = lat2y(lat, z) - cy + h / 2;
          ctx.beginPath();
          ctx.moveTo(0, sy);
          ctx.lineTo(w, sy);
          ctx.stroke();
        }
      }

      const activeCity = getActiveCity();
      const activeWeather = state.weatherByCity[activeCity.id];
      const hr = activeWeather?.hourly24?.[state.mapOpts.hourOffset] || activeWeather?.current;

      // Weather Forecast Overlays around Monitored Cities
      state.cities.forEach((city) => {
        const cw = state.weatherByCity[city.id];
        const ch = cw?.hourly24?.[state.mapOpts.hourOffset] || cw?.current;
        const sx = lon2x(city.lon, z) - cx + w / 2;
        const sy = lat2y(city.lat, z) - cy + h / 2;
        if (sx < -120 || sx > w + 120 || sy < -120 || sy > h + 120) return;

        if (state.mapOpts.layers.precip && ch && (ch.precipProb > 10 || ch.precip > 0)) {
          const rad = 45 + (ch.precipProb || 20) * 0.7;
          const g = ctx.createRadialGradient(sx, sy, 4, sx, sy, rad);
          g.addColorStop(0, 'rgba(0, 217, 255, 0.55)');
          g.addColorStop(0.55, 'rgba(34, 197, 94, 0.32)');
          g.addColorStop(1, 'rgba(0, 217, 255, 0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(sx, sy, rad, 0, Math.PI * 2);
          ctx.fill();
        }

        if (state.mapOpts.layers.clouds && ch && ch.cloud > 10) {
          const rad = 55 + ch.cloud * 0.5;
          const g = ctx.createRadialGradient(sx, sy, 5, sx, sy, rad);
          g.addColorStop(0, `rgba(226, 232, 240, ${(ch.cloud / 100) * 0.45})`);
          g.addColorStop(1, 'rgba(226, 232, 240, 0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(sx, sy, rad, 0, Math.PI * 2);
          ctx.fill();
        }

        if (state.mapOpts.layers.temp && ch && ch.temp != null) {
          const hue = Math.max(0, Math.min(240, 240 - (ch.temp + 10) * 5));
          const g = ctx.createRadialGradient(sx, sy, 4, sx, sy, 70);
          g.addColorStop(0, `hsla(${hue}, 90%, 55%, 0.42)`);
          g.addColorStop(1, `hsla(${hue}, 90%, 55%, 0)`);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(sx, sy, 70, 0, Math.PI * 2);
          ctx.fill();
        }

        if (state.mapOpts.layers.pressure && cw?.current?.pressure) {
          ctx.strokeStyle = 'rgba(165, 243, 252, 0.5)';
          ctx.lineWidth = 1.2;
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.arc(sx, sy, 58, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = '#a5f3fc';
          ctx.font = '11px Inter, sans-serif';
          ctx.fillText(`${Math.round(cw.current.pressure)} hPa`, sx + 22, sy - 42);
        }

        // City Pin
        ctx.fillStyle = city.id === activeCity.id ? '#00d9ff' : '#38bdf8';
        ctx.beginPath();
        ctx.arc(sx, sy, city.id === activeCity.id ? 6 : 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(3, 8, 23, 0.85)';
        ctx.fillRect(sx + 8, sy - 12, 92, 20);
        ctx.fillStyle = '#f5faff';
        ctx.font = 'bold 11px Inter, sans-serif';
        ctx.fillText(`${city.name} ${ch ? fmtTemp(ch.temp) : ''}`, sx + 12, sy + 2);
      });

      // Animated Wind Streamlines
      if (state.mapOpts.layers.wind && hr) {
        const rad = (((hr.windDir ?? 220) + 180) * Math.PI) / 180;
        const spd = Math.max(0.0008, ((hr.wind ?? 10) / 120) * 0.0045);
        ctx.strokeStyle = 'rgba(0, 217, 255, 0.55)';
        ctx.lineWidth = 1.4;
        particles.forEach((p) => {
          const x1 = p.x * w;
          const y1 = p.y * h;
          p.x += Math.sin(rad) * spd;
          p.y -= Math.cos(rad) * spd;
          p.age++;
          if (p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1 || p.age > 70) {
            p.x = Math.random();
            p.y = Math.random();
            p.age = 0;
          }
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(p.x * w, p.y * h);
          ctx.stroke();
        });
      }

      // Doppler Radar Sweep
      if (state.mapOpts.layers.sweep) {
        sweepAngle = (sweepAngle + 0.02) % (Math.PI * 2);
        const rx = w / 2;
        const ry = h / 2;
        const r = Math.min(w, h) * 0.42;
        ctx.strokeStyle = 'rgba(0, 217, 255, 0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(rx, ry, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(0, 217, 255, 0.65)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx + Math.cos(sweepAngle) * r, ry + Math.sin(sweepAngle) * r);
        ctx.stroke();
      }
    }

    // Drag Pan & Click-to-Inspect
    let moved = false;
    canvas.addEventListener('pointerdown', (e) => {
      dragging = true;
      moved = false;
      dragStart = { x: e.clientX, y: e.clientY, lat: state.mapOpts.lat, lon: state.mapOpts.lon };
    });
    window.addEventListener('pointermove', (e) => {
      if (!dragging || !dragStart) return;
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true;
      const degPerPx = 360 / (Math.pow(2, state.mapOpts.zoom) * 256);
      state.mapOpts.lon = Math.max(-180, Math.min(180, dragStart.lon - dx * degPerPx));
      state.mapOpts.lat = Math.max(-75, Math.min(75, dragStart.lat + dy * degPerPx * Math.cos((dragStart.lat * Math.PI) / 180)));
    });
    window.addEventListener('pointerup', async (e) => {
      if (!dragging) return;
      dragging = false;
      if (!moved) {
        const rect = canvas.getBoundingClientRect();
        const { lat, lon } = screenToLatLon(e.clientX - rect.left, e.clientY - rect.top);
        await inspectCoordinate(lat, lon);
      }
    });

    async function inspectCoordinate(lat, lon) {
      const card = document.getElementById('map-inspect-card');
      const coordsEl = document.getElementById('inspect-coords');
      const bodyEl = document.getElementById('inspect-body');
      card.classList.remove('hidden');
      coordsEl.textContent = `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`;
      bodyEl.textContent = 'Scanning Open-Meteo telemetry...';
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,surface_pressure,weather_code&timezone=auto`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = await res.json();
        const m = mapWmoCode(d.current?.weather_code, 1);
        bodyEl.innerHTML = `
          <div><strong>${m.icon} ${m.en}</strong></div>
          <div>Temp: <strong>${fmtTemp(d.current?.temperature_2m)}</strong></div>
          <div>Wind: <strong>${fmtWind(d.current?.wind_speed_10m)}</strong></div>
          <div>Humidity: <strong>${d.current?.relative_humidity_2m ?? 'N/A'}%</strong></div>
          <div>Pressure: <strong>${Math.round(d.current?.surface_pressure ?? 0)} hPa</strong></div>
        `;
      } catch (err) {
        bodyEl.textContent = `Unable to fetch point telemetry (${err.message}).`;
      }
    }

    document.getElementById('close-inspect').addEventListener('click', () => {
      document.getElementById('map-inspect-card').classList.add('hidden');
    });
    document.getElementById('map-zoom-in').addEventListener('click', () => {
      state.mapOpts.zoom = Math.min(12, state.mapOpts.zoom + 1);
    });
    document.getElementById('map-zoom-out').addEventListener('click', () => {
      state.mapOpts.zoom = Math.max(2, state.mapOpts.zoom - 1);
    });
    document.getElementById('map-center-active').addEventListener('click', () => {
      const c = getActiveCity();
      state.mapOpts.lat = c.lat;
      state.mapOpts.lon = c.lon;
      state.mapOpts.zoom = 6;
    });

    document.querySelectorAll('[data-basemap]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.mapOpts.basemap = btn.getAttribute('data-basemap');
        tileErrors = 0;
        document.getElementById('map-tile-warning').classList.add('hidden');
        document.querySelectorAll('[data-basemap]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('map-attribution').textContent = BASEMAPS[state.mapOpts.basemap].attr;
      });
    });

    document.querySelectorAll('[data-layer]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const k = btn.getAttribute('data-layer');
        state.mapOpts.layers[k] = !state.mapOpts.layers[k];
        btn.classList.toggle('active', state.mapOpts.layers[k]);
      });
    });

    document.getElementById('btn-retry-tiles').addEventListener('click', () => {
      tileCache.clear();
      tileErrors = 0;
      document.getElementById('map-tile-warning').classList.add('hidden');
    });
    document.getElementById('btn-force-vector').addEventListener('click', () => {
      document.querySelector('[data-basemap="vector"]')?.click();
    });

    const slider = document.getElementById('radar-slider');
    const playBtn = document.getElementById('radar-play-btn');
    function updateTimestampBadge() {
      const w = state.weatherByCity[getActiveCity().id];
      const h = w?.hourly24?.[state.mapOpts.hourOffset];
      document.getElementById('radar-timestamp').textContent = h ? `${h.time.replace('T', ' ')} (Forecast)` : `+${state.mapOpts.hourOffset}h`;
    }
    slider.addEventListener('input', () => {
      state.mapOpts.hourOffset = Number(slider.value);
      updateTimestampBadge();
    });
    playBtn.addEventListener('click', () => {
      state.mapOpts.playing = !state.mapOpts.playing;
      playBtn.textContent = state.mapOpts.playing ? '⏸ Pause' : '▶ Play 24h';
      if (state.mapOpts.playing) {
        playTimer = setInterval(() => {
          state.mapOpts.hourOffset = (state.mapOpts.hourOffset + 1) % 24;
          slider.value = state.mapOpts.hourOffset;
          updateTimestampBadge();
        }, 700);
      } else {
        clearInterval(playTimer);
      }
    });

    window.addEventListener('resize', resize);
    resize();
    draw();

    return {
      resize,
      updateWeather(city) {
        state.mapOpts.lat = city.lat;
        state.mapOpts.lon = city.lon;
        updateTimestampBadge();
      },
    };
  }

  function renderHomeMapPreview(city, w) {
    const c = document.getElementById('home-map-preview-canvas');
    if (!c) return;
    c.width = c.clientWidth || 400;
    c.height = 200;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#031024';
    ctx.fillRect(0, 0, c.width, c.height);

    // Subtle radar grid
    ctx.strokeStyle = 'rgba(0, 217, 255, 0.14)';
    for (let x = 0; x < c.width; x += 36) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, c.height); ctx.stroke();
    }
    for (let y = 0; y < c.height; y += 36) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(c.width, y); ctx.stroke();
    }

    const cx = c.width / 2;
    const cy = c.height / 2;
    const g = ctx.createRadialGradient(cx, cy, 6, cx, cy, 85);
    g.addColorStop(0, 'rgba(0, 217, 255, 0.45)');
    g.addColorStop(0.55, 'rgba(8, 124, 255, 0.22)');
    g.addColorStop(1, 'rgba(0, 217, 255, 0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, 85, 0, Math.PI * 2); ctx.fill();

    ctx.strokeStyle = 'rgba(0, 217, 255, 0.4)';
    [32, 62, 92].forEach((r) => {
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    });
    ctx.fillStyle = '#00d9ff';
    ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f5faff';
    ctx.font = 'bold 12px Inter, sans-serif';
    ctx.fillText(`${city.name} • ${fmtTemp(w?.current?.temp)}`, cx + 10, cy + 4);
    document.getElementById('preview-precip-badge').textContent = `Rain ${w?.current?.precipProb ?? 0}%`;
  }

  // =========================================================================
  // AI WEATHER ASSISTANT (Rule-Based Fallback + Voice + Optional Ollama)
  // =========================================================================
  function appendChat(role, text) {
    const log = document.getElementById('ai-chat-log');
    const div = document.createElement('div');
    div.className = `chat-msg ${role}`;
    div.textContent = text;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  function speakText(text) {
    if (!state.voiceSpeak || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = state.lang === 'ja' ? 'ja-JP' : 'en-US';
    window.speechSynthesis.speak(u);
  }

  function buildRuleBasedAnswer(q) {
    const city = getActiveCity();
    const w = state.weatherByCity[city.id];
    if (!w) return `Live weather data for ${city.name} is still loading. Please try again in a moment.`;

    const low = q.toLowerCase();
    const meta = mapWmoCode(w.current.code, w.current.isDay);
    const today = w.daily7[0] || {};
    const maxRain = Math.max(...w.hourly24.map((h) => h.precipProb || 0));

    if (low.includes('rain') || low.includes('umbrella') || low.includes('雨')) {
      return `In ${city.name}, current precipitation is ${w.current.precip ?? 0} mm and peak rain probability over the next 24 hours is ${maxRain}%. ${maxRain >= 40 ? 'Bring an umbrella today.' : 'Rain risk is low today.'}`;
    }
    if (low.includes('wear') || low.includes('cloth') || low.includes('服装')) {
      const t = w.current.temp ?? 18;
      const outfit = t < 10 ? 'a warm coat and layers' : t < 18 ? 'a light jacket or sweater' : t < 25 ? 'breathable casual wear' : 'light summer clothing and hydration';
      return `It is currently ${fmtTemp(w.current.temp)} (feels like ${fmtTemp(w.current.feels)}) with ${meta.en} in ${city.name}. I recommend ${outfit}${maxRain >= 40 ? ' plus a waterproof layer or umbrella' : ''}.`;
    }
    if (low.includes('7-day') || low.includes('week') || low.includes('週間')) {
      const summary = w.daily7.slice(0, 5).map((d) => `${d.date.slice(5)}: ${fmtTemp(d.max)}/${fmtTemp(d.min)}`).join(', ');
      return `7-Day outlook for ${city.name}: ${summary}. Highest rain risk today is ${today.precipProb ?? 0}%.`;
    }
    if (low.includes('compare') || low.includes('cities') || low.includes('比較')) {
      const lines = state.cities
        .map((c) => {
          const cw = state.weatherByCity[c.id];
          return cw ? `${c.name}: ${fmtTemp(cw.current.temp)} (${mapWmoCode(cw.current.code, cw.current.isDay).en})` : null;
        })
        .filter(Boolean);
      return `Monitored cities comparison — ${lines.join(' | ')}.`;
    }
    if (low.includes('travel') || low.includes('outdoor') || low.includes('旅行')) {
      return `Travel & outdoor check for ${city.name}: ${meta.en}, wind ${fmtWind(w.current.wind)}, visibility ${w.current.visibility != null ? (w.current.visibility / 1000).toFixed(1) + ' km' : 'N/A'}, UV ${w.current.uv ?? 'N/A'}, US AQI ${w.aqi.usAqi ?? 'N/A'}.`;
    }
    return `${city.name} right now: ${fmtTemp(w.current.temp)}, ${meta.en}, feels like ${fmtTemp(w.current.feels)}, wind ${fmtWind(w.current.wind)} ${degToCompass(w.current.windDir)}, humidity ${w.current.humidity ?? 'N/A'}%, High ${fmtTemp(today.max)} / Low ${fmtTemp(today.min)}.`;
  }

  async function handleAskAI(question) {
    const q = question.trim();
    if (!q) return;
    appendChat('user', q);

    if (state.ollama.enabled) {
      try {
        const city = getActiveCity();
        const w = state.weatherByCity[city.id];
        const ctx = `City: ${city.name}, Temp: ${fmtTemp(w?.current?.temp)}, Wind: ${fmtWind(w?.current?.wind)}, RainProb: ${w?.current?.precipProb ?? 0}%, Humidity: ${w?.current?.humidity ?? 'N/A'}%`;
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 12000);
        const res = await fetch(`${state.ollama.url.replace(/\/$/, '')}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: state.ollama.model, prompt: `You are TALENOVA Weather AI. Real telemetry: ${ctx}. User asks: ${q}`, stream: false }),
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const reply = data.response || buildRuleBasedAnswer(q);
        appendChat('bot', reply);
        speakText(reply);
        return;
      } catch {
        const fallback = `[Ollama unreachable — using built-in AI] ${buildRuleBasedAnswer(q)}`;
        appendChat('bot', fallback);
        speakText(fallback);
        return;
      }
    }

    const answer = buildRuleBasedAnswer(q);
    appendChat('bot', answer);
    speakText(answer);
  }

  function startVoiceInput() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      appendChat('bot', 'Voice recognition is not supported in this browser.');
      return;
    }
    const rec = new SR();
    rec.lang = state.lang === 'ja' ? 'ja-JP' : 'en-US';
    rec.onresult = (e) => {
      const text = e.results[0]?.[0]?.transcript;
      if (text) {
        switchView('ai');
        handleAskAI(text);
      }
    };
    rec.start();
  }

  // =========================================================================
  // NAVIGATION, SEARCH & EVENT WIRING
  // =========================================================================
  function switchView(viewName) {
    state.activeView = viewName;
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${viewName}`));
    document.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('active', b.getAttribute('data-view') === viewName));
    if (viewName === 'map' && mapAPI) {
      setTimeout(() => mapAPI.resize(), 40);
    }
  }

  async function selectCity(cityId, force = false) {
    state.activeCityId = cityId;
    state.selectedDayIdx = 0;
    saveState();
    renderCityLists();
    renderDashboard();
    hideStatusError();
    const city = getActiveCity();
    try {
      await fetchCityWeather(city, force);
      renderCityLists();
      renderDashboard();
    } catch (err) {
      showStatusError(`Failed to update weather for ${city.name}: ${err.message}`, () => selectCity(cityId, true));
    }
  }

  async function refreshAllCities(force = false) {
    await Promise.allSettled(state.cities.map((c) => fetchCityWeather(c, force)));
    renderCityLists();
    renderDashboard();
  }

  function setupCitySearch() {
    const input = document.getElementById('city-search-input');
    const dropdown = document.getElementById('search-dropdown');
    let debounceTimer = null;

    input.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      const q = input.value.trim();
      if (q.length < 2) {
        dropdown.classList.add('hidden');
        return;
      }
      debounceTimer = setTimeout(async () => {
        if (searchController) searchController.abort();
        searchController = new AbortController();
        try {
          const res = await fetch(
            `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=${state.lang}&format=json`,
            { signal: searchController.signal }
          );
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          dropdown.innerHTML = '';
          const results = data.results || [];
          if (!results.length) {
            dropdown.innerHTML = '<div class="search-item">No matching cities found.</div>';
          } else {
            results.forEach((r) => {
              const btn = document.createElement('button');
              btn.className = 'search-item';
              btn.innerHTML = `<span><strong>${r.name}</strong>, ${r.country || ''}</span><span class="muted-xs">${r.latitude.toFixed(2)}, ${r.longitude.toFixed(2)}</span>`;
              btn.addEventListener('click', () => {
                const id = `${r.name.toLowerCase().replace(/\s+/g, '-')}-${Math.round(r.latitude * 10)}`;
                if (!state.cities.some((c) => c.id === id)) {
                  state.cities.unshift({ id, name: r.name, country: r.country || '', lat: r.latitude, lon: r.longitude });
                }
                input.value = '';
                dropdown.classList.add('hidden');
                selectCity(id, true);
              });
              dropdown.appendChild(btn);
            });
          }
          dropdown.classList.remove('hidden');
        } catch (err) {
          if (err.name !== 'AbortError') {
            dropdown.innerHTML = `<div class="search-item">Search error (${err.message})</div>`;
            dropdown.classList.remove('hidden');
          }
        }
      }, 300);
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-wrapper')) dropdown.classList.add('hidden');
    });
  }

  function bindEvents() {
    document.querySelectorAll('[data-view]').forEach((btn) => {
      btn.addEventListener('click', () => switchView(btn.getAttribute('data-view')));
    });

    document.getElementById('btn-open-map').addEventListener('click', () => switchView('map'));
    document.getElementById('home-map-preview-canvas').addEventListener('click', () => switchView('map'));
    document.getElementById('home-ai-launcher').addEventListener('click', (e) => {
      if (!e.target.closest('#home-voice-btn')) switchView('ai');
    });
    document.getElementById('home-voice-btn').addEventListener('click', startVoiceInput);
    document.getElementById('ai-mic-btn').addEventListener('click', startVoiceInput);

    document.getElementById('btn-refresh').addEventListener('click', () => refreshAllCities(true));
    document.getElementById('btn-unit').addEventListener('click', () => {
      state.tempUnit = state.tempUnit === 'C' ? 'F' : 'C';
      saveState();
      applyThemeAndLang();
      renderCityLists();
      renderDashboard();
    });
    document.getElementById('btn-lang').addEventListener('click', () => {
      state.lang = state.lang === 'en' ? 'ja' : 'en';
      saveState();
      applyThemeAndLang();
      renderDashboard();
    });
    document.getElementById('btn-theme').addEventListener('click', () => {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
      saveState();
      applyThemeAndLang();
      renderDashboard();
    });

    document.getElementById('btn-gps').addEventListener('click', () => {
      if (!navigator.geolocation) return showStatusError('Geolocation is not supported by your browser.');
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const id = 'current-gps';
          const gpsCity = { id, name: 'Current Location', country: 'GPS', lat: pos.coords.latitude, lon: pos.coords.longitude };
          state.cities = [gpsCity, ...state.cities.filter((c) => c.id !== id)];
          selectCity(id, true);
        },
        (err) => showStatusError(`Location access denied (${err.message}).`)
      );
    });

    // 3D Globe Toggles
    const toggleMap = [
      ['toggle-clouds', 'clouds'],
      ['toggle-fx', 'fx'],
      ['toggle-grid', 'grid'],
      ['toggle-orbits', 'orbits'],
    ];
    toggleMap.forEach(([elId, key]) => {
      document.getElementById(elId)?.addEventListener('click', (e) => {
        state.globeOpts[key] = !state.globeOpts[key];
        e.currentTarget.classList.toggle('active', state.globeOpts[key]);
        globeAPI?.syncToggles();
        globeAPI?.focusCity(getActiveCity(), state.weatherByCity[state.activeCityId]);
      });
    });

    // AI Chat Form & Quick Prompts
    document.getElementById('ai-chat-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const inp = document.getElementById('ai-input');
      handleAskAI(inp.value);
      inp.value = '';
    });
    document.querySelectorAll('.ai-prompt-btn').forEach((btn) => {
      btn.addEventListener('click', () => handleAskAI(btn.getAttribute('data-q')));
    });
    document.getElementById('ai-speak-toggle').addEventListener('click', (e) => {
      state.voiceSpeak = !state.voiceSpeak;
      e.currentTarget.classList.toggle('active', state.voiceSpeak);
      e.currentTarget.textContent = state.voiceSpeak ? '🔊 Voice Output: ON' : '🔇 Voice Output: OFF';
    });

    // Settings Controls
    document.getElementById('set-temp-unit').addEventListener('change', (e) => {
      state.tempUnit = e.target.value;
      saveState(); applyThemeAndLang(); renderCityLists(); renderDashboard();
    });
    document.getElementById('set-wind-unit').addEventListener('change', (e) => {
      state.windUnit = e.target.value;
      saveState(); renderDashboard();
    });
    document.getElementById('set-lang').addEventListener('change', (e) => {
      state.lang = e.target.value;
      saveState(); applyThemeAndLang(); renderDashboard();
    });
    document.getElementById('set-theme').addEventListener('change', (e) => {
      state.theme = e.target.value;
      saveState(); applyThemeAndLang(); renderDashboard();
    });
    document.getElementById('set-ollama-enabled').addEventListener('change', (e) => {
      state.ollama.enabled = e.target.checked;
      saveState();
    });
    document.getElementById('set-ollama-url').addEventListener('change', (e) => {
      state.ollama.url = e.target.value.trim();
      saveState();
    });
    document.getElementById('set-ollama-model').addEventListener('change', (e) => {
      state.ollama.model = e.target.value.trim();
      saveState();
    });
    document.getElementById('btn-test-ollama').addEventListener('click', async () => {
      const msg = document.getElementById('ollama-status-msg');
      msg.textContent = 'Testing...';
      try {
        const res = await fetch(`${state.ollama.url.replace(/\/$/, '')}/api/tags`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const names = (data.models || []).map((m) => m.name).join(', ') || 'Connected (no models listed)';
        msg.textContent = `Connected: ${names}`;
      } catch (err) {
        msg.textContent = `Failed (${err.message}). Ensure OLLAMA_ORIGINS="*" ollama serve is running.`;
      }
    });
    document.getElementById('btn-clear-cache').addEventListener('click', () => {
      state.weatherByCity = {};
      saveState();
      refreshAllCities(true);
    });

    // Online / Offline listeners
    const syncOnline = () => document.getElementById('offline-banner').classList.toggle('hidden', navigator.onLine);
    window.addEventListener('online', syncOnline);
    window.addEventListener('offline', syncOnline);
    syncOnline();
  }

  // Bootstrap
  document.addEventListener('DOMContentLoaded', () => {
    if (window.lucide) window.lucide.createIcons();
    applyThemeAndLang();
    setupCitySearch();
    bindEvents();
    globeAPI = initEarth3D();
    mapAPI = initTacticalMap();
    renderCityLists();
    renderDashboard();

    appendChat('bot', 'Hello! I am TALENOVA Weather AI. Ask me about rain probability, what to wear, 7-day trends, or compare your saved cities.');

    // Live Clock
    setInterval(() => {
      const el = document.getElementById('live-clock');
      if (el) el.textContent = new Date().toLocaleTimeString();
    }, 1000);

    refreshAllCities(false);
  });
})();


