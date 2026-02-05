const socket = io(); // Connect to Server
const IMAGES = "images/";
const DATA = [
    { name: "Blazing Colt", type: "atk", val: 10, cost: 1, img: "blazing_colt.png", count: 5 },
    { name: "Blazing Pegasus", type: "atk", val: 15, cost: 2, img: "blazing_pegasus.png", count: 2 },
    { name: "Angelic Stallion", type: "atk", val: 20, cost: 3, img: "angelic_stallion.png", count: 1 },
    { name: "Dark Knight", type: "def", val: 10, cost: 1, img: "dark_knight.png", count: 5 },
    { name: "Damned Knight", type: "def", val: 15, cost: 2, img: "damned_knight.png", count: 2 },
    { name: "Devil King", type: "def", val: 20, cost: 3, img: "devil_king.png", count: 1 },
    { name: "Queen's Mirror", type: "skl", val: 0, cost: 0, img: "queens_mirror.png", count: 3, effect: "reflect" },
    { name: "Reflection Torture", type: "skl", val: 0, cost: 0, img: "reflection_torture.png", count: 2, effect: "supref" },
    { name: "Castle Breaker", type: "skl", val: 0, cost: 0, img: "castle_breaker.png", count: 3, effect: "breakd" },
    { name: "Stealthy Shinobi", type: "skl", val: 0, cost: 0, img: "stealthy_shinobi.png", count: 3, effect: "disarm" },
    { name: "Secret Agent 12", type: "skl", val: 0, cost: 0, img: "secret_agent_12.png", count: 3, effect: "miss" }
];

let deck = [];
let pHP = 60, aiHP = 60, turnCount = 1;
// aiHand is removed (we don't see opponent's hand in online play)
let pHand = [], pField = [null, null, null], aiField = [null, null, null];
let actions = 0, discarded = false, selectedIdx = null, sacrifices = [];
let isMyTurn = false; // Network Turn Lock
let roomCode = "";

// --- LOBBY FUNCTIONS ---

function createGame() {
    let code = document.getElementById('room-code').value;
    if(!code) return alert("Enter a room code!");
    socket.emit("create_room", code);
    roomCode = code;
}

function joinGame() {
    let code = document.getElementById('room-code').value;
    if(!code) return alert("Enter a room code!");
    socket.emit("join_room", code);
    roomCode = code;
}

// --- SOCKET LISTENERS ---

socket.on("room_created", (msg) => {
    document.getElementById('lobby-status').innerText = msg;
    isMyTurn = true; // Creator goes first usually, or wait for game_start
});

socket.on("error_msg", (msg) => alert(msg));

socket.on("game_start", (data) => {
    // Hide Lobby, Show Board
    document.getElementById('lobby-screen').style.display = 'none';
    document.getElementById('game-board').style.display = 'grid'; // Assuming grid layout
    
    // Determine Turn
    isMyTurn = (socket.id === data.startTurn);
    
    // Initialize Game
    initGame();
    addToLog("Game Started!", "sys");
    addToLog(isMyTurn ? "Your Turn!" : "Opponent's Turn", isMyTurn ? "p" : "ai");
    render();
});

socket.on("opponent_move", (data) => {
    // 1. Replicate their sacrifice (clearing slots)
    if(data.sacrifices && data.sacrifices.length > 0) {
        data.sacrifices.forEach(idx => aiField[idx] = null);
        addToLog(`Opponent sacrificed ${data.sacrifices.length} cards`, "ai");
    }

    // 2. Place their card
    aiField[data.slot] = data.card;
    addToLog(`Opponent played ${data.card.name}`, "ai");
    
    render();
});

socket.on("your_turn", () => {
    startMyTurn();
});


// --- GAME LOGIC ---

function initGame() {
    deck = [];
    DATA.forEach(card => { for(let i=0; i<card.count; i++) deck.push({...card}); });
    deck.sort(() => Math.random() - 0.5);

    pHP = 60; aiHP = 60; turnCount = 1;
    pField = [null, null, null]; aiField = [null, null, null];
    pHand = [];
    
    document.getElementById('game-log').innerHTML = '';
    
    for(let i=0; i<3; i++) {
        let c = drawCard(); if(c) pHand.push(c);
    }
}

function drawCard() {
    if(deck.length === 0) return null;
    return deck.splice(0, 1)[0];
}

function startMyTurn() {
    isMyTurn = true;
    turnCount++;
    actions = 0; 
    discarded = false;
    
    addToLog(`--- TURN ${turnCount} START ---`, "sys");

    // 1. Cards finish charging
    pField.forEach(c => { if(c) c.charging = false; });
    aiField.forEach(c => { if(c) c.charging = false; });

    // 2. Reaction Phase: Opponent's attacks land on ME
    // In online play, aiField represents the opponent's board state
    resolveCombat(aiField, pField, true);
    
    // 3. Draw to 3
    while(pHand.length < 3) {
        let card = drawCard();
        if(card) pHand.push(card); else break;
    }

    render();
    checkGameOver();
}

function addToLog(msg, type = "sys") {
    const ul = document.getElementById('game-log');
    if(!ul) return;
    const li = document.createElement('li');
    li.innerText = msg;
    li.className = `log-${type}`;
    ul.appendChild(li);
    const box = document.getElementById('log-box');
    if(box) box.scrollTop = box.scrollHeight;
}

function render() {
    document.getElementById('p-hp').innerText = pHP;
    document.getElementById('ai-hp').innerText = aiHP;
    document.getElementById('turn-count').innerText = turnCount;
    
    // Controls locked if not my turn
    document.getElementById('btn-discard').disabled = (discarded || selectedIdx === null || !isMyTurn);
    const btnEnd = document.getElementById('btn-end');
    if(btnEnd) {
        btnEnd.disabled = !isMyTurn;
        btnEnd.innerText = isMyTurn ? "END TURN" : "OPPONENT'S TURN";
    }

    const preview = document.getElementById('selection-preview');
    if (preview) preview.innerText = selectedIdx !== null ? pHand[selectedIdx].name.toUpperCase() : "";

    const handDiv = document.getElementById('hand');
    handDiv.innerHTML = '';
    pHand.forEach((c, i) => {
        const div = document.createElement('div');
        div.className = `card ${selectedIdx === i ? 'selected' : ''}`;
        div.style.backgroundImage = `url('${IMAGES}${c.img}')`;
        if(isMyTurn) {
            div.onclick = () => { selectedIdx = i; sacrifices = []; render(); updateInstr(); };
        }
        handDiv.appendChild(div);
    });

    for(let i=0; i<3; i++) {
        renderField('p-'+i, pField[i], i);
        renderField('ai-'+i, aiField[i], i);
    }
}

function renderField(id, card, col) {
    const slot = document.getElementById(id);
    if (!slot) return;
    slot.innerHTML = '';
    slot.classList.remove('highlight');
    
    if(card) {
        const div = document.createElement('div');
        const isSacTarget = sacrifices.includes(col);
        div.className = `card ${card.charging ? 'charging' : ''} ${isSacTarget ? 'sac-target' : ''}`;
        div.style.backgroundImage = `url('${IMAGES}${card.img}')`;
        
        if(id.startsWith('p') && isMyTurn) {
            div.onclick = (e) => { 
                e.stopPropagation(); 
                if (isSacTarget && sacrifices.length === getCost()) {
                    clickSlot(col);
                } else {
                    toggleSac(col); 
                }
            };
        }
        slot.appendChild(div);
    } 

    if (selectedIdx !== null && id.startsWith('p') && isMyTurn) {
        const costNeeded = getCost();
        const cardToPlay = pHand[selectedIdx];
        const isSlotAvailable = (pField[col] === null || sacrifices.includes(col));
        const laneRulePassed = !(cardToPlay.type === 'atk' && aiField[col] && aiField[col].type === 'atk');

        if (sacrifices.length === costNeeded && isSlotAvailable && laneRulePassed) {
            slot.classList.add('highlight');
        }
    }
}

function getCost() {
    if (selectedIdx === null) return 0;
    let c = pHand[selectedIdx];
    if (c.type === 'skl') return 0;
    let onBoard = pField.filter(x => x !== null).length;
    if (onBoard === 0 && c.val === 10) return 0;
    return c.cost;
}

function toggleSac(col) {
    if (!isMyTurn || selectedIdx === null || pField[col] === null) return;
    const targetCost = getCost();
    if (sacrifices.includes(col)) sacrifices = sacrifices.filter(s => s !== col);
    else if (sacrifices.length < targetCost) sacrifices.push(col);
    render(); updateInstr();
}

function updateInstr() {
    const instr = document.getElementById('instruction');
    if (!instr) return;
    if(!isMyTurn) { instr.innerText = "Waiting for opponent..."; return; }
    if (selectedIdx === null) { instr.innerText = "Select a card from your hand"; return; }
    const cost = getCost();
    instr.innerText = sacrifices.length < cost ? `Select ${cost - sacrifices.length} more Sacrifices` : "Select a slot to summon";
}

function clickSlot(col) {
    if (!isMyTurn || selectedIdx === null || actions >= 2) return;
    const cardToPlay = pHand[selectedIdx];
    const costNeeded = getCost();
    const isSlotValid = (pField[col] === null || sacrifices.includes(col));

    if (sacrifices.length === costNeeded && isSlotValid) {
        if (cardToPlay.type === 'atk' && aiField[col] && aiField[col].type === 'atk') {
            alert("Cannot play an Attack facing another Attack!");
            return;
        }

        // 1. Prepare Data for Server
        let sacrificeIndices = [...sacrifices];

        // 2. Execute Locally
        sacrifices.forEach(s => pField[s] = null);
        let card = pHand.splice(selectedIdx, 1)[0];
        card.charging = (card.type === 'atk');
        pField[col] = card;
        
        addToLog(`You summoned ${card.name}`, "p");

        // 3. Send to Server
        socket.emit("player_move", {
            roomCode: roomCode,
            card: card,
            slot: col,
            sacrifices: sacrificeIndices
        });

        selectedIdx = null; sacrifices = []; actions++;
        render(); updateInstr();
    }
}

function discardCard() {
    if (selectedIdx !== null && !discarded && isMyTurn) {
        let c = pHand.splice(selectedIdx, 1)[0];
        addToLog(`Discarded ${c.name}`, "p");
        selectedIdx = null; discarded = true; render();
    }
}

function resolveCombat(offField, defField, isAiAtk) {
    let attackerName = isAiAtk ? "Opponent" : "You";
    let defenderName = isAiAtk ? "You" : "Opponent";

    offField.forEach((atk, i) => {
        if (!atk || atk.charging) return;

        if (atk.type === 'skl' && atk.effect === 'breakd') {
            let def = defField[i];
            if (def && def.type === 'def') {
                addToLog(`${attackerName} used Castle Breaker!`, isAiAtk ? "ai" : "p");
                addToLog(`${defenderName}'s ${def.name} was destroyed!`, "dmg");
                defField[i] = null; 
                offField[i] = null; 
            }
        }
        else if (atk.type === 'atk') {
            let dmg = atk.val;
            let def = defField[i];
            
            if (def) {
                if (def.type === 'skl') {
                    addToLog(`${defenderName}'s ${def.name} triggered!`, isAiAtk ? "p" : "ai");
                    if (def.effect === 'disarm') {
                        offField[i] = null; 
                        dmg = 0;
                        addToLog(`${attackerName}'s ${atk.name} was Disarmed!`, "sys");
                    } else if (def.effect === 'reflect') {
                        if (isAiAtk) aiHP -= dmg; else pHP -= dmg;
                        addToLog(`Reflected ${dmg} dmg to ${attackerName}`, "dmg");
                        dmg = 0;
                    } else if (def.effect === 'supref') {
                        let refDmg = dmg * 2;
                        if (isAiAtk) aiHP -= refDmg; else pHP -= refDmg;
                        addToLog(`Super Reflected ${refDmg} dmg to ${attackerName}!`, "dmg");
                        dmg = 0;
                    } else if (def.effect === 'miss') {
                        addToLog(`Attack Missed!`, "sys");
                        dmg = 0;
                    }
                    defField[i] = null; 
                } 
                else if (def.type === 'def') {
                    if (def.val > dmg) {
                        let thorns = def.val - dmg;
                        if (isAiAtk) aiHP -= thorns; else pHP -= thorns;
                        addToLog(`Thorn Damage! ${attackerName} took ${thorns}`, "dmg");
                    }
                    let blocked = Math.min(dmg, def.val);
                    addToLog(`${def.name} blocked ${blocked} dmg`, "sys");
                    dmg = Math.max(0, dmg - def.val);
                }
            }
            
            if (dmg > 0) {
                if (isAiAtk) pHP -= dmg; else aiHP -= dmg;
                addToLog(`${attackerName} dealt ${dmg} dmg with ${atk.name}`, "dmg");
            }
        }
    });
}

function checkGameOver() {
    if (aiHP <= 0 || pHP <= 0) {
        let msg = aiHP <= 0 ? "VICTORY!" : "DEFEAT!";
        addToLog("GAME OVER: " + msg, "sys");
        setTimeout(() => alert(msg), 100);
        isMyTurn = false; // Stop game
        render();
    }
}

function endTurn() {
    // 1. My Attack Phase (Resolving my attacks against opponent)
    // NOTE: In network play, usually the opponent resolves this on their start turn,
    // but for immediate feedback we can calculate it here or wait.
    // To match local logic: I attack BEFORE I end my turn.
    resolveCombat(pField, aiField, false);
    
    // 2. Pass Turn
    isMyTurn = false;
    socket.emit("end_turn", roomCode);
    render();
    checkGameOver();
}
