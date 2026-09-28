package expo.modules.volumemeasurement

import android.opengl.GLES11Ext
import android.opengl.GLES20
import com.google.ar.core.Coordinates2d
import com.google.ar.core.Frame
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer

internal class ArCameraBackgroundRenderer {
  private val quadCoords = floatArrayOf(
    -1.0f, -1.0f,
    1.0f, -1.0f,
    -1.0f, 1.0f,
    1.0f, 1.0f
  )
  private val quadTexCoords = floatArrayOf(
    0.0f, 1.0f,
    1.0f, 1.0f,
    0.0f, 0.0f,
    1.0f, 0.0f
  )
  private val quadCoordsBuffer = createFloatBuffer(quadCoords)
  private val quadTexCoordsBuffer = createFloatBuffer(quadTexCoords)
  private val transformedTexCoordsBuffer = createFloatBuffer(quadTexCoords)

  private var textureId = 0
  private var program = 0
  private var positionAttribute = 0
  private var texCoordAttribute = 0
  private var textureUniform = 0

  fun createOnGlThread(): Int {
    textureId = createExternalTexture()
    program = createProgram(VERTEX_SHADER, FRAGMENT_SHADER)
    positionAttribute = GLES20.glGetAttribLocation(program, "a_Position")
    texCoordAttribute = GLES20.glGetAttribLocation(program, "a_TexCoord")
    textureUniform = GLES20.glGetUniformLocation(program, "sTexture")
    return textureId
  }

  fun draw(frame: Frame) {
    if (textureId == 0 || program == 0) {
      return
    }

    if (frame.hasDisplayGeometryChanged()) {
      frame.transformCoordinates2d(
        Coordinates2d.OPENGL_NORMALIZED_DEVICE_COORDINATES,
        quadCoordsBuffer,
        Coordinates2d.TEXTURE_NORMALIZED,
        transformedTexCoordsBuffer
      )
    }

    GLES20.glDisable(GLES20.GL_DEPTH_TEST)
    GLES20.glDepthMask(false)
    GLES20.glUseProgram(program)

    GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
    GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, textureId)
    GLES20.glUniform1i(textureUniform, 0)

    quadCoordsBuffer.position(0)
    GLES20.glVertexAttribPointer(positionAttribute, 2, GLES20.GL_FLOAT, false, 0, quadCoordsBuffer)
    GLES20.glEnableVertexAttribArray(positionAttribute)

    transformedTexCoordsBuffer.position(0)
    GLES20.glVertexAttribPointer(texCoordAttribute, 2, GLES20.GL_FLOAT, false, 0, transformedTexCoordsBuffer)
    GLES20.glEnableVertexAttribArray(texCoordAttribute)

    GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)

    GLES20.glDisableVertexAttribArray(positionAttribute)
    GLES20.glDisableVertexAttribArray(texCoordAttribute)
    GLES20.glDepthMask(true)
    GLES20.glEnable(GLES20.GL_DEPTH_TEST)
  }

  fun release() {
    if (textureId != 0) {
      GLES20.glDeleteTextures(1, intArrayOf(textureId), 0)
      textureId = 0
    }
    if (program != 0) {
      GLES20.glDeleteProgram(program)
      program = 0
    }
  }

  private fun createExternalTexture(): Int {
    val textures = IntArray(1)
    GLES20.glGenTextures(1, textures, 0)
    GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, textures[0])
    GLES20.glTexParameteri(
      GLES11Ext.GL_TEXTURE_EXTERNAL_OES,
      GLES20.GL_TEXTURE_WRAP_S,
      GLES20.GL_CLAMP_TO_EDGE
    )
    GLES20.glTexParameteri(
      GLES11Ext.GL_TEXTURE_EXTERNAL_OES,
      GLES20.GL_TEXTURE_WRAP_T,
      GLES20.GL_CLAMP_TO_EDGE
    )
    GLES20.glTexParameteri(
      GLES11Ext.GL_TEXTURE_EXTERNAL_OES,
      GLES20.GL_TEXTURE_MIN_FILTER,
      GLES20.GL_LINEAR
    )
    GLES20.glTexParameteri(
      GLES11Ext.GL_TEXTURE_EXTERNAL_OES,
      GLES20.GL_TEXTURE_MAG_FILTER,
      GLES20.GL_LINEAR
    )
    return textures[0]
  }

  private fun createProgram(vertexShaderSource: String, fragmentShaderSource: String): Int {
    val vertexShader = loadShader(GLES20.GL_VERTEX_SHADER, vertexShaderSource)
    val fragmentShader = loadShader(GLES20.GL_FRAGMENT_SHADER, fragmentShaderSource)
    val shaderProgram = GLES20.glCreateProgram()
    GLES20.glAttachShader(shaderProgram, vertexShader)
    GLES20.glAttachShader(shaderProgram, fragmentShader)
    GLES20.glLinkProgram(shaderProgram)
    GLES20.glDeleteShader(vertexShader)
    GLES20.glDeleteShader(fragmentShader)
    return shaderProgram
  }

  private fun loadShader(type: Int, source: String): Int {
    val shader = GLES20.glCreateShader(type)
    GLES20.glShaderSource(shader, source)
    GLES20.glCompileShader(shader)
    return shader
  }

  private fun createFloatBuffer(values: FloatArray): FloatBuffer {
    return ByteBuffer.allocateDirect(values.size * FLOAT_SIZE_BYTES)
      .order(ByteOrder.nativeOrder())
      .asFloatBuffer()
      .apply {
        put(values)
        position(0)
      }
  }

  companion object {
    private const val FLOAT_SIZE_BYTES = 4
    private const val VERTEX_SHADER = """
      attribute vec4 a_Position;
      attribute vec2 a_TexCoord;
      varying vec2 v_TexCoord;

      void main() {
        gl_Position = a_Position;
        v_TexCoord = a_TexCoord;
      }
    """
    private const val FRAGMENT_SHADER = """
      #extension GL_OES_EGL_image_external : require
      precision mediump float;
      varying vec2 v_TexCoord;
      uniform samplerExternalOES sTexture;

      void main() {
        gl_FragColor = texture2D(sTexture, v_TexCoord);
      }
    """
  }
}
