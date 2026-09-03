/* Contrôles tactiles : joystick à gauche (marche), glissé à droite (caméra),
   bouton ⚔️ + clavier pour tester au bureau. */

export function createInput(canvas, joyEl, atkBtn) {
  const knob = joyEl.firstElementChild;
  const s = { mx: 0, my: 0, orbit: 0, atk: false };
  let joyId = null, base = { x: 0, y: 0 };
  let orbId = null, orbLast = 0;
  const halfW = () => window.innerWidth * 0.5;

  canvas.addEventListener("pointerdown", (e) => {
    if (e.clientX < halfW() && joyId === null) {
      joyId = e.pointerId;
      base = { x: e.clientX, y: e.clientY };
      joyEl.style.left = e.clientX + "px";
      joyEl.style.top = e.clientY + "px";
      joyEl.classList.add("on");
      knob.style.transform = "translate(0,0)";
    } else if (e.clientX >= halfW() && orbId === null) {
      orbId = e.pointerId;
      orbLast = e.clientX;
    }
  });

  canvas.addEventListener("pointermove", (e) => {
    if (e.pointerId === joyId) {
      const dx = e.clientX - base.x, dy = e.clientY - base.y;
      const len = Math.hypot(dx, dy) || 1;
      const R = 48, cl = Math.min(len, R);
      const nx = dx / len, ny = dy / len;
      knob.style.transform = `translate(${nx * cl}px, ${ny * cl}px)`;
      const mag = cl / R;
      s.mx = mag < 0.12 ? 0 : nx * mag;
      s.my = mag < 0.12 ? 0 : ny * mag;
    } else if (e.pointerId === orbId) {
      s.orbit += (e.clientX - orbLast) * 0.005;
      orbLast = e.clientX;
    }
  });

  const up = (e) => {
    if (e.pointerId === joyId) {
      joyId = null; s.mx = 0; s.my = 0;
      joyEl.classList.remove("on");
    }
    if (e.pointerId === orbId) orbId = null;
  };
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);

  const keys = {};
  addEventListener("keydown", (e) => {
    keys[e.key.toLowerCase()] = true;
    if (e.key === " " || e.key === "Enter") s.atk = true;
  });
  addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });

  const press = (e) => { if (e) e.preventDefault(); s.atk = true; };
  atkBtn.addEventListener("pointerdown", press);
  atkBtn.addEventListener("touchstart", press, { passive: false });

  return {
    // vecteur écran : x = droite, y = bas
    get move() {
      let x = s.mx, y = s.my;
      if (keys["arrowleft"] || keys["a"] || keys["q"]) x -= 1;
      if (keys["arrowright"] || keys["d"]) x += 1;
      if (keys["arrowup"] || keys["w"] || keys["z"]) y -= 1;
      if (keys["arrowdown"] || keys["s"]) y += 1;
      return { x, y };
    },
    consumeOrbit() { const o = s.orbit; s.orbit = 0; return o; },
    consumeAttack() { const a = s.atk; s.atk = false; return a; },
  };
}
