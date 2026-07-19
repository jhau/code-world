import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { detectFormat, parseIR } from "./ir/load";
import { validateIR } from "./ir/validate";
import type { Entity, Relation, WorldIR } from "./ir/types";
import { computeLayout } from "./layout/layout";
import { buildWorld } from "./render/world";
import { applyView, buildConnections, flowsTouching, type ViewState } from "./render/connections";
import { deriveGates, derivePosterns } from "./render/gates";
import { defaultTheme, routeKeyFor } from "./render/theme";

const DEFAULT_WORLD = "/petstore/world.ir.yaml";

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node as T;
}

function showFatal(message: string): void {
  el("fatal").style.display = "block";
  el("fatal-body").textContent = message;
}

function describeEntity(e: Entity, relations: Relation[]): string {
  const lines: string[] = [];
  const push = (k: string, v: unknown) => {
    if (v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0)) {
      lines.push(`<span class="k">${k}</span>  ${String(v)}`);
    }
  };
  push("kind", e.kind);
  push("roles", e.roles.join(", "));
  push("exported", e.exported);
  push("anonymous", e.anonymous);
  push("shape_class", e.shape_class);
  push("ecosystem", e.ecosystem);
  if (e.provenance) {
    const p = e.provenance;
    push(
      "provenance",
      p.method +
        (p.confidence !== undefined ? ` (${p.confidence})` : "") +
        (p.context ? ` [${p.context}]` : ""),
    );
  }
  if (e.source) push("source", `${e.source.file}${e.source.span ? `:${e.source.span[0]}-${e.source.span[1]}` : ""}`);
  for (const [name, m] of Object.entries(e.magnitudes)) {
    push(name, Object.entries(m).map(([k, v]) => `${k}=${v}`).join(" "));
  }
  for (const [k, v] of Object.entries(e.attrs)) {
    push(k, typeof v === "object" ? JSON.stringify(v) : v);
  }
  const outgoing = relations.filter((r) => r.from === e.id);
  const incoming = relations.filter((r) => r.to === e.id);
  if (outgoing.length > 0) {
    lines.push(`<span class="k">out</span>  ${outgoing.map((r) => `${r.type} → ${r.to}`).join("\n     ")}`);
  }
  if (incoming.length > 0) {
    lines.push(`<span class="k">in</span>   ${incoming.map((r) => `${r.type} ← ${r.from}`).join("\n     ")}`);
  }
  return lines.join("\n");
}

function showPanel(e: Entity, ir: WorldIR): void {
  const panel = el("panel");
  panel.style.display = "block";
  panel.innerHTML =
    `<span class="close" id="panel-close">✕</span>` +
    `<div class="id">${e.id}</div>\n${describeEntity(e, ir.relations)}`;
  el("panel-close").onclick = () => (panel.style.display = "none");
}

async function loadWorld(path: string): Promise<WorldIR> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`fetch ${path}: ${res.status} ${res.statusText}`);
  return parseIR(await res.text(), detectFormat(path));
}

async function main(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const worldPath = params.get("world") ?? DEFAULT_WORLD;

  let ir: WorldIR;
  try {
    ir = await loadWorld(worldPath);
  } catch (err) {
    showFatal(String(err));
    return;
  }

  const { errors, warnings } = validateIR(ir);
  if (errors.length > 0) {
    showFatal(`validation failed for ${worldPath}:\n\n${errors.join("\n")}`);
    return;
  }

  const layout = computeLayout(ir);
  const gates = deriveGates(ir, layout);
  const posterns = derivePosterns(ir, layout, gates);
  const { group, pickables } = buildWorld(layout, defaultTheme, gates, posterns);
  const connections = buildConnections(ir, layout, defaultTheme, gates, posterns);
  const meshById = new Map<string, THREE.Mesh>(
    pickables.map((m) => [(m.userData.entity as Entity).id, m]),
  );
  // Entities with no in-city building (gate customs) glow via their
  // representative connection mesh instead.
  for (const m of connections.pickables) {
    const e = m.userData.entity as Entity | undefined;
    if (e && !meshById.has(e.id)) meshById.set(e.id, m);
  }
  const allPickables = [...pickables, ...connections.pickables];

  el("hud-title").textContent = `codebase-world — ${String(ir.meta.repo ?? worldPath)}`;
  const status = el("hud-status");
  const cityCount = layout.nodes.length;
  const drawn = connections.routes.length;
  status.textContent =
    `${cityCount} entities in city, ${layout.externals.length} externals, ` +
    `${drawn}/${ir.relations.length} relations drawn`;

  // Legend: only the route styles actually present in this world.
  const present = new Set(
    ir.relations.map((r) => {
      const mode = typeof r.attrs.mode === "string" ? r.attrs.mode : undefined;
      return `${r.type}|${mode ?? ""}`;
    }),
  );
  const legend = el("legend");
  for (const [key, style] of Object.entries(defaultTheme.routes)) {
    const used = [...present].some((p) => {
      const [type, mode] = p.split("|");
      return routeKeyFor(type ?? "", mode || undefined) === key;
    });
    if (!used) continue;
    const row = document.createElement("div");
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = `#${style.color.toString(16).padStart(6, "0")}`;
    row.append(dot, style.label);
    legend.appendChild(row);
  }
  if (warnings.length > 0) {
    const w = document.createElement("div");
    w.className = "warn";
    w.textContent = `⚠ ${warnings.length} warnings (click)`;
    w.onclick = () => showFatal(warnings.join("\n"));
    status.appendChild(w);
  }

  const app = el("app");
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  app.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(defaultTheme.background);
  scene.fog = new THREE.Fog(defaultTheme.fog.color, defaultTheme.fog.near, defaultTheme.fog.far);
  scene.add(group);
  scene.add(connections.group);

  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 500);
  const span = Math.max(layout.bounds.w, layout.bounds.d);
  camera.position.set(span * 1.1, span * 0.9, span * 1.1);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI / 2 - 0.02;

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // View state: traced-path (click a datashape) and building focus (click a
  // building to "enter" it — its local flow deliveries are revealed).
  let view: ViewState = { tracedShape: null, focusedEntity: null };
  const traceStatus = el("trace-status");
  function refreshView(): void {
    const lit = applyView(connections, view, meshById);
    if (view.tracedShape !== null) {
      traceStatus.textContent =
        lit.length > 0
          ? `tracing ${view.tracedShape} — ${lit.length} flow route(s) · Esc to clear`
          : `${view.tracedShape} has no flow routes · Esc to clear`;
    } else if (view.focusedEntity !== null) {
      const n = flowsTouching(connections, view.focusedEntity).length;
      traceStatus.textContent =
        n > 0
          ? `inside ${view.focusedEntity} — ${n} delivery route(s) revealed · Esc to leave`
          : `inside ${view.focusedEntity} — no deliveries here · Esc to leave`;
    } else {
      traceStatus.textContent = "";
    }
  }
  refreshView(); // hide local deliveries on first paint
  window.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") {
      view = { tracedShape: null, focusedEntity: null };
      refreshView();
    }
  });

  // Click-to-inspect: raycast against entity meshes; nearest hit wins.
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let downAt: [number, number] | null = null;
  renderer.domElement.addEventListener("pointerdown", (ev) => {
    downAt = [ev.clientX, ev.clientY];
  });
  renderer.domElement.addEventListener("pointerup", (ev) => {
    if (!downAt) return;
    const moved = Math.hypot(ev.clientX - downAt[0], ev.clientY - downAt[1]);
    downAt = null;
    if (moved > 4) return; // it was a drag, not a click
    pointer.x = (ev.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(ev.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(allPickables, false)[0];
    const entity = hit?.object.userData.entity as Entity | undefined;
    if (!entity) return;
    showPanel(entity, ir);
    if (entity.kind === "datashape") {
      view = {
        tracedShape: view.tracedShape === entity.id ? null : entity.id,
        focusedEntity: null,
      };
    } else {
      view = {
        tracedShape: null,
        focusedEntity: view.focusedEntity === entity.id ? null : entity.id,
      };
    }
    refreshView();
  });

  // Debug hook for tooling/console camera control; not a public API.
  (window as unknown as Record<string, unknown>).__world = { scene, camera, controls };

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    controls.update();
    connections.animate(clock.getElapsedTime());
    renderer.render(scene, camera);
  });
}

void main();
