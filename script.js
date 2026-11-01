(function(){
  // ---------- canvas & context ----------
  const canvas = document.getElementById('networkCanvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  // ---------- simulation parameters ----------
  const N = 30;
  const RADIO_RANGE = 160;
  const PACKET_INTERVAL = 5;
  const SIM_STEPS = 200;

  const AODV_TX_ENERGY = 3.2;
  const AODV_RX_ENERGY = 1.2;
  const MC_TX_ENERGY = 1.0;
  const MC_RX_ENERGY = 0.4;
  const AODV_ROUTE_DISCOVERY_ENERGY = 0.8;
  const MC_COMPLETION_ENERGY = 0.02;
  const AODV_BREAK_PENALTY = 0.5;

  // ---------- state ----------
  let nodes = [];
  let step = 0;
  let running = true;
  let animationFrame = null;

  let aodvTotalEnergy = 0;
  let mcTotalEnergy = 0;

  let aodvRoute = [];
  let mcRoute = [];
  let predictedLinks = [];
  let maxEnergyRef = 6000;

  let fastMode = false;
  let currentSrcDst = null;

  // DOM refs
  const fastBtnEl         = document.getElementById('fastBtn');
  const explainerEl       = document.getElementById('explainerText');
  const liveSavingEl      = document.getElementById('liveSaving');
  const explainFrameBtn   = document.getElementById('explainFrameBtn');
  const frameStepIndicator = document.getElementById('frameStepIndicator');

  // ---------- helpers ----------
  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function initNodes() {
    nodes = [];
    for (let i = 0; i < N; i++) {
      nodes.push({
        x: 80 + Math.random() * (W - 160),
        y: 60 + Math.random() * (H - 120),
        vx: (Math.random() - 0.5) * 2.2,
        vy: (Math.random() - 0.5) * 2.2
      });
    }
  }

  function updatePositions() {
    const teamCenters = [
      { x: W * 0.25, y: H * 0.3 },
      { x: W * 0.70, y: H * 0.6 },
      { x: W * 0.50, y: H * 0.5 }
    ];
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      n.vx += (Math.random() - 0.5) * 0.5;
      n.vy += (Math.random() - 0.5) * 0.5;

      let nearest = teamCenters[0];
      let bestD = dist(n, teamCenters[0]);
      for (let k = 1; k < teamCenters.length; k++) {
        const d = dist(n, teamCenters[k]);
        if (d < bestD) { bestD = d; nearest = teamCenters[k]; }
      }
      const dx = nearest.x - n.x;
      const dy = nearest.y - n.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > 140) {
        n.vx += (dx / d) * 0.25;
        n.vy += (dy / d) * 0.25;
      }
      n.vx *= 0.97;
      n.vy *= 0.97;
      const sp = Math.hypot(n.vx, n.vy);
      if (sp > 3.5) {
        n.vx *= 3.5 / sp;
        n.vy *= 3.5 / sp;
      }
      n.x += n.vx;
      n.y += n.vy;
      if (n.x < 40) { n.x = 40; n.vx *= -0.5; }
      if (n.x > W - 40) { n.x = W - 40; n.vx *= -0.5; }
      if (n.y < 40) { n.y = 40; n.vy *= -0.5; }
      if (n.y > H - 40) { n.y = H - 40; n.vy *= -0.5; }
    }
  }

  function buildAdjacency() {
    const adj = Array.from({ length: N }, () => Array(N).fill(false));
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        if (dist(nodes[i], nodes[j]) < RADIO_RANGE) {
          adj[i][j] = adj[j][i] = true;
        }
      }
    }
    return adj;
  }

  function shortestPath(adj, src, dst) {
    if (src === dst) return [src];
    const visited = new Array(N).fill(false);
    const parent  = new Array(N).fill(-1);
    const queue   = [src];
    visited[src] = true;
    while (queue.length) {
      const u = queue.shift();
      if (u === dst) break;
      for (let v = 0; v < N; v++) {
        if (!visited[v] && adj[u][v]) {
          visited[v] = true;
          parent[v] = u;
          queue.push(v);
        }
      }
    }
    if (!visited[dst]) return null;
    const path = [];
    let cur = dst;
    while (cur !== -1) { path.push(cur); cur = parent[cur]; }
    return path.reverse();
  }

  function partialObservation(adj) {
    const obs = Array.from({ length: N }, () => Array(N).fill(false));
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        if (adj[i][j] && Math.random() < 0.6) {
          obs[i][j] = obs[j][i] = true;
        }
      }
    }
    return obs;
  }

  function completeMatrix(obs, adj) {
    const comp = obs.map(r => r.slice());
    const predictedPairs = [];
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        if (!comp[i][j]) {
          let common = 0;
          for (let k = 0; k < N; k++) {
            if (obs[i][k] && obs[j][k]) common++;
          }
          if (common >= 1 && Math.random() < 0.45) {
            comp[i][j] = comp[j][i] = true;
            predictedPairs.push([i, j]);
          }
        }
      }
    }
    return { comp, predictedPairs };
  }

  function pickSourceDest() {
    let src = Math.floor(Math.random() * N);
    let dst;
    do { dst = Math.floor(Math.random() * N); } while (dst === src);
    return { src, dst };
  }

  function updateRoutesAndEnergy() {
    const adj = buildAdjacency();

    if (!currentSrcDst || step % PACKET_INTERVAL === 0) {
      currentSrcDst = pickSourceDest();
    }
    const { src, dst } = currentSrcDst;

    // AODV route on true topology
    let aodvPath = shortestPath(adj, src, dst) || [];
    aodvRoute = aodvPath;

    if (aodvPath.length > 1) {
      const hops = aodvPath.length - 1;
      let e = hops * (AODV_TX_ENERGY + AODV_RX_ENERGY);
      e += AODV_ROUTE_DISCOVERY_ENERGY * (1 + Math.random() * 0.5);
      if (Math.random() < 0.25) {
        e += AODV_BREAK_PENALTY * (1 + Math.random());
      }
      aodvTotalEnergy += e;
    }

    // MC route on completed matrix
    const obs = partialObservation(adj);
    const { comp, predictedPairs } = completeMatrix(obs, adj);
    predictedLinks = predictedPairs;

    let mcPath = shortestPath(comp, src, dst) || [];
    mcRoute = mcPath;

    if (mcPath.length > 1) {
      const hops = mcPath.length - 1;
      let e = hops * (MC_TX_ENERGY + MC_RX_ENERGY) + MC_COMPLETION_ENERGY;
      for (let k = 0; k < mcPath.length - 1; k++) {
        const u = mcPath[k], v = mcPath[k + 1];
        if (!adj[u][v] && comp[u][v]) e += 0.2;
      }
      mcTotalEnergy += e;
    } else {
      mcTotalEnergy += MC_COMPLETION_ENERGY;
    }

    const maxVal = Math.max(aodvTotalEnergy, mcTotalEnergy, 10);
    maxEnergyRef = Math.max(maxVal * 1.2, 800);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // faint grid
    for (let i = 0; i < W; i += 40) {
      ctx.beginPath();
      ctx.moveTo(i, 0); ctx.lineTo(i, H);
      ctx.strokeStyle = "#162b3b"; ctx.stroke();
    }
    for (let i = 0; i < H; i += 40) {
      ctx.beginPath();
      ctx.moveTo(0, i); ctx.lineTo(W, i);
      ctx.strokeStyle = "#162b3b"; ctx.stroke();
    }

    // faint all real links
    const adj = buildAdjacency();
    ctx.lineWidth = 1.0;
    ctx.strokeStyle = "#2d4d66";
    ctx.globalAlpha = 0.25;
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        if (adj[i][j]) {
          ctx.beginPath();
          ctx.moveTo(nodes[i].x, nodes[i].y);
          ctx.lineTo(nodes[j].x, nodes[j].y);
          ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1.0;

    // predicted links (dashed purple)
    ctx.setLineDash([5, 6]);
    ctx.lineWidth = 2.0;
    ctx.strokeStyle = "#c084fc";
    ctx.globalAlpha = 0.7;
    for (const [i, j] of predictedLinks) {
      if (!adj[i][j]) {
        ctx.beginPath();
        ctx.moveTo(nodes[i].x, nodes[i].y);
        ctx.lineTo(nodes[j].x, nodes[j].y);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1.0;

    // AODV route (orange)
    if (aodvRoute.length > 1) {
      ctx.beginPath();
      ctx.lineWidth = 6;
      ctx.strokeStyle = "#f59e4b";
      ctx.shadowColor = "#f59e4b";
      ctx.shadowBlur = 18;
      ctx.globalAlpha = 0.85;
      ctx.moveTo(nodes[aodvRoute[0]].x, nodes[aodvRoute[0]].y);
      for (let k = 1; k < aodvRoute.length; k++) {
        ctx.lineTo(nodes[aodvRoute[k]].x, nodes[aodvRoute[k]].y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1.0;
    }

    // MC route (green)
    if (mcRoute.length > 1) {
      ctx.beginPath();
      ctx.lineWidth = 5;
      ctx.strokeStyle = "#2ecc71";
      ctx.shadowColor = "#2ecc71";
      ctx.shadowBlur = 18;
      ctx.globalAlpha = 0.9;
      ctx.moveTo(nodes[mcRoute[0]].x, nodes[mcRoute[0]].y);
      for (let k = 1; k < mcRoute.length; k++) {
        ctx.lineTo(nodes[mcRoute[k]].x, nodes[mcRoute[k]].y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1.0;
    }

    // nodes
    for (let i = 0; i < N; i++) {
      const n = nodes[i];
      ctx.shadowColor = "#7ab7ff";
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(n.x, n.y, 7, 0, 2 * Math.PI);
      ctx.fillStyle = "#9ec6ff";
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(n.x, n.y, 4, 0, 2 * Math.PI);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
    }

    // src/dst highlight
    if (currentSrcDst) {
      const { src, dst } = currentSrcDst;
      ctx.beginPath();
      ctx.arc(nodes[src].x, nodes[src].y, 12, 0, 2 * Math.PI);
      ctx.strokeStyle = "#f9f871";
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(nodes[dst].x, nodes[dst].y, 12, 0, 2 * Math.PI);
      ctx.strokeStyle = "#f9f871";
      ctx.stroke();
    }
  }

  function updateUI() {
    const aodvEl  = document.getElementById('aodvEnergy');
    const mcEl    = document.getElementById('mcEnergy');
    const aodvBar = document.getElementById('aodvBar');
    const mcBar   = document.getElementById('mcBar');
    const savingsDisplay = document.getElementById('savingsDisplay');
    const savingsDetail  = document.getElementById('savingsDetail');
    const tickLabel      = document.getElementById('tickLabel');

    aodvEl.innerHTML = aodvTotalEnergy.toFixed(1) + ' <small>J</small>';
    mcEl.innerHTML   = mcTotalEnergy.toFixed(1) + ' <small>J</small>';

    const ref = Math.max(maxEnergyRef, 100);
    aodvBar.style.width = Math.min(100, (aodvTotalEnergy / ref) * 100) + '%';
    mcBar.style.width   = Math.min(100, (mcTotalEnergy / ref) * 100) + '%';

    const savings = aodvTotalEnergy > 0
      ? Math.round((1 - mcTotalEnergy / aodvTotalEnergy) * 100)
      : 0;

    savingsDisplay.textContent = savings + '%';
    savingsDetail.textContent  = savings > 0
      ? `MC saves ${(aodvTotalEnergy - mcTotalEnergy).toFixed(1)} J so far`
      : '—';

    tickLabel.textContent = `step ${step} / ${SIM_STEPS}`;

    // live saving in explainer title
    if (liveSavingEl) {
      liveSavingEl.textContent = aodvTotalEnergy > 0
        ? `MC saving: ${savings}%`
        : 'MC saving: —';
    }

    // update frame step indicator (for the explainer button)
    if (frameStepIndicator) {
      frameStepIndicator.textContent = `frame ${step} / ${SIM_STEPS}`;
    }
  }

  // ---------- frame explainer ----------
  function describeStep(s) {
    if (s <= 0) {
      return `Initializing <b>30 rescue-team nodes</b> under RPGM mobility. ` +
             `Both AODV and MC will run on the <b>same trace</b> for a fair comparison.`;
    }
    const packetDue  = (s % PACKET_INTERVAL === 0);
    const hasAodv    = aodvRoute.length > 1;
    const hasMc      = mcRoute.length > 1;
    const hopsAodv   = hasAodv ? aodvRoute.length - 1 : 0;
    const hopsMc     = hasMc   ? mcRoute.length - 1   : 0;
    const predCount  = predictedLinks.length;

    let parts = [];
    if (packetDue) {
      parts.push(`📦 <b>New packet</b> generated at step ${s}.`);
    } else {
      parts.push(`⏱️ Step ${s}: nodes keep moving, links update.`);
    }

    if (hasAodv) {
      parts.push(`<span class="highlight-aodv">AODV</span> finds a ` +
        `<b>${hopsAodv}-hop</b> path on the <i>true</i> topology — ` +
        `but pays route-discovery + full Tx/Rx energy.`);
    } else {
      parts.push(`<span class="highlight-aodv">AODV</span>: no route this step.`);
    }

    if (hasMc) {
      parts.push(`<span class="highlight-mc">MC</span> routes on a <i>partially observed</i> map, ` +
        `using <span class="highlight-pred">${predCount} predicted link(s)</span> — ` +
        `path length <b>${hopsMc} hops</b> at a much lower per-hop cost.`);
    } else {
      parts.push(`<span class="highlight-mc">MC</span>: no route on the completed matrix this step.`);
    }

    if (aodvTotalEnergy > 0) {
      const save = Math.round((1 - mcTotalEnergy / aodvTotalEnergy) * 100);
      if (save > 0) {
        parts.push(`💰 Cumulative saving so far: <b>${save}%</b> (MC vs AODV).`);
      }
    }
    return parts.join(' ');
  }

  function renderExplainer(s) {
    explainerEl.innerHTML = describeStep(s);
  }

  // ---------- frame-by
