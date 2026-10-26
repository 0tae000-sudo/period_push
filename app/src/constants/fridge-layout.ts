// "나의 냉장고" 이미지(assets/images/fridge.png)의 칸 위치. 이미지 원본 좌표(390 x 716) 기준이다.
// 음식 아이콘을 얹을 때 비율(0~1)로 바꿔서 쓰면 화면 크기가 달라도 같은 자리에 놓인다.
// 이미지를 다시 그리면 design/fridge.svg와 함께 이 값도 맞춰야 한다.

export const FRIDGE_DESIGN = { width: 390, height: 716 } as const;

/** 선반 윗면의 y 좌표 (위에서부터 5개). 아이콘의 바닥을 이 선에 맞춰 놓는다. */
export const FRIDGE_SHELF_FLOORS = [128, 240, 352, 464, 576] as const;

/** 한 선반에서 아이콘이 놓이는 x 중심 좌표 (왼쪽부터 5개) */
export const FRIDGE_SLOT_CENTERS_X = [62, 128, 195, 262, 328] as const;

export const FRIDGE_SLOTS_PER_SHELF = FRIDGE_SLOT_CENTERS_X.length;
export const FRIDGE_CAPACITY = FRIDGE_SHELF_FLOORS.length * FRIDGE_SLOTS_PER_SHELF;

/**
 * n번째 음식이 놓일 위치. 위 선반 왼쪽부터 차례로 채운다.
 * 칸이 모자라면(FRIDGE_CAPACITY 초과) null을 돌려주므로 호출하는 쪽에서 처리한다.
 */
export function getFridgeSlot(index: number) {
  if (index < 0 || index >= FRIDGE_CAPACITY) return null;
  const shelf = Math.floor(index / FRIDGE_SLOTS_PER_SHELF);
  const column = index % FRIDGE_SLOTS_PER_SHELF;
  return {
    shelf,
    column,
    /** 이미지 너비에 대한 비율 (0~1) */
    xRatio: FRIDGE_SLOT_CENTERS_X[column] / FRIDGE_DESIGN.width,
    /** 이미지 높이에 대한 비율 (0~1), 아이콘의 바닥 위치 */
    yRatio: FRIDGE_SHELF_FLOORS[shelf] / FRIDGE_DESIGN.height,
  };
}
