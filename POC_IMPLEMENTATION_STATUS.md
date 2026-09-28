# POC implementation status

Updated 2026-09-11. Implementation and verification are listed separately. No claim of physical measurement accuracy is made from compilation, unit tests or emulator checks.

## Implemented in this change

- Shape/method picker for boxes, cylinders, spheres, cones, ellipsoids, outline prisms and irregular cross-section estimates.
- Guided AR endpoint capture with native ARCore/ARKit anchors, re-resolved positions and projected camera markers.
- Shared native-session operation queue so pending capture/teardown finishes before another AR screen starts.
- Capture cancellation after lifecycle changes; undo, restart, point quality checks and anchor release.
- Perpendicular-dimension and minimum-size validation, including revalidation after anchor refinement.
- Concave footprint area and perpendicular-height volume; crossing, overlapping, duplicate and degenerate contours rejected.
- Multi-section exterior volume approximation using a trapezoidal integral over sampled areas and elevations.
- Reference-photo measurement with per-photo physical scale, manual endpoint marking, aspect-ratio correction, retake and undo.
- Direct dimension entry for regular shapes.
- Formula, assumptions, quality provenance, unit conversion and rotatable shape/cross-section previews.
- Shape/model-aware history with legacy cuboid compatibility.
- Small-volume display precision and an empty result state instead of a fabricated example measurement.
- The legacy AR fallback routes to reference photos. Existing iOS experimental box edge assist is retained.
- Cuboid calibration is prevented from comparing non-cuboid volumes with a box formula.

## Verified

- Exact Expo SDK 57 reference and Camera documentation read before implementation.
- TypeScript type check passed.
- ESLint passed.
- Android production JavaScript bundle export passed: `npx expo export --platform android --output-dir .expo/qa/android-export`.
- 80 unit tests passed across 14 test files. Coverage includes regular shape volumes, concave outlines, translated/rotated contours, invalid geometry, section integration, reference scale, metadata round-trips, shared endpoints, collapsed anchors and native-session operation ordering/recovery.
- Android native debug build passed: `android/gradlew.bat assembleDebug -PreactNativeArchitectures=x86_64`.
- Debug APK installed and launched on the available Android emulator.
- Android UI hierarchy verified home, shape/method selection, disabled unsupported AR, dimension entry, result/model controls, saving and history.
- Entering 20 x 30 x 40 cm produced 0.024 cubic meters / 24 liters; saving succeeded and history showed the same result and input-accuracy disclosure.

## Not yet verified

- Real-device AR tracking, anchor drift, marker alignment, depth accuracy and complete walk-around captures.
- Real camera reference-photo capture and endpoint workflow. The emulator disconnected before this walkthrough completed.
- Visual screenshot QA: emulator captures were black, including the system home screen. UI hierarchy checks do not establish visual correctness.
- iOS native compilation and ARKit behavior: this Windows environment has no Xcode.
- Production signing, store distribution and physical accuracy calibration.

## Scope limits

- This does not reconstruct a watertight free-form mesh or automatically recover every hidden surface from camera video.
- Reference-photo edges are marked manually. iOS Vision box assist is experimental; no automatic Android detector/segmentation model is bundled.
- Cross-sections approximate the solid exterior between the first and last captured outlines; unseen holes and unsampled detail are not resolved. More sections improve sampling but do not prove accuracy.
- Transparent, reflective, moving and deformable objects remain unreliable.
- Long scans require physical drift checks. A quality score is not an error bound or an accuracy percentage.
- Legacy simulation helpers remain for existing tests; the main measurement UI does not use them as physical measurements.
- Web dependencies were not added; this change targets the native app.

See POC_README.md for setup, methods, assumptions and a physical validation procedure.
