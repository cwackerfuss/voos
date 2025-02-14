import { useRef, useEffect, useMemo, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { shaderMaterial } from "@react-three/drei";
import { extend } from "@react-three/fiber";

// Create a custom shader material for the gradient
const GradientMaterial = shaderMaterial(
  {
    time: 0,
    radius: 10,
  },
  // Vertex shader
  `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  // Updated fragment shader
  `
    uniform float time;
    uniform float radius;
    varying vec2 vUv;
    
    void main() {
      vec2 center = vec2(0.5);
      float dist = length(vUv - center) * 2.0;
      vec3 color1 = vec3(1.0, 0.2, 0.8); // Hot pink
      vec3 color2 = vec3(0.2, 0.0, 0.8); // Deep purple
      vec3 color = mix(color1, color2, dist);
      
      // Create sharp circular mask
      float circle = 1.0 - smoothstep(0.8, 0.81, dist);
      
      // Fade out edges
      float alpha = circle * 0.5;
      gl_FragColor = vec4(color, alpha);
    }
  `
);

// Register the custom material
extend({ GradientMaterial });

// Add this near the top with other shader materials
const GradientFillMaterial = shaderMaterial(
  {
    color1: new THREE.Color(0.0, 0.0, 0.0),
    color2: new THREE.Color(0.0, 0.0, 0.0),
    opacity: 0.0,
    time: 0.0,
  },
  // Vertex shader
  `
    varying vec2 vUv;
    varying vec3 vPosition;
    void main() {
      vUv = uv;
      vPosition = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  // Updated fragment shader
  `
    uniform vec3 color1;
    uniform vec3 color2;
    uniform float opacity;
    uniform float time;
    varying vec2 vUv;
    varying vec3 vPosition;

    void main() {
      float dist = length(vPosition.xy) * 0.1;
      vec3 color = mix(color1, color2, dist);
      gl_FragColor = vec4(color, opacity);
      if (gl_FragColor.a < 0.01) discard;
    }
  `
);

// Register the material
extend({ GradientFillMaterial });

// Register the materials
extend({ GradientMaterial, GradientFillMaterial });

// Add type declarations for Three.js materials
declare module "@react-three/fiber" {
  interface ThreeElements {
    gradientMaterial: any;
    gradientFillMaterial: any;
    lineBasicMaterial: any;
  }
}

// Create a shared hook for audio analysis
function useAudioAnalyser(bufferLength: number) {
  const analyserRef = useRef<AnalyserNode>(null);
  const dataArrayRef = useRef<Uint8Array>(null);

  useEffect(() => {
    async function setupAudio() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        const audioCtx = new (window.AudioContext ||
          (window as any).webkitAudioContext)();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = bufferLength * 2;
        source.connect(analyser);
        analyserRef.current = analyser;
        dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
      } catch (err) {
        console.error("Error accessing audio input:", err);
      }
    }
    setupAudio();
  }, [bufferLength]);

  return { analyserRef, dataArrayRef };
}

interface WaveformProps {
  /**
   * Base radius of the waveform circle
   * @default 10
   * @range 1-100 (recommended)
   */
  baseRadius?: number;

  /**
   * Color of the waveform in hex or CSS color format
   * @default "#ff69b4" for filled, "#ff1493" for outline
   * @example "#ff0000", "rgb(255, 0, 0)", "red"
   */
  color?: string;

  /**
   * Opacity value
   * @default 0.4 for filled, 0.8 for outline
   * @range 0-1
   */
  opacity?: number;

  /**
   * How quickly the waveform responds to changes. Lower values = smoother animation
   * @default 0.1
   * @range 0.01-1.0 (recommended)
   */
  smoothingFactor?: number;

  /**
   * Multiplier for how much the audio input affects the waveform
   * @default 0.8
   * @range 0-2.0 (recommended)
   */
  audioScale?: number;

  /**
   * Array of wave patterns that create the animation
   * @default [
   *   { frequency: 3, amplitude: 0.3, speed: 0.8 },
   *   { frequency: 5, amplitude: 0.2, speed: 0.5 },
   *   { frequency: 2, amplitude: 0.4, speed: 1.2 }
   * ]
   */
  undulationPattern?: {
    /**
     * Number of waves around the circle
     * @range 1-20 (recommended)
     */
    frequency: number;
    /**
     * Height of the waves
     * @range 0-1 (recommended)
     */
    amplitude: number;
    /**
     * Speed of wave movement in radians/second
     * @range 0-5 (recommended)
     */
    speed: number;
  }[];

  /**
   * Controls how quickly the waveform responds to increasing audio levels
   * Multiplied with the base smoothingFactor
   * @default 2.0
   * @range 1.0-5.0 (recommended)
   */
  increaseResponseRate?: number;

  /**
   * Controls how quickly the waveform responds to decreasing audio levels
   * Multiplied with the base smoothingFactor
   * @default 0.5
   * @range 0.1-1.0 (recommended)
   */
  decreaseResponseRate?: number;

  /**
   * Secondary color for gradient fill (only used in FilledWaveform)
   * @default Darker version of primary color
   */
  color2?: string;

  /**
   * How much the overall size pulses with audio
   * @default 0.2
   * @range 0-1.0 (recommended)
   */
  pulseScale?: number;

  /**
   * How much the audio affects the animation speed
   * @default 0.5
   * @range 0-2.0 (recommended)
   */
  speedScale?: number;
}

function FilledWaveform({
  baseRadius = 10,
  color = "#4a9eff",
  color2 = "#0066cc",
  opacity = 0.4,
  smoothingFactor = 0.1,
  audioScale = 0.8,
  speedScale = 0.5,
  pulseScale = 0.2,
  undulationPattern = [
    { frequency: 3, amplitude: 0.3, speed: 0.8 },
    { frequency: 5, amplitude: 0.2, speed: 0.5 },
    { frequency: 2, amplitude: 0.4, speed: 1.2 },
  ],
}: WaveformProps = {}) {
  const [currentOpacity, setCurrentOpacity] = useState(0);
  const filledRef = useRef<any>(null);
  const bufferLength = 512;
  const { analyserRef, dataArrayRef } = useAudioAnalyser(bufferLength);
  const previousSpeedMultiplier = useRef(1);
  const currentRadii = useRef(new Float32Array(bufferLength).fill(baseRadius));
  const rotationDirections = useRef(
    undulationPattern.map(() => (Math.random() > 0.5 ? 1 : -1))
  );

  const positions = useMemo(() => {
    // Double the points to include center vertices
    const posArray = new Float32Array(bufferLength * 2 * 3);
    for (let i = 0; i < bufferLength; i++) {
      const angle = (i / bufferLength) * Math.PI * 2 - Math.PI / 2;
      // Edge vertex
      posArray[i * 6] = Math.cos(angle) * baseRadius;
      posArray[i * 6 + 1] = Math.sin(angle) * baseRadius;
      posArray[i * 6 + 2] = 0;
      // Center vertex
      posArray[i * 6 + 3] = 0;
      posArray[i * 6 + 4] = 0;
      posArray[i * 6 + 5] = 0;
    }
    return posArray;
  }, [bufferLength, baseRadius]);

  useFrame(({ clock }) => {
    if (!analyserRef.current || !filledRef.current || !dataArrayRef.current)
      return;
    const positions = filledRef.current.geometry.attributes.position.array;
    const dataArray = dataArrayRef.current;
    analyserRef.current.getByteTimeDomainData(dataArray);

    // Calculate average audio level
    let audioSum = 0;
    for (let i = 0; i < bufferLength; i++) {
      audioSum += Math.abs(dataArray[i] - 128);
    }
    const averageAudio = (audioSum / bufferLength) * audioScale;

    // Reduce the audio amplification
    const audioAmplification = 1 + (averageAudio / 128) * 2;

    // Update to use speedScale prop instead of hardcoded value
    const targetSpeedMultiplier = Math.min(
      2.0,
      1 + (averageAudio / 128) * speedScale
    );

    // Smooth the speed transition more gradually
    previousSpeedMultiplier.current +=
      (targetSpeedMultiplier - previousSpeedMultiplier.current) *
      Math.min(0.05, smoothingFactor);

    for (let i = 0; i < bufferLength; i++) {
      const angle = (i / bufferLength) * Math.PI * 2 - Math.PI / 2;
      const time = clock.elapsedTime;

      // Calculate base undulation with clamped speed
      const undulation = undulationPattern.reduce(
        (acc, { frequency, amplitude, speed }, index) => {
          const clampedSpeed = Math.min(
            speed * 2,
            speed * previousSpeedMultiplier.current
          );
          return (
            acc +
            Math.sin(
              angle * frequency +
                time * clampedSpeed * rotationDirections.current[index]
            ) *
              amplitude +
            Math.cos(
              angle * frequency +
                time * clampedSpeed * rotationDirections.current[index]
            ) *
              amplitude
          );
        },
        0
      );

      // Reduce randomness
      const randomness = (Math.random() - 0.5) * (averageAudio / 128);

      // Add slight interpolation between audio samples
      const prevIndex = (i - 1 + bufferLength) % bufferLength;
      const nextIndex = (i + 1) % bufferLength;
      const smoothedAudio =
        (dataArray[prevIndex] + dataArray[i] * 2 + dataArray[nextIndex]) / 4;

      // Use smoothed audio for effect
      const audioEffect =
        ((smoothedAudio - 128) / 128) * audioScale * audioAmplification;

      // Add pulse effect to base radius based on average audio
      const pulseEffect = baseRadius * (averageAudio / 128) * pulseScale;
      const pulsedRadius = baseRadius + pulseEffect;

      // Use pulsedRadius instead of baseRadius
      currentRadii.current[i] +=
        (pulsedRadius + audioEffect + randomness - currentRadii.current[i]) *
        smoothingFactor;

      // Use the current radius plus undulation for the final position
      const radius = currentRadii.current[i] + undulation;

      // Update edge vertex
      positions[i * 6] = Math.cos(angle) * radius;
      positions[i * 6 + 1] = Math.sin(angle) * radius;
      // Center vertex stays at 0,0
    }

    filledRef.current.geometry.attributes.position.needsUpdate = true;

    // Start fade in after first frame
    if (currentOpacity === 0) {
      setCurrentOpacity(opacity);
    }
  });

  useEffect(() => {
    // Add a small delay before starting the fade-in
    const timer = setTimeout(() => {
      setCurrentOpacity(opacity);
    }, 100);
    return () => clearTimeout(timer);
  }, []); // Run once on mount

  return (
    <mesh ref={filledRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
          count={bufferLength * 2}
          itemSize={3}
        />
        <bufferAttribute
          attach="index"
          args={[
            useMemo(() => {
              // Create triangles connecting center to edge points
              const indices = new Uint16Array(bufferLength * 3);
              for (let i = 0; i < bufferLength; i++) {
                const nextI = (i + 1) % bufferLength;
                indices[i * 3] = i * 2; // Current edge point
                indices[i * 3 + 1] = nextI * 2; // Next edge point
                indices[i * 3 + 2] = i * 2 + 1; // Current center point
              }
              return indices;
            }, [bufferLength]),
            1,
          ]}
          count={bufferLength * 3}
          itemSize={1}
        />
      </bufferGeometry>
      <gradientFillMaterial
        color1={new THREE.Color(color)}
        color2={new THREE.Color(color2)}
        opacity={currentOpacity}
        transparent
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function OutlineWaveform({
  baseRadius = 10,
  color = "#ff1493",
  opacity = 0.8,
  smoothingFactor = 0.1,
  audioScale = 0.8,
  pulseScale = 0.2,
  increaseResponseRate = 2.0,
  decreaseResponseRate = 0.5,
  undulationPattern = [
    { frequency: 2, amplitude: 0.3, speed: 1.5 },
    { frequency: 4, amplitude: 0.4, speed: 0.4 },
    { frequency: 3, amplitude: 0.2, speed: 0.6 },
  ],
}: WaveformProps = {}) {
  const [currentOpacity, setCurrentOpacity] = useState(0);
  const lineRef = useRef<any>(null);
  const bufferLength = 512;
  const { analyserRef, dataArrayRef } = useAudioAnalyser(bufferLength);
  const previousSpeedMultiplier = useRef(1);
  const currentRadii = useRef(new Float32Array(bufferLength).fill(baseRadius));
  const rotationDirections = useRef(
    undulationPattern.map(() => (Math.random() > 0.5 ? 1 : -1))
  );
  const previousAudioLevel = useRef(0);

  const positions = useMemo(() => {
    const posArray = new Float32Array(bufferLength * 3);
    for (let i = 0; i < bufferLength; i++) {
      const angle = (i / bufferLength) * Math.PI * 2 - Math.PI / 2;
      posArray[i * 3] = Math.cos(angle) * baseRadius;
      posArray[i * 3 + 1] = Math.sin(angle) * baseRadius;
      posArray[i * 3 + 2] = 0;
    }
    return posArray;
  }, [bufferLength, baseRadius]);

  useFrame(({ clock }) => {
    if (!analyserRef.current || !lineRef.current || !dataArrayRef.current)
      return;
    const positions = lineRef.current.geometry.attributes.position.array;
    const dataArray = dataArrayRef.current;
    analyserRef.current.getByteTimeDomainData(dataArray);

    let audioSum = 0;
    for (let i = 0; i < bufferLength; i++) {
      audioSum += Math.abs(dataArray[i] - 128);
    }
    const averageAudio = (audioSum / bufferLength) * audioScale;

    // Reduce the audio amplification slightly
    const audioAmplification = 1 + (averageAudio / 128) * 2;

    // Ensure previousAudioLevel is used in the audio level comparison
    const isIncreasing = averageAudio > previousAudioLevel.current;
    const dynamicSmoothingFactor = isIncreasing
      ? Math.min(0.08, smoothingFactor * increaseResponseRate)
      : Math.min(0.04, smoothingFactor * decreaseResponseRate);

    // Update the previous audio level
    previousAudioLevel.current = averageAudio;

    // Clamp and smooth the speed multiplier
    const targetSpeedMultiplier = Math.min(2.0, 1 + (averageAudio / 128) * 0.5);

    previousSpeedMultiplier.current +=
      (targetSpeedMultiplier - previousSpeedMultiplier.current) *
      dynamicSmoothingFactor;

    for (let i = 0; i < bufferLength; i++) {
      const angle = (i / bufferLength) * Math.PI * 2 - Math.PI / 2;
      const time = clock.elapsedTime;

      // Calculate base undulation with clamped speed
      const undulation = undulationPattern.reduce(
        (acc, { frequency, amplitude, speed }, index) => {
          const clampedSpeed = Math.min(
            speed * 2,
            speed * previousSpeedMultiplier.current
          );
          return (
            acc +
            Math.sin(
              angle * frequency +
                time * clampedSpeed * rotationDirections.current[index]
            ) *
              amplitude +
            Math.cos(
              angle * frequency +
                time * clampedSpeed * rotationDirections.current[index]
            ) *
              amplitude
          );
        },
        0
      );

      // Reduce randomness
      const randomness = (Math.random() - 0.5) * (averageAudio / 128) * 0.75;

      // Add slight interpolation between audio samples
      const prevIndex = (i - 1 + bufferLength) % bufferLength;
      const nextIndex = (i + 1) % bufferLength;
      const smoothedAudio =
        (dataArray[prevIndex] + dataArray[i] * 2 + dataArray[nextIndex]) / 4;

      // Use smoothed audio for effect
      const audioEffect =
        ((smoothedAudio - 128) / 128) * audioScale * audioAmplification;

      // Add pulse effect to base radius based on average audio
      const pulseEffect = baseRadius * (averageAudio / 128) * pulseScale;
      const pulsedRadius = baseRadius + pulseEffect;

      // Use pulsedRadius instead of baseRadius
      currentRadii.current[i] +=
        (pulsedRadius + audioEffect + randomness - currentRadii.current[i]) *
        dynamicSmoothingFactor;

      // Use the current radius plus undulation for the final position
      const radius = currentRadii.current[i] + undulation;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = Math.sin(angle) * radius;
    }

    lineRef.current.geometry.attributes.position.needsUpdate = true;

    // Start fade in after first frame
    if (currentOpacity === 0) {
      setCurrentOpacity(opacity);
    }
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      setCurrentOpacity(opacity);
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <lineLoop ref={lineRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
          count={bufferLength}
          itemSize={3}
        />
      </bufferGeometry>
      <lineBasicMaterial
        color={color}
        linewidth={2}
        transparent
        opacity={currentOpacity}
      />
    </lineLoop>
  );
}

function Controls({
  size,
  setSize,
  amplitudeFactor,
  setAmplitudeFactor,
  audioFactor,
  setAudioFactor,
  speedFactor,
  setSpeedFactor,
  pulseScale,
  setPulseScale,
}: {
  size: number;
  setSize: (value: number) => void;
  amplitudeFactor: number;
  setAmplitudeFactor: (value: number) => void;
  audioFactor: number;
  setAudioFactor: (value: number) => void;
  speedFactor: number;
  setSpeedFactor: (value: number) => void;
  pulseScale: number;
  setPulseScale: (value: number) => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        right: "20px",
        top: "20px",
        background: "rgba(0,0,0,0.7)",
        padding: "20px",
        borderRadius: "10px",
        color: "white",
        fontFamily: "sans-serif",
        width: "200px",
        zIndex: 1000,
      }}
    >
      <div style={{ marginBottom: "15px" }}>
        <label style={{ display: "block", marginBottom: "5px" }}>
          Size: {size.toFixed(1)}
        </label>
        <input
          type="range"
          min="4"
          max="8"
          step="0.1"
          value={size}
          onChange={(e) => setSize(Number(e.target.value))}
          style={{ width: "100%" }}
        />
      </div>
      <div style={{ marginBottom: "15px" }}>
        <label style={{ display: "block", marginBottom: "5px" }}>
          Amplitude: {amplitudeFactor.toFixed(2)}
        </label>
        <input
          type="range"
          min="0.1"
          max="5"
          step="0.01"
          value={amplitudeFactor}
          onChange={(e) => setAmplitudeFactor(Number(e.target.value))}
          style={{ width: "100%" }}
        />
      </div>
      <div style={{ marginBottom: "15px" }}>
        <label style={{ display: "block", marginBottom: "5px" }}>
          Audio Response: {audioFactor.toFixed(2)}
        </label>
        <input
          type="range"
          min="0.05"
          max="3"
          step="0.01"
          value={audioFactor}
          onChange={(e) => setAudioFactor(Number(e.target.value))}
          style={{ width: "100%" }}
        />
      </div>
      <div style={{ marginBottom: "15px" }}>
        <label style={{ display: "block", marginBottom: "5px" }}>
          Speed: {speedFactor.toFixed(3)}
        </label>
        <input
          type="range"
          min="0.01"
          max="3"
          step="0.01"
          value={speedFactor}
          onChange={(e) => setSpeedFactor(Number(e.target.value))}
          style={{ width: "100%" }}
        />
      </div>
      <div style={{ marginBottom: "15px" }}>
        <label style={{ display: "block", marginBottom: "5px" }}>
          Pulse: {pulseScale.toFixed(2)}
        </label>
        <input
          type="range"
          min="0"
          max="5"
          step="0.01"
          value={pulseScale}
          onChange={(e) => setPulseScale(Number(e.target.value))}
          style={{ width: "100%" }}
        />
      </div>
    </div>
  );
}

function AudioWaveform({
  size,
  amplitudeFactor,
  audioFactor,
  speedFactor,
  pulseScale,
}: {
  size: number;
  amplitudeFactor: number;
  audioFactor: number;
  speedFactor: number;
  pulseScale: number;
}) {
  return (
    <>
      {/* Innermost layer - more responsive to audio */}
      <FilledWaveform
        baseRadius={size * 0.9}
        color="#60a5fa"
        color2="#3b82f6"
        opacity={0.3}
        smoothingFactor={0.2}
        audioScale={audioFactor * 1.25}
        speedScale={speedFactor * 0.75}
        pulseScale={pulseScale}
        undulationPattern={[
          { frequency: 4, amplitude: amplitudeFactor * 0.3, speed: 0.5 },
          { frequency: 6, amplitude: amplitudeFactor * 0.2, speed: 0.3 },
          { frequency: 2, amplitude: amplitudeFactor * 0.3, speed: 0.4 },
        ]}
      />
      <OutlineWaveform
        baseRadius={size * 0.875}
        color="#fff"
        opacity={1}
        smoothingFactor={0.15}
        audioScale={audioFactor * 2}
        pulseScale={pulseScale}
        undulationPattern={[
          { frequency: 3, amplitude: amplitudeFactor * 0.3, speed: 1.6 },
          { frequency: 5, amplitude: amplitudeFactor * 0.3, speed: 0.5 },
          { frequency: 2, amplitude: amplitudeFactor * 0.2, speed: 0.8 },
        ]}
      />

      {/* Middle layer */}
      <FilledWaveform
        baseRadius={size * 0.95}
        color="#f472b6"
        color2="#ec4899"
        opacity={0.2}
        smoothingFactor={0.15}
        audioScale={audioFactor * 1.5}
        speedScale={speedFactor * 0.5}
        pulseScale={pulseScale}
        undulationPattern={[
          { frequency: 3, amplitude: amplitudeFactor * 0.3, speed: 0.4 },
          { frequency: 5, amplitude: amplitudeFactor * 0.2, speed: 0.3 },
          { frequency: 2, amplitude: amplitudeFactor * 0.4, speed: 0.5 },
        ]}
      />
      <OutlineWaveform
        baseRadius={size * 0.925}
        color="#fff"
        opacity={0.5}
        smoothingFactor={0.1}
        audioScale={audioFactor * 2.5}
        pulseScale={pulseScale}
        undulationPattern={[
          { frequency: 2, amplitude: amplitudeFactor * 0.3, speed: 1.5 },
          { frequency: 4, amplitude: amplitudeFactor * 0.4, speed: 0.4 },
          { frequency: 3, amplitude: amplitudeFactor * 0.2, speed: 0.6 },
        ]}
      />

      {/* Outer layer */}
      <FilledWaveform
        baseRadius={size * 1.0}
        color="#c084fc"
        color2="#a855f7"
        opacity={0.2}
        smoothingFactor={0.1}
        audioScale={audioFactor * 1.25}
        speedScale={speedFactor * 0.375}
        pulseScale={pulseScale}
        undulationPattern={[
          { frequency: 2, amplitude: amplitudeFactor * 0.2, speed: 0.3 },
          { frequency: 4, amplitude: amplitudeFactor * 0.15, speed: 0.2 },
          { frequency: 3, amplitude: amplitudeFactor * 0.25, speed: 0.4 },
        ]}
      />
      <OutlineWaveform
        baseRadius={size * 0.975}
        color="#fff"
        opacity={0.25}
        smoothingFactor={0.08}
        audioScale={audioFactor * 1.75}
        pulseScale={pulseScale}
        undulationPattern={[
          { frequency: 2, amplitude: amplitudeFactor * 0.25, speed: 1.2 },
          { frequency: 3, amplitude: amplitudeFactor * 0.3, speed: 0.3 },
          { frequency: 4, amplitude: amplitudeFactor * 0.15, speed: 0.5 },
        ]}
      />
    </>
  );
}

function Scene() {
  const [size, setSize] = useState(4.4);
  const [amplitudeFactor, setAmplitudeFactor] = useState(0.89);
  const [audioFactor, setAudioFactor] = useState(0.78);
  const [speedFactor, setSpeedFactor] = useState(0.04);
  const [pulseScale, setPulseScale] = useState(1.25);
  const [opacity, setOpacity] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setOpacity(1.5);
    }, 1000); // Wait 1 second before starting fade
    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      <Controls
        size={size}
        setSize={setSize}
        amplitudeFactor={amplitudeFactor}
        setAmplitudeFactor={setAmplitudeFactor}
        audioFactor={audioFactor}
        setAudioFactor={setAudioFactor}
        speedFactor={speedFactor}
        setSpeedFactor={setSpeedFactor}
        pulseScale={pulseScale}
        setPulseScale={setPulseScale}
      />
      <Canvas
        style={{
          width: "100vw",
          height: "100vh",
          transition: "opacity 2s ease-in-out",
          background: "#121212",
          opacity,
          position: "fixed",
          top: 0,
          left: 0,
        }}
        camera={{ position: [0, 0, 40], fov: 50 }}
      >
        <ambientLight />
        <AudioWaveform
          size={size}
          amplitudeFactor={amplitudeFactor}
          audioFactor={audioFactor}
          speedFactor={speedFactor}
          pulseScale={pulseScale}
        />
      </Canvas>
    </>
  );
}

export default Scene;
