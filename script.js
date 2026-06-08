// ----- DOM Elements -----
const components = document.querySelectorAll(".component");
const svg = document.getElementById("wireLayer");
const statusDiv = document.getElementById("status");
const simulateBtn = document.getElementById("simulateBtn");
const clearWiresBtn = document.getElementById("clearWiresBtn");
const voltageSlider = document.getElementById("voltageSlider");
const voltageSpan = document.getElementById("voltageValue");

// ----- State -----
let selected = null;
let connections = [];          // array of [id1, id2]
let wiresMap = new Map();      // key "id1|id2" -> line element

// ----- Switch Toggle Logic -----
const switchElem = document.getElementById("switch");
let switchClosed = true;       // start closed (ON)

switchElem.addEventListener("click", (e) => {
    e.stopPropagation();
    switchClosed = !switchClosed;
    if (switchClosed) {
        switchElem.classList.remove("open");
        switchElem.classList.add("closed");
        switchElem.innerText = "🔘 Switch (ON)";
    } else {
        switchElem.classList.remove("closed");
        switchElem.classList.add("open");
        switchElem.innerText = "🔘 Switch (OFF)";
    }
    // Re-simulate automatically to show immediate effect (optional)
    runSimulation();
});

// ----- Battery Voltage Control -----
voltageSlider.addEventListener("input", () => {
    const volts = parseFloat(voltageSlider.value).toFixed(1);
    voltageSpan.innerText = volts;
    runSimulation();  // update LED brightness / motor speed
});

// ----- Drag & Drop (all components) -----
components.forEach(comp => {
    comp.addEventListener("mousedown", (e) => {
        if (e.target === switchElem && e.button === 0) return; // avoid drag when toggling switch
        e.stopPropagation();
        let shiftX = e.clientX - comp.getBoundingClientRect().left;
        let shiftY = e.clientY - comp.getBoundingClientRect().top;

        const moveAt = (pageX, pageY) => {
            const parent = document.getElementById("workspace").getBoundingClientRect();
            comp.style.left = pageX - parent.left - shiftX + "px";
            comp.style.top = pageY - parent.top - shiftY + "px";
            redrawWires();
        };

        const onMouseMove = (e) => moveAt(e.pageX, e.pageY);
        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", () => {
            document.removeEventListener("mousemove", onMouseMove);
        }, { once: true });
    });
});

// ----- Wire Creation (double‑click) -----
components.forEach(comp => {
    comp.addEventListener("dblclick", () => {
        if (!selected) {
            selected = comp;
            comp.classList.add("selected");
        } else if (selected !== comp) {
            createWire(selected, comp);
            selected.classList.remove("selected");
            selected = null;
        }
    });
});

function createWire(a, b) {
    const id1 = a.id, id2 = b.id;
    const key = [id1, id2].sort().join("|");
    if (wiresMap.has(key)) return;

    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.dataset.a = id1;
    line.dataset.b = id2;
    svg.appendChild(line);
    wiresMap.set(key, line);
    connections.push([id1, id2]);

    updateLine(line, a, b);
    addWireDeletionListener(line, key, id1, id2);
    runSimulation(); // auto‑update after new wire
}

function addWireDeletionListener(line, key, id1, id2) {
    line.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        line.remove();
        wiresMap.delete(key);
        const idx = connections.findIndex(conn =>
            (conn[0] === id1 && conn[1] === id2) ||
            (conn[0] === id2 && conn[1] === id1)
        );
        if (idx !== -1) connections.splice(idx, 1);
        runSimulation();
    });
}

function updateLine(line, a, b) {
    const r1 = a.getBoundingClientRect();
    const r2 = b.getBoundingClientRect();
    const parent = document.getElementById("workspace").getBoundingClientRect();
    line.setAttribute("x1", r1.left - parent.left + r1.width / 2);
    line.setAttribute("y1", r1.top - parent.top + r1.height / 2);
    line.setAttribute("x2", r2.left - parent.left + r2.width / 2);
    line.setAttribute("y2", r2.top - parent.top + r2.height / 2);
}

function redrawWires() {
    wiresMap.forEach((line, key) => {
        const [ida, idb] = key.split("|");
        const a = document.getElementById(ida);
        const b = document.getElementById(idb);
        if (a && b) updateLine(line, a, b);
        else line.remove();
    });
}

// ----- Clear All Wires -----
clearWiresBtn.addEventListener("click", () => {
    wiresMap.forEach(line => line.remove());
    wiresMap.clear();
    connections.length = 0;
    runSimulation();
    statusDiv.innerHTML = "🧹 All wires cleared.";
});

// ----- Simulation Engine (with switch state & voltage) -----
function buildActiveGraph() {
    const graph = new Map();
    for (const [u, v] of connections) {
        // If either endpoint is the switch and switch is open, skip this edge
        if ((u === "switch" || v === "switch") && !switchClosed) continue;
        if (!graph.has(u)) graph.set(u, []);
        if (!graph.has(v)) graph.set(v, []);
        graph.get(u).push(v);
        graph.get(v).push(u);
    }
    return graph;
}

function canReach(graph, start, target) {
    if (!graph.has(start)) return false;
    const visited = new Set();
    const queue = [start];
    visited.add(start);
    while (queue.length) {
        const node = queue.shift();
        if (node === target) return true;
        for (const nb of graph.get(node) || []) {
            if (!visited.has(nb)) {
                visited.add(nb);
                queue.push(nb);
            }
        }
    }
    return false;
}

// Check if a component is powered (part of a closed loop from battery+ to battery-)
function isComponentPowered(compId, graph) {
    if (!graph.has(compId)) return false;
    const fromPos = canReach(graph, "battery_pos", compId);
    const toNeg = canReach(graph, compId, "battery_neg");
    return fromPos && toNeg;
}

function runSimulation() {
    const graph = buildActiveGraph();
    const voltage = parseFloat(voltageSlider.value);

    // List of all components that can show "current flow"
    const allComponents = ["led", "motor", "resistor", "capacitor", "inductor", "switch"];
    
    // Determine powered state for each
    const powered = {};
    for (let id of allComponents) {
        powered[id] = isComponentPowered(id, graph);
    }

    // ----- Update visual effects -----
    const ledElem = document.getElementById("led");
    const motorElem = document.getElementById("motor");
    const resistorElem = document.getElementById("resistor");
    const capacitorElem = document.getElementById("capacitor");
    const inductorElem = document.getElementById("inductor");

    // LED: brightness based on voltage
    if (powered.led) {
        ledElem.classList.add("led-on");
        let intensity = Math.min(1, voltage / 12);
        ledElem.style.opacity = 0.6 + intensity * 0.4;
    } else {
        ledElem.classList.remove("led-on");
        ledElem.style.opacity = 1;
    }

    // Motor: spin speed based on voltage
    if (powered.motor) {
        motorElem.classList.add("motor-on");
        let speed = Math.max(0.5, 2 - (voltage / 6));
        motorElem.style.animationDuration = `${speed}s`;
    } else {
        motorElem.classList.remove("motor-on");
    }

    // Passive components: show current flow highlight
    const passiveHighlight = (elem, isPowered) => {
        if (isPowered) elem.classList.add("current-flow");
        else elem.classList.remove("current-flow");
    };
    passiveHighlight(resistorElem, powered.resistor);
    passiveHighlight(capacitorElem, powered.capacitor);
    passiveHighlight(inductorElem, powered.inductor);

    // Also highlight the switch if powered (current flows through it)
    if (powered.switch) switchElem.classList.add("current-flow");
    else switchElem.classList.remove("current-flow");

    // Generate status message
    let poweredList = [];
    if (powered.led) poweredList.push("LED");
    if (powered.motor) poweredList.push("Motor");
    if (powered.resistor) poweredList.push("Resistor");
    if (powered.capacitor) poweredList.push("Capacitor");
    if (powered.inductor) poweredList.push("Inductor");

    if (poweredList.length === 0) {
        statusDiv.innerHTML = "❌ No complete circuit. Check connections and that the switch is ON (green).";
    } else {
        statusDiv.innerHTML = `✅ Circuit closed! Current flows through: ${poweredList.join(", ")}. Voltage: ${voltage}V`;
    }
}

// ----- Auto‑simulate on any change -----
window.addEventListener("resize", () => {
    redrawWires();
    runSimulation();
});

// Initial run
runSimulation();
