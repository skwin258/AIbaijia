(function () {
  const accessToken = window.__BAI_ACCESS_TOKEN || "";
  const scriptOrigin = window.__BAI_API_ORIGIN || (document.currentScript && document.currentScript.src
    ? new URL(document.currentScript.src).origin
    : location.origin);
  const embeddedIconData = "__BAI_ICON_DATA__";
  const iconSrc = embeddedIconData.startsWith("data:")
    ? embeddedIconData
    : `${scriptOrigin}/ai-chip-icon-small.png`;

  async function validateAccess() {
    if (window.__BAI_SKIP_RUNTIME_VALIDATE) return true;
    if (!accessToken) return true;
    try {
      const response = await fetch(`${scriptOrigin}/api/access/validate?token=${encodeURIComponent(accessToken)}`, { cache: "no-store" });
      const data = await response.json();
      if (data.active) return true;
      alert(data.error || "此外掛授權已停用或已到期。");
      return false;
    } catch {
      alert("無法確認外掛授權，請稍後再試。");
      return false;
    }
  }

  const existing = document.getElementById("baccarat-ai-floating-root");
  if (existing) {
    existing.remove();
  }

  const labels = { banker: "莊", player: "閒", tie: "和", observe: "觀望" };
  const storeKey = "baccarat-ai-floating-rounds";
  const scanAreaKey = "baccarat-ai-scan-area";
  const roadAreasKey = "baccarat-ai-road-areas";
  const positionKey = "baccarat-ai-fab-position";
  const analysisKey = "baccarat-ai-analysis-active";
  const quickCooldownKey = "baccarat-ai-quick-cooldown-until";
  const performanceKey = "baccarat-ai-performance";
  const dailyPerformanceKey = "baccarat-ai-daily-performance";
  const pendingRecommendationKey = "baccarat-ai-pending-recommendation";
  let rounds = JSON.parse(localStorage.getItem(storeKey) || "[]");
  let scannedRoads = JSON.parse(localStorage.getItem("baccarat-ai-floating-roads") || '{"bead":[],"big":[]}' );
  let scanArea = JSON.parse(localStorage.getItem(scanAreaKey) || "null");
  let roadAreas = JSON.parse(localStorage.getItem(roadAreasKey) || '{"bead":null,"big":null}');
  let fabPosition = JSON.parse(localStorage.getItem(positionKey) || '{"right":8,"top":"26vh"}');
  fabPosition = {
    left: window.innerWidth - 90,
    top: Math.max(window.innerHeight * 0.08, Math.min(window.innerHeight * 0.46, fabRectTop(fabPosition))),
  };
  let analysisActive = false;
  let panelOpen = false;
  let panelMode = "menu";
  let statsMode = "session";
  let scanMessage = "";
  let toastTimer = null;
  let quickCooldownTimer = null;
  let quickCooldownUntil = Number(localStorage.getItem(quickCooldownKey) || "0");
  let performance = JSON.parse(localStorage.getItem(performanceKey) || '{"wins":0,"losses":0,"ties":0,"profit":0}');
  performance = { wins: 0, losses: 0, ties: 0, profit: 0, ...performance };
  let dailyPerformance = JSON.parse(localStorage.getItem(dailyPerformanceKey) || "null");
  let pendingRecommendation = JSON.parse(localStorage.getItem(pendingRecommendationKey) || "null");
  localStorage.setItem(analysisKey, "false");
  pendingRecommendation = null;
  localStorage.setItem(pendingRecommendationKey, "null");

  function fabRectTop(position) {
    if (typeof position.top === "string" && position.top.endsWith("vh")) {
      return window.innerHeight * (parseFloat(position.top) / 100);
    }
    return Number(position.top ?? window.innerHeight * 0.26);
  }

  function save() {
    scannedRoads = {
      bead: rounds,
      big: rounds.filter((round) => round.result !== "tie"),
      bigLayout: [],
    };
    localStorage.setItem(storeKey, JSON.stringify(rounds));
    localStorage.setItem("baccarat-ai-floating-roads", JSON.stringify(scannedRoads));
  }

  function saveScanArea() {
    localStorage.setItem(scanAreaKey, JSON.stringify(scanArea));
  }

  function saveRoadAreas() {
    localStorage.setItem(roadAreasKey, JSON.stringify(roadAreas));
  }

  function saveFabPosition() {
    localStorage.setItem(positionKey, JSON.stringify(fabPosition));
  }

  function saveAnalysisActive() {
    localStorage.setItem(analysisKey, JSON.stringify(analysisActive));
  }

  function todayKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

  function emptyPerformance() {
    return { wins: 0, losses: 0, ties: 0, profit: 0 };
  }

  function normalizeDailyPerformance() {
    const date = todayKey();
    if (!dailyPerformance || dailyPerformance.date !== date) {
      dailyPerformance = { date, ...emptyPerformance() };
      saveDailyPerformance();
    }
    return dailyPerformance;
  }

  function savePerformance() {
    localStorage.setItem(performanceKey, JSON.stringify(performance));
  }

  function saveDailyPerformance() {
    localStorage.setItem(dailyPerformanceKey, JSON.stringify(dailyPerformance));
  }

  function savePendingRecommendation() {
    localStorage.setItem(pendingRecommendationKey, JSON.stringify(pendingRecommendation));
  }

  function streak(nonTie) {
    if (!nonTie.length) return { result: null, count: 0 };
    const result = nonTie[nonTie.length - 1].result;
    let count = 0;
    for (let index = nonTie.length - 1; index >= 0; index -= 1) {
      if (nonTie[index].result !== result) break;
      count += 1;
    }
    return { result, count };
  }

  function recommend() {
    const valid = rounds.filter((round) => ["banker", "player", "tie"].includes(round.result));
    const nonTie = valid.filter((round) => round.result !== "tie");
    const recent = nonTie.slice(-12);
    const bankerCount = recent.filter((round) => round.result === "banker").length;
    const playerCount = recent.filter((round) => round.result === "player").length;
    const tieCount = valid.slice(-12).filter((round) => round.result === "tie").length;
    const currentStreak = streak(nonTie);
    const reasons = [];
    let action = "observe";
    let confidence = 42;
    let risk = "高風險";

    if (nonTie.length < 6) {
      reasons.push("路單太少，先觀察。");
    } else if (currentStreak.count >= 4) {
      action = currentStreak.result;
      confidence = Math.min(76, 54 + currentStreak.count * 4);
      risk = currentStreak.count >= 6 ? "高風險" : "中風險";
      reasons.push(`連續 ${currentStreak.count} 手偏向${labels[action]}，順勢觀察。`);
    } else {
      const gap = Math.abs(bankerCount - playerCount);
      if (gap >= 3) {
        action = bankerCount < playerCount ? "banker" : "player";
        confidence = Math.min(68, 50 + gap * 4);
        risk = "中風險";
        reasons.push("近 12 手比例拉開，採均值回歸。");
      } else if (currentStreak.count >= 2) {
        action = currentStreak.result;
        confidence = 56 + currentStreak.count * 3;
        risk = "中風險";
        reasons.push("短線有連續方向，小心跟勢。");
      } else {
        reasons.push("莊閒分布接近，沒有明顯優勢。");
      }
    }

    if (tieCount >= 2) {
      confidence = Math.max(35, confidence - 8);
      risk = "高風險";
      reasons.push("近期和局偏多。");
    }

    if (action === "observe") confidence = Math.min(confidence, 48);
    const strategy = getStrategy(action, confidence);
    const betAmount = getBetAmount(action, confidence);
    return {
      action,
      confidence,
      risk,
      strategy,
      betAmount,
      reasons,
      bankerCount,
      playerCount,
      tieCount,
      total: valid.length,
    };
  }

  function getStrategy(action, confidence) {
    if (action === "observe" || confidence < 52) return "不下";
    if (confidence >= 69) return "加注";
    if (confidence >= 57) return "保守";
    return "反壓";
  }

  function getBetAmount(action, confidence) {
    if (action === "observe" || confidence < 52) return 0;
    const capped = Math.min(80, Math.max(52, confidence));
    const amount = 100 + ((capped - 52) / 28) * 4900;
    return Math.min(5000, Math.max(100, Math.round(amount / 100) * 100));
  }

  function moneyText(amount) {
    const sign = amount > 0 ? "+" : amount < 0 ? "-" : "";
    return `${sign}$${Math.abs(Math.round(amount)).toLocaleString("en-US")}`;
  }

  function recommendationSnapshot() {
    const rec = recommend();
    return {
      action: rec.action,
      confidence: rec.confidence,
      strategy: rec.strategy,
      betAmount: rec.betAmount,
      createdAt: new Date().toISOString(),
    };
  }

  function settleRecommendation(result) {
    const daily = normalizeDailyPerformance();
    if (result === "tie") {
      performance.ties += 1;
      daily.ties += 1;
      savePerformance();
      saveDailyPerformance();
      return;
    }

    if (!pendingRecommendation || pendingRecommendation.action === "observe" || pendingRecommendation.betAmount <= 0) {
      return;
    }

    if (result === pendingRecommendation.action) {
      performance.wins += 1;
      daily.wins += 1;
      const payout = result === "banker"
        ? Math.round(pendingRecommendation.betAmount * 0.95)
        : pendingRecommendation.betAmount;
      performance.profit += payout;
      daily.profit += payout;
    } else {
      performance.losses += 1;
      daily.losses += 1;
      performance.profit -= pendingRecommendation.betAmount;
      daily.profit -= pendingRecommendation.betAmount;
    }
    savePerformance();
    saveDailyPerformance();
  }

  function add(result) {
    rounds.push({ result, createdAt: new Date().toISOString() });
    save();
    updatePanel();
    if (analysisActive) showRecommendationToast();
  }

  function undo() {
    rounds.pop();
    save();
    updatePanel();
  }

  function clearRounds() {
    if (!confirm("清空目前路單？")) return;
    rounds = [];
    save();
    updatePanel();
  }

  function scanRoadmap() {
    const structured = scanStructuredRoads();
    const precise = structured.bead.length ? structured : scanVisibleRoadArea(scanArea);
    const visual = precise.bead.length + precise.big.length >= 12 ? { bead: [], big: [] } : scanVisualRoadArea(scanArea);
    const combined = chooseBestRoads(precise, visual);
    const scanned = combined.bead.length ? combined.bead : scanDomResults();
    const visualScanned = scanned.length >= 12 ? [] : scanVisualRoadmap(scanArea);
    const results = scanned.length >= visualScanned.length ? scanned : visualScanned;
    if (!results.length && !combined.big.length) {
      scanMessage = "沒有掃到可讀取的路圖。平台可能用受保護影像或跨網域資源，Safari 不允許外掛讀取。";
      render();
      return;
    }

    rounds = results.slice(-72);
    scannedRoads = {
      bead: combined.bead.length ? combined.bead.slice(-72) : rounds,
      big: combined.big.length ? combined.big.slice(-90) : buildBigRoad(rounds).cells.filter(Boolean),
      bigLayout: combined.bigLayout || combined.big || [],
    };
    save();
    scanMessage = `已掃描珠盤路 ${scannedRoads.bead.length} 格、大路 ${scannedRoads.big.length} 格。建議分別設定珠盤區與大路區。`;
    render();
  }

  function chooseBestRoads(primary, fallback) {
    const big = primary.big.length >= fallback.big.length ? primary.big : fallback.big;
    return {
      bead: primary.bead.length >= fallback.bead.length ? primary.bead : fallback.bead,
      big,
      bigLayout: big,
    };
  }

  function scanStructuredRoads() {
    const roadCells = [...document.querySelectorAll("[data-bai-road-result]")]
      .filter((element) => !root.contains(element))
      .map((element) => {
        const result = normalizeResult(element.getAttribute("data-bai-road-result"));
        if (!result) return null;
        const rect = element.getBoundingClientRect();
        return {
          result,
          road: element.getAttribute("data-bai-road") || "bead",
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
          source: "structured-scan",
          confidence: 96,
          createdAt: new Date().toISOString(),
        };
      })
      .filter(Boolean);

    return {
      bead: sortRoadCells(roadCells.filter((cell) => cell.road === "bead")),
      big: sortRoadCells(roadCells.filter((cell) => cell.road === "big")),
    };
  }

  function sortRoadCells(cells) {
    return cells
      .sort((a, b) => (a.x - b.x) || (a.y - b.y))
      .map(({ result, source, confidence, createdAt }) => ({ result, source, confidence, createdAt }));
  }

  function scanVisibleRoadArea(area) {
    const viewportHeight = window.innerHeight;
    const rawBounds = area || {
      left: 0,
      top: viewportHeight * 0.62,
      right: window.innerWidth,
      bottom: viewportHeight - 20,
    };
    const bounds = refineRoadBounds(rawBounds);
    const splitX = bounds.left + (bounds.right - bounds.left) * 0.305;
    const beadBounds = roadAreas.bead || {
      left: bounds.left,
      right: splitX,
      top: bounds.top,
      bottom: bounds.bottom,
    };
    const bigBounds = roadAreas.big || {
      left: splitX,
      right: bounds.right,
      top: bounds.top,
      bottom: bounds.top + (bounds.bottom - bounds.top) * 0.52,
    };
    const rawPoints = [...collectSmallRoundMarks(), ...sampleRoadMarks(beadBounds), ...sampleRoadMarks(bigBounds)]
      .filter((point) => point.x >= bounds.left && point.x <= bounds.right)
      .filter((point) => point.y >= bounds.top && point.y <= bounds.bottom)
      .filter((point) => point.x < window.innerWidth - 20);

    const points = mergeNearby(rawPoints)
      .filter((point) => point.y >= bounds.top && point.y <= bounds.bottom)
      .sort((a, b) => (a.x - b.x) || (a.y - b.y));

    if (points.length < 3) return { bead: [], big: [] };

    const beadPoints = points
      .filter((point) => point.x >= beadBounds.left && point.x <= beadBounds.right)
      .filter((point) => point.y >= beadBounds.top && point.y <= beadBounds.bottom);
    const bigPoints = points
      .filter((point) => point.x >= bigBounds.left && point.x <= bigBounds.right)
      .filter((point) => point.y >= bigBounds.top && point.y <= bigBounds.bottom);

    return {
      bead: sortByRoadGrid(beadPoints, "bead", "bead"),
      big: sortByRoadGrid(bigPoints, "big", "big"),
      bigLayout: sortByRoadGrid(bigPoints, "big", "big"),
    };
  }

  function sampleRoadMarks(bounds) {
    if (!bounds) return [];
    const points = [];
    const step = 9;
    for (let y = bounds.top; y <= bounds.bottom; y += step) {
      for (let x = bounds.left; x <= bounds.right; x += step) {
        const stack = document.elementsFromPoint(x, y).filter((element) => !root.contains(element));
        for (const element of stack.slice(0, 5)) {
          const result = classifyElementColor(element) || classifySvgColor(element) || classifyRoadText(element.textContent);
          if (!result) continue;
          const rect = element.getBoundingClientRect();
          if (rect.width > 80 || rect.height > 80) continue;
          points.push({
            result,
            x: rect.width > 0 && rect.width < 80 ? rect.left + rect.width / 2 : x,
            y: rect.height > 0 && rect.height < 80 ? rect.top + rect.height / 2 : y,
            source: "point-sample",
            confidence: 60,
            createdAt: new Date().toISOString(),
          });
          break;
        }
      }
    }
    return points;
  }

  function refineRoadBounds(bounds) {
    const width = bounds.right - bounds.left;
    const height = bounds.bottom - bounds.top;
    return {
      left: bounds.left + width * 0.005,
      right: bounds.right - width * 0.075,
      top: bounds.top + height * 0.08,
      bottom: bounds.bottom - height * 0.16,
    };
  }

  function collectSmallRoundMarks() {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    return [...document.body.querySelectorAll("*")]
      .filter((element) => !root.contains(element))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        if (rect.width < 3 || rect.height < 3 || rect.width > 46 || rect.height > 46) return null;
        if (rect.bottom < 0 || rect.top > viewportHeight || rect.right < 0 || rect.left > viewportWidth) return null;
        const styles = getComputedStyle(element);
        const radius = parseFloat(styles.borderRadius) || 0;
        const rounded = radius >= Math.min(rect.width, rect.height) * 0.18 || styles.borderRadius.includes("%");
        const result = classifyElementColor(element) || classifySvgColor(element) || classifyRoadText(element.textContent);
        if (!result) return null;
        if (!rounded && rect.width > 18 && rect.height > 18) return null;
        return {
          result,
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
          source: "road-area-scan",
          confidence: 72,
          createdAt: new Date().toISOString(),
        };
      })
      .filter(Boolean);
  }

  function classifyRoadText(text) {
    const compact = String(text || "").trim();
    if (compact.length > 2) return null;
    return normalizeResult(compact);
  }

  function sortByRoadGrid(points, source, mode = "bead") {
    if (!points.length) return [];
    const rowSize = estimateStep(points.map((point) => point.y), 18);
    const colSize = estimateStep(points.map((point) => point.x), 18);
    const minY = Math.min(...points.map((point) => point.y));
    const minX = Math.min(...points.map((point) => point.x));
    return points
      .map((point) => ({
        ...point,
        row: Math.max(0, Math.min(5, Math.round((point.y - minY) / rowSize))),
        col: Math.max(0, Math.round((point.x - minX) / colSize)),
      }))
      .sort((a, b) => mode === "big" ? ((a.col - b.col) || (a.row - b.row)) : ((a.col - b.col) || (a.row - b.row)))
      .map(({ result, confidence, createdAt, x, y, row, col }) => ({ result, source, confidence, createdAt, x, y, row, col }));
  }

  function configureScanArea() {
    panelOpen = false;
    render();

    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.18);font-family:Arial,'Microsoft JhengHei',sans-serif";
    overlay.innerHTML = `
      <div style="position:fixed;left:12px;right:12px;top:18px;background:white;color:#17212b;border-radius:10px;padding:12px;text-align:center;font-weight:900;box-shadow:0 8px 28px rgba(0,0,0,.25)">
        點一下路圖左上角，再點一下路圖右下角
      </div>
    `;
    document.body.append(overlay);

    const points = [];
    overlay.addEventListener("touchstart", (event) => {
      const touch = event.touches[0];
      if (!touch) return;
      points.push({ x: touch.clientX, y: touch.clientY });
      event.preventDefault();
      event.stopPropagation();

      if (points.length === 1) {
        overlay.querySelector("div").textContent = "再點一下路圖右下角";
        return;
      }

      const first = points[0];
      const second = points[1];
      scanArea = {
        left: Math.min(first.x, second.x),
        top: Math.min(first.y, second.y),
        right: Math.max(first.x, second.x),
        bottom: Math.max(first.y, second.y),
      };
      saveScanArea();
      overlay.remove();
      scanMessage = "已設定掃描區，請再按掃描目前路圖。";
      panelOpen = true;
      render();
    }, { passive: false });
  }

  function configureRoadArea(type) {
    panelOpen = false;
    render();

    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.16);font-family:Arial,'Microsoft JhengHei',sans-serif";
    overlay.innerHTML = `
      <div style="position:fixed;left:12px;right:12px;top:18px;background:white;color:#17212b;border-radius:10px;padding:12px;text-align:center;font-weight:900;box-shadow:0 8px 28px rgba(0,0,0,.25)">
        ${type === "bead" ? "點珠盤路左上角，再點右下角" : "點大路左上角，再點右下角"}
      </div>
    `;
    document.body.append(overlay);

    const points = [];
    overlay.addEventListener("touchstart", (event) => {
      const touch = event.touches[0];
      if (!touch) return;
      points.push({ x: touch.clientX, y: touch.clientY });
      event.preventDefault();
      event.stopPropagation();

      if (points.length === 1) {
        overlay.querySelector("div").textContent = "再點右下角";
        return;
      }

      const first = points[0];
      const second = points[1];
      roadAreas[type] = {
        left: Math.min(first.x, second.x),
        top: Math.min(first.y, second.y),
        right: Math.max(first.x, second.x),
        bottom: Math.max(first.y, second.y),
      };
      saveRoadAreas();
      overlay.remove();
      scanMessage = type === "bead" ? "已設定珠盤路區，請再設定大路區或直接掃描。" : "已設定大路區，請再按掃描目前路圖。";
      panelOpen = true;
      render();
    }, { passive: false });
  }

  function estimateStep(values, fallback) {
    const sorted = [...new Set(values.map((value) => Math.round(value)))].sort((a, b) => a - b);
    const gaps = [];
    for (let index = 1; index < sorted.length; index += 1) {
      const gap = sorted[index] - sorted[index - 1];
      if (gap >= 8 && gap <= 36) gaps.push(gap);
    }
    if (!gaps.length) return fallback;
    return gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
  }

  function normalizeResult(value) {
    const text = String(value || "").trim().toLowerCase();
    if (["banker", "莊", "庄"].includes(text)) return "banker";
    if (["player", "閒", "闲"].includes(text)) return "player";
    if (["tie", "和"].includes(text)) return "tie";
    return null;
  }

  function scanDomResults() {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const candidates = [];
    const roadContainers = [...document.querySelectorAll('[aria-label*="路"], [class*="road"], [id*="road"], [class*="Road"], [id*="Road"]')]
      .filter((element) => !root.contains(element));
    const scanRoot = roadContainers.length ? roadContainers : [document.body];
    const elements = scanRoot.flatMap((container) => [...container.querySelectorAll("*")])
      .filter((element) => !root.contains(element));

    elements.forEach((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.width < 5 || rect.height < 5 || rect.width > 90 || rect.height > 90) return;
      if (rect.bottom < 0 || rect.top > viewportHeight || rect.right < 0 || rect.left > viewportWidth) return;

      const textResult = classifyText(element.textContent || "");
      const colorResult = classifyElementColor(element);
      const result = textResult || colorResult;
      if (!result) return;

      candidates.push({
        result,
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        createdAt: new Date().toISOString(),
      });
    });

    return mergeNearby(candidates)
      .sort((a, b) => (a.y - b.y) || (a.x - b.x))
      .map(({ result, createdAt }) => ({ result, source: "dom-scan", confidence: 58, createdAt }));
  }

  function classifyText(text) {
    const compact = text.trim();
    if (!compact || compact.length > 8) return null;
    return normalizeResult(compact);
  }

  function classifyElementColor(element) {
    const styles = getComputedStyle(element);
    const colors = [styles.backgroundColor, styles.borderColor, styles.color]
      .map(parseRgb)
      .filter(Boolean);

    for (const color of colors) {
      const [r, g, b] = color;
      if (r > 145 && r > g * 1.28 && r > b * 1.18) return "banker";
      if (b > 135 && b > r * 1.18 && b > g * 1.02) return "player";
      if (g > 120 && g > r * 1.12 && g > b * 1.12) return "tie";
    }
    return null;
  }

  function classifySvgColor(element) {
    const styles = getComputedStyle(element);
    const colors = [
      element.getAttribute("fill"),
      element.getAttribute("stroke"),
      styles.fill,
      styles.stroke,
    ].map(parseAnyColor).filter(Boolean);

    for (const color of colors) {
      const [r, g, b] = color;
      if (r > 145 && r > g * 1.22 && r > b * 1.12) return "banker";
      if (b > 130 && b > r * 1.12 && b > g * 0.95) return "player";
      if (g > 115 && g > r * 1.03 && g > b * 1.03) return "tie";
    }
    return null;
  }

  function parseRgb(value) {
    const match = String(value).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (!match) return null;
    return [Number(match[1]), Number(match[2]), Number(match[3])];
  }

  function parseAnyColor(value) {
    if (!value || value === "none" || value === "transparent") return null;
    const rgb = parseRgb(value);
    if (rgb) return rgb;
    const hex = String(value).trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (!hex) return null;
    const raw = hex[1].length === 3
      ? hex[1].split("").map((char) => char + char).join("")
      : hex[1];
    return [
      parseInt(raw.slice(0, 2), 16),
      parseInt(raw.slice(2, 4), 16),
      parseInt(raw.slice(4, 6), 16),
    ];
  }

  function mergeNearby(items) {
    const merged = [];
    items.forEach((item) => {
      const duplicate = merged.find((entry) => Math.abs(entry.x - item.x) < 12 && Math.abs(entry.y - item.y) < 12);
      if (!duplicate) merged.push(item);
    });
    return merged;
  }

  function scanVisualRoadmap(area) {
    const structured = scanVisualRoadArea(area);
    const best = structured.bead.length >= structured.big.length ? structured.bead : structured.big;
    return best.length ? best : [...structured.bead, ...structured.big];
  }

  function scanVisualRoadArea(area) {
    const viewportHeight = window.innerHeight;
    const rawBounds = area || {
      left: 0,
      top: viewportHeight * 0.58,
      right: window.innerWidth,
      bottom: viewportHeight - 8,
    };
    const bounds = refineRoadBounds(rawBounds);
    const visualElements = [...document.querySelectorAll("canvas,img")]
      .filter((element) => !root.contains(element))
      .map((element) => ({ element, rect: element.getBoundingClientRect() }))
      .filter(({ rect }) => {
        const visible = rect.width > 40 && rect.height > 16 && rect.bottom >= bounds.top && rect.top <= bounds.bottom;
        const overlapsArea = rect.right >= bounds.left && rect.left <= bounds.right;
        return visible && overlapsArea;
      });

    const points = [];
    visualElements.forEach(({ element, rect }) => {
      try {
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, 480 / rect.width);
        canvas.width = Math.max(1, Math.round(rect.width * scale));
        canvas.height = Math.max(1, Math.round(rect.height * scale));
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.drawImage(element, 0, 0, canvas.width, canvas.height);
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        points.push(...scanColorPoints(imageData, rect, scale)
          .filter((point) => point.x >= bounds.left && point.x <= bounds.right)
          .filter((point) => point.y >= bounds.top && point.y <= bounds.bottom));
      } catch {
        // Safari blocks pixels from protected/cross-origin images. Ignore and keep scanning other elements.
      }
    });

    return splitRoadPoints(mergeNearby(points), "visual-scan");
  }

  function splitRoadPoints(points, source) {
    const clean = points.sort((a, b) => (a.x - b.x) || (a.y - b.y));
    if (clean.length < 3) return { bead: [], big: [] };

    const left = Math.min(...clean.map((point) => point.x));
    const right = Math.max(...clean.map((point) => point.x));
    const top = Math.min(...clean.map((point) => point.y));
    const bottom = Math.max(...clean.map((point) => point.y));
    const splitX = left + (right - left) * 0.305;
    const bigBottom = top + (bottom - top) * 0.52;

    return {
      bead: sortByRoadGrid(clean.filter((point) => point.x <= splitX), source, "bead"),
      big: sortByRoadGrid(clean.filter((point) => point.x > splitX && point.y <= bigBottom), source, "big"),
    };
  }

  function scanColorPoints(imageData, rect, scale) {
    const { data, width, height } = imageData;
    const points = [];
    const step = 4;

    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const offset = (y * width + x) * 4;
        const alpha = data[offset + 3];
        if (alpha < 120) continue;
        const result = classifyRawColor(data[offset], data[offset + 1], data[offset + 2]);
        if (!result) continue;
        points.push({
          result,
          x: rect.left + x / scale,
          y: rect.top + y / scale,
          createdAt: new Date().toISOString(),
        });
      }
    }

    return mergeColorClusters(points);
  }

  function classifyRawColor(r, g, b) {
    if (r > 150 && r > g * 1.25 && r > b * 1.15) return "banker";
    if (b > 135 && b > r * 1.15 && b > g * 1.02) return "player";
    if (g > 125 && g > r * 1.08 && g > b * 1.08) return "tie";
    return null;
  }

  function mergeColorClusters(points) {
    const bucketSize = 14;
    const buckets = new Map();
    points.forEach((point) => {
      const key = `${Math.round(point.x / bucketSize)}:${Math.round(point.y / bucketSize)}`;
      const bucket = buckets.get(key) || { x: 0, y: 0, count: 0, banker: 0, player: 0, tie: 0 };
      bucket.x += point.x;
      bucket.y += point.y;
      bucket.count += 1;
      bucket[point.result] += 1;
      buckets.set(key, bucket);
    });

    return [...buckets.values()]
      .filter((bucket) => bucket.count >= 2 && bucket.count <= 80)
      .map((bucket) => {
        const result = ["banker", "player", "tie"].sort((a, b) => bucket[b] - bucket[a])[0];
        return { result, x: bucket.x / bucket.count, y: bucket.y / bucket.count };
      });
  }

  function dot(round) {
    const color = round.result === "banker" ? "#df3347" : round.result === "player" ? "#2467dc" : "#1e9d63";
    return `<span style="width:14px;height:14px;border-radius:50%;background:${color};display:inline-block"></span>`;
  }

  function roadMark(result, withTieSlash, showText = false) {
    const color = result === "banker" ? "#df3347" : result === "player" ? "#2467dc" : "#1e9d63";
    const text = result === "banker" ? "莊" : result === "player" ? "閒" : "和";
    const slash = withTieSlash
      ? `<span style="position:absolute;width:10px;height:2px;background:#1e9d63;transform:rotate(-45deg);border-radius:999px"></span>`
      : "";
    return `
      <span style="position:relative;width:9px;height:9px;border-radius:50%;border:1.5px solid ${color};display:grid;place-items:center;background:${showText ? color : "white"};color:white;font-size:6px;line-height:1;font-weight:900">
        ${showText && !withTieSlash ? text : ""}
        ${slash}
      </span>`;
  }

  function buildBeadGrid(sourceRounds) {
    const rows = 6;
    const cols = 8;
    const visibleRounds = sourceRounds.slice(-(rows * cols));
    const cells = Array.from({ length: rows * cols }, () => null);
    visibleRounds.forEach((round, index) => {
      const col = Math.floor(index / rows);
      const row = index % rows;
      cells[row * cols + col] = { result: round.result };
    });
    return { rows, cols, cells };
  }

  function buildBigRoad(sourceRounds) {
    const rows = 6;
    const columns = [];
    let cursor = null;
    let lastNonTie = null;
    let startCol = -1;
    let latestCol = 0;

    function ensure(col) {
      while (columns.length <= col) columns.push(Array.from({ length: rows }, () => null));
    }

    sourceRounds.forEach((round) => {
      if (round.result === "tie") {
        if (lastNonTie) lastNonTie.tieCount = (lastNonTie.tieCount || 0) + 1;
        return;
      }

      if (!cursor || cursor.result !== round.result) {
        startCol += 1;
        ensure(startCol);
        while (columns[startCol][0]) {
          startCol += 1;
          ensure(startCol);
        }
        cursor = { result: round.result, startCol, col: startCol, row: 0, lockedRow: false };
      } else {
        const nextRow = cursor.row + 1;
        ensure(cursor.col);
        if (!cursor.lockedRow && nextRow < rows && !columns[cursor.col][nextRow]) {
          cursor.row = nextRow;
        } else {
          cursor.lockedRow = true;
          cursor.col += 1;
          ensure(cursor.col);
        }
      }

      ensure(cursor.col);
      const cell = { result: round.result, tieCount: 0 };
      columns[cursor.col][cursor.row] = cell;
      lastNonTie = cell;
      latestCol = cursor.col;
    });

    const cols = 12;
    const startVisibleCol = Math.max(0, Math.min(latestCol, columns.length - 1) - cols + 1);
    const visibleColumns = columns.slice(startVisibleCol, startVisibleCol + cols);
    while (visibleColumns.length < cols) visibleColumns.push(Array.from({ length: rows }, () => null));
    const cells = [];
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        cells.push(visibleColumns[col][row]);
      }
    }
    return { rows, cols, cells };
  }

  function gridHtml(grid, label, width) {
    return `
      <div style="display:grid;gap:3px">
        <div style="font-size:12px;font-weight:900;color:#607080">${label}</div>
        <div style="display:grid;grid-template-columns:repeat(${grid.cols}, ${width}px);grid-auto-rows:${width}px;border-left:1px solid #cbd5df;border-top:1px solid #cbd5df;background:white;overflow:hidden">
          ${grid.cells.map((cell) => `
            <div style="width:${width}px;height:${width}px;border-right:1px solid #cbd5df;border-bottom:1px solid #cbd5df;display:grid;place-items:center">
              ${cell ? roadMark(cell.result, Boolean(cell.tieCount)) : ""}
            </div>`).join("")}
        </div>
      </div>`;
  }

  function beadGridHtml(sourceRounds, label, width) {
    const rows = 6;
    const cols = 6;
    const totalCols = Math.max(1, Math.ceil(sourceRounds.length / rows));
    const startCol = Math.max(0, totalCols - cols);
    const startIndex = startCol * rows;
    const visibleRounds = sourceRounds.slice(startIndex, startIndex + rows * cols);
    const cells = Array.from({ length: rows * cols }, (_, index) => visibleRounds[index] || null);
    return `
      <div style="display:grid;gap:3px">
        <div style="font-size:12px;font-weight:900;color:#607080">${label}</div>
        <div style="display:grid;grid-template-rows:repeat(${rows}, ${width}px);grid-auto-flow:column;grid-auto-columns:${width}px;border-left:1px solid #cbd5df;border-top:1px solid #cbd5df;background:white;overflow:hidden">
          ${cells.map((cell) => `
            <div style="width:${width}px;height:${width}px;border-right:1px solid #cbd5df;border-bottom:1px solid #cbd5df;display:grid;place-items:center">
              ${cell ? roadMark(cell.result, false, true) : ""}
            </div>`).join("")}
        </div>
      </div>`;
  }

  function pointGridHtml(points, label, width, minCols) {
    if (!points.length) return gridHtml({ rows: 6, cols: minCols, cells: Array.from({ length: 6 * minCols }, () => null) }, label, width);
    const rowSize = estimateStep(points.map((point) => point.y || 0), width);
    const colSize = estimateStep(points.map((point) => point.x || 0), width);
    const minY = Math.min(...points.map((point) => point.y || 0));
    const minX = Math.min(...points.map((point) => point.x || 0));
    const placed = points.map((point) => ({
      ...point,
      row: Math.max(0, Math.min(5, Math.round(((point.y || 0) - minY) / rowSize))),
      col: Math.max(0, Math.round(((point.x || 0) - minX) / colSize)),
    }));
    const cols = Math.max(minCols, Math.max(...placed.map((point) => point.col)) + 1);
    const cells = Array.from({ length: 6 * cols }, () => null);
    placed.forEach((point) => {
      cells[point.row * cols + point.col] = { result: point.result, tieCount: point.tieCount };
    });
    return gridHtml({ rows: 6, cols, cells }, label, width);
  }

  function cycleFabPosition() {
    const positions = [
      { right: 8, top: "26vh" },
      { right: 8, top: "42vh" },
      { right: 8, top: "62vh" },
      { left: 8, top: "42vh" },
      { left: 8, top: "62vh" },
    ];
    const current = JSON.stringify(fabPosition);
    const index = positions.findIndex((position) => JSON.stringify(position) === current);
    fabPosition = positions[(index + 1) % positions.length];
    saveFabPosition();
    render();
  }

  function fabStyle() {
    const horizontal = fabPosition.left != null
      ? `left:${fabPosition.left}px;right:auto;`
      : `right:${fabPosition.right ?? 8}px;left:auto;`;
    const vertical = typeof fabPosition.top === "string"
      ? `top:${fabPosition.top};bottom:auto;`
      : `top:${fabPosition.top ?? Math.round(window.innerHeight * 0.26)}px;bottom:auto;`;
    return `${horizontal}${vertical}`;
  }

  function fabRectFromPosition() {
    const size = 82;
    const left = fabPosition.left != null
      ? Number(fabPosition.left)
      : window.innerWidth - Number(fabPosition.right ?? 8) - size;
    let top;
    if (typeof fabPosition.top === "string" && fabPosition.top.endsWith("vh")) {
      top = window.innerHeight * (parseFloat(fabPosition.top) / 100);
    } else {
      top = Number(fabPosition.top ?? Math.round(window.innerHeight * 0.26));
    }
    return { left, top, size };
  }

  function panelStyle() {
    const icon = fabRectFromPosition();
    const gap = 12;
    const availableLeft = icon.left - gap - 8;
    const panelWidth = Math.max(190, Math.min(276, availableLeft, window.innerWidth - 112));
    const panelHeight = Math.min(Math.round(window.innerHeight * 0.66), 390);
    const left = Math.max(8, Math.round((window.innerWidth - panelWidth) / 2));

    let top = icon.top + icon.size + gap;
    if (top + panelHeight > window.innerHeight - 8) {
      top = Math.max(8, window.innerHeight - panelHeight - 8);
    }

    return `left:${left}px;right:auto;top:${top}px;width:${panelWidth}px;`;
  }

  function updatePanelPosition() {
    const panel = root.querySelector("#baccarat-ai-panel");
    if (!panel) return;
    const styleText = panelStyle();
    styleText.split(";").filter(Boolean).forEach((rule) => {
      const [name, value] = rule.split(":");
      panel.style[name.trim()] = value.trim();
    });
    updateQuickActionsPosition();
    updateToastPosition();
  }

  function quickActionsStyle() {
    const icon = fabRectFromPosition();
    return `left:${icon.left}px;top:${icon.top + icon.size + 6}px;width:${icon.size}px;`;
  }

  function updateQuickActionsPosition() {
    const actions = root.querySelector("#baccarat-ai-quick-actions");
    if (!actions) return;
    const styleText = quickActionsStyle();
    styleText.split(";").filter(Boolean).forEach((rule) => {
      const [name, value] = rule.split(":");
      actions.style[name.trim()] = value.trim();
    });
  }

  function toastStyle() {
    const icon = fabRectFromPosition();
    const width = Math.min(230, window.innerWidth - 20);
    let left = icon.left - width - 8;
    if (left < 8) left = icon.left + icon.size + 8;
    if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
    let top = icon.top;
    if (top + 92 > window.innerHeight - 8) top = window.innerHeight - 100;
    return `left:${Math.max(8, left)}px;top:${Math.max(8, top)}px;width:${width}px;`;
  }

  function updateToastPosition() {
    const toast = root.querySelector("#baccarat-ai-toast");
    if (!toast) return;
    const styleText = toastStyle();
    styleText.split(";").filter(Boolean).forEach((rule) => {
      const [name, value] = rule.split(":");
      toast.style[name.trim()] = value.trim();
    });
  }

  function updateFabAnimation() {
    const fab = root.querySelector("#baccarat-ai-fab");
    if (!fab) return;
    fab.style.animation = !analysisActive && !panelOpen ? "bai-float 2.6s ease-in-out infinite" : "none";
  }

  function startAnalysis() {
    analysisActive = true;
    performance = emptyPerformance();
    pendingRecommendation = null;
    savePerformance();
    savePendingRecommendation();
    normalizeDailyPerformance();
    saveAnalysisActive();
    panelOpen = false;
    const panel = root.querySelector("#baccarat-ai-panel");
    if (panel) panel.style.display = "none";
    updateQuickActions();
    updateFabAnimation();
    showRecommendationToast();
  }

  function endAnalysis() {
    analysisActive = false;
    pendingRecommendation = null;
    saveAnalysisActive();
    savePendingRecommendation();
    updateQuickActions();
    hideRecommendationToast();
    updateFabAnimation();
  }

  function quickCooldownRemaining() {
    return Math.max(0, quickCooldownUntil - Date.now());
  }

  function refreshQuickCooldown() {
    clearTimeout(quickCooldownTimer);
    const remaining = quickCooldownRemaining();
    if (remaining > 0) {
      quickCooldownTimer = setTimeout(updateQuickActions, remaining + 50);
    }
  }

  function quickAdd(result) {
    if (quickCooldownRemaining() > 0) {
      showStatusToast("此局尚未結束");
      return;
    }
    quickCooldownUntil = Date.now() + 10000;
    localStorage.setItem(quickCooldownKey, String(quickCooldownUntil));
    settleRecommendation(result);
    add(result);
    updateQuickActions();
    refreshQuickCooldown();
  }

  function showStatusToast(message) {
    let toast = root.querySelector("#baccarat-ai-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "baccarat-ai-toast";
      toast.style.cssText = `position:fixed;${toastStyle()}z-index:2147483647;background:linear-gradient(145deg,rgba(255,255,255,.98),rgba(246,250,253,.95));border:1px solid rgba(255,255,255,.9);border-radius:14px;box-shadow:0 14px 34px rgba(8,20,38,.28);padding:10px;color:#13202c;font-family:Arial,'Microsoft JhengHei',sans-serif`;
      root.append(toast);
    }
    toast.innerHTML = `<div style="font-size:14px;font-weight:900;text-align:center">${message}</div>`;
    toast.style.display = "block";
    updateToastPosition();
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideRecommendationToast, 1600);
  }

  function toastHtml() {
    const rec = recommendationSnapshot();
    pendingRecommendation = rec;
    savePendingRecommendation();
    const winRateText = rec.action === "observe" ? "-" : `${rec.confidence}%`;
    const betText = rec.betAmount > 0 ? `$${rec.betAmount}` : "$0";
    return `
      <div style="display:grid;gap:4px">
        <div style="font-size:11px;color:#607080">下局推薦</div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
          <b style="font-size:24px;line-height:1">${labels[rec.action]}</b>
          <span style="font-size:14px;font-weight:900;color:#0f8f72">${winRateText}</span>
        </div>
        <div style="display:flex;justify-content:space-between;gap:8px;font-size:12px;color:#405060">
          <span>${rec.strategy}</span>
          <b>${betText}</b>
        </div>
      </div>`;
  }

  function showRecommendationToast() {
    let toast = root.querySelector("#baccarat-ai-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "baccarat-ai-toast";
      toast.style.cssText = `position:fixed;${toastStyle()}z-index:2147483647;background:linear-gradient(145deg,rgba(255,255,255,.98),rgba(246,250,253,.95));border:1px solid rgba(255,255,255,.9);border-radius:14px;box-shadow:0 14px 34px rgba(8,20,38,.28);padding:10px;color:#13202c;font-family:Arial,'Microsoft JhengHei',sans-serif`;
      root.append(toast);
    }
    toast.innerHTML = toastHtml();
    toast.style.display = "block";
    updateToastPosition();
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideRecommendationToast, 3000);
  }

  function hideRecommendationToast() {
    const toast = root.querySelector("#baccarat-ai-toast");
    if (toast) toast.style.display = "none";
  }

  function bindFab(button) {
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    let dragging = false;
    let moved = false;

    function begin(clientX, clientY) {
      const rect = button.getBoundingClientRect();
      button.style.animation = "none";
      startX = clientX;
      startY = clientY;
      startLeft = rect.left;
      startTop = rect.top;
      dragging = true;
      moved = false;
    }

    function move(clientX, clientY) {
      if (!dragging) return;
      const dy = clientY - startY;
      if (Math.abs(dy) > 8) moved = true;
      const railRight = 8;
      const left = window.innerWidth - 82 - railRight;
      const minTop = Math.max(12, window.innerHeight * 0.08);
      const maxTop = Math.min(window.innerHeight - 96, window.innerHeight * 0.46);
      const top = Math.max(minTop, Math.min(maxTop, startTop + dy));
      button.style.left = `${left}px`;
      button.style.right = "auto";
      button.style.top = `${top}px`;
      button.style.bottom = "auto";
      fabPosition = { left, top };
      updatePanelPosition();
      updateQuickActionsPosition();
      updateToastPosition();
    }

  function finish() {
      if (!dragging) return;
      dragging = false;
      if (moved) {
        saveFabPosition();
        updatePanelPosition();
        updateFabAnimation();
        return;
      }
      if (analysisActive) return;
      panelOpen = !panelOpen;
      if (panelOpen) panelMode = "menu";
      const panel = root.querySelector("#baccarat-ai-panel");
      if (panel) {
        panel.innerHTML = panelHtml();
        panel.style.display = panelOpen ? "block" : "none";
        updatePanelPosition();
        bindPanelControls();
      }
      updateFabAnimation();
    }

    button.addEventListener("touchstart", (event) => {
      const touch = event.touches[0];
      if (!touch) return;
      begin(touch.clientX, touch.clientY);
      event.preventDefault();
      event.stopPropagation();
    }, { passive: false });

    button.addEventListener("touchmove", (event) => {
      const touch = event.touches[0];
      if (!touch) return;
      move(touch.clientX, touch.clientY);
      event.preventDefault();
      event.stopPropagation();
    }, { passive: false });

    button.addEventListener("touchend", (event) => {
      finish();
      event.preventDefault();
      event.stopPropagation();
    }, { passive: false });

    button.addEventListener("mousedown", (event) => {
      begin(event.clientX, event.clientY);
      event.preventDefault();
      event.stopPropagation();
    });
    window.addEventListener("mousemove", (event) => move(event.clientX, event.clientY), true);
    window.addEventListener("mouseup", finish, true);
  }

  function bindTapButton(button, handler) {
    if (!button || button.dataset.baiTapBound) return;
    button.dataset.baiTapBound = "true";
    let touched = false;
    button.addEventListener("touchend", (event) => {
      touched = true;
      event.preventDefault();
      event.stopPropagation();
      handler();
      setTimeout(() => {
        touched = false;
      }, 450);
    }, { passive: false });
    button.addEventListener("click", (event) => {
      if (touched) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      handler();
    });
  }

  function panelHtml() {
    const bigGrid = buildBigRoad(rounds.slice(-60));
    const daily = normalizeDailyPerformance();
    const stats = statsMode === "daily" ? daily : performance;
    const profitColor = stats.profit >= 0 ? "#0f8f72" : "#d9273e";
    const glassButton = "height:42px;border:1px solid rgba(210,224,238,.75);border-radius:12px;background:linear-gradient(145deg,rgba(255,255,255,.82),rgba(230,239,248,.72));color:#17212b;font-weight:900;box-shadow:0 10px 22px rgba(15,30,48,.14), inset 0 1px 0 rgba(255,255,255,.95)";
    const tabButton = (mode, label) => {
      const active = statsMode === mode;
      return `<button data-bai-stats-mode="${mode}" style="height:32px;border:1px solid ${active ? "rgba(15,143,114,.58)" : "rgba(205,217,229,.78)"};border-radius:10px;background:${active ? "linear-gradient(145deg,rgba(225,250,244,.95),rgba(194,241,230,.9))" : "rgba(255,255,255,.56)"};color:${active ? "#0b725c" : "#526273"};font-weight:900">${label}</button>`;
    };
    const manualControls = analysisActive ? "" : `
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 36px;gap:6px">
        <button data-bai-result="banker" style="height:42px;border:1px solid rgba(255,255,255,.46);border-radius:12px;background:linear-gradient(145deg,#ff5265,#bd172d);color:white;font-size:18px;font-weight:900;box-shadow:0 8px 18px rgba(223,51,71,.24), inset 0 1px 0 rgba(255,255,255,.36)">莊</button>
        <button data-bai-result="player" style="height:42px;border:1px solid rgba(255,255,255,.46);border-radius:12px;background:linear-gradient(145deg,#3f8bff,#1551bd);color:white;font-size:18px;font-weight:900;box-shadow:0 8px 18px rgba(36,103,220,.24), inset 0 1px 0 rgba(255,255,255,.36)">閒</button>
        <button data-bai-result="tie" style="height:42px;border:1px solid rgba(255,255,255,.46);border-radius:12px;background:linear-gradient(145deg,#30c985,#117446);color:white;font-size:18px;font-weight:900;box-shadow:0 8px 18px rgba(30,157,99,.22), inset 0 1px 0 rgba(255,255,255,.36)">和</button>
        <button data-bai-undo style="height:42px;border:1px solid rgba(205,217,229,.8);border-radius:9px;background:rgba(255,255,255,.58);font-size:18px;box-shadow:inset 0 1px 0 rgba(255,255,255,.85)">↶</button>
      </div>`;

    if (panelMode === "menu") {
      return `
        <div style="padding:10px;display:grid;gap:8px;position:relative">
          <button data-bai-close style="position:absolute;right:7px;top:7px;width:28px;height:28px;border:1px solid rgba(180,196,214,.75);border-radius:999px;background:rgba(255,255,255,.78);color:#17212b;font-size:18px;font-weight:900;line-height:1;box-shadow:0 6px 14px rgba(15,30,48,.12), inset 0 1px 0 rgba(255,255,255,.9)">×</button>
          <div style="font-size:12px;font-weight:900;color:#405060;padding-right:32px">AI 輔助</div>
          <button data-bai-open-road style="${glassButton}">輸入路圖</button>
          <button data-bai-open-stats style="${glassButton}">目前戰績</button>
        </div>`;
    }

    if (panelMode === "stats") {
      return `
        <div style="padding:10px;display:grid;gap:8px;position:relative">
          <button data-bai-close style="position:absolute;right:7px;top:7px;width:28px;height:28px;border:1px solid rgba(180,196,214,.75);border-radius:999px;background:rgba(255,255,255,.78);color:#17212b;font-size:18px;font-weight:900;line-height:1;box-shadow:0 6px 14px rgba(15,30,48,.12), inset 0 1px 0 rgba(255,255,255,.9)">×</button>
          <div style="font-size:12px;font-weight:900;color:#405060;padding-right:32px">目前戰績</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
            ${tabButton("session", "當局")}
            ${tabButton("daily", "當日")}
          </div>
          <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:7px">
            <div style="${glassButton};height:auto;padding:8px"><b style="font-size:20px;color:#0f8f72">${stats.wins}</b><div style="font-size:11px;color:#607080">勝</div></div>
            <div style="${glassButton};height:auto;padding:8px"><b style="font-size:20px;color:#d9273e">${stats.losses}</b><div style="font-size:11px;color:#607080">負</div></div>
            <div style="${glassButton};height:auto;padding:8px"><b style="font-size:20px;color:#1581d8">${stats.ties}</b><div style="font-size:11px;color:#607080">和局</div></div>
            <div style="${glassButton};height:auto;padding:8px"><b style="font-size:20px;color:${profitColor}">${moneyText(stats.profit)}</b><div style="font-size:11px;color:#607080">獲利金額</div></div>
          </div>
          <div style="${glassButton};height:auto;padding:8px;display:grid;gap:2px">
            <span style="font-size:12px;color:#607080">結算方式</span>
            <b style="font-size:13px">依照 AI 上一局推薦與下一局結果計算</b>
          </div>
          <button data-bai-open-road style="${glassButton}">回到路圖</button>
        </div>`;
    }

    return `
      <div style="padding:8px;display:grid;gap:7px;position:relative">
        <button data-bai-close style="position:absolute;right:7px;top:7px;width:28px;height:28px;border:1px solid rgba(180,196,214,.75);border-radius:999px;background:rgba(255,255,255,.72);color:#17212b;font-size:18px;font-weight:900;line-height:1;box-shadow:0 6px 14px rgba(15,30,48,.12), inset 0 1px 0 rgba(255,255,255,.9)">×</button>
        <div style="font-size:12px;font-weight:900;color:#405060;padding-right:32px">輸入路圖</div>
        ${manualControls}
        <div data-bai-road-scroll style="display:grid;grid-template-columns:100px 1fr;gap:7px;overflow:hidden;max-width:100%">
          <div>${beadGridHtml(rounds, "珠盤路", 15)}</div>
          <div style="overflow:hidden">${gridHtml(bigGrid, "大路", 15)}</div>
        </div>
        <button data-bai-start style="height:34px;border:1px solid rgba(15,143,114,.48);border-radius:9px;background:linear-gradient(145deg,rgba(232,251,246,.95),rgba(204,244,235,.92));color:#0b725c;font-weight:900;box-shadow:inset 0 1px 0 rgba(255,255,255,.85)">開始分析</button>
        <button data-bai-clear style="height:34px;border:1px solid rgba(205,217,229,.78);border-radius:9px;background:rgba(255,255,255,.54);font-weight:800;box-shadow:inset 0 1px 0 rgba(255,255,255,.85)">清空路單</button>
      </div>`;
  }

  function quickActionsHtml() {
    const display = analysisActive ? "grid" : "none";
    const buttonStyle = "width:62px;height:38px;border:1px solid rgba(255,255,255,.52);border-radius:13px;color:white;font-size:17px;font-weight:900;box-shadow:0 10px 20px rgba(0,0,0,.24), inset 0 1px 0 rgba(255,255,255,.34)";
    return `
      <div id="baccarat-ai-quick-actions" style="position:fixed;${quickActionsStyle()}z-index:2147483646;display:${display};gap:6px;justify-items:center">
        <button data-bai-quick="banker" style="${buttonStyle};background:linear-gradient(145deg,#f04458,#b8172c)">莊</button>
        <button data-bai-quick="player" style="${buttonStyle};background:linear-gradient(145deg,#347be8,#1551bd)">閒</button>
        <button data-bai-quick="tie" style="${buttonStyle};background:linear-gradient(145deg,#28b677,#117446)">和</button>
        <button data-bai-end style="${buttonStyle};background:linear-gradient(145deg,#5a6675,#1e2733);font-size:14px">結束</button>
      </div>`;
  }

  function bindPanelControls() {
    bindTapButton(root.querySelector("[data-bai-open-road]"), () => {
      panelMode = "road";
      updatePanel();
    });
    bindTapButton(root.querySelector("[data-bai-open-stats]"), () => {
      panelMode = "stats";
      updatePanel();
    });
    root.querySelectorAll("[data-bai-stats-mode]").forEach((button) => {
      bindTapButton(button, () => {
        statsMode = button.getAttribute("data-bai-stats-mode") || "session";
        updatePanel();
      });
    });
    root.querySelectorAll("[data-bai-result]").forEach((button) => {
      bindTapButton(button, () => add(button.getAttribute("data-bai-result")));
    });
    bindTapButton(root.querySelector("[data-bai-undo]"), undo);
    bindTapButton(root.querySelector("[data-bai-close]"), () => {
      panelOpen = false;
      const panel = root.querySelector("#baccarat-ai-panel");
      if (panel) panel.style.display = "none";
      updateFabAnimation();
    });
    bindTapButton(root.querySelector("[data-bai-start]"), startAnalysis);
    bindTapButton(root.querySelector("[data-bai-clear]"), clearRounds);
    bindTapButton(root.querySelector("[data-bai-end-panel]"), endAnalysis);
  }

  function bindQuickActions() {
    root.querySelectorAll("[data-bai-quick]").forEach((button) => {
      bindTapButton(button, () => quickAdd(button.getAttribute("data-bai-quick")));
    });
    bindTapButton(root.querySelector("[data-bai-end]"), endAnalysis);
  }

  function updateQuickActions() {
    let actions = root.querySelector("#baccarat-ai-quick-actions");
    if (!actions) {
      root.insertAdjacentHTML("beforeend", quickActionsHtml());
      actions = root.querySelector("#baccarat-ai-quick-actions");
    } else {
      actions.outerHTML = quickActionsHtml();
      actions = root.querySelector("#baccarat-ai-quick-actions");
    }
    actions.style.display = analysisActive ? "grid" : "none";
    updateQuickActionsPosition();
    bindQuickActions();
    refreshQuickCooldown();
  }

  function updatePanel() {
    const panel = root.querySelector("#baccarat-ai-panel");
    if (!panel) {
      render();
      return;
    }
    panel.innerHTML = panelHtml();
    panel.style.display = panelOpen ? "block" : "none";
    updatePanelPosition();
    bindPanelControls();
  }

  function render() {
    const style = document.createElement("style");
    style.textContent = `
      #baccarat-ai-floating-root button {
        -webkit-tap-highlight-color: transparent;
        transition: none;
        touch-action: manipulation;
        -webkit-user-select: none;
        user-select: none;
      }
      @keyframes bai-float {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-7px); }
      }
    `;
    root.innerHTML = `
      <button id="baccarat-ai-fab" aria-label="AI 輔助" style="position:fixed;${fabStyle()}z-index:2147483647;width:82px;height:82px;border:0;background:transparent;padding:0;box-shadow:none;touch-action:none">
        <img src="${iconSrc}" alt="" onerror="this.style.display='none';this.parentNode.textContent='AI';this.parentNode.style.color='white';this.parentNode.style.background='linear-gradient(145deg,#13b18d,#085b8c)';this.parentNode.style.borderRadius='50%';this.parentNode.style.fontWeight='900';" style="width:100%;height:100%;display:block;pointer-events:none;object-fit:contain" />
      </button>
      <section id="baccarat-ai-panel" style="position:fixed;${panelStyle()}z-index:2147483647;max-height:72vh;overflow:auto;background:linear-gradient(145deg,rgba(255,255,255,.985),rgba(244,249,252,.965));color:#13202c;border:1px solid rgba(255,255,255,.94);border-radius:18px;box-shadow:0 20px 52px rgba(8,20,38,.36), inset 0 1px 0 rgba(255,255,255,.92);font-family:Arial,'Microsoft JhengHei',sans-serif;display:${panelOpen ? "block" : "none"}">
        ${panelHtml()}
      </section>
      ${quickActionsHtml()}`;
    root.prepend(style);

    bindFab(root.querySelector("#baccarat-ai-fab"));
    bindPanelControls();
    bindQuickActions();
    updateFabAnimation();
    requestAnimationFrame(() => {
      const roadScroll = root.querySelector("[data-bai-road-scroll]");
      if (roadScroll) roadScroll.scrollLeft = roadScroll.scrollWidth;
    });
  }

  const root = document.createElement("div");
  root.id = "baccarat-ai-floating-root";
  validateAccess().then((allowed) => {
    if (!allowed) return;
    document.body.append(root);
    render();
  });
})();
