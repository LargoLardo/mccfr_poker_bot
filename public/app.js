const RANKS = "23456789TJQKA";
const SUITS = "cdhs";
const SUIT_GLYPH = { c: "♣", d: "♦", h: "♥", s: "♠" };
const STREET_NAMES = ["Preflop", "Flop", "Turn", "River"];
const ACTIONS = ["fold", "check/call", "raise"];
const STORAGE_KEY = "lard-plays-poker-progress-v1";
const DISPLAY_RANKS = [...RANKS].reverse();
const AGENT_DELAY_MS = 1_500;

const $ = (id) => document.getElementById(id);
const ui = Object.fromEntries([
  "modelStatus", "agentStack", "userStack", "agentPosition", "userPosition", "agentCards", "userCards",
  "agentBet", "userBet", "pot", "board", "message", "street", "toCall", "lastAction", "actions",
  "foldButton", "callButton", "raiseButton", "raiseSlider", "raiseOutput", "finishedActions", "newHandButton",
  "newHandTop", "newGameTop", "resultDetail", "rangePosition", "rangeHistory", "rangeStack", "rangeSize", "rangeGrid", "rangeFold", "rangeCall", "rangeRaise",
  "foldBar", "callBar", "raiseBar", "rangeDetail", "spotCoverage",
].map((id) => [id, $(id)]));

let model = {};
let rangeMode = "all";
let rangeSpots = [];
const savedProgress = loadProgress();
let handNumber = savedProgress.handNumber;
let bankroll = savedProgress.bankroll;
let game;

function loadProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(saved?.bankroll) && saved.bankroll.length === 2 && saved.bankroll.every((value) => Number.isFinite(value) && value >= 0)) {
      return { bankroll: saved.bankroll, handNumber: Number.isInteger(saved.handNumber) ? saved.handNumber : 0 };
    }
  } catch (_) { /* Storage can be unavailable in privacy-restricted browsers. */ }
  return { bankroll: [100, 100], handNumber: 0 };
}

function saveProgress() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ bankroll, handNumber })); } catch (_) { /* Continue without persistence. */ }
}

function deck() {
  const cards = [...RANKS].flatMap((rank) => [...SUITS].map((suit) => rank + suit));
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

function pay(player, amount) {
  const paid = Math.min(amount, game.stacks[player]);
  game.stacks[player] -= paid;
  game.bets[player] += paid;
  game.committed[player] += paid;
  return paid;
}

function newHand() {
  if (bankroll.some((stack) => stack < 1)) {
    if (game) { game.result = "Game over — start a new game to reset the stacks"; render(); }
    return;
  }
  handNumber++;
  saveProgress();
  const cards = deck();
  const user = handNumber % 2, agent = (handNumber + 1) % 2;
  const stacks = [];
  stacks[user] = bankroll[0];
  stacks[agent] = bankroll[1];
  game = {
    cards, hole: [[cards.pop(), cards.pop()], [cards.pop(), cards.pop()]], board: [],
    stacks, committed: [0, 0], bets: [0, 0], pot: 0,
    user, agent, actor: 1, street: 0,
    pending: new Set([0, 1]), histories: [[], [], [], []], lastRaise: 1,
    finished: false, reveal: false, lastAction: "Blinds posted", result: "",
  };
  pay(0, 1); pay(1, 0.5);
  logNewHand();
  render();
  if (game.actor === game.agent) scheduleAgent();
}

function logNewHand() {
  const timestamp = new Date().toISOString();
  console.groupCollapsed(`[Lard] Hand #${handNumber} dealt — ${timestamp}`);
  console.log("Timestamp:", timestamp);
  console.log("Lard's cards:", game.hole[game.agent].join(" "));
  console.log("Lard's position:", game.agent === 1 ? "SB" : "BB");
  console.log("Stacks:", { player: `${bankroll[0]} BB`, lard: `${bankroll[1]} BB` });
  console.groupEnd();
}

function startNewGame() {
  const hasProgress = handNumber > 0 || bankroll.some((stack) => stack !== 100);
  if (hasProgress && !window.confirm("Start a new game? This resets both stacks to 100 BB.")) return;
  bankroll = [100, 100];
  handNumber = 0;
  saveProgress();
  newHand();
}

function toCall(player = game.actor) { return Math.max(...game.bets) - game.bets[player]; }
function minRaiseTo() { return Math.min(game.bets[game.actor] + game.stacks[game.actor], Math.max(...game.bets) + game.lastRaise); }
function maxRaiseTo() { return game.bets[game.actor] + game.stacks[game.actor]; }
function fmt(amount) { return `${Number(amount.toFixed(2))} BB`; }

function act(kind, raiseTo = null) {
  if (game.finished || game.actor === null) return;
  const player = game.actor;
  const call = toCall(player);
  if (kind === "fold") {
    if (call <= 0) return;
    game.histories[game.street].push("fold");
    game.lastAction = `${name(player)} folds`;
    finishHand(1 - player, "won by fold");
    return;
  }
  if (kind === "raise") {
    const maximum = maxRaiseTo();
    const target = Math.max(minRaiseTo(), Math.min(Number(raiseTo), maximum));
    const oldHigh = Math.max(...game.bets);
    pay(player, target - game.bets[player]);
    game.lastRaise = Math.max(1, target - oldHigh);
    game.pending = new Set([1 - player]);
    game.histories[game.street].push("raise");
    game.lastAction = `${name(player)} raises to ${fmt(target)}`;
  } else {
    pay(player, call);
    game.pending.delete(player);
    game.histories[game.street].push("check/call");
    game.lastAction = call ? `${name(player)} calls ${fmt(call)}` : `${name(player)} checks`;
  }

  if (game.stacks[1 - player] === 0) game.pending.delete(1 - player);
  if (game.pending.size === 0) closeRound();
  else game.actor = 1 - player;
  render();
  if (!game.finished && game.actor === game.agent) scheduleAgent();
}

function closeRound() {
  // Return an unmatched all-in overage before moving chips into the pot.
  if (game.stacks.some((stack) => stack === 0) && game.bets[0] !== game.bets[1]) {
    const high = game.bets[0] > game.bets[1] ? 0 : 1;
    const excess = Math.abs(game.bets[0] - game.bets[1]);
    game.bets[high] -= excess;
    game.stacks[high] += excess;
  }
  game.pot += game.bets[0] + game.bets[1];
  game.bets = [0, 0];
  if (game.street === 3) return showdown();
  game.street++;
  const dealCount = game.street === 1 ? 3 : 1;
  for (let i = 0; i < dealCount; i++) game.board.push(game.cards.pop());
  if (game.stacks.some((stack) => stack === 0)) {
    while (game.board.length < 5) game.board.push(game.cards.pop());
    game.street = 3;
    return showdown();
  }
  game.actor = 0; // Big blind acts first postflop heads-up.
  game.pending = new Set([0, 1]);
  game.lastRaise = 1;
}

function showdown() {
  const scores = game.hole.map((hole) => bestHand([...hole, ...game.board]));
  game.reveal = true;
  if (compareScore(scores[0], scores[1]) > 0) finishHand(0, scores[0].name, true);
  else if (compareScore(scores[1], scores[0]) > 0) finishHand(1, scores[1].name, true);
  else finishHand(null, `split pot · ${scores[0].name}`, true);
}

function finishHand(winner, reason, potAlreadyCollected = false) {
  if (!potAlreadyCollected) game.pot += game.bets[0] + game.bets[1];
  game.bets = [0, 0];
  if (winner === null) { game.stacks[0] += game.pot / 2; game.stacks[1] += game.pot / 2; }
  else game.stacks[winner] += game.pot;
  bankroll = [game.stacks[game.user], game.stacks[game.agent]];
  saveProgress();
  game.result = winner === null ? "The pot is split" : `${name(winner)} wins ${fmt(game.pot)}`;
  game.lastAction = reason;
  game.finished = true; game.actor = null; game.reveal = true;
  render();
}

function name(player) { return player === game.user ? "You" : "Lard"; }

function cardMarkup(card, hidden = false) {
  if (hidden) return '<span class="card back" aria-label="Hidden card"></span>';
  const [rank, suit] = card;
  return `<span class="card ${suit === "h" || suit === "d" ? "red" : ""}" aria-label="${rank} of ${suit}">${rank}<small>${SUIT_GLYPH[suit]}</small></span>`;
}

function render() {
  const user = game.user, agent = game.agent;
  ui.userStack.textContent = fmt(game.stacks[user]); ui.agentStack.textContent = fmt(game.stacks[agent]);
  ui.userPosition.textContent = user === 1 ? "SB" : "BB"; ui.agentPosition.textContent = agent === 1 ? "SB" : "BB";
  ui.userPosition.classList.toggle("dealer", user === 1); ui.agentPosition.classList.toggle("dealer", agent === 1);
  ui.userCards.innerHTML = game.hole[user].map((card) => cardMarkup(card)).join("");
  ui.agentCards.innerHTML = game.hole[agent].map((card) => cardMarkup(card, !game.reveal)).join("");
  ui.board.innerHTML = game.board.map((card) => cardMarkup(card)).join("") + Array.from({ length: 5 - game.board.length }, () => '<span class="board-slot"></span>').join("");
  ui.pot.textContent = fmt(game.pot + game.bets[0] + game.bets[1]);
  renderBet(ui.userBet, game.bets[user]); renderBet(ui.agentBet, game.bets[agent]);
  ui.street.textContent = STREET_NAMES[game.street];
  ui.lastAction.textContent = game.lastAction;
  const userTurn = !game.finished && game.actor === user;
  const call = userTurn ? toCall(user) : 0;
  ui.toCall.textContent = fmt(call);
  ui.message.textContent = game.finished ? game.result : game.actor === user ? "Your move" : "Lard is thinking…";
  ui.actions.classList.toggle("hidden", game.finished);
  ui.finishedActions.classList.toggle("hidden", !game.finished);
  ui.resultDetail.textContent = game.finished ? game.lastAction : "";
  const gameOver = game.finished && bankroll.some((stack) => stack < 1);
  ui.newHandButton.textContent = gameOver ? "Start a new game" : "Deal next hand";
  for (const button of [ui.foldButton, ui.callButton, ui.raiseButton]) button.disabled = !userTurn;
  ui.foldButton.disabled = !userTurn || call === 0;
  ui.callButton.textContent = call ? `Call ${fmt(call).replace(" BB", "")}` : "Check";
  if (userTurn) configureRaise();
}

function renderBet(element, amount) {
  element.classList.toggle("hidden", amount <= 0);
  element.querySelector("strong").textContent = fmt(amount);
}

function configureRaise() {
  const min = minRaiseTo(), max = maxRaiseTo();
  ui.raiseSlider.min = min; ui.raiseSlider.max = max; ui.raiseSlider.step = 0.5;
  if (+ui.raiseSlider.value < min || +ui.raiseSlider.value > max) ui.raiseSlider.value = Math.min(max, Math.max(min, Math.max(...game.bets) + game.pot * 0.5));
  ui.raiseOutput.textContent = fmt(+ui.raiseSlider.value);
  ui.raiseButton.disabled = max <= Math.max(...game.bets) || game.stacks[game.user] <= toCall(game.user);
}

function preflopHand(cards) {
  const ranks = [cards[0][0], cards[1][0]].sort().join("");
  return ranks + (cards[0][1] === cards[1][1] ? "s" : "o");
}

function historyBucket(history) {
  if (!history.length) return "root";
  if (history.length === 1) return history[0] === "check/call" ? "limped" : history[0] === "raise" ? "vs_open" : "root";
  if (history.length === 2) return history.every((a) => a === "raise") ? "vs_3bet" : "vs_open";
  if (history.length === 3) return history.every((a) => a === "raise") ? "vs_4bet" : "vs_3bet";
  return "vs_4bet";
}

function sizeBucket(history) {
  const historyName = historyBucket(history);
  const call = toCall(game.agent);
  if (historyName === "limped") return "Limp";
  if (call > 0 && call <= 2) return "~2.0bb raise";
  if (call <= 2.75) return "~2.75bb raise";
  if (call < 6) return "~6.0bb raise";
  if (call < 10) return "~10.0bb raise";
  if (call < 25) return "~25.0bb raise";
  if (call >= 25) return "Jam (>25.00bb) raise";
  return "Limp";
}

function handStrength(hand) {
  const values = [...hand.slice(0, 2)].map((rank) => RANKS.indexOf(rank) + 2).sort((a, b) => b - a);
  const pair = values[0] === values[1], suited = hand.endsWith("s");
  if ((pair && values[0] >= 11) || (values[0] === 14 && values[1] >= 13) || (suited && values[0] === 14 && values[1] >= 12)) return "premium";
  if (pair || (values[0] === 14 && values[1] >= 10) || (values[0] >= 12 && values[1] >= 10) || (suited && values[0] - values[1] <= 2)) return "playable";
  return "trash";
}

function heuristicPreflop(hand, history, facing) {
  if (!facing) return [0, 0.72, 0.28];
  const strength = handStrength(hand), fourBet = historyBucket(history) === "vs_4bet";
  if (fourBet) return { premium:[0, .25, .75], playable:[.72, .25, .03], trash:[.97, .03, 0] }[strength];
  return { premium:[0, .35, .65], playable:[.28, .55, .17], trash:[.78, .20, .02] }[strength];
}

function preflopDecisionContext() {
  const history = game.histories[0], hand = preflopHand(game.hole[game.agent]);
  const effective = Math.min(...game.stacks);
  const stack = effective < 20 ? "short" : effective < 50 ? "medium" : "deep";
  const key = [hand, game.agent === 1 ? "SB" : "BB", stack, historyBucket(history), sizeBucket(history)].join("|");
  const node = model[key];
  const fallback = heuristicPreflop(hand, history, toCall(game.agent) > 0);
  if (!node) return { weights:fallback, spot:key, source:"heuristic fallback (untrained node)" };
  const confidence = Math.min(node[3] / 2000, 1) * .9;
  return {
    weights:fallback.map((weight, i) => confidence * node[i] + (1 - confidence) * weight),
    spot:key,
    source:`trained node blended with heuristic prior (${node[3].toLocaleString()} visits)`,
  };
}

const HISTORY_LABELS = { root:"Unopened — SB acts first", limped:"After SB limp", vs_open:"Facing open", vs_3bet:"Facing 3-bet", vs_4bet:"Facing 4-bet+" };

function rangeHand(row, column) {
  if (row === column) return { label:`${row}${column}`, key:[row, column].sort().join("") + "o", combos:6 };
  const rowIndex = DISPLAY_RANKS.indexOf(row), columnIndex = DISPLAY_RANKS.indexOf(column);
  const suited = columnIndex > rowIndex;
  const high = rowIndex < columnIndex ? row : column;
  const low = high === row ? column : row;
  return { label:`${high}${low}${suited ? "s" : "o"}`, key:[row, column].sort().join("") + (suited ? "s" : "o"), combos:suited ? 4 : 12 };
}

function initializeRangeExplorer() {
  const spots = [...new Set(Object.keys(model).map((key) => key.split("|").slice(1).join("|")))];
  const historyOrder = { root:0, limped:1, vs_open:2, vs_3bet:3, vs_4bet:4 };
  spots.sort((a, b) => {
    const aa = a.split("|"), bb = b.split("|");
    return (historyOrder[aa[2]] ?? 9) - (historyOrder[bb[2]] ?? 9) || aa[0].localeCompare(bb[0]) || a.localeCompare(b);
  });
  rangeSpots = spots.map((spot) => {
    const [position, stack, history, size] = spot.split("|");
    return { position, stack, history, size };
  });
  const filters = [ui.rangePosition, ui.rangeStack, ui.rangeHistory, ui.rangeSize];
  filters.forEach((filter, index) => filter.addEventListener("change", () => {
    populateRangeFilters(index + 1);
    renderRange();
  }));
  populateRangeFilters(0);
  document.querySelectorAll("[data-range-action]").forEach((button) => button.addEventListener("click", () => {
    rangeMode = button.dataset.rangeAction;
    document.querySelectorAll("[data-range-action]").forEach((item) => item.classList.toggle("active", item === button));
    renderRange();
  }));
  renderRange();
}

function populateRangeFilters(startIndex) {
  const filters = [
    { element:ui.rangePosition, key:"position", label:(value) => value },
    { element:ui.rangeStack, key:"stack", label:(value) => value.replace("_", " ") },
    { element:ui.rangeHistory, key:"history", label:(value) => HISTORY_LABELS[value] || value },
    { element:ui.rangeSize, key:"size", label:(value) => {
      if (ui.rangeHistory.value === "root") return "Blinds posted";
      if (ui.rangeHistory.value === "limped") return "Limp";
      return value;
    } },
  ];
  for (let index = startIndex; index < filters.length; index++) {
    const available = rangeSpots.filter((spot) => filters.slice(0, index).every((filter) => spot[filter.key] === filter.element.value));
    const values = [...new Set(available.map((spot) => spot[filters[index].key]))];
    const current = filters[index].element.value;
    filters[index].element.innerHTML = values.map((value) => `<option value="${value}">${filters[index].label(value)}</option>`).join("");
    if (values.includes(current)) filters[index].element.value = current;
    filters[index].element.disabled = values.length <= 1;
  }
  const sizingCount = ui.rangeSize.options.length;
  ui.spotCoverage.textContent = sizingCount <= 1
    ? "One sizing was trained for this node; additional sizes require a wider training tree."
    : `${sizingCount} trained sizings are available for this node.`;
}

function renderRange() {
  const spot = [ui.rangePosition.value, ui.rangeStack.value, ui.rangeHistory.value, ui.rangeSize.value].join("|");
  const totals = [0, 0, 0];
  let totalCombos = 0;
  const cells = [];
  const colors = ["#4d90c7", "#4dc78e", "#d75f61"];
  const modeIndex = ACTIONS.indexOf(rangeMode);

  for (const row of DISPLAY_RANKS) for (const column of DISPLAY_RANKS) {
    const hand = rangeHand(row, column);
    const node = model[`${hand.key}|${spot}`];
    if (!node) {
      cells.push(`<button class="range-cell missing" disabled><strong>${hand.label}</strong><small>—</small></button>`);
      continue;
    }
    const frequencies = node.slice(0, 3);
    frequencies.forEach((frequency, index) => { totals[index] += frequency * hand.combos; });
    totalCombos += hand.combos;
    let background;
    let shownFrequency;
    if (rangeMode === "all") {
      const foldEnd = frequencies[0] * 100, callEnd = (frequencies[0] + frequencies[1]) * 100;
      background = `linear-gradient(90deg,${colors[0]} 0 ${foldEnd}%,${colors[1]} ${foldEnd}% ${callEnd}%,${colors[2]} ${callEnd}% 100%)`;
      shownFrequency = Math.max(...frequencies);
    } else {
      shownFrequency = frequencies[modeIndex];
      const alpha = .08 + shownFrequency * .92;
      background = `color-mix(in srgb, ${colors[modeIndex]} ${alpha * 100}%, #101c18)`;
    }
    const title = `${hand.label} — Fold ${(frequencies[0] * 100).toFixed(1)}%, Call ${(frequencies[1] * 100).toFixed(1)}%, Raise ${(frequencies[2] * 100).toFixed(1)}% · ${node[3].toLocaleString()} visits`;
    cells.push(`<button class="range-cell" style="background:${background}" title="${title}" aria-label="${title}"><strong>${hand.label}</strong><small>${Math.round(shownFrequency * 100)}%</small></button>`);
  }
  ui.rangeGrid.innerHTML = cells.join("");
  ui.rangeGrid.querySelectorAll(".range-cell:not(.missing)").forEach((cell) => {
    cell.addEventListener("click", () => { ui.rangeDetail.textContent = cell.getAttribute("aria-label"); });
    cell.addEventListener("mouseenter", () => { ui.rangeDetail.textContent = cell.getAttribute("aria-label"); });
  });
  const averages = totals.map((total) => totalCombos ? total / totalCombos : 0);
  [ui.rangeFold, ui.rangeCall, ui.rangeRaise].forEach((element, index) => { element.textContent = `${(averages[index] * 100).toFixed(1)}%`; });
  [ui.foldBar, ui.callBar, ui.raiseBar].forEach((element, index) => { element.style.width = `${averages[index] * 100}%`; });
}

function postflopDecisionContext() {
  const equity = estimateEquity(game.hole[game.agent], game.board, 160);
  const facing = toCall(game.agent) > 0;
  const position = game.agent === 1 ? "SB" : "BB";
  const spot = `${STREET_NAMES[game.street]}|${position}|board:${game.board.join(" ")}|pot:${fmt(game.pot + game.bets[0] + game.bets[1])}|to-call:${fmt(toCall(game.agent))}|equity:${(equity * 100).toFixed(1)}%`;
  if (!facing) return {
    weights:[0, Math.max(.32, .82 - equity * .55), Math.min(.68, .18 + equity * .55)],
    spot,
    source:"postflop sampled-equity heuristic",
  };
  const potOdds = toCall(game.agent) / (game.pot + game.bets[0] + game.bets[1] + toCall(game.agent));
  let weights;
  if (equity > .72) weights = [0, .38, .62];
  else if (equity + .06 >= potOdds) weights = [.12, .76, .12];
  else weights = [.78, .21, .01];
  return { weights, spot, source:`postflop sampled-equity heuristic (pot odds ${(potOdds * 100).toFixed(1)}%)` };
}

function normalizeWeights(weights) {
  const total = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0);
  if (total <= 0) return [0, 1, 0];
  return weights.map((weight) => Math.max(0, weight) / total);
}

function logAgentDecision(context, frequencies, decision) {
  const timestamp = new Date().toISOString();
  console.group(`[Lard decision] ${timestamp}`);
  console.log("Timestamp:", timestamp);
  console.log("Cards:", game.hole[game.agent].join(" "));
  console.log("Spot:", context.spot);
  console.log("Strategy source:", context.source);
  console.log(
    `Action frequencies: Fold ${(frequencies[0] * 100).toFixed(2)}% | `
    + `Call ${(frequencies[1] * 100).toFixed(2)}% | Raise ${(frequencies[2] * 100).toFixed(2)}%`,
  );
  console.table({
    Fold: { frequency:`${(frequencies[0] * 100).toFixed(2)}%` },
    Call: { frequency:`${(frequencies[1] * 100).toFixed(2)}%` },
    Raise: { frequency:`${(frequencies[2] * 100).toFixed(2)}%` },
  });
  console.log("Ultimate decision:", decision);
  console.groupEnd();
}

function scheduleAgent() {
  render();
  const scheduledGame = game;
  window.setTimeout(() => {
    if (game !== scheduledGame || game.finished || game.actor !== game.agent) return;
    const context = game.street === 0 ? preflopDecisionContext() : postflopDecisionContext();
    const weights = [...context.weights];
    if (toCall(game.agent) === 0) weights[0] = 0;
    if (game.stacks[game.agent] <= toCall(game.agent)) weights[2] = 0;
    const frequencies = normalizeWeights(weights);
    const choice = weightedChoice(frequencies);
    if (choice === 2) {
      const high = Math.max(...game.bets);
      const target = game.street === 0 ? Math.max(high * 3, minRaiseTo()) : Math.max(minRaiseTo(), high + (game.pot + game.bets[0] + game.bets[1]) * .65);
      logAgentDecision(context, frequencies, `Raise to ${fmt(Math.min(target, maxRaiseTo()))}`);
      act("raise", Math.min(target, maxRaiseTo()));
    } else {
      const decision = choice === 1 ? (toCall(game.agent) > 0 ? `Call ${fmt(toCall(game.agent))}` : "Check") : "Fold";
      logAgentDecision(context, frequencies, decision);
      act(ACTIONS[choice]);
    }
  }, AGENT_DELAY_MS);
}

function weightedChoice(weights) {
  const total = weights.reduce((a, b) => a + Math.max(0, b), 0);
  let value = Math.random() * total;
  for (let i = 0; i < weights.length; i++) if ((value -= Math.max(0, weights[i])) <= 0) return i;
  return 1;
}

function estimateEquity(hero, board, samples) {
  const known = new Set([...hero, ...board]);
  const available = [...RANKS].flatMap((rank) => [...SUITS].map((suit) => rank + suit)).filter((card) => !known.has(card));
  let wins = 0;
  for (let n = 0; n < samples; n++) {
    const sample = [...available];
    for (let i = sample.length - 1; i > sample.length - 8 && i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [sample[i], sample[j]] = [sample[j], sample[i]]; }
    const needed = 5 - board.length;
    const villain = sample.slice(-2), runout = [...board, ...sample.slice(-2 - needed, -2)];
    const a = bestHand([...hero, ...runout]), b = bestHand([...villain, ...runout]);
    const comparison = compareScore(a, b);
    wins += comparison > 0 ? 1 : comparison === 0 ? .5 : 0;
  }
  return wins / samples;
}

function bestHand(cards) {
  let best = null;
  for (let a = 0; a < cards.length - 4; a++) for (let b = a + 1; b < cards.length - 3; b++)
    for (let c = b + 1; c < cards.length - 2; c++) for (let d = c + 1; d < cards.length - 1; d++)
      for (let e = d + 1; e < cards.length; e++) {
        const score = scoreFive([cards[a], cards[b], cards[c], cards[d], cards[e]]);
        if (!best || compareScore(score, best) > 0) best = score;
      }
  return best;
}

function scoreFive(cards) {
  const values = cards.map((card) => RANKS.indexOf(card[0]) + 2).sort((a, b) => b - a);
  const counts = new Map(); values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  const groups = [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const flush = cards.every((card) => card[1] === cards[0][1]);
  const unique = [...new Set(values)]; if (unique[0] === 14) unique.push(1);
  let straight = 0; for (let i = 0; i <= unique.length - 5; i++) if (unique[i] - unique[i + 4] === 4) straight = Math.max(straight, unique[i]);
  if (flush && straight) return { rank:8, kickers:[straight], name:"straight flush" };
  if (groups[0][1] === 4) return { rank:7, kickers:[groups[0][0], groups[1][0]], name:"four of a kind" };
  if (groups[0][1] === 3 && groups[1][1] === 2) return { rank:6, kickers:[groups[0][0], groups[1][0]], name:"full house" };
  if (flush) return { rank:5, kickers:values, name:"flush" };
  if (straight) return { rank:4, kickers:[straight], name:"straight" };
  if (groups[0][1] === 3) return { rank:3, kickers:[groups[0][0], ...groups.slice(1).map((g) => g[0]).sort((a,b)=>b-a)], name:"three of a kind" };
  if (groups[0][1] === 2 && groups[1][1] === 2) return { rank:2, kickers:[Math.max(groups[0][0], groups[1][0]), Math.min(groups[0][0], groups[1][0]), groups[2][0]], name:"two pair" };
  if (groups[0][1] === 2) return { rank:1, kickers:[groups[0][0], ...groups.slice(1).map((g) => g[0]).sort((a,b)=>b-a)], name:"pair" };
  return { rank:0, kickers:values, name:"high card" };
}

function compareScore(a, b) {
  if (a.rank !== b.rank) return a.rank - b.rank;
  for (let i = 0; i < Math.max(a.kickers.length, b.kickers.length); i++) if ((a.kickers[i] || 0) !== (b.kickers[i] || 0)) return (a.kickers[i] || 0) - (b.kickers[i] || 0);
  return 0;
}

ui.foldButton.addEventListener("click", () => act("fold"));
ui.callButton.addEventListener("click", () => act("check/call"));
ui.raiseButton.addEventListener("click", () => act("raise", +ui.raiseSlider.value));
ui.raiseSlider.addEventListener("input", () => { ui.raiseOutput.textContent = fmt(+ui.raiseSlider.value); });
document.querySelectorAll("[data-size]").forEach((button) => button.addEventListener("click", () => {
  const size = button.dataset.size;
  const target = size === "allin" ? maxRaiseTo() : Math.max(...game.bets) + (game.pot + game.bets[0] + game.bets[1]) * Number(size);
  ui.raiseSlider.value = Math.min(maxRaiseTo(), Math.max(minRaiseTo(), target));
  ui.raiseOutput.textContent = fmt(+ui.raiseSlider.value);
}));
ui.newHandButton.addEventListener("click", () => bankroll.some((stack) => stack < 1) ? startNewGame() : newHand());
ui.newHandTop.addEventListener("click", newHand);
ui.newGameTop.addEventListener("click", startNewGame);
function activateTab(button) {
  document.querySelectorAll("[data-tab]").forEach((tab) => {
    const selected = tab === button;
    tab.classList.toggle("active", selected);
    tab.setAttribute("aria-selected", String(selected));
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.toggle("hidden", panel.id !== button.dataset.tab));
  history.replaceState(null, "", `#${button.dataset.tab}`);
}
document.querySelectorAll("[data-tab]").forEach((button) => button.addEventListener("click", () => activateTab(button)));
const linkedTab = document.querySelector(`[data-tab="${location.hash.slice(1)}"]`);
if (linkedTab) activateTab(linkedTab);
document.addEventListener("keydown", (event) => {
  if (event.target.matches("input")) return;
  if (event.key.toLowerCase() === "f" && !ui.foldButton.disabled) ui.foldButton.click();
  if (event.key.toLowerCase() === "c" && !ui.callButton.disabled) ui.callButton.click();
  if (event.key.toLowerCase() === "r" && !ui.raiseButton.disabled) ui.raiseButton.click();
});

try {
  model = await fetch("/preflop-model.json").then((response) => {
    if (!response.ok) throw new Error("Strategy unavailable");
    return response.json();
  });
  ui.modelStatus.classList.add("ready"); ui.modelStatus.lastChild.textContent = ` ${Object.keys(model).length.toLocaleString()} strategy nodes`;
  initializeRangeExplorer();
} catch (error) {
  ui.modelStatus.lastChild.textContent = " Heuristic strategy";
  ui.rangeGrid.innerHTML = '<p class="range-error">The trained strategy could not be loaded.</p>';
}
newHand();
