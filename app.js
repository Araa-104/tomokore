const STORAGE_KEY = "tomokore_state_v1";
const LOCATIONS = ["自室", "廊下", "談話室", "食堂", "中庭", "勉強スペース"];

const state = {
  characters: [],
  relations: [],
  events: [],
  lastLaunchAt: null,
};

const screens = {
  map: document.getElementById("screen-map"),
  characters: document.getElementById("screen-characters"),
  create: document.getElementById("screen-create"),
  settings: document.getElementById("screen-settings"),
  detail: document.getElementById("screen-detail"),
};

let selectedCharacterId = null;

init();

function init() {
  loadState();
  runOfflineCatchUp();
  wireEvents();
  renderAll();
  state.lastLaunchAt = Date.now();
  saveState();
  setInterval(() => {
    renderTime();
  }, 1000 * 30);
}

function wireEvents() {
  document.querySelectorAll(".tab-nav button").forEach((button) => {
    button.addEventListener("click", () => switchScreen(button.dataset.screen));
  });

  document.getElementById("createForm").addEventListener("submit", (event) => {
    event.preventDefault();
    createCharacter(new FormData(event.currentTarget));
    event.currentTarget.reset();
    switchScreen("characters");
  });

  document.getElementById("runSimulation").addEventListener("click", () => {
    simulateHours(1);
    renderAll();
    saveState();
  });

  document.getElementById("clearData").addEventListener("click", () => {
    if (!window.confirm("データをすべて削除します。よろしいですか？")) return;
    localStorage.removeItem(STORAGE_KEY);
    window.location.reload();
  });

  document.getElementById("backToList").addEventListener("click", () => {
    switchScreen("characters");
  });
}

function switchScreen(key) {
  Object.values(screens).forEach((screen) => screen.classList.remove("active"));
  screens[key].classList.add("active");

  document.querySelectorAll(".tab-nav button").forEach((button) => {
    button.classList.toggle("active", button.dataset.screen === key);
  });

  if (key === "detail") renderDetail();
}

function createCharacter(formData) {
  const name = String(formData.get("name") || "").trim();
  if (!name) return;

  const character = {
    id: `char_${Date.now()}`,
    name,
    displayName: String(formData.get("displayName") || "").trim() || name,
    avatar: {
      hair: formData.get("hair"),
      hairColor: formData.get("hairColor"),
      eyes: formData.get("eyes"),
      mouth: formData.get("mouth"),
      face: formData.get("face"),
      skinColor: formData.get("skinColor"),
      clothesColor: formData.get("clothesColor"),
    },
    status: {
      sleepiness: rand(15, 50),
      stress: rand(10, 45),
      mood: rand(50, 80),
      energy: rand(50, 85),
      social: rand(40, 80),
    },
    personality: {
      sociability: clampNum(formData.get("sociability")),
      kindness: clampNum(formData.get("kindness")),
      sensitivity: clampNum(formData.get("sensitivity")),
      stubbornness: clampNum(formData.get("stubbornness")),
    },
    currentLocation: "自室",
    currentAction: "くつろいでいる",
    quote: "今日はどんな日になるかな？",
  };

  state.characters.forEach((other) => {
    state.relations.push(makeInitialRelation(character.id, other.id));
    state.relations.push(makeInitialRelation(other.id, character.id));
  });

  state.characters.push(character);
  addEvent(`${character.displayName}が入寮しました`, [character.id]);
  renderAll();
  saveState();
}

function runOfflineCatchUp() {
  if (!state.lastLaunchAt) return;
  const elapsedMs = Date.now() - state.lastLaunchAt;
  const elapsedHours = Math.floor(elapsedMs / (1000 * 60 * 60));
  if (elapsedHours <= 0) return;
  simulateHours(Math.min(elapsedHours, 48));
  addEvent(`アプリを閉じている間に${elapsedHours}時間が経過しました`, []);
}

function simulateHours(hours) {
  for (let i = 0; i < hours; i += 1) {
    state.characters.forEach((character) => {
      updateStatus(character);
      decideAction(character);
    });
    maybeTriggerInteractionEvent();
  }
}

function updateStatus(character) {
  const slot = getTimeSlot();
  if (slot === "深夜") {
    character.status.sleepiness = clamp(character.status.sleepiness - 10);
    character.status.energy = clamp(character.status.energy + 10);
  } else {
    character.status.sleepiness = clamp(character.status.sleepiness + rand(-2, 8));
    character.status.energy = clamp(character.status.energy + rand(-8, 4));
  }

  character.status.stress = clamp(character.status.stress + rand(-5, 6));
  character.status.mood = clamp(character.status.mood + rand(-7, 7));
  character.status.social = clamp(character.status.social + rand(-4, 5));
}

function decideAction(character) {
  const slot = getTimeSlot();
  const sleepiness = character.status.sleepiness;
  const stress = character.status.stress;

  if (slot === "深夜" || sleepiness >= 70) {
    character.currentLocation = "自室";
    character.currentAction = "寝ている";
    character.quote = "……すやすや";
    return;
  }

  if (stress >= 70) {
    character.currentLocation = "中庭";
    character.currentAction = "ひとりで落ち着いている";
    character.quote = "少しだけ静かにしてたいな。";
    return;
  }

  const options = [
    { action: "廊下をうろうろ", location: "廊下", quote: "誰かいるかな？" },
    { action: "談話している", location: "談話室", quote: "雑談しよ〜" },
    { action: "勉強している", location: "勉強スペース", quote: "いま集中中。" },
    { action: "食堂で休憩", location: "食堂", quote: "ちょっと休憩！" },
  ];

  const choice = options[rand(0, options.length - 1)];
  character.currentAction = choice.action;
  character.currentLocation = choice.location;
  character.quote = choice.quote;
}

function maybeTriggerInteractionEvent() {
  if (state.characters.length < 2) return;

  const grouped = new Map();
  state.characters.forEach((character) => {
    const list = grouped.get(character.currentLocation) || [];
    list.push(character);
    grouped.set(character.currentLocation, list);
  });

  grouped.forEach((members, location) => {
    if (members.length < 2 || Math.random() > 0.35) return;
    const a = members[rand(0, members.length - 1)];
    let b = members[rand(0, members.length - 1)];
    if (a.id === b.id) return;

    const relation = getRelation(a.id, b.id);
    if (!relation) return;

    if (relation.emotion.trust >= 60 && relation.emotion.affection >= 55) {
      relation.emotion.trust = clamp(relation.emotion.trust + rand(1, 5));
      relation.emotion.affection = clamp(relation.emotion.affection + rand(1, 4));
      addEvent(`${a.displayName}と${b.displayName}が${location}で楽しく話した`, [a.id, b.id]);
    } else if (relation.emotion.awkwardness >= 50) {
      relation.emotion.awkwardness = clamp(relation.emotion.awkwardness + rand(1, 3));
      addEvent(`${a.displayName}と${b.displayName}の間に気まずい沈黙`, [a.id, b.id]);
    } else {
      relation.emotion.interest = clamp(relation.emotion.interest + rand(1, 4));
      addEvent(`${a.displayName}が${b.displayName}を少し気にし始めた`, [a.id, b.id]);
    }
  });

  state.events = state.events.slice(0, 25);
}

function renderAll() {
  renderTime();
  renderMap();
  renderCharacterList();
  renderDetail();
}

function renderTime() {
  const now = new Date();
  document.getElementById("timeLabel").textContent = `${now.toLocaleString("ja-JP")} / ${getTimeSlot()}`;

  const vibeMap = {
    朝: "朝の支度で少しバタバタしています。",
    昼: "それぞれのペースで活動中です。",
    夜: "会話イベントが起きやすい時間です。",
    深夜: "ほとんどの住人が眠っています。",
  };
  document.getElementById("vibeLabel").textContent = vibeMap[getTimeSlot()];
}

function renderMap() {
  const mapGrid = document.getElementById("mapGrid");
  mapGrid.innerHTML = "";

  LOCATIONS.forEach((location) => {
    const residents = state.characters.filter((character) => character.currentLocation === location);
    const locationEvents = state.events.filter((event) => event.text.includes(location)).slice(0, 1);

    const card = document.createElement("article");
    card.className = "location-card";
    card.innerHTML = `
      <h3>${location}</h3>
      <div class="row">${residents
        .map(
          (character) =>
            `<button class="resident-chip" data-char-id="${character.id}">
              ${renderFaceIcon(character)}
              <span>${character.displayName}</span>
            </button>`
        )
        .join("") || "<small>誰もいません</small>"}</div>
      <p>${locationEvents.length ? `💡 ${locationEvents[0].text}` : "特にイベントなし"}</p>
    `;

    card.querySelectorAll("[data-char-id]").forEach((el) => {
      el.addEventListener("click", () => openDetail(el.dataset.charId));
    });

    mapGrid.append(card);
  });

  const recent = state.events.slice(0, 3).map((event) => `• ${event.text}`).join("<br>");
  document.getElementById("eventSummary").innerHTML = recent || "現在通知はありません。";
}

function renderCharacterList() {
  const list = document.getElementById("characterList");
  list.innerHTML = "";

  if (state.characters.length === 0) {
    list.innerHTML = "<p class='char-card'>まず1人作成してください。</p>";
    return;
  }

  state.characters.forEach((character) => {
    const card = document.createElement("article");
    card.className = "char-card";
    card.innerHTML = `
      <div class="row">
        ${renderFaceIcon(character)}
        <strong>${character.displayName}</strong>
      </div>
      <p>現在地: ${character.currentLocation}</p>
      <p>行動: ${character.currentAction}</p>
      <button data-id="${character.id}">様子を見る</button>
    `;
    card.querySelector("button").addEventListener("click", () => openDetail(character.id));
    list.append(card);
  });
}

function openDetail(characterId) {
  selectedCharacterId = characterId;
  switchScreen("detail");
}

function renderDetail() {
  if (!selectedCharacterId) return;
  const character = state.characters.find((item) => item.id === selectedCharacterId);
  if (!character) return;

  const relations = state.relations
    .filter((relation) => relation.from === character.id)
    .slice(0, 4)
    .map((relation) => {
      const to = state.characters.find((item) => item.id === relation.to);
      return `${to?.displayName || "?"}: 信頼${relation.emotion.trust}/好意${relation.emotion.affection}`;
    });

  document.getElementById("detailPanel").innerHTML = `
    <article class="detail-card">
      <div class="row">
        ${renderFaceIcon(character)}
        <h3>${character.displayName}</h3>
      </div>
      <p>現在地: ${character.currentLocation}</p>
      <p>今の行動: ${character.currentAction}</p>
      <p>ひとこと: 「${character.quote}」</p>
      <div class="stack">
        <small>眠気: ${character.status.sleepiness}</small>
        <small>ストレス: ${character.status.stress}</small>
        <small>気分: ${character.status.mood}</small>
        <small>社会性: ${character.status.social}</small>
        <small>元気: ${character.status.energy}</small>
      </div>
      <hr>
      <h4>主な関係</h4>
      <p>${relations.join("<br>") || "まだ関係データがありません"}</p>
    </article>
  `;
}

function addEvent(text, characterIds) {
  state.events.unshift({
    id: `evt_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`,
    text,
    characterIds,
    createdAt: Date.now(),
  });
}

function makeInitialRelation(from, to) {
  return {
    from,
    to,
    emotion: {
      affection: rand(30, 65),
      trust: rand(35, 70),
      respect: rand(25, 65),
      jealousy: rand(0, 20),
      dislike: rand(0, 15),
      awkwardness: rand(5, 30),
      interest: rand(35, 80),
      dependency: rand(10, 30),
    },
  };
}

function getRelation(from, to) {
  return state.relations.find((relation) => relation.from === from && relation.to === to);
}

function getTimeSlot(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 7 && hour <= 11) return "朝";
  if (hour >= 12 && hour <= 17) return "昼";
  if (hour >= 18 && hour <= 23) return "夜";
  return "深夜";
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    state.characters = parsed.characters || [];
    state.relations = parsed.relations || [];
    state.events = parsed.events || [];
    state.lastLaunchAt = parsed.lastLaunchAt || null;
  } catch {
    console.warn("保存データが破損しているため初期化します");
  }
}

function saveState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      characters: state.characters,
      relations: state.relations,
      events: state.events,
      lastLaunchAt: state.lastLaunchAt,
    })
  );
}

function clamp(value) {
  return Math.max(0, Math.min(100, value));
}

function clampNum(value) {
  const num = Number(value);
  if (Number.isNaN(num)) return 50;
  return clamp(num);
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function renderFaceIcon(character) {
  const eyesClass = `eyes-${character.avatar.eyes || "round2"}`;
  const mouthClass = `mouth-${character.avatar.mouth || "smile1"}`;
  const faceClass = `face-${character.avatar.face || "round"}`;
  const hairClass = `hair-${character.avatar.hair || "short1"}`;

  return `
    <span
      class="face-icon ${eyesClass} ${mouthClass} ${faceClass} ${hairClass}"
      style="
        --hair-color:${character.avatar.hairColor};
        --skin-color:${character.avatar.skinColor};
        --clothes-color:${character.avatar.clothesColor};
      "
      aria-label="${character.displayName}の顔アイコン"
    >
      <span class="hair"></span>
      <span class="face-base">
        <span class="eyes"></span>
        <span class="mouth"></span>
      </span>
      <span class="clothes"></span>
    </span>
  `;
}
