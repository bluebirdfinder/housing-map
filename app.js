/**
 * 呼嚕呼嚕共生公寓生活機能地圖 - 主核心程式
 */

// 1. 全域變態與預設設定
const DEFAULT_COORDS = [25.053196, 121.553893]; // 南京東路四段133巷8弄24號
let map = null;
let currentCoords = DEFAULT_COORDS;
let currentRadius = 500; // 預設 500m
let tileLayer = null;
let markersGroup = null;
let centerMarker = null;
let radiusCircle = null;

// 生活機能點資料庫
let poiData = []; 
let activeFilters = {
  convenience: true,
  supermarket: true,
  pharmacy: true,
  cosmetics: true,
  restaurant: true,
  mrt: true,
  bus: true,
  fuel: true,
  ubike: true
};

// 2. 地圖樣式圖磚設定 (CartoDB 提供的高質感地圖樣式)
const MAP_THEMES = {
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
};

// 3. 分類設定 (顏色與圖標)
const CATEGORIES = {
  center: {
    color: '#ef4444',
    icon: 'home',
    label: '共生公寓中心點'
  },
  convenience: {
    color: '#22c55e',
    icon: 'store',
    label: '便利商店'
  },
  supermarket: {
    color: '#f97316',
    icon: 'shopping-bag',
    label: '全聯/家樂福'
  },
  pharmacy: {
    color: '#3b82f6',
    icon: 'pill',
    label: '藥局'
  },
  cosmetics: {
    color: '#ec4899',
    icon: 'sparkles',
    label: '連鎖藥妝'
  },
  restaurant: {
    color: '#eab308',
    icon: 'utensils',
    label: '餐廳美食'
  },
  mrt: {
    color: '#0ea5e9',
    icon: 'subway',
    label: '捷運地鐵'
  },
  bus: {
    color: '#0d9488',
    icon: 'bus',
    label: '公車乘車'
  },
  fuel: {
    color: '#a855f7',
    icon: 'fuel',
    label: '加油站'
  },
  ubike: {
    color: '#f59e0b',
    icon: 'bike',
    label: 'YouBike 站點'
  }
};

// 4. 初始化應用程式
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  initTheme();
  setupEventListeners();
  
  // 首次載入：定位預設地址並抓取資料
  loadLocationData(DEFAULT_COORDS);
});

// 5. 初始化地圖
function initMap() {
  // 建立地圖實例
  map = L.map('map', {
    zoomControl: false // 我們使用自訂或預設放右下角
  }).setView(DEFAULT_COORDS, 15);

  // 加載預設深色地圖圖磚
  tileLayer = L.tileLayer(MAP_THEMES.dark, {
    attribution: MAP_THEMES.attribution,
    maxZoom: 20
  }).addTo(map);

  // 移至右下角 Zoom Control
  L.control.zoom({
    position: 'bottomright'
  }).addTo(map);

  // 建立地標群組
  markersGroup = L.layerGroup().addTo(map);

  // 渲染 Lucide 圖標
  lucide.createIcons();
}

// 6. 主題切換 (深色 / 淺色)
function initTheme() {
  const themeToggle = document.getElementById('theme-toggle');
  const body = document.body;

  // 檢查偏好設定
  const savedTheme = localStorage.getItem('theme') || 'dark';
  if (savedTheme === 'light') {
    body.classList.remove('dark-theme');
    body.classList.add('light-theme');
    tileLayer.setUrl(MAP_THEMES.light);
  }

  themeToggle.addEventListener('click', () => {
    if (body.classList.contains('dark-theme')) {
      body.classList.remove('dark-theme');
      body.classList.add('light-theme');
      tileLayer.setUrl(MAP_THEMES.light);
      localStorage.setItem('theme', 'light');
    } else {
      body.classList.remove('light-theme');
      body.classList.add('dark-theme');
      tileLayer.setUrl(MAP_THEMES.dark);
      localStorage.setItem('theme', 'dark');
    }
  });
}

// 7. 設定事件監聽器
function setupEventListeners() {
  // 地址搜尋
  const searchBtn = document.getElementById('search-btn');
  const addressInput = document.getElementById('address-input');
  
  searchBtn.addEventListener('click', () => geocodeAddress(addressInput.value));
  addressInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') geocodeAddress(addressInput.value);
  });

  // 半徑設定
  const radiusSelect = document.getElementById('radius-select');
  radiusSelect.addEventListener('change', (e) => {
    currentRadius = parseInt(e.target.value);
    loadLocationData(currentCoords);
  });

  // 重新整理
  const refreshBtn = document.getElementById('refresh-btn');
  refreshBtn.addEventListener('click', () => {
    loadLocationData(currentCoords);
  });

  // 篩選卡片點擊
  const filterCards = document.querySelectorAll('.filter-card');
  filterCards.forEach(card => {
    const checkbox = card.querySelector('input[type="checkbox"]');
    const category = card.dataset.category;

    // 點擊整張卡片觸發 checkbox 切換
    card.addEventListener('click', (e) => {
      if (e.target !== checkbox) {
        checkbox.checked = !checkbox.checked;
      }
      activeFilters[category] = checkbox.checked;
      
      if (checkbox.checked) {
        card.classList.add('active');
      } else {
        card.classList.remove('active');
      }
      
      renderMarkersAndList();
    });
  });
}

// 8. 載入特定經緯度的周邊機能資料
async function loadLocationData(coords) {
  currentCoords = coords;
  showStatus('正在抓取周邊生活機能資料與 YouBike 即時數據...');

  // 更新地圖中心與共生公寓標記
  updateCenterMarker(coords);

  try {
    // 平行抓取 Overpass POIs 與 YouBike 即時資料
    const [overpassPOIs, liveYouBikes] = await Promise.all([
      fetchNearbyPOIs(coords[0], coords[1], currentRadius),
      fetchYouBikeRealTime(coords[0], coords[1], currentRadius)
    ]);
    
    // 合併資料：如果 liveYouBikes 有資料，則過濾掉 overpassPOIs 中的 ubike 類別以防重複
    let mergedPOIs = [];
    if (liveYouBikes.length > 0) {
      mergedPOIs = [
        ...overpassPOIs.filter(item => item.category !== 'ubike'),
        ...liveYouBikes
      ];
    } else {
      mergedPOIs = overpassPOIs;
    }

    poiData = mergedPOIs;
    
    // 計算所有地點的距離與步行時間
    poiData.forEach(item => {
      const dist = calculateDistance(coords[0], coords[1], item.lat, item.lon);
      item.distance = dist;
      item.walkTime = Math.max(1, Math.round(dist / 80)); // 步行速度約 80公尺/分鐘
    });

    // 依距離排序
    poiData.sort((a, b) => a.distance - b.distance);

    // 更新篩選器計數與最近機能面板
    updateSummaryStats();

    // 渲染地標與列表
    renderMarkersAndList();
    hideStatus();
  } catch (error) {
    console.error('Fetch POI Error:', error);
    showStatus('資料載入失敗，正使用備用節點重試中...');
    try {
      // 備用流程
      const [overpassPOIs, liveYouBikes] = await Promise.all([
        fetchNearbyPOIsBackup(coords[0], coords[1], currentRadius),
        fetchYouBikeRealTime(coords[0], coords[1], currentRadius)
      ]);
      
      let mergedPOIs = [];
      if (liveYouBikes.length > 0) {
        mergedPOIs = [
          ...overpassPOIs.filter(item => item.category !== 'ubike'),
          ...liveYouBikes
        ];
      } else {
        mergedPOIs = overpassPOIs;
      }
      
      poiData = mergedPOIs;
      poiData.forEach(item => {
        const dist = calculateDistance(coords[0], coords[1], item.lat, item.lon);
        item.distance = dist;
        item.walkTime = Math.max(1, Math.round(dist / 80));
      });
      poiData.sort((a, b) => a.distance - b.distance);
      updateSummaryStats();
      renderMarkersAndList();
      hideStatus();
    } catch (err2) {
      console.error('Backup Fetch Failed:', err2);
      showStatus('網路連線逾時，請點擊「重新載入」再試一次。', false);
    }
  }
}

// 8.5. 抓取台北市 YouBike 2.0 即時資料庫 (支援即時可借可還資訊與 CORS)
async function fetchYouBikeRealTime(lat, lon, radius) {
  try {
    const response = await fetch('https://tcgbusfs.blob.core.windows.net/dotapp/youbike/v2/youbike_immediate.json');
    if (!response.ok) throw new Error('YouBike API status not ok');
    const data = await response.json();
    
    const results = [];
    data.forEach(station => {
      const sLat = parseFloat(station.latitude);
      const sLon = parseFloat(station.longitude);
      if (isNaN(sLat) || isNaN(sLon)) return;
      
      const distance = calculateDistance(lat, lon, sLat, sLon);
      if (distance <= radius) {
        // 清理站點名稱 (移除 "YouBike2.0_")
        const cleanName = station.sna.replace(/^YouBike2.0_/, '');
        
        // 站點地址
        const address = station.ar || '';
        
        results.push({
          id: 'ubike_' + station.sno,
          name: cleanName,
          branch: 'YouBike 2.0',
          address: address,
          fullAddress: address,
          category: 'ubike',
          subType: `YouBike 2.0 (可借:${station.available_rent_bikes} / 可還:${station.available_return_bikes})`,
          lat: sLat,
          lon: sLon,
          distance: distance,
          walkTime: Math.max(1, Math.round(distance / 80)),
          availableBikes: station.available_rent_bikes,
          emptySlots: station.available_return_bikes
        });
      }
    });
    return results;
  } catch (error) {
    console.error('Fetch YouBike RealTime API failed, falling back to OSM:', error);
    return []; // 失敗時回傳空陣列，自動降級使用 Overpass 抓取到的 OSM 自行車點
  }
}

// 9. 更新中心點標記與半徑圓圈
function updateCenterMarker(coords) {
  // 清除舊標記
  if (centerMarker) map.removeLayer(centerMarker);
  if (radiusCircle) map.removeLayer(radiusCircle);

  // 建立新中心點標記
  const homeIcon = L.divIcon({
    className: 'custom-div-icon',
    html: `
      <div class="marker-pin center-marker-pin" style="--marker-color: ${CATEGORIES.center.color}">
        <i data-lucide="${CATEGORIES.center.icon}" class="marker-icon"></i>
      </div>
    `,
    iconSize: [32, 42],
    iconAnchor: [16, 42]
  });

  centerMarker = L.marker(coords, { icon: homeIcon }).addTo(map);
  centerMarker.bindPopup(`
    <div style="font-family: var(--font-family);">
      <div class="popup-title">📍 呼嚕呼嚕南京東路共生公寓</div>
      <div class="popup-detail" style="font-size: 0.85rem; color: var(--text-secondary);">
        臺北市松山區南京東路四段133巷8弄24號<br>
        緯度: ${coords[0].toFixed(5)} / 經度: ${coords[1].toFixed(5)}
      </div>
    </div>
  `);

  // 畫出搜尋範圍圓圈
  radiusCircle = L.circle(coords, {
    radius: currentRadius,
    color: CATEGORIES.center.color,
    weight: 1,
    fillColor: CATEGORIES.center.color,
    fillOpacity: 0.05,
    dashArray: '5, 5'
  }).addTo(map);

  // 調整視野以容納半徑圓圈
  map.fitBounds(radiusCircle.getBounds(), { padding: [20, 20] });
}

// 10. 地址定位 (Nominatim Geocoding API)
async function geocodeAddress(address) {
  if (!address.trim()) return;
  showStatus('正在解析地址位置...');

  let coords = null;
  
  // 1. 嘗試完整地址
  coords = await queryNominatim(address);
  
  // 2. 若失敗，去除了郵遞區號 (如 105)、台灣、中華民國以及里名 (如 東勢里) 後重試
  if (!coords) {
    const cleaned = address
      .replace(/^\d+/, '') // 移除數字開頭 (郵遞區號)
      .replace(/台灣|中華民國/, '')
      .replace(/[一-龥]{2,3}里/, '') // 移除里名，如「東勢里」、「美仁里」
      .trim();
    coords = await queryNominatim(cleaned);
  }
  
  // 3. 若依然失敗，只提取路名、巷、弄進行搜尋，例如提取「南京東路四段133巷8弄」
  if (!coords) {
    const match = address.match(/([一-龥]+(?:路|街|大道|路[一-二三四五六七八九十]+段))(?:\d+巷)?(?:\d+弄)?/);
    if (match && match[0]) {
      coords = await queryNominatim(match[0]);
    }
  }

  if (coords) {
    loadLocationData(coords);
  } else {
    showStatus('找不到該地址，請嘗試輸入更通用的路名或地標。', false);
    setTimeout(hideStatus, 3000);
  }
}

// 輔助函式：發送地理編碼請求
async function queryNominatim(queryStr) {
  try {
    const encoded = encodeURIComponent(queryStr);
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encoded}&limit=1`);
    if (!response.ok) return null;
    const data = await response.json();
    if (data && data.length > 0) {
      return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
    }
  } catch (error) {
    console.error('Nominatim single query error:', error);
  }
  return null;
}

// 11. Overpass API 查詢 (主節點)
async function fetchNearbyPOIs(lat, lon, radius) {
  const url = 'https://overpass-api.de/api/interpreter';
  const query = buildOverpassQL(lat, lon, radius);
  
  const response = await fetch(url, {
    method: 'POST',
    body: `data=${encodeURIComponent(query)}`,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  
  if (!response.ok) throw new Error('Overpass server returned error');
  const data = await response.json();
  return parseOverpassJSON(data);
}

// Overpass API 備用節點
async function fetchNearbyPOIsBackup(lat, lon, radius) {
  const url = 'https://lz4.overpass-api.de/api/interpreter';
  const query = buildOverpassQL(lat, lon, radius);
  
  const response = await fetch(url, {
    method: 'POST',
    body: `data=${encodeURIComponent(query)}`,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  
  if (!response.ok) throw new Error('Overpass backup server returned error');
  const data = await response.json();
  return parseOverpassJSON(data);
}

// 12. 建立 Overpass QL 語法
function buildOverpassQL(lat, lon, radius) {
  return `
    [out:json][timeout:30];
    (
      // 1. 便利商店 (7-11, FamilyMart, OK, Hi-Life, SimpleMart)
      nwr["shop"="convenience"](around:${radius}, ${lat}, ${lon});
      nwr["brand"~"7-11|7-ELEVEN|FamilyMart|全家|萊爾富|Hi-Life|OK|美廉社", i](around:${radius}, ${lat}, ${lon});
      nwr["name"~"7-11|7-ELEVEN|FamilyMart|全家|萊爾富|Hi-Life|OK|美廉社", i](around:${radius}, ${lat}, ${lon});
      
      // 2. 超市 (全聯, 家樂福)
      nwr["shop"="supermarket"](around:${radius}, ${lat}, ${lon});
      nwr["brand"~"全聯|家樂福|PX Mart|PXMart|Carrefour", i](around:${radius}, ${lat}, ${lon});
      nwr["name"~"全聯|家樂福|PX Mart|PXMart|Carrefour", i](around:${radius}, ${lat}, ${lon});
      
      // 3. 藥局
      nwr["amenity"="pharmacy"](around:${radius}, ${lat}, ${lon});
      
      // 4. 連鎖藥妝 (屈臣氏, 康是美)
      nwr["shop"~"chemist|cosmetics"](around:${radius}, ${lat}, ${lon});
      nwr["brand"~"屈臣氏|康是美|Watsons|Cosmed", i](around:${radius}, ${lat}, ${lon});
      nwr["name"~"屈臣氏|康是美|Watsons|Cosmed", i](around:${radius}, ${lat}, ${lon});
      
      // 5. 餐廳美食 (小吃、餐廳、速食)
      nwr["amenity"~"restaurant|cafe|fast_food"](around:${radius}, ${lat}, ${lon});
      
      // 6. 捷運站與出口
      nwr["railway"~"station|subway_entrance"](around:${radius}, ${lat}, ${lon});
      nwr["station"="subway"](around:${radius}, ${lat}, ${lon});

      // 7. 公車站
      nwr["highway"="bus_stop"](around:${radius}, ${lat}, ${lon});

      // 8. YouBike 站點 (作為 API 斷網或超出台北市時的備用)
      nwr["amenity"="bicycle_rental"](around:${radius}, ${lat}, ${lon});

      // 9. 加油站
      nwr["amenity"="fuel"](around:${radius}, ${lat}, ${lon});

      // 10. 街道資訊 (限縮在 500m 內主要道路以避免 Overpass 逾時)
      way["highway"~"primary|secondary|tertiary|residential"]["name"](around:${Math.min(500, radius)}, ${lat}, ${lon});
    );
    out center;
  `;
}

// 13. 解析 Overpass API 回傳的 JSON 資料
function parseOverpassJSON(data) {
  const elements = data.elements || [];
  const results = [];
  const streetSegments = [];

  // 第一階段：收集所有有名字的街道中心點
  elements.forEach(el => {
    const tags = el.tags || {};
    if (tags.highway && (tags.name || tags['name:zh'])) {
      const lat = el.lat || (el.center ? el.center.lat : null);
      const lon = el.lon || (el.center ? el.center.lon : null);
      if (lat && lon) {
        streetSegments.push({
          name: tags.name || tags['name:zh'],
          lat: lat,
          lon: lon
        });
      }
    }
  });

  // 第二階段：處理 POI
  elements.forEach(el => {
    const tags = el.tags || {};
    // 排除純街道本身作為 POI (允許公車站牌)
    if (tags.highway && tags.highway !== 'bus_stop' && !tags.amenity && !tags.shop && !tags.railway && !tags.station) return;

    // 取得坐標：OSM 的 node 有 lat/lon，way/relation 在 center 模式下有 center.lat/center.lon
    const lat = el.lat || (el.center ? el.center.lat : null);
    const lon = el.lon || (el.center ? el.center.lon : null);
    
    if (!lat || !lon) return;

    const name = tags.name || tags['name:zh'] || tags['name:en'] || '未命名地點';
    const shop = tags.shop || '';
    const amenity = tags.amenity || '';
    const brand = tags.brand || tags['brand:zh'] || '';

    // 分類識別與標籤重塑
    let category = '';
    let subType = '';

    const nameLower = name.toLowerCase();
    const brandLower = brand.toLowerCase();

    // A. 超商與超市分類
    const isPXMart = nameLower.includes('全聯') || brandLower.includes('全聯') || nameLower.includes('pxmart') || brandLower.includes('pxmart') || nameLower.includes('px mart') || brandLower.includes('px mart');
    const isCarrefour = nameLower.includes('家樂福') || brandLower.includes('家樂福') || nameLower.includes('carrefour') || brandLower.includes('carrefour');

    if (isPXMart) {
      category = 'supermarket';
      subType = '全聯福利中心';
    } else if (isCarrefour) {
      category = 'supermarket';
      subType = nameLower.includes('超市') || nameLower.includes('便利購') || nameLower.includes('market') ? '家樂福超市' : '家樂福量販店';
    } else if (shop === 'supermarket') {
      category = 'supermarket';
      subType = '一般超市';
    }
    
    // B. 便利商店分類
    else if (shop === 'convenience' || nameLower.includes('統一超商') || nameLower.includes('7-11') || nameLower.includes('7-eleven') || nameLower.includes('全家') || nameLower.includes('familymart') || nameLower.includes('萊爾富') || nameLower.includes('hi-life') || nameLower.includes('ok超商') || nameLower.includes('ok mart') || nameLower.includes('美廉社') || nameLower.includes('simple') || brandLower.includes('7-11') || brandLower.includes('7-eleven') || brandLower.includes('familymart') || brandLower.includes('hi-life') || brandLower.includes('ok mart') || brandLower.includes('simple')) {
      category = 'convenience';
      const is711 = nameLower.includes('7-11') || nameLower.includes('7-eleven') || nameLower.includes('統一') || brandLower.includes('7-11') || brandLower.includes('7-eleven');
      const isFamilyMart = nameLower.includes('全家') || nameLower.includes('familymart') || brandLower.includes('全家') || brandLower.includes('familymart');
      const isHilife = nameLower.includes('萊爾富') || nameLower.includes('hi-life') || brandLower.includes('萊爾富') || brandLower.includes('hi-life');
      const isOk = nameLower.includes('ok') || brandLower.includes('ok');
      const isSimpleMart = nameLower.includes('美廉社') || nameLower.includes('simple') || brandLower.includes('美廉社') || brandLower.includes('simple');

      if (is711) {
        subType = '7-ELEVEN';
      } else if (isFamilyMart) {
        subType = '全家便利商店';
      } else if (isHilife) {
        subType = '萊爾富';
      } else if (isOk) {
        subType = 'OK超商';
      } else if (isSimpleMart) {
        subType = '美廉社';
      } else {
        subType = '便利商店';
      }
    }

    // C. 連鎖藥妝與藥局
    else if (nameLower.includes('屈臣氏') || brandLower.includes('屈臣氏') || nameLower.includes('watsons') || brandLower.includes('watsons')) {
      category = 'cosmetics';
      subType = '屈臣氏 Watsons';
    } else if (nameLower.includes('康是美') || brandLower.includes('康是美') || nameLower.includes('cosmed') || brandLower.includes('cosmed')) {
      category = 'cosmetics';
      subType = '康是美 Cosmed';
    } else if (shop === 'chemist' || shop === 'cosmetics') {
      category = 'cosmetics';
      subType = '藥妝/化妝品';
    } else if (amenity === 'pharmacy') {
      category = 'pharmacy';
      subType = name.includes('藥局') ? '特約藥局' : '藥局';
    }

    // D. 餐廳美食
    else if (amenity === 'restaurant' || amenity === 'cafe' || amenity === 'fast_food') {
      category = 'restaurant';
      if (amenity === 'cafe') {
        subType = '咖啡廳';
      } else if (amenity === 'fast_food') {
        subType = '速食店';
      } else {
        subType = '餐廳';
      }
    }

    // E. 捷運地鐵站與出口
    else if (tags.railway === 'station' || tags.station === 'subway' || tags.railway === 'subway_entrance') {
      category = 'mrt';
      if (tags.railway === 'subway_entrance') {
        subType = '捷運出口';
      } else {
        subType = '捷運站';
      }
    }

    // F. 公車站牌
    else if (tags.highway === 'bus_stop') {
      category = 'bus';
      subType = '公車站牌';
    }

    // G. YouBike 站點
    else if (amenity === 'bicycle_rental' || tags.amenity === 'bicycle_rental' || nameLower.includes('youbike')) {
      category = 'ubike';
      subType = name.includes('2.0') ? 'YouBike 2.0' : 'YouBike';
    }

    // H. 加油站
    else if (amenity === 'fuel') {
      category = 'fuel';
      if (name.includes('中油') || name.includes('CPC')) {
        subType = '台灣中油';
      } else if (name.includes('台塑')) {
        subType = '台塑石油';
      } else {
        subType = '加油站';
      }
    }

    // 若無法歸類，則不收錄
    if (!category) return;

    // 擷取分店名稱與地址（若有）
    const branch = tags.branch || tags['brand:branch'] || tags['branch:zh'] || tags['branch:en'] || '';
    
    // 1. 取得完整地址 (用於 Google Maps 搜尋)
    const city = tags['addr:city'] || tags['addr:city:zh'] || '臺北市';
    const district = tags['addr:district'] || tags['addr:district:zh'] || '松山區';
    const street = tags['addr:street'] || tags['addr:street:zh'] || '';
    const housenumber = tags['addr:housenumber'] || '';
    const fullAddr = tags['addr:full'] || tags['addr:full:zh'] || '';
    let fullAddress = fullAddr || (street ? (city + district + street + housenumber) : '');
    
    // 2. 簡短地址 (用於網頁顯示)
    let shortAddress = '';
    if (fullAddress) {
      shortAddress = fullAddress
        .replace(/^\d+/, '') // 移除開頭的郵遞區號 (如 105)
        .replace(/^台灣省?|^中華民國/, '')
        .replace(/^台北市|^臺北市/, '')
        .replace(/^松山區/, '')
        .trim();
    }

    // 3. 智慧街道匹配 (若 OSM 沒有地址資料，使用距離最近的街道進行推導)
    let matchedStreet = street;
    
    if (!fullAddress && streetSegments.length > 0) {
      // 尋找最近的街道
      let minStreetDist = Infinity;
      let closestStreet = '';
      
      streetSegments.forEach(strSeg => {
        const d = calculateDistance(lat, lon, strSeg.lat, strSeg.lon);
        if (d < minStreetDist) {
          minStreetDist = d;
          closestStreet = strSeg.name;
        }
      });
      
      if (closestStreet && minStreetDist < 150) { // 只匹配 150 公尺內的街道，防誤判
        matchedStreet = closestStreet;
        shortAddress = `${closestStreet}附近 (估算)`;
        fullAddress = `臺北市松山區${closestStreet}`; // 用於 Google Maps 搜尋的基礎位址
      }
    }

    // 4. 智慧補全分店名稱 (若資料庫缺少分店，依路名補上，以符合 Google 地圖命名邏輯)
    let finalBranch = branch;
    if (!finalBranch && matchedStreet) {
      // 取得路名 (如 南京東路四段)
      const roadMatch = matchedStreet.match(/([\u4e00-\u9fa5]+(?:路|街|大道|段))/);
      if (roadMatch) {
        const roadName = roadMatch[1];
        if (roadName.length > 1) {
          const is711 = nameLower.includes('7-11') || nameLower.includes('7-eleven') || nameLower.includes('統一') || brandLower.includes('7-11') || brandLower.includes('7-eleven');
          const isFamilyMart = nameLower.includes('全家') || nameLower.includes('familymart') || brandLower.includes('全家') || brandLower.includes('familymart');
          const isCosmed = nameLower.includes('康是美') || nameLower.includes('cosmed') || brandLower.includes('康是美') || brandLower.includes('cosmed');
          const isWatsons = nameLower.includes('屈臣氏') || nameLower.includes('watsons') || brandLower.includes('屈臣氏') || brandLower.includes('watsons');
          const isPXMart = nameLower.includes('全聯') || brandLower.includes('全聯') || nameLower.includes('pxmart') || brandLower.includes('pxmart') || nameLower.includes('px mart') || brandLower.includes('px mart');
          const isCarrefour = nameLower.includes('家樂福') || nameLower.includes('carrefour') || brandLower.includes('家樂福') || brandLower.includes('carrefour');

          if (is711) {
            finalBranch = `${roadName}門市`;
          } else if (isCosmed) {
            finalBranch = `${roadName}門市`;
          } else if (isFamilyMart) {
            finalBranch = `${roadName}店`;
          } else if (isPXMart) {
            finalBranch = `${roadName}店`;
          } else if (isWatsons) {
            finalBranch = `${roadName}店`;
          } else if (isCarrefour) {
            finalBranch = `${roadName}店`;
          }
        }
      }
    }

    const poi = {
      id: el.id,
      name: name,
      branch: finalBranch,
      address: shortAddress,
      fullAddress: fullAddress,
      category: category,
      subType: subType,
      lat: lat,
      lon: lon,
      tags: tags
    };

    // 套用特定商圈的精確分店與地址覆寫 (比照 Google Maps 資訊)
    applyLocalBranchOverrides(poi, matchedStreet, lat, lon);

    results.push(poi);
  });

  return results;
}

// 13.5. 針對共生公寓商圈特定店家，以 Google Maps 資訊進行精確覆寫 (覆寫範圍擴大至 1 公里)
function applyLocalBranchOverrides(poi, matchedStreet, lat, lon) {
  const nameLower = poi.name.toLowerCase();
  const matchedStreetStr = matchedStreet || '';
  
  // A. 連鎖藥妝店 (屈臣氏、康是美)
  if (poi.category === 'cosmetics') {
    if (nameLower.includes('屈臣氏') || nameLower.includes('watsons')) {
      if (matchedStreetStr.includes('南京東路四段')) {
        poi.branch = '南寧門市';
        poi.address = '南京東路四段131號';
        poi.fullAddress = '臺北市松山區南京東路四段131號';
      } else if (matchedStreetStr.includes('南京東路五段')) {
        // 區分五段上的南二店與東興店
        if (lon > 121.5620) {
          poi.branch = '東興門市';
          poi.address = '南京東路五段301號1-3樓';
          poi.fullAddress = '臺北市松山區南京東路五段301號1-3樓';
        } else {
          poi.branch = '南二門市';
          poi.address = '南京東路五段64號';
          poi.fullAddress = '臺北市松山區南京東路五段64號';
        }
      } else if (matchedStreetStr.includes('八德路')) {
        poi.branch = '松山門市';
        poi.address = '八德路四段725號';
        poi.fullAddress = '臺北市松山區八德路四段725號';
      }
    } else if (nameLower.includes('康是美') || nameLower.includes('cosmed')) {
      if (matchedStreetStr.includes('南京東路四段')) {
        poi.branch = '新建華門市';
        poi.address = '南京東路四段137號';
        poi.fullAddress = '臺北市松山區南京東路四段137號';
      } else if (matchedStreetStr.includes('南京東路五段')) {
        poi.branch = '新東興門市';
        poi.address = '南京東路五段264號1樓';
        poi.fullAddress = '臺北市松山區南京東路五段264號1樓';
      }
    }
  }
  
  // B. 超市 (全聯、家樂福)
  if (poi.category === 'supermarket') {
    if (nameLower.includes('全聯') || nameLower.includes('pxmart') || nameLower.includes('px mart')) {
      if (matchedStreetStr.includes('健康路')) {
        poi.branch = '松山健康門市';
        poi.address = '健康路243號B1';
        poi.fullAddress = '臺北市松山區健康路243號B1';
      } else if (matchedStreetStr.includes('南京東路五段')) {
        poi.branch = '松山南京東門市';
        poi.address = '南京東路五段58-64號B1';
        poi.fullAddress = '臺北市松山區南京東路五段58-64號B1';
      } else if (matchedStreetStr.includes('光復北路')) {
        poi.branch = '松山吉祥門市';
        poi.address = '光復北路11巷99號B1';
        poi.fullAddress = '臺北市松山區光復北路11巷99號B1';
      } else if (matchedStreetStr.includes('八德路三段')) {
        // 八德路三段上的松山八德門市與松山中崙門市
        if (lon > 121.5540) {
          poi.branch = '松山八德門市';
          poi.address = '八德路三段225號';
          poi.fullAddress = '臺北市松山區八德路三段225號';
        } else {
          poi.branch = '松山中崙門市';
          poi.address = '八德路三段106巷1號';
          poi.fullAddress = '臺北市松山區八德路三段106巷1號';
        }
      }
    } else if (nameLower.includes('家樂福') || nameLower.includes('carrefour')) {
      if (matchedStreetStr.includes('光復北路')) {
        poi.branch = '台北光復店';
        poi.address = '光復北路198號';
        poi.fullAddress = '臺北市松山區光復北路198號';
      } else if (matchedStreetStr.includes('敦化北路')) {
        poi.branch = '台北敦化北店';
        poi.address = '敦化北路199巷5號';
        poi.fullAddress = '臺北市松山區敦化北路199巷5號';
      } else if (matchedStreetStr.includes('八德路四段')) {
        poi.branch = '台北八德店';
        poi.address = '八德路四段83號';
        poi.fullAddress = '臺北市松山區八德路四段83號';
      } else if (matchedStreetStr.includes('三民路')) {
        poi.branch = '三民店';
        poi.address = '三民路160號';
        poi.fullAddress = '臺北市松山區三民路160號';
      } else if (matchedStreetStr.includes('東興路')) {
        poi.branch = '東興店';
        poi.address = '東興路45號B1';
        poi.fullAddress = '臺北市松山區東興路45號B1';
      }
    }
  }

  // C. 便利商店 (7-ELEVEN, 全家, 萊爾富)
  if (poi.category === 'convenience') {
    // 7-ELEVEN 門市比對
    if (nameLower.includes('7-11') || nameLower.includes('7-eleven') || nameLower.includes('統一')) {
      if (matchedStreetStr.includes('寧安街')) {
        poi.branch = '新育商門市';
        poi.address = '寧安街3巷11號1樓';
        poi.fullAddress = '臺北市松山區寧安街3巷11號1樓';
      } else if (matchedStreetStr.includes('健康路')) {
        poi.branch = '健一門市';
        poi.address = '健康路11號';
        poi.fullAddress = '臺北市松山區健康路11號';
      } else if (matchedStreetStr.includes('南京東路四段')) {
        if (lon > 121.5510) {
          poi.branch = '京城門市';
          poi.address = '南京東路四段75-2號1樓';
          poi.fullAddress = '臺北市松山區南京東路四段75-2號1樓';
        } else {
          poi.branch = '敦巨門市';
          poi.address = '南京東路四段25號';
          poi.fullAddress = '臺北市松山區南京東路四段25號';
        }
      } else if (matchedStreetStr.includes('南京東路五段')) {
        if (lon > 121.5620) {
          poi.branch = '聰明門市';
          poi.address = '南京東路五段363號';
          poi.fullAddress = '臺北市松山區南京東路五段363號';
        } else if (lon > 121.5580) {
          poi.branch = '新寶清門市';
          poi.address = '南京東路五段334號1樓';
          poi.fullAddress = '臺北市松山區南京東路五段334號1樓';
        } else if (lon > 121.5555) {
          poi.branch = '京發門市';
          poi.address = '南京東路五段139-4號';
          poi.fullAddress = '臺北市松山區南京東路五段139-4號';
        } else {
          poi.branch = '東光門市';
          poi.address = '南京東路五段15號1樓';
          poi.fullAddress = '臺北市松山區南京東路五段15號1樓';
        }
      } else if (matchedStreetStr.includes('八德路三段')) {
        if (lon > 121.5540) {
          poi.branch = '新復勢門市';
          poi.address = '八德路三段200號1樓';
          poi.fullAddress = '臺北市松山區八德路三段200號1樓';
        } else if (lon > 121.5520) {
          poi.branch = '德育門市';
          poi.address = '八德路三段171號1樓';
          poi.fullAddress = '臺北市松山區八德路三段171號1樓';
        } else if (lon > 121.5490) {
          poi.branch = '吉德門市';
          poi.address = '八德路三段74巷43號1樓';
          poi.fullAddress = '臺北市松山區八德路三段74巷43號1樓';
        } else {
          poi.branch = '中崙門市';
          poi.address = '八德路三段27號';
          poi.fullAddress = '臺北市松山區八德路三段27號';
        }
      }
    }
    
    // 全家門市比對
    if (nameLower.includes('全家') || nameLower.includes('familymart')) {
      if (matchedStreetStr.includes('南京東路四段133巷') || matchedStreetStr.includes('133巷') || (lat > 25.0515 && lat < 25.0535 && lon > 121.5535 && lon < 121.5550)) {
        poi.branch = '新健康店';
        poi.address = '南京東路四段133巷9弄2號';
        poi.fullAddress = '臺北市松山區南京東路四段133巷9弄2號';
      } else if (matchedStreetStr.includes('南京東路四段')) {
        if (lon > 121.5525) {
          poi.branch = '京兆店';
          poi.address = '南京東路四段137號1樓';
          poi.fullAddress = '臺北市松山區南京東路四段137號1樓';
        } else {
          poi.branch = '巨星超市店';
          poi.address = '南京東路四段2號';
          poi.fullAddress = '臺北市松山區南京東路四段2號';
        }
      } else if (matchedStreetStr.includes('南京東路五段')) {
        if (lon > 121.5600) {
          poi.branch = '新東寶店';
          poi.address = '南京東路五段291巷14號';
          poi.fullAddress = '臺北市松山區南京東路五段291巷14號';
        } else if (lon > 121.5570) {
          poi.branch = '新京吉店';
          poi.address = '南京東路五段194號';
          poi.fullAddress = '臺北市松山區南京東路五段194號';
        } else {
          poi.branch = '新東光店';
          poi.address = '南京東路五段123巷1號1樓';
          poi.fullAddress = '臺北市松山區南京東路五段123巷1號1樓';
        }
      } else if (matchedStreetStr.includes('健康路')) {
        if (lon > 121.5570) {
          poi.branch = '民康店';
          poi.address = '健康路285號1樓';
          poi.fullAddress = '臺北市松山區健康路285號1樓';
        } else {
          poi.branch = '康柏店';
          poi.address = '健康路220號';
          poi.fullAddress = '臺北市松山區健康路220號';
        }
      } else if (matchedStreetStr.includes('八德路三段')) {
        poi.branch = '台發店';
        poi.address = '八德路三段30號1樓';
        poi.fullAddress = '臺北市松山區八德路三段30號1樓';
      }
    }

    // 萊爾富門市比對
    if (nameLower.includes('萊爾富') || nameLower.includes('hi-life')) {
      if (matchedStreetStr.includes('寧安街') || (lat > 25.0515 && lat < 25.0535 && lon > 121.5530 && lon < 121.5545)) {
        poi.branch = '松山家聲店';
        poi.address = '寧安街12號B1';
        poi.fullAddress = '臺北市松山區寧安街12號B1';
      }
    }
  }

  // D. 藥局 (延康藥局、達昌健康藥局、晨安藥局、美仁藥局、睦康藥局)
  if (poi.category === 'pharmacy') {
    if (poi.name.includes('達昌') || nameLower.includes('達昌')) {
      poi.branch = '健康店';
      poi.address = '健康路100號';
      poi.fullAddress = '臺北市松山區健康路100號';
    } else if (poi.name.includes('睦康') || nameLower.includes('睦康')) {
      poi.branch = '健康店';
      poi.address = '健康路160號';
      poi.fullAddress = '臺北市松山區健康路160號';
    } else if (poi.name.includes('延康') || nameLower.includes('延康')) {
      poi.branch = '健保藥局';
      poi.address = '健康路325巷36號';
      poi.fullAddress = '臺北市松山區健康路325巷36號';
    } else if (poi.name.includes('美仁') || nameLower.includes('美仁')) {
      poi.branch = '健康店';
      poi.address = '健康路5之1號1樓';
      poi.fullAddress = '臺北市松山區健康路5之1號1樓';
    } else if (poi.name.includes('晨安') || nameLower.includes('晨安')) {
      poi.branch = '健保藥局';
      poi.address = '寧安街9巷8號';
      poi.fullAddress = '臺北市松山區寧安街9巷8號';
    }
  }
}



// 14. 統計與更新面板摘要
function updateSummaryStats() {
  const counts = {
    convenience: 0,
    supermarket: 0,
    pharmacy: 0,
    cosmetics: 0,
    restaurant: 0,
    mrt: 0,
    bus: 0,
    fuel: 0,
    ubike: 0
  };

  poiData.forEach(item => {
    if (counts[item.category] !== undefined) {
      counts[item.category]++;
    }
  });

  // 更新 UI 上的數字
  document.getElementById('count-convenience').innerText = counts.convenience;
  document.getElementById('count-supermarket').innerText = counts.supermarket;
  document.getElementById('count-pharmacy').innerText = counts.pharmacy;
  document.getElementById('count-cosmetics').innerText = counts.cosmetics;
  document.getElementById('count-restaurant').innerText = counts.restaurant;
  document.getElementById('count-mrt').innerText = counts.mrt;
  document.getElementById('count-bus').innerText = counts.bus;
  document.getElementById('count-fuel').innerText = counts.fuel;
  document.getElementById('count-ubike').innerText = counts.ubike;

  // 尋找最近地標
  const closest = {
    convenience: null,
    supermarket: null,
    pharmacy: null
  };

  for (const item of poiData) {
    if (!closest.convenience && item.category === 'convenience') closest.convenience = item;
    if (!closest.supermarket && item.category === 'supermarket') closest.supermarket = item;
    if (!closest.pharmacy && item.category === 'pharmacy') closest.pharmacy = item;
    
    // 如果都找到了就跳出
    if (closest.convenience && closest.supermarket && closest.pharmacy) break;
  }

  // 渲染最近機能面版
  updateClosestStat('stat-convenience-closest', closest.convenience);
  updateClosestStat('stat-supermarket-closest', closest.supermarket);
  updateClosestStat('stat-pharmacy-closest', closest.pharmacy);
}

function updateClosestStat(elementId, item) {
  const element = document.getElementById(elementId);
  const valSpan = element.querySelector('.stat-val');
  if (item) {
    valSpan.innerHTML = `${item.name} <span style="color: var(--text-muted); font-size: 0.75rem; font-weight: normal;">(${Math.round(item.distance)}m, 🚶 ${item.walkTime}分)</span>`;
    element.style.cursor = 'pointer';
    element.onclick = () => {
      focusOnPOI(item.id);
    };
  } else {
    valSpan.innerText = '半徑內無搜尋結果';
    element.style.cursor = 'default';
    element.onclick = null;
  }
}

// 15. 渲染地標標記與側邊欄列表
function renderMarkersAndList() {
  // A. 清空舊地標
  markersGroup.clearLayers();

  // B. 取得篩選過後的資料
  const filteredData = poiData.filter(item => activeFilters[item.category]);

  // 更新總數標籤
  document.getElementById('total-results').innerText = `共 ${filteredData.length} 筆`;

  // C. 渲染地圖標記與列表 HTML
  const listContainer = document.getElementById('results-list');
  listContainer.innerHTML = '';

  if (filteredData.length === 0) {
    listContainer.innerHTML = `
      <div class="list-placeholder">
        <i data-lucide="info"></i>
        <p>在此半徑與篩選條件下無符合的地標，請調整篩選器或增加搜尋半徑。</p>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  filteredData.forEach(item => {
    const config = CATEGORIES[item.category];
    
    // 建立分店/地點顯示名稱
    let displayName = item.name;
    if (item.branch && !item.name.includes(item.branch)) {
      displayName = `${item.name} (${item.branch})`;
    }

    // 1. 建立地圖 Custom Marker
    const elIcon = L.divIcon({
      className: 'custom-div-icon',
      html: `
        <div class="marker-pin" style="--marker-color: ${config.color}">
          <i data-lucide="${config.icon}" class="marker-icon"></i>
        </div>
      `,
      iconSize: [32, 42],
      iconAnchor: [16, 42]
    });

    const marker = L.marker([item.lat, item.lon], { icon: elIcon }).addTo(markersGroup);

    // Google Maps 整合搜尋連結：優先使用「品牌名稱 + 分店名稱 + 完整地址」進行搜尋以精確直達 Google Maps 單一店家頁面與評分
    const googleQuery = item.fullAddress ? `${item.name} ${item.branch || ''} ${item.fullAddress}` : `${item.name} ${item.branch || ''} ${item.lat},${item.lon}`;
    const googleSearchUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(googleQuery)}`;
    const googleDirectionsUrl = `https://www.google.com/maps/dir/?api=1&origin=${currentCoords[0]},${currentCoords[1]}&destination=${item.lat},${item.lon}&travelmode=walking`;

    // 氣泡內容
    marker.bindPopup(`
      <div style="font-family: var(--font-family); min-width: 180px;">
        <span class="item-badge" style="--card-light: ${config.color}15; --card-color: ${config.color}; margin-bottom: 6px; display: inline-block;">
          ${item.subType}
        </span>
        <div class="popup-title">${displayName}</div>
        ${item.address ? `<div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 6px;">📍 ${item.address}</div>` : ''}
        <div class="popup-detail">
          <span>📍 距離：${Math.round(item.distance)} 公尺</span>
          <span style="color: var(--accent-color); font-weight: 600;">🚶 步行：約 ${item.walkTime} 分鐘</span>
        </div>
        <div class="popup-links">
          <a href="${googleSearchUrl}" target="_blank" class="btn-link"><i data-lucide="external-link" style="width: 12px;"></i> Google Maps</a>
          <a href="${googleDirectionsUrl}" target="_blank" class="btn-link" style="color: var(--accent-color);"><i data-lucide="navigation" style="width: 12px;"></i> 導航</a>
        </div>
      </div>
    `);

    // 關聯 Marker 實例到 item，以利點擊清單時呼叫
    item.markerInstance = marker;

    // 2. 建立側邊欄列表卡片
    const card = document.createElement('div');
    card.className = 'result-item';
    card.style.setProperty('--card-color', config.color);
    card.setAttribute('data-id', item.id);
    
    card.innerHTML = `
      <div class="item-header">
        <span class="item-title">${displayName}</span>
        <span class="item-badge" style="--card-light: ${config.color}15; --card-color: ${config.color};">${item.subType}</span>
      </div>
      ${item.address ? `<div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 4px; display: flex; align-items: center; gap: 4px;"><i data-lucide="map-pin" style="width: 10px; height: 10px;"></i> <span>${item.address}</span></div>` : ''}
      <div class="item-distance">
        <div class="distance-metric">
          <i data-lucide="map-pin" style="width: 12px; height: 12px;"></i>
          <span>${Math.round(item.distance)}m</span>
        </div>
        <div class="walking-time">
          <i data-lucide="footprints" style="width: 12px; height: 12px;"></i>
          <span>${item.walkTime} 分鐘</span>
        </div>
      </div>
      <div class="item-footer">
        <a href="${googleSearchUrl}" target="_blank" class="btn-link" title="在 Google 地圖中查看該分店評價、營業時間與星等">
          <i data-lucide="star" style="width: 12px; height: 12px; fill: #eab308; stroke: #eab308;"></i> 評價/星等
        </a>
        <a href="${googleDirectionsUrl}" target="_blank" class="btn-link">
          <i data-lucide="navigation" style="width: 12px; height: 12px;"></i> 步行導航
        </a>
      </div>
    `;

    // 點擊列表聚焦
    card.addEventListener('click', (e) => {
      // 避免點擊外部連結按鈕觸發聚焦
      if (e.target.closest('.btn-link')) return;
      focusOnPOI(item.id);
    });

    listContainer.appendChild(card);
  });

  // 重新渲染 Lucide 圖標
  lucide.createIcons();
}

// 16. 地圖定位聚焦機能點
function focusOnPOI(id) {
  const item = poiData.find(p => p.id === id);
  if (item && item.markerInstance) {
    // 平滑移到地標位置，放大地圖
    map.setView([item.lat, item.lon], 17);
    
    // 開啟氣泡窗
    setTimeout(() => {
      item.markerInstance.openPopup();
    }, 300);

    // 高亮側邊欄對應卡片
    const activeCards = document.querySelectorAll('.result-item');
    activeCards.forEach(c => c.classList.remove('active-card'));
    
    const targetCard = document.querySelector(`.result-item[data-id="${id}"]`);
    if (targetCard) {
      targetCard.classList.add('active-card');
      targetCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }
}

// 17. 輔助工具函式
// 計算兩經緯度大圓距離 (公尺)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // 地球半徑 (公尺)
  const phi1 = lat1 * Math.PI / 180;
  const phi2 = lat2 * Math.PI / 180;
  const deltaPhi = (lat2 - lat1) * Math.PI / 180;
  const deltaLambda = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // 公尺
}

// 控制定位與狀態覆蓋層
function showStatus(text, showLoader = true) {
  const overlay = document.getElementById('status-overlay');
  const textSpan = document.getElementById('status-text');
  const loader = overlay.querySelector('.spin');

  textSpan.innerText = text;
  
  if (showLoader) {
    loader.classList.remove('hidden');
    loader.style.display = 'inline-block';
  } else {
    loader.classList.add('hidden');
    loader.style.display = 'none';
  }

  overlay.classList.remove('hidden');
}

function hideStatus() {
  const overlay = document.getElementById('status-overlay');
  overlay.classList.add('hidden');
}
