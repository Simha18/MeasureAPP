import { requireOptionalNativeModule } from 'expo-modules-core';
import type { WorldPoint3D } from '../types';

export type Anchor = WorldPoint3D & { id: string; tracking: boolean; screenX?: number | null; screenY?: number | null };
type AnchorModule = {
  createMeasurementAnchor?: (id: string, x: number, y: number, z: number) => Promise<boolean>;
  resolveMeasurementAnchors: () => Promise<Anchor[]>;
  removeMeasurementAnchor: (id: string) => Promise<void>;
  clearMeasurementAnchors: () => Promise<void>;
};
const native = requireOptionalNativeModule<AnchorModule>('VolumeMeasurementModule');
export const supportsMeasurementAnchors = Boolean(native?.createMeasurementAnchor);
export async function anchorPoint(id: string, p: WorldPoint3D) {
  if (!native?.createMeasurementAnchor || !await native.createMeasurementAnchor(id, p.xMeters, p.yMeters, p.zMeters)) {
    throw new Error('Could not fix this point. Hold still and wait for tracking, or rebuild the development app if it is outdated.');
  }
}
export async function resolvePoints(ids: string[]) {
  if (!native?.createMeasurementAnchor) throw new Error('Rebuild the development app to enable tracked measurement points.');
  const anchors = await native.resolveMeasurementAnchors();
  return ids.map(id => {
    const anchor = anchors.find(a => a.id === id);
    if (!anchor?.tracking) throw new Error('A saved point is not tracking. Return to the starting area and scan slowly; restart if tracking cannot recover.');
    return { xMeters: anchor.xMeters, yMeters: anchor.yMeters, zMeters: anchor.zMeters };
  });
}
export async function removeAnchor(id: string) { await native?.removeMeasurementAnchor?.(id); }
export async function clearAnchors() { await native?.clearMeasurementAnchors?.(); }
export async function projectedAnchors(): Promise<Anchor[]> { return await native?.resolveMeasurementAnchors?.() ?? []; }
