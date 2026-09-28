package expo.modules.volumemeasurement

import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class VolumeMeasurementModule : Module() {
  private var measurementMode = "camera_fallback"
  private var observedEventCount = 0

  override fun definition() = ModuleDefinition {
    Name("VolumeMeasurementModule")

    Events(
      "onTrackingStateChanged",
      "onPlaneDetected",
      "onMeasurementUpdated",
      "onMeasurementCompleted",
      "onMeasurementError"
    )

    AsyncFunction("getCapabilities") {
      ArCoreController.getCapabilities(appContext.reactContext ?: appContext.currentActivity)
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("createMeasurementAnchor") { id: String, x: Double, y: Double, z: Double ->
      ArCoreController.createMeasurementAnchor(id, x, y, z)
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("resolveMeasurementAnchors") {
      ArCoreController.resolveMeasurementAnchors()
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("removeMeasurementAnchor") { id: String ->
      ArCoreController.removeMeasurementAnchor(id)
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("clearMeasurementAnchors") {
      ArCoreController.clearMeasurementAnchors()
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("startSession") {
      ArCoreController.startSession(appContext.currentActivity)
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("stopSession") {
      ArCoreController.stopSession()
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("resetSession") {
      ArCoreController.resetSession()
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("undoLastPoint") {
      ArCoreController.undoLastPoint()
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("setMeasurementMode") { mode: String ->
      measurementMode = normalizeMeasurementMode(mode)
      ArCoreController.getSessionState()
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("performHitTest") { screenX: Double, screenY: Double ->
      ArCoreController.hitTest(screenX, screenY)
    }

    AsyncFunction("estimateWorldPoint") { screenX: Double, screenY: Double ->
      ArCoreController.estimateWorldPoint(screenX, screenY)
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("recordWorldPoint") { xMeters: Double, yMeters: Double, zMeters: Double ->
      ArCoreController.recordWorldPoint(xMeters, yMeters, zMeters)
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("getWorldPoint") { screenX: Double, screenY: Double ->
      ArCoreController.getWorldPoint(screenX, screenY)
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("getDepthAtPoint") { screenX: Double, screenY: Double ->
      ArCoreController.getDepthAtPoint(screenX, screenY)
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("getCurrentMeasurement") {
      ArCoreController.getCurrentMeasurement()
    }

    AsyncFunction("getTrackingState") {
      ArCoreController.getTrackingState()
    }

    AsyncFunction("getDetectedPlanes") {
      ArCoreController.getDetectedPlanes()
    }

    AsyncFunction("getMeasurementState") {
      ArCoreController.getMeasurementState()
    }

    AsyncFunction("getObjectDetectorCapabilities") {
      mapOf(
        "onDevice" to true,
        "platform" to "android",
        "reason" to "Android object detection contract is present, but no ML Kit or TFLite detector is bundled yet.",
        "supported" to false
      )
    }

    AsyncFunction("detectObjectsInCurrentFrame") { minConfidence: Double ->
      mapOf(
        "detections" to emptyList<Map<String, Any?>>(),
        "elapsedMs" to 0,
        "reason" to "Android on-device box detection is not bundled yet. Manual AR point selection remains available.",
        "source" to "unavailable"
      )
    }

    OnStartObserving {
      observedEventCount += 1
    }

    OnStopObserving {
      observedEventCount = (observedEventCount - 1).coerceAtLeast(0)
    }

    OnCreate {
      ArCoreController.setEventSink { eventName, payload ->
        sendEvent(eventName, payload)
      }
    }

    OnActivityEntersForeground {
      if (ArCoreController.shouldResumeSession()) {
        ArCoreController.startSession(appContext.currentActivity)
      }
    }

    OnActivityEntersBackground {
      ArCoreController.pauseSession()
    }

    OnActivityDestroys {
      ArCoreController.closeSession()
    }

    OnDestroy {
      observedEventCount = 0
      ArCoreController.closeSession()
      ArCoreController.setEventSink(null)
    }

    View(VolumeMeasurementArView::class) {
      Prop("active") { view: VolumeMeasurementArView, active: Boolean ->
        view.setActive(active)
      }

      OnViewDestroys { view: VolumeMeasurementArView ->
        view.destroy()
      }
    }
  }

  private fun normalizeMeasurementMode(mode: String): String {
    return when (mode) {
      "ar_depth", "standard_ar", "camera_fallback" -> mode
      else -> "camera_fallback"
    }
  }
}
