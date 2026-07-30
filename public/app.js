const resultLabels = {
  banker: "莊",
  player: "閒",
  tie: "和",
  observe: "觀望",
};

const riskLabels = {
  low: "低風險",
  medium: "中風險",
  high: "高風險",
};

const state = {
  lineUserId: localStorage.getItem("lineUserId") || "demo-line-user",
  rounds: [],
  detectedRounds: [],
  selectedSite: {
    id: "bc78999",
    name: "BC78999 百家樂",
    url: "https://bc78999.net/",
    isEmbeddable: false,
  },
};

const elements = {
  loginButton: document.querySelector("#loginButton"),
  siteName: document.querySelector("#siteName"),
  siteFrame: document.querySelector("#siteFrame"),
  embedStatus: document.querySelector("#embedStatus"),
  fallbackPanel: document.querySelector("#fallbackPanel"),
  openSiteButton: document.querySelector("#openSiteButton"),
  actionText: document.querySelector("#actionText"),
  confidenceText: document.querySelector("#confidenceText"),
  riskBadge: document.querySelector("#riskBadge"),
  reasonText: document.querySelector("#reasonText"),
  roadGrid: document.querySelector("#roadGrid"),
  detectedRoad: document.querySelector("#detectedRoad"),
  reviewPanel: document.querySelector("#reviewPanel"),
  detectConfidence: document.querySelector("#detectConfidence"),
  screenshotInput: document.querySelector("#screenshotInput"),
  applyDetectedButton: document.querySelector("#applyDetectedButton"),
  undoButton: document.querySelector("#undoButton"),
  totalRounds: document.querySelector("#totalRounds"),
  bankerCount: document.querySelector("#bankerCount"),
  playerCount: document.querySelector("#playerCount"),
  tieCount: document.querySelector("#tieCount"),
};

async function api(path, options = {}) {
  const separator = path.includes("?") ? "&" : "?";
  const response = await fetch(`/api${path}${separator}t=${Date.now()}`, {
    headers: { "content-type": "application/json" },
    cache: "no-store",
    ...options,
  });
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  return response.json();
}

async function bootstrap() {
  bindEvents();
  await loadSupportedSite();
  const data = await api("/sessions", {
    method: "POST",
    body: JSON.stringify({ lineUserId: state.lineUserId }),
  });
  state.rounds = data.session.rounds || [];
  renderRecommendation(data.recommendation);
  renderRoad();
}

function bindEvents() {
  elements.loginButton.addEventListener("click", () => {
    const lineUserId = window.prompt("請輸入 LINE 使用者代號", state.lineUserId);
    if (!lineUserId) return;
    state.lineUserId = lineUserId.trim();
    localStorage.setItem("lineUserId", state.lineUserId);
    bootstrap();
  });

  document.querySelectorAll("[data-result]").forEach((button) => {
    button.addEventListener("click", () => addRound(button.dataset.result));
  });

  elements.undoButton.addEventListener("click", async () => {
    state.rounds.pop();
    await saveRounds();
  });

  elements.screenshotInput.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const analysis = await analyzeScreenshot(file);
    const data = await api("/screenshots/analyze", {
      method: "POST",
      body: JSON.stringify({
        lineUserId: state.lineUserId,
        detectedRounds: analysis.rounds,
        confidence: analysis.confidence,
      }),
    });
    state.detectedRounds = data.rounds;
    renderDetectedRoad(data.rounds, data.confidence);
  });

  elements.applyDetectedButton.addEventListener("click", async () => {
    state.rounds = state.detectedRounds.map((round) => ({ ...round, source: "screenshot-review" }));
    await saveRounds();
    elements.reviewPanel.hidden = true;
  });

  elements.openSiteButton.addEventListener("click", () => {
    if (state.selectedSite?.url) window.open(state.selectedSite.url, "_blank", "noopener");
  });
}

async function loadSupportedSite() {
  const data = await api("/supported-sites");
  state.selectedSite = data.sites.find((site) => site.id === "bc78999") || state.selectedSite;
  elements.siteName.textContent = state.selectedSite.name;
  elements.openSiteButton.textContent = state.selectedSite.id === "bc78999" ? "開啟 BC78999" : "開新分頁";
  elements.openSiteButton.disabled = !state.selectedSite.url;
  elements.siteFrame.src = state.selectedSite.isEmbeddable === true ? state.selectedSite.url : "about:blank";
  elements.embedStatus.textContent = state.selectedSite.isEmbeddable === true
    ? "已同頁顯示。"
    : "BC78999 禁止同頁嵌入，請開啟平台後回來用截圖或手動路單分析。";

  if (state.selectedSite.isEmbeddable !== true) showFallback();
}

function showFallback() {
  elements.fallbackPanel.hidden = false;
  elements.embedStatus.textContent = "此平台禁止同頁顯示，請改用新分頁與截圖/手動流程。";
}

async function addRound(result) {
  state.rounds.push({ result, source: "manual", confidence: 100, createdAt: new Date().toISOString() });
  await saveRounds();
}

async function saveRounds() {
  const data = await api("/rounds", {
    method: "POST",
    body: JSON.stringify({ lineUserId: state.lineUserId, rounds: state.rounds }),
  });
  state.rounds = data.session.rounds;
  renderRecommendation(data.recommendation);
  renderRoad();
}

function renderRecommendation(recommendation) {
  const action = recommendation.action || "observe";
  elements.actionText.textContent = resultLabels[action] || "觀望";
  elements.confidenceText.textContent = String(recommendation.confidence ?? 0);
  elements.riskBadge.className = `risk-badge ${recommendation.riskLevel || "high"}`;
  elements.riskBadge.textContent = riskLabels[recommendation.riskLevel] || "高風險";
  elements.reasonText.textContent = recommendation.reasons?.join(" ") || "暫無明顯訊號。";

  const stats = recommendation.stats || {};
  elements.totalRounds.textContent = String(stats.totalRounds || 0);
  elements.bankerCount.textContent = String(stats.bankerCount || 0);
  elements.playerCount.textContent = String(stats.playerCount || 0);
  elements.tieCount.textContent = String(stats.tieCount || 0);
}

function renderRoad() {
  renderRoadGrid(elements.roadGrid, state.rounds, false);
}

function renderDetectedRoad(rounds, confidence) {
  elements.reviewPanel.hidden = false;
  elements.applyDetectedButton.disabled = rounds.length === 0;
  elements.detectConfidence.textContent = `${confidence}%`;
  renderRoadGrid(elements.detectedRoad, rounds, true);
}

function renderRoadGrid(container, rounds, editable) {
  container.innerHTML = "";
  const visibleRounds = rounds.slice(-72);
  const cells = Math.max(24, Math.ceil(visibleRounds.length / 12) * 12);

  for (let index = 0; index < cells; index += 1) {
    const round = visibleRounds[index];
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "road-cell";
    cell.disabled = !editable || !round;
    if (round) {
      const dot = document.createElement("span");
      dot.className = `road-dot ${round.result}`;
      dot.title = resultLabels[round.result];
      cell.append(dot);
    }
    if (editable && round) {
      cell.addEventListener("click", () => {
        round.result = nextResult(round.result);
        renderDetectedRoad(state.detectedRounds, Number(elements.detectConfidence.textContent.replace("%", "")));
      });
    }
    container.append(cell);
  }
}

function nextResult(result) {
  if (result === "banker") return "player";
  if (result === "player") return "tie";
  return "banker";
}

async function analyzeScreenshot(file) {
  const image = await loadImage(file);
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, 900 / image.width);
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const points = detectColoredPoints(imageData);
  const rounds = clusterPoints(points).slice(-72);
  const confidence = rounds.length ? Math.min(88, 42 + rounds.length * 3) : 0;
  return { rounds, confidence };
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = URL.createObjectURL(file);
  });
}

function detectColoredPoints(imageData) {
  const { data, width, height } = imageData;
  const points = [];
  const step = 5;

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const offset = (y * width + x) * 4;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      const result = classifyPixel(r, g, b);
      if (result) points.push({ x, y, result });
    }
  }

  return points;
}

function classifyPixel(r, g, b) {
  if (r > 145 && r > g * 1.35 && r > b * 1.25) return "banker";
  if (b > 135 && b > r * 1.25 && b > g * 1.05) return "player";
  if (g > 120 && g > r * 1.15 && g > b * 1.15) return "tie";
  return null;
}

function clusterPoints(points) {
  if (!points.length) return [];
  const bucketSize = 18;
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
    .filter((bucket) => bucket.count >= 3)
    .map((bucket) => {
      const result = ["banker", "player", "tie"].sort((a, b) => bucket[b] - bucket[a])[0];
      return {
        x: bucket.x / bucket.count,
        y: bucket.y / bucket.count,
        result,
        source: "screenshot",
        confidence: Math.min(92, 45 + bucket.count * 4),
        createdAt: new Date().toISOString(),
      };
    })
    .sort((a, b) => (a.y - b.y) || (a.x - b.x))
    .map(({ result, source, confidence, createdAt }) => ({ result, source, confidence, createdAt }));
}

bootstrap().catch((error) => {
  elements.reasonText.textContent = `系統啟動失敗：${error.message}`;
});
