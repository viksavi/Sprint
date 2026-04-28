import * as THREE from "three";
//the code is not well done

// Vertex Shader: Handles the positions of the vertices
export const vertexShader = `
// Matrices provided by Three.js
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

precision highp float;

// Vertex position attribute
in vec3 position;

void main() {
  // Calculate final vertex position on screen
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// Fragment Shader: Handles the per-pixel image processing
export const fragmentShader = `
precision highp float;

// Input textures and parameters from our JavaScript
uniform sampler2D imageTexture; // The video frame
uniform int kernelSize;         // How much to blur (box blur)
uniform float colorScaleR;      // Red channel multiplier
uniform float colorScaleG;      // Green channel multiplier
uniform float colorScaleB;      // Blue channel multiplier
uniform bool invertColors;      // Whether to invert the final color
uniform int filterImage;            // 0: None, 1: Gaussian Blur, 2: Laplacian, 3: Separate Gaussian, 4: Median Filter
uniform float sigma;   
uniform int laplacianMode;
uniform bool horizontal;
uniform int medianKernelSize;

// Output color of the pixel
out vec4 out_FragColor;

vec3 conv_GaussianBlur(sampler2D tex, ivec2 coord, int kernelSize, float sigma) { 
  int radius = kernelSize / 2;
  vec3 colorSum = vec3(0.0);
  float weightSum = 0.0;
  vec4 textureColor = vec4(0.0);

  for (int x = -radius; x <= radius; x++) {
    for (int y = -radius; y <= radius; y++) {
      float weight = exp(-(float(x*x + y*y) / (2.0 * sigma * sigma)));
      ivec2 sampleCoord = coord + ivec2(x, y); 
      sampleCoord = clamp(
        sampleCoord,
        ivec2(0, 0),
        textureSize(tex, 0) - ivec2(1, 1)
      ); // clamp to ensure we don't sample outside the texture

      textureColor = texelFetch(tex, sampleCoord, 0); // get the color of the sampled pixel
      colorSum += textureColor.rgb * weight;
      weightSum += weight;
    }
  }
  return colorSum / weightSum;
}

vec3 laplacienFilter(sampler2D tex, ivec2 coord, int displayMode) {
  float kernel[9] = float[9](
    1.0,  1.0, 1.0,
    1.0, -8.0, 1.0,
    1.0,  1.0, 1.0
  );

  vec3 colorSum = vec3(0.0);
  vec4 textureColor = vec4(0.0);
  int idx = 0;

  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      ivec2 sampleCoord = coord + ivec2(x, y); 
      textureColor = texelFetch(tex, sampleCoord, 0);
      colorSum = colorSum + kernel[idx] * textureColor.rgb;
      idx++;
    }
  }
  if (displayMode == 1) { // gray-scale mode
    float norm = sqrt(colorSum.r * colorSum.r + colorSum.g * colorSum.g + colorSum.b * colorSum.b);
    norm = clamp(norm, 0.0, 1.0);
    return vec3(norm, norm, norm);
  } else { // color mode
    vec3 result = vec3(abs(colorSum.r), abs(colorSum.g), abs(colorSum.b));
    result = clamp(result, vec3(0.0), vec3(1.0)); // normalize to [0, 1] range
    return result;
  }
}

vec3 gaussianBlur_1D(sampler2D tex, ivec2 coord, int kernelSize, float sigma, bool horizontal) {
  int radius = kernelSize / 2;
  vec3 colorSum = vec3(0.0);
  float weightSum = 0.0;
  vec4 textureColor = vec4(0.0);
  vec2 offset = vec2(0.0);

  for (int i = -radius; i <= radius; i++) {
    float weight = exp(-(float(i*i) / (2.0 * sigma * sigma)));
    if(horizontal) {
      offset = vec2(float(i), 0.0);
    } else {
      offset = vec2(0.0, float(i));
    }
    ivec2 sampleCoord = coord + ivec2(offset); 
    sampleCoord = clamp(
        sampleCoord,
        ivec2(0, 0),
        textureSize(tex, 0) - ivec2(1, 1)
      ); 

      textureColor = texelFetch(tex, sampleCoord, 0); // get the color of the sampled pixel
      colorSum += textureColor.rgb * weight;
      weightSum += weight;
  }
  return colorSum / weightSum;
}

void compare(inout float a, inout float b) { //inout for pass by reference
  float t;
  if (a > b) {
    t = a;
    a = b;
    b = t;
  }
}

void sort_9(inout float array[9]) {
  compare(array[1], array[2]);
  compare(array[4], array[5]);
  compare(array[7], array[8]);

  compare(array[0], array[1]);
  compare(array[3], array[4]);
  compare(array[6], array[7]);

  compare(array[1], array[2]);
  compare(array[4], array[5]);
  compare(array[7], array[8]);

  compare(array[0], array[3]);
  compare(array[5], array[8]);
  compare(array[4], array[7]);

  compare(array[3], array[6]);
  compare(array[1], array[4]);
  compare(array[2], array[5]);

  compare(array[4], array[7]);
  compare(array[4], array[2]);
  compare(array[6], array[4]);
  compare(array[4], array[2]);
}

void sort_25(inout float array[25]) {
  for (int i = 0; i < 25; i++) {
    for (int j = i + 1; j < 25; j++) {
      compare(array[i], array[j]);
    }
  }
}

vec3 medianFilter_3(sampler2D tex, ivec2 coord) {
  vec4 textureColor = vec4(0.0);
  float values_r[9];
  float values_g[9];
  float values_b[9];
  int idx = 0;

  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      ivec2 texSize = textureSize(tex, 0);

      ivec2 sampleCoord = clamp(
        coord + ivec2(x, y),
        ivec2(0),
        texSize - ivec2(1)
      );
      textureColor = texelFetch(tex, sampleCoord, 0);
      values_r[idx] = textureColor.r;
      values_g[idx] = textureColor.g;
      values_b[idx] = textureColor.b;

      idx++;
    }
  }
  sort_9(values_r);
  sort_9(values_g);
  sort_9(values_b);

  return vec3(values_r[4], values_g[4], values_b[4]);
}

vec3 medianFilter_5(sampler2D tex, ivec2 coord) {
  vec4 textureColor = vec4(0.0);
  float values_r[25];
  float values_g[25];
  float values_b[25];
  int idx = 0;
    
  for (int x = -2; x <= 2; x++) {
    for (int y = -2; y <= 2; y++) {
      ivec2 texSize = textureSize(tex, 0);

      ivec2 sampleCoord = clamp(
        coord + ivec2(x, y),
        ivec2(0),
        texSize - ivec2(1)
      );
      textureColor = texelFetch(tex, sampleCoord, 0);
      values_r[idx] = textureColor.r;
      values_g[idx] = textureColor.g;
      values_b[idx] = textureColor.b;

      idx++;
    }
  }

  sort_25(values_r);
  sort_25(values_g);
  sort_25(values_b);

  return vec3(values_r[0], values_g[0], values_b[0]);
}

void main(void) {
  vec4 textureValue = vec4(0.0, 0.0, 0.0, 0.0);

  if (filterImage == 1) { // Gaussian Blur
    textureValue = vec4(conv_GaussianBlur(imageTexture, ivec2(int(gl_FragCoord.x), int(gl_FragCoord.y)), kernelSize, sigma), 1.0);
  }
  else if (filterImage == 2) { // Laplacian
    textureValue = vec4(laplacienFilter(imageTexture, ivec2(int(gl_FragCoord.x), int(gl_FragCoord.y)), laplacianMode), 1.0);
  } 
  else if (filterImage == 3) { // Separate Gaussian
    textureValue = vec4(gaussianBlur_1D(imageTexture, ivec2(int(gl_FragCoord.x), int(gl_FragCoord.y)), kernelSize, sigma, horizontal), 1.0);
  }
  else if (filterImage == 4) { // Median Filter
    if(medianKernelSize == 3) {
      textureValue = vec4(medianFilter_3(imageTexture, ivec2(int(gl_FragCoord.x), int(gl_FragCoord.y))), 1.0);
    } else if (medianKernelSize == 5) {
      textureValue = vec4(medianFilter_5(imageTexture, ivec2(int(gl_FragCoord.x), int(gl_FragCoord.y))), 1.0);
    }
  } else {
    textureValue = texelFetch(imageTexture, ivec2(int(gl_FragCoord.x), int(gl_FragCoord.y)), 0); // default color mode
  }

  // Apply color scaling
  vec3 colorScale = vec3(colorScaleR, colorScaleG, colorScaleB);
  out_FragColor = vec4(colorScale, 1.0) * textureValue;

  // Apply color inversion if requested
  if (invertColors) {
    out_FragColor = vec4(1.0, 1.0, 1.0, 0.0) - out_FragColor;
    out_FragColor.a = 1.0; // Ensure alpha remains opaque
  }
}
`;

// Helper Class for Render-To-Texture (RTT) Image Processing
export class TextureProcessor {
  constructor(width, height, processingMaterial) {
    this.width = width;
    this.height = height;

    // Create a separate scene and orthographic camera for 2D processing
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // Setup the render target (the canvas we draw to in memory)
    const renderTargetOptions = {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType, // High precision colors
    };
    this.renderTarget = new THREE.WebGLRenderTarget(width, height, renderTargetOptions);
    this.intermediateRenderTarget = new THREE.WebGLRenderTarget(
      width,
      height,
      renderTargetOptions
    ); // For 2-pass Gaussian blur
    this.originalImageTexture = processingMaterial.uniforms.imageTexture.value; // Store the original texture for later use

    // Create a full-screen quad (rectangle) to draw the processed image onto
    const geometry = new THREE.BufferGeometry();
    const vertices = new Float32Array([
      -1, -1, 0,   1, -1, 0,   1, 1, 0, 
      -1, -1, 0,   1,  1, 0,  -1, 1, 0
    ]);
    geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
    
    // Add the quad with our custom shader material to the processing scene
    this.quadMesh = new THREE.Mesh(geometry, processingMaterial);
    this.scene.add(this.quadMesh);
  }

  // Renders the processed image into the renderTarget with 2-pass Gaussian blur if enabled
  process(renderer) {
    const uniforms = this.quadMesh.material.uniforms;

    if (uniforms.filterImage == 3) {
      // pass 1: horizontal
      uniforms.horizontal.value = true;

      renderer.setRenderTarget(this.intermediateRenderTarget);
      renderer.render(this.scene, this.camera);

      // pass 2: vertical
      uniforms.imageTexture.value = this.intermediateRenderTarget.texture;
      uniforms.horizontal.value = false;

      renderer.setRenderTarget(this.renderTarget);
      renderer.render(this.scene, this.camera);

      // restore the original
      uniforms.imageTexture.value = this.originalImageTexture;
    } else {
      uniforms.imageTexture.value = this.originalImageTexture;
      renderer.setRenderTarget(this.renderTarget);
      renderer.render(this.scene, this.camera);
    }

    renderer.setRenderTarget(null);
  }
}