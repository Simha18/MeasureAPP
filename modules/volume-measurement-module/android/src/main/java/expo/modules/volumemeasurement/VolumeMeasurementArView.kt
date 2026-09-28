package expo.modules.volumemeasurement

import android.annotation.SuppressLint
import android.content.Context
import android.opengl.GLES20
import android.opengl.GLSurfaceView
import android.view.Surface
import android.view.ViewGroup
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView
import javax.microedition.khronos.egl.EGLConfig
import javax.microedition.khronos.opengles.GL10

@SuppressLint("ViewConstructor")
internal class VolumeMeasurementArView(
  context: Context,
  appContext: AppContext
) : ExpoView(context, appContext), GLSurfaceView.Renderer {
  private val backgroundRenderer = ArCameraBackgroundRenderer()
  private val anchorRenderer = ArAnchorRenderer(context.resources.displayMetrics.density)
  private val surfaceView = GLSurfaceView(context)
  private var active = false
  private var viewportWidth = 0
  private var viewportHeight = 0

  init {
    surfaceView.setEGLContextClientVersion(2)
    surfaceView.preserveEGLContextOnPause = true
    surfaceView.setRenderer(this)
    surfaceView.renderMode = GLSurfaceView.RENDERMODE_CONTINUOUSLY
    addView(
      surfaceView,
      ViewGroup.LayoutParams(
        LayoutParams.MATCH_PARENT,
        LayoutParams.MATCH_PARENT
      )
    )
  }

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    measureChild(surfaceView, widthMeasureSpec, heightMeasureSpec)
    setMeasuredDimension(
      ViewGroup.resolveSize(surfaceView.measuredWidth, widthMeasureSpec),
      ViewGroup.resolveSize(surfaceView.measuredHeight, heightMeasureSpec)
    )
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    val width = right - left
    val height = bottom - top
    surfaceView.layout(0, 0, width, height)
    if (width != viewportWidth || height != viewportHeight) {
      viewportWidth = width
      viewportHeight = height
      surfaceView.queueEvent {
        ArCoreController.onSurfaceChanged(width, height, getDisplayRotation())
      }
    }
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    if (active) {
      surfaceView.onResume()
    }
  }

  override fun onDetachedFromWindow() {
    surfaceView.onPause()
    super.onDetachedFromWindow()
  }

  override fun onSurfaceCreated(gl: GL10?, config: EGLConfig?) {
    GLES20.glClearColor(0f, 0f, 0f, 1f)
    val textureId = backgroundRenderer.createOnGlThread()
    anchorRenderer.createOnGlThread()
    ArCoreController.onSurfaceCreated(textureId)
  }

  override fun onSurfaceChanged(gl: GL10?, width: Int, height: Int) {
    GLES20.glViewport(0, 0, width, height)
    ArCoreController.onSurfaceChanged(width, height, getDisplayRotation())
  }

  override fun onDrawFrame(gl: GL10?) {
    GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT or GLES20.GL_DEPTH_BUFFER_BIT)
    val frame = ArCoreController.updateFrame() ?: return
    backgroundRenderer.draw(frame)
    anchorRenderer.draw(ArCoreController.getMeasurementAnchorNdcPositions(frame))
  }

  fun setActive(nextActive: Boolean) {
    if (active == nextActive) {
      return
    }

    active = nextActive
    if (active) {
      surfaceView.onResume()
    } else {
      surfaceView.onPause()
    }
  }

  fun destroy() {
    setActive(false)
    surfaceView.queueEvent {
      backgroundRenderer.release()
      anchorRenderer.release()
    }
    removeAllViews()
  }

  private fun getDisplayRotation(): Int {
    return display?.rotation ?: Surface.ROTATION_0
  }
}
