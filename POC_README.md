# Volume Finder POC

Expo SDK 57 / React Native app for estimating solid exterior volume from measured dimensions and AR outlines. Measurement is local to the device.

## Measurement paths

- **Guided AR dimensions:** boxes, cylinders, spheres, cones and ellipsoids. Fix endpoints at the crosshair, move around the object, and capture the remaining dimensions. Each accepted point has an ARCore/ARKit anchor; the app resolves updated anchor positions before calculating. Visible anchors are projected back onto the preview. Android screen coordinates account for display density.
- **Walk-around outline + height:** trace a simple horizontal perimeter, close it, then capture a vertical height. Supports concave footprints such as an L-shaped object. Assumes constant cross-section and vertical sides.
- **Irregular cross-sections:** trace horizontal perimeters from bottom to top. The trapezoidal area integral estimates the volume between adjacent measured heights. Capture extra sections where the shape changes. This is a sampled exterior approximation, not photogrammetry or a watertight reconstructed mesh.
- **Reference photos:** capture a separate photo for each dimension. Mark two endpoints of a known reference, enter its physical length, then mark the object's two endpoints. The calculation accounts for the photo aspect ratio. Each reference and measured edge must be coplanar and viewed straight on. Marks are manual; this path does not claim automatic edge detection.
- **Known dimensions:** enter physical measurements and calculate a regular shape's volume without camera or AR.
- **Experimental iOS box assist:** existing Vision rectangle detection plus conservative AR/depth cuboid fitting remains accessible for boxes. Android does not bundle an automatic object detector.

The main measurement flow no longer presents simulated camera dimensions. Legacy simulation helpers remain for existing tests; unavailable AR and the legacy scan's fallback action route to reference photos. Opening Result without a measurement shows an empty state.

## Results and storage

Results include SI volume, selectable volume/length units, a rotatable shape wireframe or sampled cross-sections, the formula and explicit assumptions. Small volumes retain significant digits. Quality scores describe AR inputs, not calibrated accuracy. Photo and entered-dimension results have no invented confidence percentage.

AsyncStorage keeps results, shape, model assumptions, compact section coordinates, settings, history and existing cuboid calibration records. Older history defaults to cuboid. Photos used for reference scaling are transient camera-cache images; no camera stream or depth map is uploaded or saved in history.

## Setup

Use Node compatible with Expo 57 and install dependencies:

```sh
npm install
npm run start
npm run android
```

AR requires a freshly rebuilt development app with the local module, an ARCore/ARKit-capable device, camera permission and stable tracking. Expo Go can use reference photos and entered dimensions. Rebuild after changing native module code. iOS builds require macOS/Xcode.

```sh
npm run typecheck
npm run lint
npm test
```

Windows Android debug build (JDK 21 and Android SDK required):

```powershell
$env:JAVA_HOME = 'C:/Program Files/Java/jdk-21'
$env:NODE_ENV = 'development'
cd android
./gradlew.bat assembleDebug -PreactNativeArchitectures=x86_64
```

Use the appropriate ABI for a physical device or omit the architecture override.

## Measurement limits

- Exact volume of an arbitrary object cannot be recovered from a single unscaled image. Hidden cavities, transparent/reflective surfaces, moving objects and deformable shapes are not reliably measured.
- Regular modes assume the selected geometric solid. AR diameter endpoints must represent the true full diameter; visible silhouette hits can underestimate a curved object. Verify against a ruler.
- Outline scans require simple, non-crossing contours. Holes are not subtracted. Each section allows 3–64 points with at least 5 mm between distinct points. All points within a horizontal section must be within 3 cm vertically.
- Irregular scans require 2–16 outlines, each at least 3 cm above the previous. Volume outside the first/last outlines and unsampled shape changes are not recovered. Trapezoidal integration can overestimate or underestimate curved/tapering regions.
- Long walks can accumulate tracking drift. Return to the start, inspect anchors, and repeat known measurements. Tracking recovery can change anchor positions, so geometry is revalidated at calculation time.
- Leaving an AR screen or backgrounding the app invalidates an unfinished scan. Restarting, undoing and leaving release anchors. Calculation waits for tracking and refuses missing/untracked points.
- Calibration is currently for cuboids only. It compares measurements with known dimensions; it does not automatically correct the sensors.

## Physical validation

Use known boxes, a cylinder and a sphere. Repeat captures at different distances and compare dimensions and volume to a ruler-based baseline. For outline scans test rectangular and L-shaped footprints, repeat the first corner after walking around, and check drift. For cross-sections compare sparse and dense sampling of a known tapered solid. Test tracking loss, background/resume, undo and restart on both platforms.

Unit tests and an emulator validate calculations and UI, not real camera/depth accuracy. See POC_IMPLEMENTATION_STATUS.md for verification performed in this change.

## References consulted

- https://docs.expo.dev/versions/v57.0.0/
- https://docs.expo.dev/versions/v57.0.0/sdk/camera/
- https://developers.google.com/ar/develop/anchors
- https://developer.apple.com/documentation/arkit/arframe/anchors
