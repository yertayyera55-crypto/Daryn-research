import { Detection } from "@/lib/domain";

export function hintKey(detection: Pick<Detection, "patternId" | "textSpan">) {
  return `${detection.patternId}:${detection.textSpan}`;
}

export function reconcileDetections(previous: Detection[], received: Detection[], dismissedKeys: ReadonlySet<string> = new Set()) {
  const active = received.filter((detection, index) => (
    !dismissedKeys.has(hintKey(detection))
    && received.findIndex((item) => hintKey(item) === hintKey(detection)) === index
  ));
  const activeKeys = new Set(active.map(hintKey));
  return {
    active,
    resolved: previous.filter((detection) => !activeKeys.has(hintKey(detection))),
  };
}
