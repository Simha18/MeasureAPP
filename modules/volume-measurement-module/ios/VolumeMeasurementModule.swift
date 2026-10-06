import ARKit
import AVFoundation
import CoreVideo
import ExpoModulesCore
import Foundation
import SceneKit
import UIKit
import Vision
import simd

public class VolumeMeasurementModule: Module {
  public func definition() -> ModuleDefinition {
    Name("VolumeMeasurementModule")

    Events(
      "onTrackingStateChanged",
      "onPlaneDetected",
      "onMeasurementUpdated",
      "onMeasurementCompleted",
      "onMeasurementError"
    )

    AsyncFunction("getCapabilities") { () -> [String: Any?] in
      ArKitMeasurementController.shared.getCapabilities()
    }.runOnQueue(.main)

    AsyncFunction("createMeasurementAnchor") { (id: String, x: Double, y: Double, z: Double) -> Bool in
      ArKitMeasurementController.shared.createMeasurementAnchor(id: id, x: x, y: y, z: z)
    }.runOnQueue(.main)
    AsyncFunction("resolveMeasurementAnchors") { () -> [[String: Any?]] in
      ArKitMeasurementController.shared.resolveMeasurementAnchors()
    }.runOnQueue(.main)
    AsyncFunction("removeMeasurementAnchor") { (id: String) in
      ArKitMeasurementController.shared.removeMeasurementAnchor(id: id)
    }.runOnQueue(.main)
    AsyncFunction("clearMeasurementAnchors") {
      ArKitMeasurementController.shared.clearMeasurementAnchors()
    }.runOnQueue(.main)

    AsyncFunction("startSession") { () -> [String: Any?] in
      ArKitMeasurementController.shared.startSession()
    }.runOnQueue(.main)

    AsyncFunction("stopSession") { () -> [String: Any?] in
      ArKitMeasurementController.shared.stopSession()
    }.runOnQueue(.main)

    AsyncFunction("resetSession") { () -> [String: Any?] in
      ArKitMeasurementController.shared.resetSession()
    }.runOnQueue(.main)

    AsyncFunction("undoLastPoint") { () -> [String: Any?] in
      ArKitMeasurementController.shared.undoLastPoint()
    }.runOnQueue(.main)

    AsyncFunction("setMeasurementMode") { (mode: String) -> [String: Any?] in
      ArKitMeasurementController.shared.setMeasurementMode(mode)
    }.runOnQueue(.main)

    AsyncFunction("performHitTest") { (screenX: Double, screenY: Double) -> [[String: Any?]] in
      ArKitMeasurementController.shared.performHitTest(screenX: screenX, screenY: screenY)
    }.runOnQueue(.main)

    AsyncFunction("estimateWorldPoint") { (screenX: Double, screenY: Double) -> [String: Any?] in
      ArKitMeasurementController.shared.estimateWorldPoint(screenX: screenX, screenY: screenY)
    }.runOnQueue(.main)

    AsyncFunction("recordWorldPoint") { (xMeters: Double, yMeters: Double, zMeters: Double) -> [String: Any?] in
      ArKitMeasurementController.shared.recordWorldPoint(
        xMeters: xMeters,
        yMeters: yMeters,
        zMeters: zMeters
      )
    }.runOnQueue(.main)

    AsyncFunction("getWorldPoint") { (screenX: Double, screenY: Double) -> [String: Any?] in
      ArKitMeasurementController.shared.getWorldPoint(screenX: screenX, screenY: screenY)
    }.runOnQueue(.main)

    AsyncFunction("getDepthAtPoint") { (screenX: Double, screenY: Double) -> [String: Any?] in
      ArKitMeasurementController.shared.getDepthAtPoint(screenX: screenX, screenY: screenY)
    }.runOnQueue(.main)

    AsyncFunction("getCurrentMeasurement") { () -> [String: Any?] in
      ArKitMeasurementController.shared.getCurrentMeasurement()
    }.runOnQueue(.main)

    AsyncFunction("getTrackingState") { () -> [String: Any?] in
      ArKitMeasurementController.shared.getTrackingState()
    }.runOnQueue(.main)

    AsyncFunction("getDetectedPlanes") { () -> [[String: Any?]] in
      ArKitMeasurementController.shared.getDetectedPlanes()
    }.runOnQueue(.main)

    AsyncFunction("getMeasurementState") { () -> [String: Any?] in
      ArKitMeasurementController.shared.getMeasurementState()
    }.runOnQueue(.main)

    AsyncFunction("getObjectDetectorCapabilities") { () -> [String: Any?] in
      ArKitMeasurementController.shared.getObjectDetectorCapabilities()
    }

    AsyncFunction("detectObjectsInCurrentFrame") { (minConfidence: Double, promise: Promise) in
      ArKitMeasurementController.shared.detectObjectsInCurrentFrame(
        minConfidence: minConfidence,
        promise: promise
      )
    }

    OnCreate {
      ArKitMeasurementController.shared.setEventSink { eventName, payload in
        self.sendEvent(eventName, payload)
      }
    }

    OnAppEntersForeground {
      ArKitMeasurementController.shared.resumeSessionIfNeeded()
    }

    OnAppEntersBackground {
      ArKitMeasurementController.shared.pauseSession()
    }

    OnDestroy {
      ArKitMeasurementController.shared.closeSession()
      ArKitMeasurementController.shared.setEventSink(nil)
    }

    View(VolumeMeasurementArView.self) {
      Prop("active") { (view: VolumeMeasurementArView, active: Bool) in
        view.setActive(active)
      }
    }
  }
}

private final class VolumeMeasurementArView: ExpoView {
  fileprivate let sceneView = ARSCNView(frame: .zero)
  private var active = false

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    sceneView.automaticallyUpdatesLighting = false
    sceneView.autoenablesDefaultLighting = false
    sceneView.session = ArKitMeasurementController.shared.session
    sceneView.backgroundColor = .black
    addSubview(sceneView)
    ArKitMeasurementController.shared.attachView(self)
  }

  deinit {
    destroy()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    sceneView.frame = bounds
    ArKitMeasurementController.shared.setViewportSize(bounds.size)
  }

  func setActive(_ nextActive: Bool) {
    if active == nextActive {
      return
    }

    active = nextActive
    if active {
      ArKitMeasurementController.shared.startSession()
    } else {
      ArKitMeasurementController.shared.pauseSession()
    }
  }

  func destroy() {
    active = false
    ArKitMeasurementController.shared.detachView(self)
    sceneView.session.pause()
    sceneView.removeFromSuperview()
  }
}

private final class ArKitMeasurementController: NSObject, ARSessionDelegate {
  static let shared = ArKitMeasurementController()

  let session = ARSession()

  private weak var arView: VolumeMeasurementArView?
  private var desiredActive = false
  private var sessionRunning = false
  private var measurementMode = "camera_fallback"
  private var trackingStatus = "idle"
  private var lastError: String?
  private var selectedPoints: [SIMD3<Float>] = []
  private var measurementAnchors: [String: ARAnchor] = [:]

  func createMeasurementAnchor(id: String, x: Double, y: Double, z: Double) -> Bool {
    guard x.isFinite, y.isFinite, z.isFinite, trackingStatus == "tracking", measurementAnchors.count < 1024 else { return false }
    var transform = matrix_identity_float4x4
    transform.columns.3 = SIMD4<Float>(Float(x), Float(y), Float(z), 1)
    let anchor = ARAnchor(name: id, transform: transform)
    removeMeasurementAnchor(id: id)
    measurementAnchors[id] = anchor
    session.add(anchor: anchor)
    return true
  }

  func resolveMeasurementAnchors() -> [[String: Any?]] {
    let frame = session.currentFrame
    return measurementAnchors.map { id, saved in
      let current = frame?.anchors.first { $0.identifier == saved.identifier }
      let position = (current ?? saved).transform.columns.3
      let projected = arView?.sceneView.projectPoint(SCNVector3(position.x, position.y, position.z))
      let visible = projected.map { $0.z >= 0 && $0.z <= 1 && $0.x >= 0 && $0.y >= 0 &&
        Double($0.x) <= Double(viewportSize.width) && Double($0.y) <= Double(viewportSize.height) } ?? false
      return ["id": id, "xMeters": Double(position.x), "yMeters": Double(position.y),
              "zMeters": Double(position.z), "tracking": current != nil && trackingStatus == "tracking",
              "screenX": visible ? Double(projected!.x) / Double(viewportSize.width) : nil,
              "screenY": visible ? Double(projected!.y) / Double(viewportSize.height) : nil]
    }
  }

  func removeMeasurementAnchor(id: String) {
    if let anchor = measurementAnchors.removeValue(forKey: id) { session.remove(anchor: anchor) }
  }

  func clearMeasurementAnchors() {
    measurementAnchors.values.forEach { session.remove(anchor: $0) }
    measurementAnchors.removeAll()
  }
  private var detectedPlanes: [UUID: ARPlaneAnchor] = [:]
  private var latestDepthAvailable = false
  private var latestDepthConfidence: Double?
  private var depthFrameCount = 0
  private var validDepthFrameCount = 0
  private var latestMeasurementConfidence = 0.0
  private var latestTrackingQuality = 0.0
  private var latestHitStabilityMeters: Double?
  private var viewportSize = CGSize(width: 1, height: 1)
  private var eventSink: ((String, [String: Any?]) -> Void)?
  private let objectDetectionQueue = DispatchQueue(
    label: "com.poc-volume-finder.object-detection",
    qos: .userInitiated
  )
  private let isoDateFormatter = ISO8601DateFormatter()

  private struct DepthReading {
    let confidence: Double?
    let depthMeters: Double
    let frameTimestamp: TimeInterval
  }

  private struct WorldPointEstimate {
    let depthReading: DepthReading?
    let hitDistanceMeters: Double
    let point: SIMD3<Float>
    let source: String
    let trackableId: String
    let trackableType: String
  }

  override private init() {
    super.init()
    session.delegate = self
  }

  func setEventSink(_ sink: ((String, [String: Any?]) -> Void)?) {
    eventSink = sink
  }

  func attachView(_ view: VolumeMeasurementArView) {
    arView = view
    view.sceneView.session = session
    setViewportSize(view.bounds.size)
  }

  func detachView(_ view: VolumeMeasurementArView) {
    if arView === view {
      arView = nil
    }
  }

  func setViewportSize(_ size: CGSize) {
    guard size.width > 0, size.height > 0 else {
      return
    }
    viewportSize = size
  }

  func getCapabilities() -> [String: Any?] {
    let arSupported = ARWorldTrackingConfiguration.isSupported
    let depthSupported = supportsSceneDepth()
    let lidarSupported = hasLiDARCamera()
    let reason: String

    if arSupported && depthSupported {
      reason = lidarSupported
        ? "ARKit world tracking is supported with scene depth on this LiDAR-capable iOS device."
        : "ARKit world tracking is supported with scene depth on this iOS device."
    } else if arSupported {
      reason = "ARKit world tracking is supported. Scene depth is unavailable, so standard ARKit raycasting will be used."
    } else {
      reason = "ARKit world tracking is not available on this iOS device or simulator."
    }

    return [
      "platform": "ios",
      "arSupported": arSupported,
      "depthSupported": depthSupported,
      "lidarSupported": lidarSupported,
      "nativeMeasurementAvailable": arSupported,
      "fallbackMeasurementAvailable": true,
      "measurementMode": modeForCapabilities(arSupported: arSupported, depthSupported: depthSupported),
      "nativeModule": "VolumeMeasurementModule",
      "reason": reason
    ]
  }

  @discardableResult
  func startSession() -> [String: Any?] {
    desiredActive = true

    guard ARWorldTrackingConfiguration.isSupported else {
      return failSession(
        code: "arkit_unsupported",
        message: "ARKit world tracking is not supported on this iOS device."
      )
    }

    guard arView != nil else {
      updateTrackingStatus("idle")
      return getSessionState(reason: "ARKit preview view is not attached yet.")
    }

    let configuration = createConfiguration()
    measurementMode = modeForCapabilities(
      arSupported: true,
      depthSupported: configuration.frameSemantics.contains(.sceneDepth)
    )
    session.run(configuration, options: [])
    sessionRunning = true
    lastError = nil
    updateTrackingStatus("idle")
    return getSessionState()
  }

  func resumeSessionIfNeeded() {
    if desiredActive {
      startSession()
    }
  }

  @discardableResult
  func stopSession() -> [String: Any?] {
    desiredActive = false
    pauseSession()
    updateTrackingStatus("stopped")
    return getSessionState()
  }

  func pauseSession() {
    session.pause()
    sessionRunning = false
    latestDepthAvailable = false
    latestDepthConfidence = nil
    if desiredActive {
      updateTrackingStatus("stopped")
    }
  }

  @discardableResult
  func resetSession() -> [String: Any?] {
    clearMeasurementAnchors()
    selectedPoints.removeAll()
    detectedPlanes.removeAll()
    latestDepthAvailable = false
    latestDepthConfidence = nil
    depthFrameCount = 0
    validDepthFrameCount = 0
    latestMeasurementConfidence = 0.0
    latestTrackingQuality = trackingQualityScore()
    latestHitStabilityMeters = nil
    lastError = nil

    if sessionRunning {
      session.run(createConfiguration(), options: [.resetTracking, .removeExistingAnchors])
      updateTrackingStatus("idle")
    } else {
      updateTrackingStatus("stopped")
    }

    emitMeasurementUpdated()
    return getSessionState()
  }

  @discardableResult
  func undoLastPoint() -> [String: Any?] {
    if !selectedPoints.isEmpty {
      selectedPoints.removeLast()
    }
    emitMeasurementUpdated()
    return getSessionState()
  }

  func closeSession() {
    clearMeasurementAnchors()
    desiredActive = false
    session.pause()
    sessionRunning = false
    selectedPoints.removeAll()
    detectedPlanes.removeAll()
    updateTrackingStatus("stopped")
  }

  func setMeasurementMode(_ mode: String) -> [String: Any?] {
    let normalizedMode = normalizeMeasurementMode(mode)
    let capabilities = getCapabilities()

    if normalizedMode == "ar_depth", capabilities["depthSupported"] as? Bool != true {
      measurementMode = "standard_ar"
    } else {
      measurementMode = normalizedMode
    }

    return getSessionState()
  }

  func performHitTest(screenX: Double, screenY: Double) -> [[String: Any?]] {
    raycastEstimates(screenX: screenX, screenY: screenY).map { estimate in
      worldPointEstimateToMap(estimate: estimate, hitStabilityMeters: nil, sampleCount: 1)
    }
  }

  func estimateWorldPoint(screenX: Double, screenY: Double) -> [String: Any?] {
    guard let estimate = estimateWorldPointInternal(screenX: screenX, screenY: screenY) else {
      return [
        "reason": trackingStatus == "tracking"
          ? "No ARKit raycast result was found at this screen point."
          : "ARKit tracking is not ready yet."
      ]
    }

    updateQualityFromEstimate(estimate: estimate, hitStabilityMeters: nil, sampleCount: 1)
    return worldPointEstimateToMap(estimate: estimate, hitStabilityMeters: nil, sampleCount: 1)
  }

  func recordWorldPoint(xMeters: Double, yMeters: Double, zMeters: Double) -> [String: Any?] {
    guard xMeters.isFinite, yMeters.isFinite, zMeters.isFinite else {
      return ["reason": "World point contains invalid coordinates."]
    }

    selectedPoints.append(SIMD3<Float>(Float(xMeters), Float(yMeters), Float(zMeters)))
    emitMeasurementUpdated()
    return getSessionState()
  }

  func getWorldPoint(screenX: Double, screenY: Double) -> [String: Any?] {
    guard let estimate = estimateWorldPointInternal(screenX: screenX, screenY: screenY) else {
      return [
        "reason": trackingStatus == "tracking"
          ? "No ARKit raycast result was found at this screen point."
          : "ARKit tracking is not ready yet."
      ]
    }

    selectedPoints.append(estimate.point)
    updateQualityFromEstimate(estimate: estimate, hitStabilityMeters: nil, sampleCount: 1)
    emitMeasurementUpdated()
    return worldPointEstimateToMap(estimate: estimate, hitStabilityMeters: nil, sampleCount: 1)
  }

  func getDepthAtPoint(screenX: Double, screenY: Double) -> [String: Any?] {
    guard supportsSceneDepth() else {
      return [
        "depthAvailable": false,
        "reason": "ARKit scene depth is not supported on this iOS device."
      ]
    }

    guard let frame = session.currentFrame else {
      return [
        "depthAvailable": false,
        "reason": "No ARKit camera frame is available yet."
      ]
    }

    guard let reading = sampleDepthAtPoint(frame: frame, screenX: screenX, screenY: screenY) else {
      return [
        "depthAvailable": false,
        "reason": "Scene depth is not available for this frame or screen point.",
        "validFrameCount": validDepthFrameCount
      ]
    }

    return [
      "confidence": reading.confidence,
      "depthAvailable": true,
      "depthConfidence": reading.confidence,
      "depthMeters": reading.depthMeters,
      "frameTimestamp": reading.frameTimestamp,
      "validFrameCount": validDepthFrameCount
    ]
  }

  func getCurrentMeasurement() -> [String: Any?] {
    [
      "lengthMeters": distanceBetweenLastTwoPoints() ?? 0.0,
      "widthMeters": 0.0,
      "heightMeters": 0.0,
      "volumeCubicMeters": 0.0,
      "confidence": latestMeasurementConfidence,
      "trackingState": trackingStatus,
      "trackingQuality": latestTrackingQuality,
      "depthAvailable": latestDepthAvailable,
      "depthConfidence": latestDepthConfidence,
      "measurementConfidence": latestMeasurementConfidence,
      "measurementMode": currentMeasurementMode(),
      "selectedPointsCount": selectedPoints.count,
      "latestPoint": selectedPoints.last.map(pointToMap),
      "distanceBetweenLastTwoMeters": distanceBetweenLastTwoPoints(),
      "validDepthFrameCount": validDepthFrameCount,
      "depthFrameCount": depthFrameCount,
      "hitStabilityMeters": latestHitStabilityMeters,
      "simulated": false
    ]
  }

  func getTrackingState() -> [String: Any?] {
    [
      "status": trackingStatus,
      "reason": lastError
    ]
  }

  func getDetectedPlanes() -> [[String: Any?]] {
    detectedPlanes.values.map(planeToMap)
  }

  func getMeasurementState() -> [String: Any?] {
    [
      "status": selectedPoints.count >= 2 ? "processing" : (sessionRunning ? "scanning" : "idle"),
      "trackingState": trackingStatus,
      "selectedPointsCount": selectedPoints.count,
      "latestPoint": selectedPoints.last.map(pointToMap),
      "distanceBetweenLastTwoMeters": distanceBetweenLastTwoPoints(),
      "planes": getDetectedPlanes(),
      "quality": qualityMap(),
      "capabilities": getCapabilities()
    ]
  }

  func getObjectDetectorCapabilities() -> [String: Any?] {
    [
      "onDevice": true,
      "platform": "ios",
      "reason": "Uses Vision rectangle detection on the current ARKit camera frame.",
      "supported": ARWorldTrackingConfiguration.isSupported
    ]
  }

  func detectObjectsInCurrentFrame(minConfidence: Double, promise: Promise) {
    guard ARWorldTrackingConfiguration.isSupported else {
      promise.resolve(createObjectDetectionResponse(
        detections: [],
        elapsedMs: 0,
        reason: "ARKit current-frame detection is unavailable on this iOS device or simulator.",
        source: "unavailable"
      ))
      return
    }

    guard let frame = session.currentFrame else {
      promise.resolve(createObjectDetectionResponse(
        detections: [],
        elapsedMs: 0,
        reason: "No ARKit camera frame is available yet.",
        source: "unavailable"
      ))
      return
    }

    let pixelBuffer = frame.capturedImage
    let frameId = "arkit-frame-\(Int(frame.timestamp * 1000))"
    let startedAt = Date()
    let threshold = Float(minConfidence.clamped(to: 0.0...1.0))

    objectDetectionQueue.async {
      let request = VNDetectRectanglesRequest()
      request.maximumObservations = 3
      request.minimumConfidence = VNConfidence(threshold)
      request.minimumAspectRatio = 0.2
      request.maximumAspectRatio = 1.0
      request.quadratureTolerance = 25

      let handler = VNImageRequestHandler(
        cvPixelBuffer: pixelBuffer,
        orientation: .right,
        options: [:]
      )

      do {
        try handler.perform([request])
        let detections = (request.results ?? [])
          .filter { $0.confidence >= threshold }
          .sorted { $0.confidence > $1.confidence }
          .map { observation in
            self.rectangleObservationToDetection(
              observation,
              frameId: frameId
            )
          }
        let elapsedMs = Date().timeIntervalSince(startedAt) * 1000

        promise.resolve(self.createObjectDetectionResponse(
          detections: detections,
          elapsedMs: elapsedMs,
          reason: detections.isEmpty ? "No confident rectangular box-like face was detected." : nil,
          source: detections.isEmpty ? "unavailable" : "native"
        ))
      } catch {
        promise.reject("vision_detection_failed", error.localizedDescription)
      }
    }
  }

  func session(_ session: ARSession, didUpdate frame: ARFrame) {
    updateTrackingStatus(mapTrackingState(frame.camera.trackingState))
    updateDepthFrameStatus(frame: frame)
    latestTrackingQuality = trackingQualityScore()
  }

  func session(_ session: ARSession, cameraDidChangeTrackingState camera: ARCamera) {
    updateTrackingStatus(mapTrackingState(camera.trackingState))
    latestTrackingQuality = trackingQualityScore()
  }

  func session(_ session: ARSession, didAdd anchors: [ARAnchor]) {
    upsertPlaneAnchors(anchors: anchors, shouldEmitNewPlanes: true)
  }

  func session(_ session: ARSession, didUpdate anchors: [ARAnchor]) {
    upsertPlaneAnchors(anchors: anchors, shouldEmitNewPlanes: false)
  }

  func session(_ session: ARSession, didRemove anchors: [ARAnchor]) {
    anchors.compactMap { $0 as? ARPlaneAnchor }.forEach { plane in
      detectedPlanes.removeValue(forKey: plane.identifier)
    }
  }

  func session(_ session: ARSession, didFailWithError error: Error) {
    failSession(code: "arkit_session_failed", message: error.localizedDescription)
  }

  private func createConfiguration() -> ARWorldTrackingConfiguration {
    let configuration = ARWorldTrackingConfiguration()
    configuration.planeDetection = [.horizontal, .vertical]
    configuration.environmentTexturing = .none

    if supportsSceneDepth() {
      configuration.frameSemantics.insert(.sceneDepth)
    }

    return configuration
  }

  private func estimateWorldPointInternal(screenX: Double, screenY: Double) -> WorldPointEstimate? {
    guard let frame = session.currentFrame, mapTrackingState(frame.camera.trackingState) == "tracking" else {
      return nil
    }

    if let depthEstimate = depthWorldPointEstimate(frame: frame, screenX: screenX, screenY: screenY) {
      return depthEstimate
    }

    return raycastEstimates(screenX: screenX, screenY: screenY).first
  }

  private func raycastEstimates(screenX: Double, screenY: Double) -> [WorldPointEstimate] {
    guard let view = arView else {
      return []
    }

    let screenPoint = CGPoint(x: screenX, y: screenY)
    let targets: [ARRaycastQuery.Target] = [.existingPlaneGeometry, .estimatedPlane]
    let results = targets.flatMap { target -> [ARRaycastResult] in
      guard let query = view.sceneView.raycastQuery(from: screenPoint, allowing: target, alignment: .any) else {
        return []
      }
      return session.raycast(query)
    }

    return results.map { result in
      let point = pointFromTransform(result.worldTransform)
      let planeAnchor = result.anchor as? ARPlaneAnchor
      return WorldPointEstimate(
        depthReading: nil,
        hitDistanceMeters: distanceFromCamera(to: point),
        point: point,
        source: planeAnchor == nil ? "feature_point" : "plane",
        trackableId: result.anchor?.identifier.uuidString ?? "estimated-plane",
        trackableType: planeAnchor == nil ? "ARRaycastResult" : "ARPlaneAnchor"
      )
    }
  }

  private func depthWorldPointEstimate(
    frame: ARFrame,
    screenX: Double,
    screenY: Double
  ) -> WorldPointEstimate? {
    guard
      let reading = sampleDepthAtPoint(frame: frame, screenX: screenX, screenY: screenY),
      let point = worldPointFromDepth(frame: frame, screenX: screenX, screenY: screenY, depthMeters: reading.depthMeters)
    else {
      return nil
    }

    return WorldPointEstimate(
      depthReading: reading,
      hitDistanceMeters: distanceFromCamera(to: point),
      point: point,
      source: "depth_point",
      trackableId: nearestPlaneId(to: point) ?? "scene-depth",
      trackableType: "ARSceneDepth"
    )
  }

  private func sampleDepthAtPoint(frame: ARFrame, screenX: Double, screenY: Double) -> DepthReading? {
    guard let sceneDepth = frame.sceneDepth else {
      latestDepthAvailable = false
      latestDepthConfidence = nil
      return nil
    }

    guard let normalizedImagePoint = normalizedImagePoint(frame: frame, screenX: screenX, screenY: screenY) else {
      return nil
    }

    let depthMap = sceneDepth.depthMap
    let depthX = pixelCoordinate(normalizedValue: normalizedImagePoint.x, maxValue: CVPixelBufferGetWidth(depthMap))
    let depthY = pixelCoordinate(normalizedValue: normalizedImagePoint.y, maxValue: CVPixelBufferGetHeight(depthMap))

    guard let depthMeters = readFloat32Pixel(buffer: depthMap, x: depthX, y: depthY), depthMeters.isFinite, depthMeters > 0 else {
      latestDepthAvailable = false
      latestDepthConfidence = nil
      return nil
    }

    let confidence = sceneDepth.confidenceMap.flatMap { confidenceMap -> Double? in
      let confidenceX = pixelCoordinate(normalizedValue: normalizedImagePoint.x, maxValue: CVPixelBufferGetWidth(confidenceMap))
      let confidenceY = pixelCoordinate(normalizedValue: normalizedImagePoint.y, maxValue: CVPixelBufferGetHeight(confidenceMap))
      return readConfidencePixel(buffer: confidenceMap, x: confidenceX, y: confidenceY)
    }

    latestDepthAvailable = true
    latestDepthConfidence = confidence

    return DepthReading(
      confidence: confidence,
      depthMeters: Double(depthMeters),
      frameTimestamp: frame.timestamp
    )
  }

  private func worldPointFromDepth(
    frame: ARFrame,
    screenX: Double,
    screenY: Double,
    depthMeters: Double
  ) -> SIMD3<Float>? {
    guard let normalizedImagePoint = normalizedImagePoint(frame: frame, screenX: screenX, screenY: screenY) else {
      return nil
    }

    let imageWidth = Float(CVPixelBufferGetWidth(frame.capturedImage))
    let imageHeight = Float(CVPixelBufferGetHeight(frame.capturedImage))
    let imageX = Float(normalizedImagePoint.x) * imageWidth
    let imageY = Float(normalizedImagePoint.y) * imageHeight
    let intrinsics = frame.camera.intrinsics
    let fx = intrinsics.columns.0.x
    let fy = intrinsics.columns.1.y
    let cx = intrinsics.columns.2.x
    let cy = intrinsics.columns.2.y

    guard fx != 0, fy != 0 else {
      return nil
    }

    let depth = Float(depthMeters)
    let cameraX = (imageX - cx) * depth / fx
    let cameraY = -(imageY - cy) * depth / fy
    let cameraZ = -depth
    let cameraPoint = SIMD4<Float>(cameraX, cameraY, cameraZ, 1)
    let worldPoint = simd_mul(frame.camera.transform, cameraPoint)

    return SIMD3<Float>(worldPoint.x, worldPoint.y, worldPoint.z)
  }

  private func normalizedImagePoint(frame: ARFrame, screenX: Double, screenY: Double) -> CGPoint? {
    guard viewportSize.width > 0, viewportSize.height > 0 else {
      return nil
    }

    let normalizedViewPoint = CGPoint(
      x: CGFloat(screenX) / viewportSize.width,
      y: CGFloat(screenY) / viewportSize.height
    )
    let imageToViewTransform = frame.displayTransform(
      for: .portrait,
      viewportSize: viewportSize
    )
    let imagePoint = normalizedViewPoint.applying(imageToViewTransform.inverted())

    guard
      imagePoint.x.isFinite,
      imagePoint.y.isFinite,
      imagePoint.x >= 0,
      imagePoint.x <= 1,
      imagePoint.y >= 0,
      imagePoint.y <= 1
    else {
      return nil
    }

    return imagePoint
  }

  private func updateDepthFrameStatus(frame: ARFrame) {
    guard supportsSceneDepth(), mapTrackingState(frame.camera.trackingState) == "tracking" else {
      latestDepthAvailable = false
      latestDepthConfidence = nil
      return
    }

    depthFrameCount += 1
    if frame.sceneDepth != nil {
      latestDepthAvailable = true
      validDepthFrameCount += 1
    } else {
      latestDepthAvailable = false
      latestDepthConfidence = nil
    }
  }

  private func readFloat32Pixel(buffer: CVPixelBuffer, x: Int, y: Int) -> Float? {
    CVPixelBufferLockBaseAddress(buffer, .readOnly)
    defer {
      CVPixelBufferUnlockBaseAddress(buffer, .readOnly)
    }

    guard let baseAddress = CVPixelBufferGetBaseAddress(buffer) else {
      return nil
    }

    let width = CVPixelBufferGetWidth(buffer)
    let height = CVPixelBufferGetHeight(buffer)
    guard x >= 0, x < width, y >= 0, y < height else {
      return nil
    }

    let rowBytes = CVPixelBufferGetBytesPerRow(buffer)
    let rowPointer = baseAddress.advanced(by: y * rowBytes)
    let pixelPointer = rowPointer.assumingMemoryBound(to: Float32.self).advanced(by: x)

    return pixelPointer.pointee
  }

  private func readConfidencePixel(buffer: CVPixelBuffer, x: Int, y: Int) -> Double? {
    CVPixelBufferLockBaseAddress(buffer, .readOnly)
    defer {
      CVPixelBufferUnlockBaseAddress(buffer, .readOnly)
    }

    guard let baseAddress = CVPixelBufferGetBaseAddress(buffer) else {
      return nil
    }

    let width = CVPixelBufferGetWidth(buffer)
    let height = CVPixelBufferGetHeight(buffer)
    guard x >= 0, x < width, y >= 0, y < height else {
      return nil
    }

    let rowBytes = CVPixelBufferGetBytesPerRow(buffer)
    let rowPointer = baseAddress.advanced(by: y * rowBytes)
    let pixelPointer = rowPointer.assumingMemoryBound(to: UInt8.self).advanced(by: x)

    switch Int(pixelPointer.pointee) {
    case ARConfidenceLevel.high.rawValue:
      return 1.0
    case ARConfidenceLevel.medium.rawValue:
      return 0.66
    case ARConfidenceLevel.low.rawValue:
      return 0.33
    default:
      return nil
    }
  }

  private func pixelCoordinate(normalizedValue: CGFloat, maxValue: Int) -> Int {
    if maxValue <= 0 {
      return 0
    }

    return Int((normalizedValue * CGFloat(maxValue)).rounded(.down)).clamped(to: 0...(maxValue - 1))
  }

  private func upsertPlaneAnchors(anchors: [ARAnchor], shouldEmitNewPlanes: Bool) {
    anchors.compactMap { $0 as? ARPlaneAnchor }.forEach { plane in
      let isNewPlane = detectedPlanes[plane.identifier] == nil
      detectedPlanes[plane.identifier] = plane
      if shouldEmitNewPlanes && isNewPlane {
        emit("onPlaneDetected", planeToMap(plane))
      }
    }
  }

  private func planeToMap(_ plane: ARPlaneAnchor) -> [String: Any?] {
    [
      "id": plane.identifier.uuidString,
      "alignment": planeAlignment(plane.alignment),
      "center": pointToMap(planeCenterWorldPoint(plane)),
      "extentX": Double(plane.extent.x),
      "extentZ": Double(plane.extent.z),
      "trackingState": "tracking",
      "simulated": false
    ]
  }

  private func planeCenterWorldPoint(_ plane: ARPlaneAnchor) -> SIMD3<Float> {
    let localCenter = SIMD4<Float>(plane.center.x, plane.center.y, plane.center.z, 1)
    let worldCenter = simd_mul(plane.transform, localCenter)
    return SIMD3<Float>(worldCenter.x, worldCenter.y, worldCenter.z)
  }

  private func nearestPlaneId(to point: SIMD3<Float>) -> String? {
    detectedPlanes.values
      .map { plane in
        (id: plane.identifier.uuidString, distance: distanceBetween(point, planeCenterWorldPoint(plane)))
      }
      .sorted { first, second in first.distance < second.distance }
      .first?
      .id
  }

  private func pointToMap(_ point: SIMD3<Float>) -> [String: Any?] {
    [
      "x": Double(point.x),
      "y": Double(point.y),
      "z": Double(point.z),
      "xMeters": Double(point.x),
      "yMeters": Double(point.y),
      "zMeters": Double(point.z)
    ]
  }

  private func pointFromTransform(_ transform: simd_float4x4) -> SIMD3<Float> {
    let translation = transform.columns.3
    return SIMD3<Float>(translation.x, translation.y, translation.z)
  }

  private func distanceFromCamera(to point: SIMD3<Float>) -> Double {
    guard let frame = session.currentFrame else {
      return 0
    }

    return distanceBetween(point, pointFromTransform(frame.camera.transform))
  }

  private func distanceBetweenLastTwoPoints() -> Double? {
    guard selectedPoints.count >= 2 else {
      return nil
    }

    return distanceBetween(selectedPoints[selectedPoints.count - 2], selectedPoints[selectedPoints.count - 1])
  }

  private func distanceBetween(_ first: SIMD3<Float>, _ second: SIMD3<Float>) -> Double {
    let difference = first - second
    return Double(simd_length(difference))
  }

  private func worldPointEstimateToMap(
    estimate: WorldPointEstimate,
    hitStabilityMeters: Double?,
    sampleCount: Int
  ) -> [String: Any?] {
    let confidence = computeMeasurementConfidence(
      estimate: estimate,
      hitStabilityMeters: hitStabilityMeters,
      sampleCount: sampleCount
    )

    return pointToMap(estimate.point).merging([
      "confidence": confidence,
      "depthAvailable": estimate.depthReading != nil,
      "depthConfidence": estimate.depthReading?.confidence,
      "depthMeters": estimate.depthReading?.depthMeters,
      "distanceMeters": estimate.hitDistanceMeters,
      "frameTimestamp": estimate.depthReading?.frameTimestamp,
      "hitDistanceMeters": estimate.hitDistanceMeters,
      "hitStabilityMeters": hitStabilityMeters,
      "measurementConfidence": confidence,
      "planeId": estimate.trackableId,
      "sampleCount": sampleCount,
      "source": estimate.source,
      "trackableType": estimate.trackableType,
      "trackingQuality": trackingQualityScore(),
      "trackingState": trackingStatus,
      "validDepthFrameCount": validDepthFrameCount,
      "worldPoint": pointToMap(estimate.point),
      "simulated": false
    ]) { _, newValue in newValue }
  }

  private func computeMeasurementConfidence(
    estimate: WorldPointEstimate?,
    hitStabilityMeters: Double?,
    sampleCount: Int
  ) -> Double {
    let trackingScore = trackingQualityScore()
    let sourceScore: Double
    switch estimate?.source {
    case "depth_point":
      sourceScore = 0.95
    case "plane":
      sourceScore = 0.82
    case "feature_point":
      sourceScore = 0.62
    default:
      sourceScore = 0.0
    }

    let depthScore: Double
    if let confidence = estimate?.depthReading?.confidence {
      depthScore = confidence
    } else if estimate?.depthReading != nil {
      depthScore = 0.7
    } else if supportsSceneDepth() {
      depthScore = 0.25
    } else {
      depthScore = 0.0
    }

    let sampleScore = Double(min(sampleCount, 5)) / 5.0
    let stabilityScore: Double
    if let hitStabilityMeters {
      if hitStabilityMeters <= 0.01 {
        stabilityScore = 1.0
      } else if hitStabilityMeters <= 0.03 {
        stabilityScore = 0.8
      } else if hitStabilityMeters <= 0.06 {
        stabilityScore = 0.55
      } else {
        stabilityScore = 0.25
      }
    } else {
      stabilityScore = sampleCount <= 1 ? 0.35 : 0.5
    }

    let depthWeight = supportsSceneDepth() ? 0.15 : 0.0
    let confidence =
      trackingScore * 0.35 +
      sourceScore * 0.25 +
      stabilityScore * 0.25 +
      sampleScore * 0.15 +
      depthScore * depthWeight

    return confidence.clamped(to: 0.0...1.0)
  }

  private func updateQualityFromEstimate(
    estimate: WorldPointEstimate?,
    hitStabilityMeters: Double?,
    sampleCount: Int
  ) {
    latestTrackingQuality = trackingQualityScore()
    latestHitStabilityMeters = hitStabilityMeters
    latestMeasurementConfidence = computeMeasurementConfidence(
      estimate: estimate,
      hitStabilityMeters: hitStabilityMeters,
      sampleCount: sampleCount
    )
  }

  private func qualityMap() -> [String: Any?] {
    [
      "trackingQuality": trackingQualityScore(),
      "depthAvailable": latestDepthAvailable,
      "depthConfidence": latestDepthConfidence,
      "measurementConfidence": latestMeasurementConfidence,
      "measurementMode": currentMeasurementMode(),
      "depthFrameCount": depthFrameCount,
      "validDepthFrameCount": validDepthFrameCount,
      "hitStabilityMeters": latestHitStabilityMeters
    ]
  }

  private func mapTrackingState(_ state: ARCamera.TrackingState) -> String {
    switch state {
    case .normal:
      return "tracking"
    case .limited:
      return "limited"
    case .notAvailable:
      return sessionRunning ? "limited" : "idle"
    }
  }

  private func trackingQualityScore() -> Double {
    switch trackingStatus {
    case "tracking":
      return 1.0
    case "idle":
      return 0.2
    case "limited":
      return 0.35
    case "stopped", "not_available":
      return 0.0
    default:
      return 0.0
    }
  }

  private func currentMeasurementMode() -> String {
    if !ARWorldTrackingConfiguration.isSupported {
      return "camera_fallback"
    }

    if measurementMode == "ar_depth", supportsSceneDepth() {
      return "ar_depth"
    }

    return "standard_ar"
  }

  private func modeForCapabilities(arSupported: Bool, depthSupported: Bool) -> String {
    guard arSupported else {
      return "camera_fallback"
    }

    return depthSupported ? "ar_depth" : "standard_ar"
  }

  private func normalizeMeasurementMode(_ mode: String) -> String {
    switch mode {
    case "ar_depth", "standard_ar", "camera_fallback":
      return mode
    default:
      return "camera_fallback"
    }
  }

  private func supportsSceneDepth() -> Bool {
    ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth)
  }

  private func hasLiDARCamera() -> Bool {
    AVCaptureDevice.default(.builtInLiDARDepthCamera, for: .video, position: .back) != nil
  }

  private func planeAlignment(_ alignment: ARPlaneAnchor.Alignment) -> String {
    switch alignment {
    case .horizontal:
      return "horizontal"
    case .vertical:
      return "vertical"
    @unknown default:
      return "unknown"
    }
  }

  private func getSessionState(reason: String? = nil) -> [String: Any?] {
    [
      "active": sessionRunning,
      "measurementMode": currentMeasurementMode(),
      "trackingState": trackingStatus,
      "selectedPointsCount": selectedPoints.count,
      "latestPoint": selectedPoints.last.map(pointToMap),
      "distanceBetweenLastTwoMeters": distanceBetweenLastTwoPoints(),
      "quality": qualityMap(),
      "error": lastError,
      "reason": reason
    ]
  }

  private func updateTrackingStatus(_ status: String) {
    guard trackingStatus != status else {
      return
    }

    trackingStatus = status
    emit("onTrackingStateChanged", [
      "trackingState": trackingStatus,
      "measurementMode": currentMeasurementMode()
    ])
  }

  private func emitMeasurementUpdated() {
    emit("onMeasurementUpdated", getCurrentMeasurement())
  }

  @discardableResult
  private func failSession(code: String, message: String) -> [String: Any?] {
    lastError = message
    emit("onMeasurementError", [
      "code": code,
      "message": message
    ])
    updateTrackingStatus("not_available")
    return getSessionState()
  }

  private func emit(_ eventName: String, _ payload: [String: Any?]) {
    guard let sink = eventSink else {
      return
    }

    DispatchQueue.main.async {
      sink(eventName, payload)
    }
  }

  private func rectangleObservationToDetection(
    _ observation: VNRectangleObservation,
    frameId: String
  ) -> [String: Any?] {
    let boundingBox = visionRectToTopLeftNormalizedMap(observation.boundingBox)
    let confidence = Double(observation.confidence)

    return [
      "boundingBox": boundingBox,
      "category": "box",
      "confidence": confidence,
      "detectedAt": isoDateFormatter.string(from: Date()),
      "detectorName": "VisionRectangleObjectDetector",
      "frameId": frameId,
      "id": "vision-rectangle-\(UUID().uuidString)",
      "keypoints": [
        visionPointToKeypoint("top_left", observation.topLeft, confidence: confidence),
        visionPointToKeypoint("top_right", observation.topRight, confidence: confidence),
        visionPointToKeypoint("bottom_right", observation.bottomRight, confidence: confidence),
        visionPointToKeypoint("bottom_left", observation.bottomLeft, confidence: confidence)
      ],
      "source": "native"
    ]
  }

  private func createObjectDetectionResponse(
    detections: [[String: Any?]],
    elapsedMs: Double,
    reason: String?,
    source: String
  ) -> [String: Any?] {
    [
      "detections": detections,
      "elapsedMs": elapsedMs,
      "reason": reason,
      "source": source
    ]
  }

  private func visionRectToTopLeftNormalizedMap(_ rect: CGRect) -> [String: Double] {
    [
      "height": clampNormalized(rect.height),
      "width": clampNormalized(rect.width),
      "x": clampNormalized(rect.origin.x),
      "y": clampNormalized(1.0 - rect.origin.y - rect.height)
    ]
  }

  private func visionPointToKeypoint(
    _ id: String,
    _ point: CGPoint,
    confidence: Double
  ) -> [String: Any?] {
    [
      "confidence": confidence,
      "id": id,
      "x": clampNormalized(point.x),
      "y": clampNormalized(1.0 - point.y)
    ]
  }

  private func clampNormalized(_ value: CGFloat) -> Double {
    Double(value.clamped(to: CGFloat(0.0)...CGFloat(1.0)))
  }
}

private extension Comparable {
  func clamped(to limits: ClosedRange<Self>) -> Self {
    min(max(self, limits.lowerBound), limits.upperBound)
  }
}
