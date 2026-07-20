import type { LayoutNode } from "../layout/layout";

export interface DoorSide {
  axis: "x" | "z";
  dir: 1 | -1;
}

const SIDES: readonly DoorSide[] = [
  { axis: "z", dir: 1 },
  { axis: "z", dir: -1 },
  { axis: "x", dir: 1 },
  { axis: "x", dir: -1 },
];

function sameSide(a: DoorSide, b: DoorSide): boolean {
  return a.axis === b.axis && a.dir === b.dir;
}

/** Building sides whose center approach is not occupied by another obstacle. */
export function availableDoorSides(target: LayoutNode, obstacles: LayoutNode[]): DoorSide[] {
  const { rect } = target;
  const cx = rect.x + rect.w / 2;
  const cz = rect.z + rect.d / 2;
  const probe = (side: DoorSide): { x: number; z: number } => {
    if (side.axis === "z") {
      return { x: cx, z: side.dir === 1 ? rect.z + rect.d + 0.35 : rect.z - 0.35 };
    }
    return { x: side.dir === 1 ? rect.x + rect.w + 0.35 : rect.x - 0.35, z: cz };
  };
  const blocked = (x: number, z: number) =>
    obstacles.some(
      (obstacle) =>
        obstacle !== target &&
        x >= obstacle.rect.x &&
        x <= obstacle.rect.x + obstacle.rect.w &&
        z >= obstacle.rect.z &&
        z <= obstacle.rect.z + obstacle.rect.d,
    );
  return SIDES.filter((side) => {
    const point = probe(side);
    return !blocked(point.x, point.z);
  });
}

/** First open side in the renderer's fixed +z, -z, +x, -x order. */
export function chooseDoorSide(target: LayoutNode, obstacles: LayoutNode[]): DoorSide {
  return availableDoorSides(target, obstacles)[0] ?? SIDES[0]!;
}

export function firstDifferentSide(
  sides: DoorSide[],
  occupied: DoorSide,
): DoorSide | undefined {
  return sides.find((side) => !sameSide(side, occupied));
}
