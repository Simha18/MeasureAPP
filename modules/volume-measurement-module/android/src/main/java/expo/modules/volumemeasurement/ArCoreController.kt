package expo.modules.volumemeasurement

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.pm.PackageManager
import android.media.Image
import android.opengl.Matrix
import android.os.Handler
import android.os.Looper
import android.view.Surface
import androidx.core.content.ContextCompat
import com.google.ar.core.ArCoreApk
import com.google.ar.core.Anchor
import com.google.ar.core.Config
import com.google.ar.core.Coordinates2d
import com.google.ar.core.DepthPoint
import com.google.ar.core.Frame
import com.google.ar.core.HitResult
import com.google.ar.core.Plane
import com.google.ar.core.Point
import com.google.ar.core.Pose
import com.google.ar.core.Session
import com.google.ar.core.TrackingState
import com.google.ar.core.exceptions.CameraNotAvailableException
import com.google.ar.core.exceptions.UnavailableApkTooOldException
import com.google.ar.core.exceptions.UnavailableArcoreNotInstalledException
import com.google.ar.core.exceptions.UnavailableDeviceNotCompatibleException
import com.google.ar.core.exceptions.UnavailableException
import com.google.ar.core.exceptions.UnavailableSdkTooOldException
import com.google.ar.core.exceptions.UnavailableUserDeclinedInstallationException
import com.google.ar.core.exceptions.NotYetAvailableException
import java.nio.ByteOrder
import java.util.concurrent.CopyOnWriteArraySet
import kotlin.math.abs
import kotlin.math.min
import kotlin.math.sqrt

internal object ArCoreController {
  private val mainHandler = Handler(Looper.getMainLooper())
  private val selectedPoints = mutableListOf<Pose>()
  private val measurementAnchorLock = Any()
  private val measurementAnchorOffsets = mutableMapOf<String, Pose>()
  private var measurementRootAnchor: Anchor? = null

  private data class MeasurementPointSnapshot(
    val id: String,
    val pose: Pose,
    val tracking: Boolean
  )

  fun createMeasurementAnchor(id: String, x: Double, y: Double, z: Double): Boolean {
    if (!x.isFinite() || !y.isFinite() || !z.isFinite() || trackingStatus != "tracking") return false
    val currentSession = session ?: return false
    val worldPose = Pose.makeTranslation(x.toFloat(), y.toFloat(), z.toFloat())
    synchronized(measurementAnchorLock) {
      if (measurementAnchorOffsets.size >= 1024 && !measurementAnchorOffsets.containsKey(id)) return false
      val rootAnchor = measurementRootAnchor ?: currentSession.createAnchor(worldPose).also {
        measurementRootAnchor = it
      }
      measurementAnchorOffsets[id] = rootAnchor.pose.inverse().compose(worldPose)
    }
    return true
  }

  fun resolveMeasurementAnchors(): List<Map<String, Any?>> {
    val view = FloatArray(16)
    val projection = FloatArray(16)
    val frame = lastFrame
    frame?.camera?.getViewMatrix(view, 0)
    frame?.camera?.getProjectionMatrix(projection, 0, 0.01f, 1000f)
    return measurementPointSnapshots().map { snapshot ->
      val point = floatArrayOf(snapshot.pose.tx(), snapshot.pose.ty(), snapshot.pose.tz(), 1f)
      val eye = FloatArray(4)
      val clip = FloatArray(4)
      Matrix.multiplyMV(eye, 0, view, 0, point, 0)
      Matrix.multiplyMV(clip, 0, projection, 0, eye, 0)
      val visible = frame != null && isVisibleClipPoint(clip)
      mapOf("id" to snapshot.id, "xMeters" to point[0].toDouble(), "yMeters" to point[1].toDouble(),
        "zMeters" to point[2].toDouble(), "tracking" to snapshot.tracking,
        "screenX" to if (visible) ((clip[0] / clip[3] + 1f) / 2f).toDouble() else null,
        "screenY" to if (visible) ((1f - clip[1] / clip[3]) / 2f).toDouble() else null)
    }
  }

  fun getMeasurementAnchorNdcPositions(frame: Frame): FloatArray {
    if (frame.camera.trackingState != TrackingState.TRACKING) {
      return floatArrayOf()
    }

    val view = FloatArray(16)
    val projection = FloatArray(16)
    frame.camera.getViewMatrix(view, 0)
    frame.camera.getProjectionMatrix(projection, 0, 0.01f, 1000f)
    val positions = mutableListOf<Float>()

    measurementPointSnapshots().forEach { snapshot ->
      if (!snapshot.tracking) return@forEach
      val point = floatArrayOf(snapshot.pose.tx(), snapshot.pose.ty(), snapshot.pose.tz(), 1f)
      val eye = FloatArray(4)
      val clip = FloatArray(4)
      Matrix.multiplyMV(eye, 0, view, 0, point, 0)
      Matrix.multiplyMV(clip, 0, projection, 0, eye, 0)
      if (isVisibleClipPoint(clip)) {
        positions.add(clip[0] / clip[3])
        positions.add(clip[1] / clip[3])
      }
    }

    return positions.toFloatArray()
  }

  fun removeMeasurementAnchor(id: String) {
    synchronized(measurementAnchorLock) {
      measurementAnchorOffsets.remove(id)
      if (measurementAnchorOffsets.isEmpty()) {
        measurementRootAnchor?.detach()
        measurementRootAnchor = null
      }
    }
  }

  fun clearMeasurementAnchors() {
    synchronized(measurementAnchorLock) {
      measurementRootAnchor?.detach()
      measurementRootAnchor = null
      measurementAnchorOffsets.clear()
    }
  }
  private val detectedPlaneIds = CopyOnWriteArraySet<String>()

  private var session: Session? = null
  private var lastFrame: Frame? = null
  private var requestedInstall = false
  private var desiredActive = false
  private var sessionResumed = false
  private var cameraTextureId = 0
  private var viewWidth = 0
  private var viewHeight = 0
  private var displayRotation = Surface.ROTATION_0
  private var trackingStatus = "idle"
  private var lastError: String? = null
  private var lastArSupported = false
  private var lastDepthSupported = false
  private var depthEnabled = false
  private var latestDepthAvailable = false
  private var latestDepthConfidence: Double? = null
  private var depthFrameCount = 0
  private var validDepthFrameCount = 0
  private var latestMeasurementConfidence = 0.0
  private var latestTrackingQuality = 0.0
  private var latestHitStabilityMeters: Double? = null
  private var eventSink: ((String, Map<String, Any?>) -> Unit)? = null

  private data class DepthReading(
    val confidence: Double?,
    val depthMeters: Double,
    val frameTimestamp: Long
  )

  private data class WorldPointEstimate(
    val depthReading: DepthReading?,
    val hitDistanceMeters: Double,
    val pose: Pose,
    val source: String,
    val trackableId: String,
    val trackableType: String
  )

  fun setEventSink(sink: ((String, Map<String, Any?>) -> Unit)?) {
    eventSink = sink
  }

  fun getCapabilities(context: Context?): Map<String, Any?> {
    val availability = context?.let { ArCoreApk.getInstance().checkAvailability(it) }
    val arSupported = availability?.isSupported == true
    if (context != null) {
      lastArSupported = arSupported
    }
    val depthSupported = detectDepthSupport(context)
    val installed = availability == ArCoreApk.Availability.SUPPORTED_INSTALLED
    val reason = when {
      context == null -> "No Android context is currently available."
      installed && depthSupported -> "ARCore is supported with Depth API on this Android device."
      installed -> "ARCore is supported and Google Play Services for AR is installed."
      arSupported -> "ARCore is supported. Google Play Services for AR may need installation or an update."
      availability == ArCoreApk.Availability.UNKNOWN_CHECKING -> "ARCore support check is still in progress."
      else -> "ARCore is not available on this Android device."
    }

    return mapOf(
      "platform" to "android",
      "arSupported" to arSupported,
      "depthSupported" to depthSupported,
      "lidarSupported" to false,
      "nativeMeasurementAvailable" to arSupported,
      "fallbackMeasurementAvailable" to true,
      "measurementMode" to measurementMode(),
      "arAvailability" to availability?.name,
      "googlePlayServicesForArInstalled" to installed,
      "nativeModule" to "VolumeMeasurementModule",
      "reason" to reason
    )
  }

  fun startSession(activity: Activity?): Map<String, Any?> {
    desiredActive = true

    if (activity == null) {
      return failSession("missing_activity", "Android activity is not available.")
    }

    if (!hasCameraPermission(activity)) {
      return failSession("missing_camera_permission", "Camera permission is required before starting ARCore.")
    }

    if (!ensureArCoreInstalled(activity)) {
      return getSessionState()
    }

    return try {
      val currentSession = session ?: createConfiguredSession(activity).also { session = it }
      if (cameraTextureId != 0) {
        currentSession.setCameraTextureName(cameraTextureId)
      }
      currentSession.resume()
      sessionResumed = true
      updateTrackingStatus("idle")
      getSessionState()
    } catch (error: Exception) {
      failSession("start_failed", "Unable to start ARCore session: ${error.message ?: error.javaClass.simpleName}")
    }
  }

  fun shouldResumeSession(): Boolean {
    return desiredActive
  }

  fun pauseSession() {
    try {
      session?.pause()
    } catch (_: Exception) {
      // Session pause is best effort during lifecycle transitions.
    }
    sessionResumed = false
    lastFrame = null
    if (desiredActive) {
      updateTrackingStatus("stopped")
    }
  }

  fun stopSession(): Map<String, Any?> {
    desiredActive = false
    pauseSession()
    updateTrackingStatus("stopped")
    return getSessionState()
  }

  fun resetSession(): Map<String, Any?> {
    clearMeasurementAnchors()
    selectedPoints.clear()
    detectedPlaneIds.clear()
    lastFrame = null
    lastError = null
    latestDepthAvailable = false
    latestDepthConfidence = null
    depthFrameCount = 0
    validDepthFrameCount = 0
    latestMeasurementConfidence = 0.0
    latestTrackingQuality = 0.0
    latestHitStabilityMeters = null
    updateTrackingStatus(if (sessionResumed) "idle" else "stopped")
    emitMeasurementUpdated()
    return getSessionState()
  }

  fun undoLastPoint(): Map<String, Any?> {
    if (selectedPoints.isNotEmpty()) {
      selectedPoints.removeAt(selectedPoints.lastIndex)
    }
    emitMeasurementUpdated()
    return getSessionState()
  }

  fun closeSession() {
    clearMeasurementAnchors()
    desiredActive = false
    pauseSession()
    session?.close()
    session = null
    selectedPoints.clear()
    detectedPlaneIds.clear()
    updateTrackingStatus("stopped")
  }

  fun onSurfaceCreated(textureId: Int) {
    cameraTextureId = textureId
    session?.setCameraTextureName(textureId)
  }

  fun onSurfaceChanged(width: Int, height: Int, rotation: Int) {
    viewWidth = width
    viewHeight = height
    displayRotation = rotation
    session?.setDisplayGeometry(rotation, width, height)
  }

  fun updateFrame(): Frame? {
    val currentSession = session ?: return null
    if (!sessionResumed || cameraTextureId == 0) {
      return null
    }

    return try {
      currentSession.setDisplayGeometry(displayRotation, viewWidth, viewHeight)
      val frame = currentSession.update()
      lastFrame = frame
      updateTrackingStatus(mapTrackingState(frame.camera.trackingState))
      collectDetectedPlanes(currentSession)
      updateDepthFrameStatus(frame)
      frame
    } catch (error: CameraNotAvailableException) {
      sessionResumed = false
      emitError("camera_not_available", "ARCore camera became unavailable: ${error.message ?: "unknown error"}")
      updateTrackingStatus("limited")
      null
    } catch (error: Exception) {
      lastError = error.message ?: error.javaClass.simpleName
      null
    }
  }

  fun hitTest(screenX: Double, screenY: Double): List<Map<String, Any?>> {
    val frame = lastFrame ?: return emptyList()
    if (frame.camera.trackingState != TrackingState.TRACKING) {
      return emptyList()
    }

    return frame.hitTest(screenX.toFloat(), screenY.toFloat())
      .filter(::isUsableHit)
      .map { hit -> hitToMap(hit) }
  }

  fun getWorldPoint(screenX: Double, screenY: Double): Map<String, Any?> {
    val estimate = estimateWorldPointInternal(screenX, screenY)
      ?: return mapOf("reason" to "No ARCore hit was found at this screen point.")

    selectedPoints.add(estimate.pose)
    updateQualityFromEstimate(estimate, latestHitStabilityMeters, 1)
    emitMeasurementUpdated()
    return worldPointEstimateToMap(estimate, latestHitStabilityMeters, 1)
  }

  fun estimateWorldPoint(screenX: Double, screenY: Double): Map<String, Any?> {
    val estimate = estimateWorldPointInternal(screenX, screenY)
      ?: return mapOf("reason" to "No ARCore hit was found at this screen point.")

    updateQualityFromEstimate(estimate, latestHitStabilityMeters, 1)
    return worldPointEstimateToMap(estimate, latestHitStabilityMeters, 1)
  }

  fun recordWorldPoint(xMeters: Double, yMeters: Double, zMeters: Double): Map<String, Any?> {
    if (!xMeters.isFinite() || !yMeters.isFinite() || !zMeters.isFinite()) {
      return mapOf("reason" to "World point contains invalid coordinates.")
    }

    selectedPoints.add(Pose.makeTranslation(xMeters.toFloat(), yMeters.toFloat(), zMeters.toFloat()))
    emitMeasurementUpdated()
    return getSessionState()
  }

  fun getDepthAtPoint(screenX: Double, screenY: Double): Map<String, Any?> {
    val frame = lastFrame ?: return mapOf(
      "depthAvailable" to false,
      "reason" to "No ARCore camera frame is available yet."
    )

    if (!depthEnabled) {
      return mapOf(
        "depthAvailable" to false,
        "reason" to "ARCore Depth API is not supported or not enabled on this device."
      )
    }

    return sampleDepthAtPoint(frame, screenX, screenY)?.let { reading ->
      mapOf(
        "confidence" to reading.confidence,
        "depthAvailable" to true,
        "depthConfidence" to reading.confidence,
        "depthMeters" to reading.depthMeters,
        "frameTimestamp" to reading.frameTimestamp,
        "validFrameCount" to validDepthFrameCount
      )
    } ?: mapOf(
      "depthAvailable" to false,
      "reason" to "Depth data is not available for this frame or screen point.",
      "validFrameCount" to validDepthFrameCount
    )
  }

  fun getTrackingState(): Map<String, Any?> {
    return mapOf(
      "status" to trackingStatus,
      "reason" to lastError
    )
  }

  fun getDetectedPlanes(): List<Map<String, Any?>> {
    val currentSession = session ?: return emptyList()
    return currentSession.getAllTrackables(Plane::class.java)
      .filter { it.trackingState == TrackingState.TRACKING }
      .map { planeToMap(it) }
  }

  fun getMeasurementState(): Map<String, Any?> {
    return mapOf(
      "status" to if (selectedPoints.size >= 2) "processing" else if (sessionResumed) "scanning" else "idle",
      "trackingState" to trackingStatus,
      "selectedPointsCount" to selectedPoints.size,
      "latestPoint" to selectedPoints.lastOrNull()?.let(::poseToPointMap),
      "distanceBetweenLastTwoMeters" to distanceBetweenLastTwoPoints(),
      "planes" to getDetectedPlanes(),
      "quality" to qualityMap(),
      "capabilities" to getCapabilities(null)
    )
  }

  fun getCurrentMeasurement(): Map<String, Any?> {
    return mapOf(
      "lengthMeters" to (distanceBetweenLastTwoPoints() ?: 0.0),
      "widthMeters" to 0.0,
      "heightMeters" to 0.0,
      "volumeCubicMeters" to 0.0,
      "confidence" to latestMeasurementConfidence,
      "trackingState" to trackingStatus,
      "trackingQuality" to latestTrackingQuality,
      "depthAvailable" to latestDepthAvailable,
      "depthConfidence" to latestDepthConfidence,
      "measurementConfidence" to latestMeasurementConfidence,
      "measurementMode" to measurementMode(),
      "selectedPointsCount" to selectedPoints.size,
      "latestPoint" to selectedPoints.lastOrNull()?.let(::poseToPointMap),
      "distanceBetweenLastTwoMeters" to distanceBetweenLastTwoPoints(),
      "validDepthFrameCount" to validDepthFrameCount,
      "depthFrameCount" to depthFrameCount,
      "hitStabilityMeters" to latestHitStabilityMeters,
      "simulated" to false
    )
  }

  fun getSessionState(): Map<String, Any?> {
    return mapOf(
      "active" to sessionResumed,
      "measurementMode" to measurementMode(),
      "trackingState" to trackingStatus,
      "selectedPointsCount" to selectedPoints.size,
      "latestPoint" to selectedPoints.lastOrNull()?.let(::poseToPointMap),
      "distanceBetweenLastTwoMeters" to distanceBetweenLastTwoPoints(),
      "quality" to qualityMap(),
      "error" to lastError
    )
  }

  private fun ensureArCoreInstalled(activity: Activity): Boolean {
    return when (ArCoreApk.getInstance().checkAvailability(activity)) {
      ArCoreApk.Availability.SUPPORTED_INSTALLED -> true
      ArCoreApk.Availability.SUPPORTED_APK_TOO_OLD,
      ArCoreApk.Availability.SUPPORTED_NOT_INSTALLED -> {
        try {
          when (ArCoreApk.getInstance().requestInstall(activity, !requestedInstall)) {
            ArCoreApk.InstallStatus.INSTALL_REQUESTED -> {
              requestedInstall = true
              lastError = "Google Play Services for AR installation requested."
              updateTrackingStatus("limited")
              false
            }
            ArCoreApk.InstallStatus.INSTALLED -> true
          }
        } catch (error: UnavailableUserDeclinedInstallationException) {
          failSession("arcore_install_declined", "Google Play Services for AR installation was declined.")
          false
        } catch (error: UnavailableException) {
          failSession("arcore_unavailable", "Google Play Services for AR is unavailable: ${error.javaClass.simpleName}")
          false
        }
      }
      ArCoreApk.Availability.UNKNOWN_CHECKING -> {
        lastError = "ARCore support check is still in progress."
        updateTrackingStatus("limited")
        false
      }
      else -> {
        failSession("arcore_unsupported", "This Android device does not support ARCore.")
        false
      }
    }
  }

  private fun createConfiguredSession(activity: Activity): Session {
    val createdSession = try {
      Session(activity)
    } catch (error: UnavailableArcoreNotInstalledException) {
      throw IllegalStateException("Google Play Services for AR is not installed.", error)
    } catch (error: UnavailableApkTooOldException) {
      throw IllegalStateException("Google Play Services for AR is too old.", error)
    } catch (error: UnavailableSdkTooOldException) {
      throw IllegalStateException("The ARCore SDK dependency is too old.", error)
    } catch (error: UnavailableDeviceNotCompatibleException) {
      throw IllegalStateException("This device is not compatible with ARCore.", error)
    }

    val config = Config(createdSession).apply {
      planeFindingMode = Config.PlaneFindingMode.HORIZONTAL_AND_VERTICAL
      updateMode = Config.UpdateMode.LATEST_CAMERA_IMAGE
      lightEstimationMode = Config.LightEstimationMode.DISABLED
      focusMode = Config.FocusMode.AUTO
      depthMode = if (createdSession.isDepthModeSupported(Config.DepthMode.AUTOMATIC)) {
        Config.DepthMode.AUTOMATIC
      } else {
        Config.DepthMode.DISABLED
      }
    }
    lastDepthSupported = config.depthMode == Config.DepthMode.AUTOMATIC
    depthEnabled = lastDepthSupported
    createdSession.configure(config)
    return createdSession
  }

  private fun hasCameraPermission(context: Context): Boolean {
    return ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
  }

  private fun isUsableHit(hit: HitResult): Boolean {
    return when (val trackable = hit.trackable) {
      is DepthPoint -> trackable.trackingState == TrackingState.TRACKING
      is Plane -> trackable.trackingState == TrackingState.TRACKING && trackable.isPoseInPolygon(hit.hitPose)
      is Point -> trackable.trackingState == TrackingState.TRACKING
      else -> false
    }
  }

  private fun estimateWorldPointInternal(screenX: Double, screenY: Double): WorldPointEstimate? {
    val frame = lastFrame ?: return null
    if (frame.camera.trackingState != TrackingState.TRACKING) {
      return null
    }

    val hit = choosePreferredHit(frame.hitTest(screenX.toFloat(), screenY.toFloat()).filter(::isUsableHit))
      ?: return null
    val depthReading = if (depthEnabled) sampleDepthAtPoint(frame, screenX, screenY) else null
    val trackableType = hit.trackable.javaClass.simpleName

    return WorldPointEstimate(
      depthReading = depthReading,
      hitDistanceMeters = hit.distance.toDouble(),
      pose = hit.hitPose,
      source = when (hit.trackable) {
        is DepthPoint -> "depth_point"
        is Plane -> "plane"
        is Point -> "feature_point"
        else -> "unknown"
      },
      trackableId = trackableId(hit.trackable),
      trackableType = trackableType
    )
  }

  private fun choosePreferredHit(hits: List<HitResult>): HitResult? {
    if (hits.isEmpty()) {
      return null
    }

    return hits.firstOrNull { it.trackable is DepthPoint }
      ?: hits.firstOrNull { it.trackable is Plane }
      ?: hits.firstOrNull { it.trackable is Point }
      ?: hits.first()
  }

  private fun hitToMap(hit: HitResult): Map<String, Any?> {
    val trackable = hit.trackable
    return mapOf(
      "distanceMeters" to hit.distance.toDouble(),
      "planeId" to trackableId(trackable),
      "trackableType" to trackable.javaClass.simpleName,
      "worldPoint" to poseToPointMap(hit.hitPose),
      "source" to when (trackable) {
        is DepthPoint -> "depth_point"
        is Plane -> "plane"
        is Point -> "feature_point"
        else -> "unknown"
      },
      "simulated" to false
    )
  }

  private fun worldPointEstimateToMap(
    estimate: WorldPointEstimate,
    hitStabilityMeters: Double?,
    sampleCount: Int
  ): Map<String, Any?> {
    val confidence = computeMeasurementConfidence(estimate, hitStabilityMeters, sampleCount)
    return poseToPointMap(estimate.pose) + mapOf(
      "confidence" to confidence,
      "depthAvailable" to (estimate.depthReading != null),
      "depthConfidence" to estimate.depthReading?.confidence,
      "depthMeters" to estimate.depthReading?.depthMeters,
      "hitDistanceMeters" to estimate.hitDistanceMeters,
      "hitStabilityMeters" to hitStabilityMeters,
      "measurementConfidence" to confidence,
      "planeId" to estimate.trackableId,
      "sampleCount" to sampleCount,
      "source" to estimate.source,
      "trackableType" to estimate.trackableType,
      "trackingQuality" to trackingQualityScore(),
      "validDepthFrameCount" to validDepthFrameCount,
      "simulated" to false
    )
  }

  private fun updateDepthFrameStatus(frame: Frame) {
    if (!depthEnabled || frame.camera.trackingState != TrackingState.TRACKING) {
      latestDepthAvailable = false
      latestDepthConfidence = null
      return
    }

    depthFrameCount += 1
    try {
      frame.acquireDepthImage16Bits().use { image ->
        val hasDepth = image.width > 0 && image.height > 0
        latestDepthAvailable = hasDepth
        if (hasDepth) {
          validDepthFrameCount += 1
        }
      }
    } catch (_: NotYetAvailableException) {
      latestDepthAvailable = false
      latestDepthConfidence = null
    } catch (_: Exception) {
      latestDepthAvailable = false
      latestDepthConfidence = null
    }
  }

  private fun sampleDepthAtPoint(frame: Frame, screenX: Double, screenY: Double): DepthReading? {
    if (!depthEnabled || frame.camera.trackingState != TrackingState.TRACKING) {
      return null
    }

    return try {
      frame.acquireDepthImage16Bits().use { depthImage ->
        val texturePoint = viewPointToTexturePoint(frame, screenX, screenY) ?: return null
        val depthX = (texturePoint.first * depthImage.width).toInt().coerceIn(0, depthImage.width - 1)
        val depthY = (texturePoint.second * depthImage.height).toInt().coerceIn(0, depthImage.height - 1)
        val depthMillimeters = readUnsignedShortPixel(depthImage, depthX, depthY)
        if (depthMillimeters <= 0) {
          return null
        }

        val confidence = readDepthConfidence(frame, texturePoint)
        latestDepthAvailable = true
        latestDepthConfidence = confidence
        DepthReading(
          confidence = confidence,
          depthMeters = depthMillimeters / 1000.0,
          frameTimestamp = frame.timestamp
        )
      }
    } catch (_: NotYetAvailableException) {
      null
    } catch (_: Exception) {
      null
    }
  }

  private fun readDepthConfidence(frame: Frame, texturePoint: Pair<Float, Float>): Double? {
    return try {
      frame.acquireRawDepthConfidenceImage().use { confidenceImage ->
        val confidenceX = (texturePoint.first * confidenceImage.width).toInt().coerceIn(0, confidenceImage.width - 1)
        val confidenceY = (texturePoint.second * confidenceImage.height).toInt().coerceIn(0, confidenceImage.height - 1)
        readUnsignedBytePixel(confidenceImage, confidenceX, confidenceY) / 255.0
      }
    } catch (_: NotYetAvailableException) {
      null
    } catch (_: Exception) {
      null
    }
  }

  private fun viewPointToTexturePoint(frame: Frame, screenX: Double, screenY: Double): Pair<Float, Float>? {
    if (viewWidth <= 0 || viewHeight <= 0) {
      return null
    }

    val input = floatArrayOf(screenX.toFloat(), screenY.toFloat())
    val output = FloatArray(2)
    frame.transformCoordinates2d(Coordinates2d.VIEW, input, Coordinates2d.TEXTURE_NORMALIZED, output)
    val textureX = output[0]
    val textureY = output[1]

    if (!textureX.isFinite() || !textureY.isFinite() || textureX < 0f || textureX > 1f || textureY < 0f || textureY > 1f) {
      return null
    }

    return Pair(textureX, textureY)
  }

  private fun readUnsignedShortPixel(image: Image, x: Int, y: Int): Int {
    val plane = image.planes[0]
    val buffer = plane.buffer.duplicate().order(ByteOrder.nativeOrder())
    val index = y * plane.rowStride + x * plane.pixelStride
    if (index < 0 || index + 1 >= buffer.capacity()) {
      return 0
    }

    return buffer.getShort(index).toInt() and 0xffff
  }

  private fun readUnsignedBytePixel(image: Image, x: Int, y: Int): Int {
    val plane = image.planes[0]
    val buffer = plane.buffer.duplicate()
    val index = y * plane.rowStride + x * plane.pixelStride
    if (index < 0 || index >= buffer.capacity()) {
      return 0
    }

    return buffer.get(index).toInt() and 0xff
  }

  private fun collectDetectedPlanes(currentSession: Session) {
    currentSession.getAllTrackables(Plane::class.java)
      .filter { it.trackingState == TrackingState.TRACKING }
      .forEach { plane ->
        val id = trackableId(plane)
        if (detectedPlaneIds.add(id)) {
          emit("onPlaneDetected", planeToMap(plane))
        }
      }
  }

  private fun planeToMap(plane: Plane): Map<String, Any?> {
    return mapOf(
      "id" to trackableId(plane),
      "alignment" to planeAlignment(plane),
      "center" to poseToPointMap(plane.centerPose),
      "extentX" to plane.extentX.toDouble(),
      "extentZ" to plane.extentZ.toDouble(),
      "trackingState" to mapTrackingState(plane.trackingState),
      "simulated" to false
    )
  }

  private fun planeAlignment(plane: Plane): String {
    return when (plane.type) {
      Plane.Type.HORIZONTAL_DOWNWARD_FACING,
      Plane.Type.HORIZONTAL_UPWARD_FACING -> "horizontal"
      Plane.Type.VERTICAL -> "vertical"
    }
  }

  private fun poseToPointMap(pose: Pose): Map<String, Any?> {
    return mapOf(
      "x" to pose.tx().toDouble(),
      "y" to pose.ty().toDouble(),
      "z" to pose.tz().toDouble(),
      "xMeters" to pose.tx().toDouble(),
      "yMeters" to pose.ty().toDouble(),
      "zMeters" to pose.tz().toDouble()
    )
  }

  private fun isVisibleClipPoint(clip: FloatArray): Boolean {
    return clip[3] > 0f &&
      abs(clip[0]) <= clip[3] &&
      abs(clip[1]) <= clip[3] &&
      abs(clip[2]) <= clip[3]
  }

  private fun measurementPointSnapshots(): List<MeasurementPointSnapshot> {
    return synchronized(measurementAnchorLock) {
      val rootAnchor = measurementRootAnchor ?: return@synchronized emptyList()
      val rootPose = rootAnchor.pose
      val tracking = rootAnchor.trackingState == TrackingState.TRACKING
      measurementAnchorOffsets.map { (id, offset) ->
        MeasurementPointSnapshot(id, rootPose.compose(offset), tracking)
      }
    }
  }

  private fun distanceBetweenLastTwoPoints(): Double? {
    if (selectedPoints.size < 2) {
      return null
    }

    val first = selectedPoints[selectedPoints.size - 2]
    val second = selectedPoints[selectedPoints.size - 1]
    val dx = second.tx() - first.tx()
    val dy = second.ty() - first.ty()
    val dz = second.tz() - first.tz()
    return sqrt((dx * dx + dy * dy + dz * dz).toDouble())
  }

  private fun detectDepthSupport(context: Context?): Boolean {
    session?.let { activeSession ->
      lastDepthSupported = activeSession.isDepthModeSupported(Config.DepthMode.AUTOMATIC)
      return lastDepthSupported
    }

    if (context == null || !lastArSupported) {
      return lastDepthSupported
    }

    if (!hasCameraPermission(context)) {
      return lastDepthSupported
    }

    return try {
      val probeSession = Session(context)
      val isSupported = probeSession.isDepthModeSupported(Config.DepthMode.AUTOMATIC)
      probeSession.close()
      lastDepthSupported = isSupported
      isSupported
    } catch (_: Exception) {
      lastDepthSupported
    }
  }

  private fun measurementMode(): String {
    return when {
      lastArSupported && depthEnabled && lastDepthSupported -> "ar_depth"
      lastArSupported -> "standard_ar"
      else -> "camera_fallback"
    }
  }

  private fun trackingQualityScore(): Double {
    return when (trackingStatus) {
      "tracking" -> 1.0
      "idle" -> 0.2
      "limited" -> 0.35
      "stopped" -> 0.0
      "not_available" -> 0.0
      else -> 0.0
    }
  }

  private fun computeMeasurementConfidence(
    estimate: WorldPointEstimate?,
    hitStabilityMeters: Double?,
    sampleCount: Int
  ): Double {
    val trackingScore = trackingQualityScore()
    val sourceScore = when (estimate?.source) {
      "depth_point" -> 0.95
      "plane" -> 0.82
      "feature_point" -> 0.62
      else -> 0.0
    }
    val depthScore = when {
      estimate?.depthReading?.confidence != null -> estimate.depthReading.confidence
      estimate?.depthReading != null -> 0.7
      depthEnabled -> 0.25
      else -> 0.0
    }
    val sampleScore = min(sampleCount, 5) / 5.0
    val stabilityScore = when {
      hitStabilityMeters == null -> if (sampleCount <= 1) 0.35 else 0.5
      hitStabilityMeters <= 0.01 -> 1.0
      hitStabilityMeters <= 0.03 -> 0.8
      hitStabilityMeters <= 0.06 -> 0.55
      else -> 0.25
    }
    val depthWeight = if (depthEnabled) 0.15 else 0.0
    val confidence =
      trackingScore * 0.35 +
        sourceScore * 0.25 +
        stabilityScore * 0.25 +
        sampleScore * 0.15 +
        depthScore * depthWeight

    return confidence.coerceIn(0.0, 1.0)
  }

  private fun updateQualityFromEstimate(
    estimate: WorldPointEstimate?,
    hitStabilityMeters: Double?,
    sampleCount: Int
  ) {
    latestTrackingQuality = trackingQualityScore()
    latestHitStabilityMeters = hitStabilityMeters
    latestMeasurementConfidence = computeMeasurementConfidence(estimate, hitStabilityMeters, sampleCount)
  }

  private fun qualityMap(): Map<String, Any?> {
    return mapOf(
      "trackingQuality" to trackingQualityScore(),
      "depthAvailable" to latestDepthAvailable,
      "depthConfidence" to latestDepthConfidence,
      "measurementConfidence" to latestMeasurementConfidence,
      "measurementMode" to measurementMode(),
      "depthFrameCount" to depthFrameCount,
      "validDepthFrameCount" to validDepthFrameCount,
      "hitStabilityMeters" to latestHitStabilityMeters
    )
  }

  private fun mapTrackingState(state: TrackingState): String {
    return when (state) {
      TrackingState.TRACKING -> "tracking"
      TrackingState.PAUSED -> "limited"
      TrackingState.STOPPED -> "stopped"
    }
  }

  private fun updateTrackingStatus(status: String) {
    if (trackingStatus == status) {
      return
    }
    trackingStatus = status
    emit(
      "onTrackingStateChanged",
      mapOf(
        "trackingState" to trackingStatus,
        "measurementMode" to measurementMode()
      )
    )
  }

  private fun emitMeasurementUpdated() {
    emit("onMeasurementUpdated", getCurrentMeasurement())
  }

  private fun emitError(code: String, message: String) {
    lastError = message
    emit(
      "onMeasurementError",
      mapOf(
        "code" to code,
        "message" to message
      )
    )
  }

  private fun emit(eventName: String, payload: Map<String, Any?>) {
    val sink = eventSink ?: return
    mainHandler.post {
      sink(eventName, payload)
    }
  }

  private fun failSession(code: String, message: String): Map<String, Any?> {
    emitError(code, message)
    updateTrackingStatus("not_available")
    return getSessionState()
  }

  private fun trackableId(trackable: Any): String {
    return "${trackable.javaClass.simpleName}-${System.identityHashCode(trackable)}"
  }
}
