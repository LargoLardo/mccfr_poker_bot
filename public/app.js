const RANKS = "23456789TJQKA";
const SUITS = "cdhs";
const SUIT_GLYPH = { c: "♣", d: "♦", h: "♥", s: "♠" };
const STREET_NAMES = ["Preflop", "Flop", "Turn", "River"];
const ACTIONS = ["fold", "check/call", "raise"];

const $ = (id) => document.getElementById(id);
const ui = Object.fromEntries([
  "modelStatus", "agentStack", "userStack", "agentPosition", "userPosition", "agentCards", "userCards",
  "agentBet", "userBet", "pot", "board", "message", "street", "toCall", "lastAction", "actions",
  "foldButton", "callButton", "raiseButton", "raiseSlider", "raiseOutput", "finishedActions", "newHandButton",
  "newHandTop", "resultDetail",
].map((id) => [id, $(id)]));

let model = {};
let handNumber = 0;
let bankroll = [100, 100];
let game;

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
  handNumber++;
  if (bankroll.some((stack) => stack < 1)) bankroll = [100, 100];
  const cards = deck();
  game = {
    cards, hole: [[cards.pop(), cards.pop()], [cards.pop(), cards.pop()]], board: [],
    stacks: [...bankroll], committed: [0, 0], bets: [0, 0], pot: 0,
    user: handNumber % 2, agent: (handNumber + 1) % 2, actor: 0, street: 0,
    pending: new Set([0, 1]), histories: [[], [], [], []], lastRaise: 1,
    finished: false, reveal: false, lastAction: "Blinds posted", result: "",
  };
  pay(0, 0.5); pay(1, 1);
  render();
  if (game.actor === game.agent) scheduleAgent();
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
  game.actor = 1; // Big blind acts first postflop heads-up.
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
  bankroll = [...game.stacks];
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
  ui.userPosition.textContent = user === 0 ? "SB" : "BB"; ui.agentPosition.textContent = agent === 0 ? "SB" : "BB";
  ui.userPosition.classList.toggle("dealer", user === 0); ui.agentPosition.classList.toggle("dealer", agent === 0);
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

function preflopWeights() {
  const history = game.histories[0], hand = preflopHand(game.hole[game.agent]);
  const effective = Math.min(...game.stacks);
  const stack = effective < 20 ? "short" : effective < 50 ? "medium" : "deep";
  const key = [hand, game.agent === 0 ? "SB" : "BB", stack, historyBucket(history), sizeBucket(history)].join("|");
  const node = model[key];
  const fallback = heuristicPreflop(hand, history, toCall(game.agent) > 0);
  if (!node) return fallback;
  const confidence = Math.min(node[3] / 2000, 1) * .9;
  return fallback.map((weight, i) => confidence * node[i] + (1 - confidence) * weight);
}

function postflopWeights() {
  const equity = estimateEquity(game.hole[game.agent], game.board, 160);
  const facing = toCall(game.agent) > 0;
  if (!facing) return [0, Math.max(.32, .82 - equity * .55), Math.min(.68, .18 + equity * .55)];
  const potOdds = toCall(game.agent) / (game.pot + game.bets[0] + game.bets[1] + toCall(game.agent));
  if (equity > .72) return [0, .38, .62];
  if (equity + .06 >= potOdds) return [.12, .76, .12];
  return [.78, .21, .01];
}

function scheduleAgent() {
  render();
  window.setTimeout(() => {
    if (game.finished || game.actor !== game.agent) return;
    const weights = game.street === 0 ? preflopWeights() : postflopWeights();
    if (toCall(game.agent) === 0) weights[0] = 0;
    if (game.stacks[game.agent] <= toCall(game.agent)) weights[2] = 0;
    const choice = weightedChoice(weights);
    if (choice === 2) {
      const high = Math.max(...game.bets);
      const target = game.street === 0 ? Math.max(high * 3, minRaiseTo()) : Math.max(minRaiseTo(), high + (game.pot + game.bets[0] + game.bets[1]) * .65);
      act("raise", Math.min(target, maxRaiseTo()));
    } else act(ACTIONS[choice]);
  }, 520);
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
ui.newHandButton.addEventListener("click", newHand); ui.newHandTop.addEventListener("click", newHand);
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
} catch (error) {
  ui.modelStatus.lastChild.textContent = " Heuristic strategy";
}
newHand();
