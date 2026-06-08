const components = document.querySelectorAll(".component");
const svg = document.getElementById("wireLayer");
const statusText = document.getElementById("status");

let selected = null;
let connections = [];

/* DRAGGING */

components.forEach(comp => {

    comp.addEventListener("mousedown", function(e){

        let shiftX = e.clientX - comp.getBoundingClientRect().left;
        let shiftY = e.clientY - comp.getBoundingClientRect().top;

        function moveAt(pageX,pageY){
            const parent = document.getElementById("workspace");

            comp.style.left =
                pageX - parent.offsetLeft - shiftX + "px";

            comp.style.top =
                pageY - parent.offsetTop - shiftY + "px";

            redrawWires();
        }

        function onMouseMove(e){
            moveAt(e.pageX,e.pageY);
        }

        document.addEventListener("mousemove",onMouseMove);

        document.addEventListener("mouseup",function(){
            document.removeEventListener("mousemove",onMouseMove);
        },{once:true});
    });

});

/* CONNECTIONS */

components.forEach(comp => {

    comp.addEventListener("dblclick",function(){

        if(selected===null){

            selected=comp;
            comp.classList.add("selected");

        }else if(selected!==comp){

            createWire(selected,comp);

            connections.push([
                selected.id,
                comp.id
            ]);

            selected.classList.remove("selected");
            selected=null;
        }
    });

});

function createWire(a,b){

    let line=document.createElementNS(
        "http://www.w3.org/2000/svg",
        "line"
    );

    line.dataset.a=a.id;
    line.dataset.b=b.id;

    svg.appendChild(line);

    updateLine(line,a,b);
}

function updateLine(line,a,b){

    let r1=a.getBoundingClientRect();
    let r2=b.getBoundingClientRect();

    let parent=document
        .getElementById("workspace")
        .getBoundingClientRect();

    line.setAttribute(
        "x1",
        r1.left-parent.left+r1.width/2
    );

    line.setAttribute(
        "y1",
        r1.top-parent.top+r1.height/2
    );

    line.setAttribute(
        "x2",
        r2.left-parent.left+r2.width/2
    );

    line.setAttribute(
        "y2",
        r2.top-parent.top+r2.height/2
    );
}

function redrawWires(){

    document.querySelectorAll("line")
        .forEach(line=>{

        let a=document.getElementById(
            line.dataset.a
        );

        let b=document.getElementById(
            line.dataset.b
        );

        updateLine(line,a,b);
    });
}

/* SIMULATION */

document
.getElementById("simulateBtn")
.addEventListener("click",function(){

    const needed = [
        "battery-switch",
        "switch-led",
        "switch-motor"
    ];

    let found=[];

    connections.forEach(c=>{

        found.push(c[0]+"-"+c[1]);
        found.push(c[1]+"-"+c[0]);
    });

    let ok=true;

    needed.forEach(req=>{

        if(!found.includes(req)){
            ok=false;
        }
    });

    const led=document.getElementById("led");
    const motor=document.getElementById("motor");

    if(ok){

        led.classList.add("led-on");
        motor.classList.add("motor-on");

        statusText.innerHTML =
        "✔ Circuit Complete! LED ON & Motor Running";

    }else{

        led.classList.remove("led-on");
        motor.classList.remove("motor-on");

        statusText.innerHTML =
        "❌ Circuit Incomplete";
    }
});
