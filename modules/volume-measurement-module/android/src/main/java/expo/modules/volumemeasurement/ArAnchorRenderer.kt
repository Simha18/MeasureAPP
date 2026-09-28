package expo.modules.volumemeasurement

import android.opengl.GLES20
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer

internal class ArAnchorRenderer(private val density: Float) {
  private var program = 0
  private var positionAttribute = 0
  private var colorUniform = 0
  private var pointSizeUniform = 0
  private var positionBuffer: FloatBuffer? = null

  fun createOnGlThread() {
    program = createProgram(VERTEX_SHADER, FRAGMENT_SHADER)
    positionAttribute = GLES20.glGetAttribLocation(program, "a_Position")
    colorUniform = GLES20.glGetUniformLocation(program, "u_Color")
    pointSizeUniform = GLES20.glGetUniformLocation(program, "u_PointSize")
  }

  fun draw(ndcPositions: FloatArray) {
    if (program == 0 || ndcPositions.isEmpty()) {
      return
    }

    val buffer = ensurePositionBuffer(ndcPositions.size)
    buffer.clear()
    buffer.put(ndcPositions)
    buffer.position(0)

    GLES20.glDisable(GLES20.GL_DEPTH_TEST)
    GLES20.glDepthMask(false)
    GLES20.glUseProgram(program)
    GLES20.glVertexAttribPointer(positionAttribute, 2, GLES20.GL_FLOAT, false, 0, buffer)
    GLES20.glEnableVertexAttribArray(positionAttribute)

    val pointCount = ndcPositions.size / 2
    drawPoints(pointCount, 24f * density, 1f, 1f, 1f, 1f)
    drawPoints(pointCount, 18f * density, 0.45f, 0.87f, 0.82f, 1f)

    GLES20.glDisableVertexAttribArray(positionAttribute)
    GLES20.glDepthMask(true)
    GLES20.glEnable(GLES20.GL_DEPTH_TEST)
  }

  fun release() {
    if (program != 0) {
      GLES20.glDeleteProgram(program)
      program = 0
    }
    positionBuffer = null
  }

  private fun drawPoints(
    pointCount: Int,
    pointSize: Float,
    red: Float,
    green: Float,
    blue: Float,
    alpha: Float
  ) {
    GLES20.glUniform1f(pointSizeUniform, pointSize)
    GLES20.glUniform4f(colorUniform, red, green, blue, alpha)
    GLES20.glDrawArrays(GLES20.GL_POINTS, 0, pointCount)
  }

  private fun ensurePositionBuffer(floatCount: Int): FloatBuffer {
    val existing = positionBuffer
    if (existing != null && existing.capacity() >= floatCount) {
      return existing
    }

    return ByteBuffer.allocateDirect(floatCount * FLOAT_SIZE_BYTES)
      .order(ByteOrder.nativeOrder())
      .asFloatBuffer()
      .also { positionBuffer = it }
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

  companion object {
    private const val FLOAT_SIZE_BYTES = 4
    private const val VERTEX_SHADER = """
      attribute vec2 a_Position;
      uniform float u_PointSize;

      void main() {
        gl_Position = vec4(a_Position, 0.0, 1.0);
        gl_PointSize = u_PointSize;
      }
    """
    private const val FRAGMENT_SHADER = """
      precision mediump float;
      uniform vec4 u_Color;

      void main() {
        vec2 offset = gl_PointCoord - vec2(0.5);
        if (dot(offset, offset) > 0.25) {
          discard;
        }
        gl_FragColor = u_Color;
      }
    """
  }
}
