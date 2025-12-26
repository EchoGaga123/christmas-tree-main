import { useState, useMemo, useRef, useEffect, Suspense } from 'react';
import { Canvas, useFrame, extend, useThree } from '@react-three/fiber';
import {
  OrbitControls,
  Environment,
  PerspectiveCamera,
  shaderMaterial,
  Float,
  Stars,
  Sparkles,
  useTexture,
  Html
} from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { MathUtils } from 'three';
import * as random from 'maath/random';
import { GestureRecognizer, FilesetResolver, DrawingUtils } from "@mediapipe/tasks-vision";

// --- 动态生成照片列表 (top.jpg + 1.jpg 到 31.jpg) ---
const TOTAL_NUMBERED_PHOTOS = 9;
// 修改：将 top.jpg 加入到数组开头
const bodyPhotoPaths = [
  //'/photos/top.jpg',
  ...Array.from({ length: TOTAL_NUMBERED_PHOTOS }, (_, i) => `/photos/${i + 1}.jpg`)
];

// --- 视觉配置 ---
const CONFIG = {
  colors: {
    emerald: '#004225', // 纯正祖母绿
    gold: '#FFD700',
    silver: '#ECEFF1',
    red: '#D32F2F',
    green: '#2E7D32',
    white: '#FFFFFF',   // 纯白色
    warmLight: '#FFD54F',
    lights: ['#FF0000', '#00FF00', '#0000FF', '#FFFF00'], // 彩灯
    // 拍立得边框颜色池 (复古柔和色系)
    borders: ['#FFFAF0', '#F0E68C', '#E6E6FA', '#FFB6C1', '#98FB98', '#87CEFA', '#FFDAB9'],
    // 圣诞元素颜色
    giftColors: ['#D32F2F', '#FFD700', '#1976D2', '#2E7D32'],
    candyColors: ['#FF0000', '#FFFFFF']
  },
  counts: {
    foliage: 15000,
    ornaments: 9,   // 拍立得照片数量
    elements: 200,    // 圣诞元素数量
    lights: 400       // 彩灯数量
  },
  tree: { height: 22, radius: 9 }, // 树体尺寸
  photos: {
    // top 属性不再需要，因为已经移入 body
    body: bodyPhotoPaths
  }
};

// --- Random Blessings Library ---
const BLESSINGS = [
  "✨ May your days be merry and bright!",
  "🎄 Magic is in the air. Happy Christmas!",
  "🎁 Wishing you peace, love, and joy.",
  "🎅 Santa is watching you... Smile!",
  "🌟 You are the brightest star on this tree!",
  "❄️ Stay unique, just like a snowflake.",
  "🍬 Life is sweet, enjoy every moment.",
  "🕯️ May your 2025 be full of surprises!",
  "❤️ Sending you warm hugs and happiness."
];

// --- Shader Material (Foliage) ---
const FoliageMaterial = shaderMaterial(
  { uTime: 0, uColor: new THREE.Color(CONFIG.colors.emerald), uProgress: 0 },
  `uniform float uTime; uniform float uProgress; attribute vec3 aTargetPos; attribute float aRandom;
  varying vec2 vUv; varying float vMix;
  float cubicInOut(float t) { return t < 0.5 ? 4.0 * t * t * t : 0.5 * pow(2.0 * t - 2.0, 3.0) + 1.0; }
  void main() {
    vUv = uv;
    vec3 noise = vec3(sin(uTime * 1.5 + position.x), cos(uTime + position.y), sin(uTime * 1.5 + position.z)) * 0.15;
    float t = cubicInOut(uProgress);
    vec3 finalPos = mix(position, aTargetPos + noise, t);
    vec4 mvPosition = modelViewMatrix * vec4(finalPos, 1.0);
    gl_PointSize = (60.0 * (1.0 + aRandom)) / -mvPosition.z;
    gl_Position = projectionMatrix * mvPosition;
    vMix = t;
  }`,
  `uniform vec3 uColor; varying float vMix;
  void main() {
    float r = distance(gl_PointCoord, vec2(0.5)); if (r > 0.5) discard;
    vec3 finalColor = mix(uColor * 0.3, uColor * 1.2, vMix);
    gl_FragColor = vec4(finalColor, 1.0);
  }`
);
extend({ FoliageMaterial });

// --- Helper: Tree Shape ---
const getTreePosition = () => {
  const h = CONFIG.tree.height; const rBase = CONFIG.tree.radius;
  const y = (Math.random() * h) - (h / 2); const normalizedY = (y + (h/2)) / h;
  const currentRadius = rBase * (1 - normalizedY); const theta = Math.random() * Math.PI * 2;
  const r = Math.random() * currentRadius;
  return [r * Math.cos(theta), y, r * Math.sin(theta)];
};

// --- Component: Foliage ---
const Foliage = ({ state }: { state: 'CHAOS' | 'FORMED' }) => {
  const materialRef = useRef<any>(null);
  const { positions, targetPositions, randoms } = useMemo(() => {
    const count = CONFIG.counts.foliage;
    const positions = new Float32Array(count * 3); const targetPositions = new Float32Array(count * 3); const randoms = new Float32Array(count);
    const spherePoints = random.inSphere(new Float32Array(count * 3), { radius: 25 }) as Float32Array;
    for (let i = 0; i < count; i++) {
      positions[i*3] = spherePoints[i*3]; positions[i*3+1] = spherePoints[i*3+1]; positions[i*3+2] = spherePoints[i*3+2];
      const [tx, ty, tz] = getTreePosition();
      targetPositions[i*3] = tx; targetPositions[i*3+1] = ty; targetPositions[i*3+2] = tz;
      randoms[i] = Math.random();
    }
    return { positions, targetPositions, randoms };
  }, []);
  useFrame((rootState, delta) => {
    if (materialRef.current) {
      materialRef.current.uTime = rootState.clock.elapsedTime;
      const targetProgress = state === 'FORMED' ? 1 : 0;
      materialRef.current.uProgress = MathUtils.damp(materialRef.current.uProgress, targetProgress, 1.5, delta);
    }
  });
  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-aTargetPos" args={[targetPositions, 3]} />
        <bufferAttribute attach="attributes-aRandom" args={[randoms, 1]} />
      </bufferGeometry>
      {/* @ts-ignore */}
      <foliageMaterial ref={materialRef} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
};

// --- Component: Photo Ornaments (Interactive) ---
const PhotoOrnaments = ({ state, pointerPos }: { state: 'CHAOS' | 'FORMED', pointerPos: THREE.Vector3 }) => {
  const { camera } = useThree();
  const textures = useTexture(CONFIG.photos.body);
  useEffect(() => {
    textures.forEach((t) => {
      if (!t) return;
      t.colorSpace = THREE.SRGBColorSpace;   // ✅ 这是最关键的一行
      t.anisotropy = 16;                      // ✅ 提升斜角清晰度
      t.minFilter = THREE.LinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.generateMipmaps = true;
      t.needsUpdate = true;
    });
  }, [textures]);
  const count = CONFIG.counts.ornaments;
  const groupRef = useRef<THREE.Group>(null);
  
  // 记录当前被点亮的照片索引
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  // 记录当前显示的祝福语
  const [activeBlessing, setActiveBlessing] = useState("");

  // 冷却时间锁
  const lastTriggerTime = useRef(0);

  const borderGeometry = useMemo(() => new THREE.PlaneGeometry(2.4, 3.0), []);
  const photoGeometry = useMemo(() => new THREE.PlaneGeometry(2.0, 2.0), []);

  const data = useMemo(() => {
    return new Array(count).fill(0).map((_, i) => {
      const chaosPos = new THREE.Vector3((Math.random()-0.5)*40, (Math.random()-0.5)*40, (Math.random()-0.5)*40);
      const h = CONFIG.tree.height; const y = (Math.random() * h) - (h / 2);
      const rBase = CONFIG.tree.radius;
      const currentRadius = (rBase * (1 - (y + (h/2)) / h)) + 0.5;
      const theta = Math.random() * Math.PI * 2;
      const targetPos = new THREE.Vector3(currentRadius * Math.cos(theta), y, currentRadius * Math.sin(theta));
      const borderColor = CONFIG.colors.borders[Math.floor(Math.random() * CONFIG.colors.borders.length)];
      const rotationSpeed = { x: (Math.random()-0.5), y: (Math.random()-0.5), z: (Math.random()-0.5) };
      const chaosRotation = new THREE.Euler(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);
      return { chaosPos, targetPos, borderColor, textureIndex: i % textures.length, currentPos: chaosPos.clone(), chaosRotation, rotationSpeed };
    });
  }, [textures, count]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const isFormed = state === 'FORMED';
    //let foundClosePhoto = false; // 放在循环外面或者在循环内重置逻辑要小心，这里我们在局部判断

    groupRef.current.children.forEach((group, i) => {
      const objData = data[i];
      const target = isFormed ? objData.targetPos : objData.chaosPos;
      
      // 1. 移动照片
      objData.currentPos.lerp(target, delta * (isFormed ? 0.8 : 0.5));
      group.position.copy(objData.currentPos);

      // 2. 旋转逻辑
      if (isFormed) {
        group.lookAt(new THREE.Vector3(0, group.position.y, 0));
      } else {
        group.rotation.x += delta * objData.rotationSpeed.x;
        group.rotation.y += delta * objData.rotationSpeed.y;
      }
        
      // --- 碰撞检测 ---
      const dist2D = Math.sqrt(
        Math.pow(pointerPos.x - group.position.x, 2) + 
        Math.pow(pointerPos.y - group.position.y, 2)
      );
      
      if (dist2D < 3.0) { 
        //foundClosePhoto = true;
        
        // 防抖逻辑
        const now = Date.now();
        if (hoveredIndex !== i && (now - lastTriggerTime.current > 2000)) {
          setHoveredIndex(i);
          setActiveBlessing(BLESSINGS[Math.floor(Math.random() * BLESSINGS.length)]); 
          lastTriggerTime.current = now; 
        }

        // 选中状态逻辑
        if (hoveredIndex === i) {
          group.scale.lerp(new THREE.Vector3(3.5, 3.5, 3.5), delta * 5);
          const targetPosition = objData.currentPos.clone().add(new THREE.Vector3(0, 0, 2));
          group.position.lerp(targetPosition, delta * 5);
          group.lookAt(camera.position); // 看向摄像机
        } else {
          if (isFormed) group.lookAt(new THREE.Vector3(0, group.position.y, 0));
          group.scale.lerp(new THREE.Vector3(1, 1, 1), delta * 5);
        }
      } else {
         // 没被选中且不在范围内
         if (hoveredIndex !== i) {
             group.scale.lerp(new THREE.Vector3(1, 1, 1), delta * 5);
         }
      }
    }); // 结束 forEach
  });

  return (
    <group ref={groupRef}>
      {data.map((obj, i) => (
        <group key={i} rotation={state === 'CHAOS' ? obj.chaosRotation : [0,0,0]}>
          <group position={[0, 0, 0.015]}>
            {/* 📸 照片本体 */}
            <mesh geometry={photoGeometry} renderOrder={10}>
              <meshBasicMaterial
                  map={textures[obj.textureIndex]}
                  toneMapped={false} // 关键：关闭色调映射，保持图片原始色彩
                />
            </mesh>
            <mesh geometry={borderGeometry} position={[0, -0.15, -0.01]}>
              <meshStandardMaterial
                color={hoveredIndex === i ? '#FFD700' : obj.borderColor}
                emissive={hoveredIndex === i ? '#FFD700' : '#000000'}
                emissiveIntensity={hoveredIndex === i ? 1.5 : 0}
                roughness={0.3} metalness={hoveredIndex === i ? 0.8 : 0.1}
              />
            </mesh>
            {/* 选中时的魔法特效 */}
            {hoveredIndex === i && (
              <Sparkles count={40} scale={3.5} size={4} speed={1.5} noise={0.2} color="#FFD700" />
            )}
          </group>
          {/* 祝福语 */}
          {hoveredIndex === i && (
            <Html position={[0, 1.5, 0]} center distanceFactor={12} zIndexRange={[100, 0]}>
              <div style={{
                background: 'rgba(255, 255, 255, 0.95)',
                padding: '16px 24px', borderRadius: '16px', border: `3px solid ${CONFIG.colors.gold}`,
                color: '#333', fontFamily: 'sans-serif', minWidth: '200px',
                boxShadow: '0 4px 20px rgba(255, 215, 0, 0.6)', textAlign: 'center', pointerEvents: 'none', transform: 'scale(1.2)'
              }}>
                <div style={{ color: '#D32F2F', fontSize: '14px', fontWeight:'900', marginBottom: '6px', letterSpacing: '1px' }}>✨ MERRY CHRISTMAS ✨</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold', lineHeight: '1.4' }}>{activeBlessing}</div>
              </div>
            </Html>
          )}
        </group>
      ))}
    </group>
  );
};

// --- Component: Christmas Elements ---
const ChristmasElements = ({ state }: { state: 'CHAOS' | 'FORMED' }) => {
  const count = CONFIG.counts.elements;
  const groupRef = useRef<THREE.Group>(null);

  const boxGeometry = useMemo(() => new THREE.BoxGeometry(0.8, 0.8, 0.8), []);
  const sphereGeometry = useMemo(() => new THREE.SphereGeometry(0.5, 16, 16), []);
  const caneGeometry = useMemo(() => new THREE.CylinderGeometry(0.15, 0.15, 1.2, 8), []);

  const data = useMemo(() => {
    return new Array(count).fill(0).map(() => {
      const chaosPos = new THREE.Vector3((Math.random()-0.5)*60, (Math.random()-0.5)*60, (Math.random()-0.5)*60);
      const h = CONFIG.tree.height;
      const y = (Math.random() * h) - (h / 2);  
      const rBase = CONFIG.tree.radius;
      const currentRadius = (rBase * (1 - (y + (h/2)) / h)) * 0.95;
      const theta = Math.random() * Math.PI * 2;

      const targetPos = new THREE.Vector3(currentRadius * Math.cos(theta), y, currentRadius * Math.sin(theta));

      const type = Math.floor(Math.random() * 3);
      let color; let scale = 1;
      if (type === 0) { color = CONFIG.colors.giftColors[Math.floor(Math.random() * CONFIG.colors.giftColors.length)]; scale = 0.8 + Math.random() * 0.4; }
      else if (type === 1) { color = CONFIG.colors.giftColors[Math.floor(Math.random() * CONFIG.colors.giftColors.length)]; scale = 0.6 + Math.random() * 0.4; }
      else { color = Math.random() > 0.5 ? CONFIG.colors.red : CONFIG.colors.white; scale = 0.7 + Math.random() * 0.3; }

      const rotationSpeed = { x: (Math.random()-0.5)*2.0, y: (Math.random()-0.5)*2.0, z: (Math.random()-0.5)*2.0 };
      return { type, chaosPos, targetPos, color, scale, currentPos: chaosPos.clone(), chaosRotation: new THREE.Euler(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI), rotationSpeed };
    });
  }, [boxGeometry, sphereGeometry, caneGeometry]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const isFormed = state === 'FORMED';
    groupRef.current.children.forEach((child, i) => {
      const mesh = child as THREE.Mesh;
      const objData = data[i];
      const target = isFormed ? objData.targetPos : objData.chaosPos;
      objData.currentPos.lerp(target, delta * 1.5);
      mesh.position.copy(objData.currentPos);
      mesh.rotation.x += delta * objData.rotationSpeed.x; mesh.rotation.y += delta * objData.rotationSpeed.y; mesh.rotation.z += delta * objData.rotationSpeed.z;
    });
  });

  return (
    <group ref={groupRef}>
      {data.map((obj, i) => {
        let geometry; if (obj.type === 0) geometry = boxGeometry; else if (obj.type === 1) geometry = sphereGeometry; else geometry = caneGeometry;
        return ( <mesh key={i} scale={[obj.scale, obj.scale, obj.scale]} geometry={geometry} rotation={obj.chaosRotation}>
          <meshStandardMaterial color={obj.color} roughness={0.3} metalness={0.4} emissive={obj.color} emissiveIntensity={0.2} />
        </mesh> )})}
    </group>
  );
};

// --- Component: Fairy Lights ---
const FairyLights = ({ state }: { state: 'CHAOS' | 'FORMED' }) => {
  const count = CONFIG.counts.lights;
  const groupRef = useRef<THREE.Group>(null);
  const geometry = useMemo(() => new THREE.SphereGeometry(0.8, 8, 8), []);

  const data = useMemo(() => {
    return new Array(count).fill(0).map(() => {
      const chaosPos = new THREE.Vector3((Math.random()-0.5)*60, (Math.random()-0.5)*60, (Math.random()-0.5)*60);
      const h = CONFIG.tree.height; const y = (Math.random() * h) - (h / 2); const rBase = CONFIG.tree.radius;
      const currentRadius = (rBase * (1 - (y + (h/2)) / h)) + 0.3; const theta = Math.random() * Math.PI * 2;
      const targetPos = new THREE.Vector3(currentRadius * Math.cos(theta), y, currentRadius * Math.sin(theta));
      const color = CONFIG.colors.lights[Math.floor(Math.random() * CONFIG.colors.lights.length)];
      const speed = 2 + Math.random() * 3;
      return { chaosPos, targetPos, color, speed, currentPos: chaosPos.clone(), timeOffset: Math.random() * 100 };
    });
  }, []);

  useFrame((stateObj, delta) => {
    if (!groupRef.current) return;
    const isFormed = state === 'FORMED';
    const time = stateObj.clock.elapsedTime;
    groupRef.current.children.forEach((child, i) => {
      const objData = data[i];
      const target = isFormed ? objData.targetPos : objData.chaosPos;
      objData.currentPos.lerp(target, delta * 2.0);
      const mesh = child as THREE.Mesh;
      mesh.position.copy(objData.currentPos);
      const intensity = (Math.sin(time * objData.speed + objData.timeOffset) + 1) / 2;
      if (mesh.material) { (mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = isFormed ? 3 + intensity * 4 : 0; }
    });
  });

  return (
    <group ref={groupRef}>
      {data.map((obj, i) => ( <mesh key={i} scale={[0.15, 0.15, 0.15]} geometry={geometry}>
          <meshStandardMaterial color={obj.color} emissive={obj.color} emissiveIntensity={0} toneMapped={false} />
        </mesh> ))}
    </group>
  );
};

// --- Component: Magic Wand (Fixed & Glowing) ---
const MagicWand = ({ pointerPos }: { pointerPos: THREE.Vector3 }) => {
  const wandRef = useRef<THREE.Group>(null);
  
  useFrame((state) => {
    if (wandRef.current) {
      // 1. 跟随手指
      wandRef.current.position.lerp(pointerPos, 0.8);
      // 2. 悬浮微动：增加一点“呼吸感”，让它不是死板地定在那里
      wandRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 1.5) * 0.05; 
    }
  });

  return (
    <group ref={wandRef}>
      {/* 核心修改：创建一个内部组 (Inner Group) 负责统一旋转 45度。
         这样棒身和棒头是在同一个坐标系里的，绝对不会分家！
      */}
      <group rotation={[0, 0, Math.PI / 4]}> 
        
        {/* 1. 魔法棒身：改成发光银白色，在太空中更明显 */}
        <mesh position={[0, 0, 0]}>
          {/* 稍微调细一点：上半径0.04，下半径0.08，长度6 */}
          <cylinderGeometry args={[0.04, 0.08, 6, 12]} /> 
          <meshStandardMaterial 
            color="#FFFFFF"          // 纯白
            emissive="#E0F7FA"       // 发出淡蓝色的光
            emissiveIntensity={0.5}  // 发光强度
            roughness={0.2} 
            metalness={0.8}          // 金属质感
          />
        </mesh>
        
        {/* 2. 魔法棒头：位置精确设定在棒身顶部 (长度6的一半是3) */}
        <mesh position={[0, 3, 0]}>
          <sphereGeometry args={[0.25, 16, 16]} />
          <meshStandardMaterial color="#FFD700" emissive="#FFD700" emissiveIntensity={2} />
          
          {/* 3. 粒子特效：绑定在棒头，跟着棒头走 */}
          <Sparkles
            count={200}           // 数量适中
            scale={[50, 50, 50]}  // 散布在整个空间
            size={3}              // 雪花大小
            speed={0.4}           // 缓慢飘落
            opacity={0.7}         //稍微透明
            color="#FFFFFF"       // <--- 关键修改：纯白色
          />
        </mesh>

      </group>
    </group>
  );
};

// --- Component: Top Star (No Photo, Pure Gold 3D Star) ---
const TopStar = ({ state }: { state: 'CHAOS' | 'FORMED' }) => {
  const groupRef = useRef<THREE.Group>(null);

  const starShape = useMemo(() => {
    const shape = new THREE.Shape();
    const outerRadius = 1.3; const innerRadius = 0.7; const points = 5;
    for (let i = 0; i < points * 2; i++) {
      const radius = i % 2 === 0 ? outerRadius : innerRadius;
      const angle = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
      i === 0 ? shape.moveTo(radius*Math.cos(angle), radius*Math.sin(angle)) : shape.lineTo(radius*Math.cos(angle), radius*Math.sin(angle));
    }
    shape.closePath();
    return shape;
  }, []);

  const starGeometry = useMemo(() => {
    return new THREE.ExtrudeGeometry(starShape, {
      depth: 0.4, // 增加一点厚度
      bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.1, bevelSegments: 3,
    });
  }, [starShape]);

  // 纯金材质
  const goldMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: CONFIG.colors.gold,
    emissive: CONFIG.colors.gold,
    emissiveIntensity: 1.5, // 适中亮度，既发光又有质感
    roughness: 0.1,
    metalness: 1.0,
  }), []);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.5;
      const targetScale = state === 'FORMED' ? 1 : 0;
      groupRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), delta * 3);
    }
  });

  return (
    <group ref={groupRef} position={[0, CONFIG.tree.height / 2 + 1.8, 0]}>
      <Float speed={2} rotationIntensity={0.2} floatIntensity={0.2}>
        <mesh geometry={starGeometry} material={goldMaterial} />
      </Float>
    </group>
  );
};

// --- Main Scene Experience ---
const Experience = ({ sceneState, rotationSpeed, pointerPos }: { sceneState: 'CHAOS' | 'FORMED', rotationSpeed: number, pointerPos: THREE.Vector3 }) => {
  const controlsRef = useRef<any>(null);
  useFrame(() => {
    if (controlsRef.current) {
      controlsRef.current.setAzimuthalAngle(controlsRef.current.getAzimuthalAngle() + rotationSpeed);
      controlsRef.current.update();
    }
  });

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 5, 35]} fov={45} />
      <OrbitControls ref={controlsRef} enablePan={false} enableZoom={true} minDistance={30} maxDistance={120} autoRotate={false} maxPolarAngle={Math.PI / 1.7} />

      <color attach="background" args={['#000300']} />
      <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
      <Environment preset="night" background={false} />

      <ambientLight intensity={0.4} color="#003311" />
      <pointLight position={[30, 30, 30]} intensity={100} color={CONFIG.colors.warmLight} />
      <pointLight position={[-30, 10, -30]} intensity={50} color={CONFIG.colors.gold} />
      <pointLight position={[0, -20, 10]} intensity={30} color="#ffffff" />

      <group position={[0, -6, 0]}>
        <Foliage state={sceneState} />
        <Suspense fallback={null}>
           <PhotoOrnaments state={sceneState} pointerPos={pointerPos} />
           <ChristmasElements state={sceneState} />
           <FairyLights state={sceneState} />
           <TopStar state={sceneState} />
        </Suspense>
        <Sparkles count={600} scale={50} size={8} speed={0.4} opacity={0.4} color={CONFIG.colors.silver} />
      </group>

      <EffectComposer>
        <Bloom luminanceThreshold={1.2} luminanceSmoothing={0.2} intensity={0.6} radius={0.3} mipmapBlur />
        <Vignette eskil={false} offset={0.1} darkness={0.5} />
      </EffectComposer>
    </>
  );
};

// --- Gesture Controller ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const GestureController = ({ onGesture, onMove, onPointerMove, onStatus, debugMode }: any) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let gestureRecognizer: GestureRecognizer;
    let requestRef: number;

    const setup = async () => {
      onStatus("DOWNLOADING AI...");
      try {
        const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm");
        gestureRecognizer = await GestureRecognizer.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 1
        });
        onStatus("REQUESTING CAMERA...");
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play();
            onStatus("AI READY: SHOW HAND");
            predictWebcam();
          }
        } else {
            onStatus("ERROR: CAMERA PERMISSION DENIED");
        }
      } catch (err: any) {
        onStatus(`ERROR: ${err.message || 'MODEL FAILED'}`);
      }
    };

    const predictWebcam = () => {
      if (gestureRecognizer && videoRef.current && canvasRef.current) {
        if (videoRef.current.videoWidth > 0) {
            const results = gestureRecognizer.recognizeForVideo(videoRef.current, Date.now());
            const ctx = canvasRef.current.getContext("2d");
            if (ctx && debugMode) {
                ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
                canvasRef.current.width = videoRef.current.videoWidth; canvasRef.current.height = videoRef.current.videoHeight;
                if (results.landmarks) for (const landmarks of results.landmarks) {
                        const drawingUtils = new DrawingUtils(ctx);
                        drawingUtils.drawConnectors(landmarks, GestureRecognizer.HAND_CONNECTIONS, { color: "#FFD700", lineWidth: 2 });
                        drawingUtils.drawLandmarks(landmarks, { color: "#FF0000", lineWidth: 1 });
                }
            } else if (ctx && !debugMode) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

            if (results.gestures.length > 0) {
              const name = results.gestures[0][0].categoryName; const score = results.gestures[0][0].score;
              if (score > 0.4) {
                 if (name === "Open_Palm") onGesture("CHAOS"); if (name === "Closed_Fist") onGesture("FORMED");
                 if (debugMode) onStatus(`DETECTED: ${name}`);
              }
              //if (results.landmarks.length > 0) {
              //  const speed = (0.5 - results.landmarks[0][0].x) * 0.15;
              //  onMove(Math.abs(speed) > 0.01 ? speed : 0);
              //}
            } else { onMove(0); if (debugMode) onStatus("AI READY: NO HAND"); }
            if (results.landmarks.length > 0) {
              const finger = results.landmarks[0][8]; // 食指尖

              // 坐标转换
              const x = (0.5 - finger.x) * 30; 
              const y = (0.5 - finger.y) * 20;
              const z = 12; 

              // 发送坐标给魔法棒
              if (onPointerMove) {
              onPointerMove(new THREE.Vector3(x, y, z));
              }

              // 计算旋转速度 (保留原有的逻辑)
              const rawX = results.landmarks[0][0].x; // 0 是左边，1 是右边
              let speed = 0;

              if (rawX < 0.3) {
                speed = (0.3 - rawX) * 0.2; // 向左转
              } else if (rawX > 0.7) {
                speed = (0.7 - rawX) * 0.2; // 向右转
              }

              onMove(speed);
            } else { onMove(0); }
        }
        requestRef = requestAnimationFrame(predictWebcam);
      }
    };
    setup();
    return () => cancelAnimationFrame(requestRef);
  }, [onGesture, onMove, onStatus, debugMode]);

  return (
    <>
      <video ref={videoRef} style={{ opacity: debugMode ? 0.6 : 0, position: 'fixed', top: 0, right: 0, width: debugMode ? '320px' : '1px', zIndex: debugMode ? 100 : -1, pointerEvents: 'none', transform: 'scaleX(-1)' }} playsInline muted autoPlay />
      <canvas ref={canvasRef} style={{ position: 'fixed', top: 0, right: 0, width: debugMode ? '320px' : '1px', height: debugMode ? 'auto' : '1px', zIndex: debugMode ? 101 : -1, pointerEvents: 'none', transform: 'scaleX(-1)' }} />
    </>
  );
};

// --- App Entry ---
export default function GrandTreeApp() {
  const [sceneState, setSceneState] = useState<'CHAOS' | 'FORMED'>('CHAOS');
  const [rotationSpeed, setRotationSpeed] = useState(0);
  const [aiStatus, setAiStatus] = useState("INITIALIZING...");
  const [debugMode, setDebugMode] = useState(false);
  const [pointerPos, setPointerPos] = useState(new THREE.Vector3(0, 0, 10));

  return (
    <div style={{ width: '100vw', height: '100vh', backgroundColor: '#000', position: 'relative', overflow: 'hidden' }}>
      <div style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, zIndex: 1 }}>
        <Canvas
          dpr={Math.min(window.devicePixelRatio, 2)}
          gl={{
            antialias: true,
            toneMapping: THREE.ACESFilmicToneMapping,
            outputColorSpace: THREE.SRGBColorSpace,
          }}
        >
            <Experience sceneState={sceneState} rotationSpeed={rotationSpeed} pointerPos={pointerPos} />
            {/* 新增魔法棒组件 */}
            <MagicWand pointerPos={pointerPos} />
        </Canvas>
      </div>
    
      <GestureController 
        onGesture={setSceneState} 
        onMove={setRotationSpeed} 
        onPointerMove={setPointerPos}  
        onStatus={setAiStatus} 
        debugMode={debugMode} 
      />

      {/* UI - Stats */}
      <div style={{ position: 'absolute', bottom: '30px', left: '40px', color: '#888', zIndex: 10, fontFamily: 'sans-serif', userSelect: 'none' }}>
        <div style={{ marginBottom: '15px' }}>
          <p style={{ fontSize: '10px', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '4px' }}>Memories</p>
          <p style={{ fontSize: '24px', color: '#FFD700', fontWeight: 'bold', margin: 0 }}>
            {CONFIG.counts.ornaments.toLocaleString()} <span style={{ fontSize: '10px', color: '#555', fontWeight: 'normal' }}>POLAROIDS</span>
          </p>
        </div>
        <div>
          <p style={{ fontSize: '10px', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '4px' }}>Foliage</p>
          <p style={{ fontSize: '24px', color: '#004225', fontWeight: 'bold', margin: 0 }}>
            {(CONFIG.counts.foliage / 1000).toFixed(0)}K <span style={{ fontSize: '10px', color: '#555', fontWeight: 'normal' }}>EMERALD NEEDLES</span>
          </p>
        </div>
      </div>

      {/* UI - Buttons */}
      <div style={{ position: 'absolute', bottom: '30px', right: '40px', zIndex: 10, display: 'flex', gap: '10px' }}>
        <button onClick={() => setDebugMode(!debugMode)} style={{ padding: '12px 15px', backgroundColor: debugMode ? '#FFD700' : 'rgba(0,0,0,0.5)', border: '1px solid #FFD700', color: debugMode ? '#000' : '#FFD700', fontFamily: 'sans-serif', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', backdropFilter: 'blur(4px)' }}>
           {debugMode ? 'HIDE DEBUG' : '🛠 DEBUG'}
        </button>
        <button onClick={() => setSceneState(s => s === 'CHAOS' ? 'FORMED' : 'CHAOS')} style={{ padding: '12px 30px', backgroundColor: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255, 215, 0, 0.5)', color: '#FFD700', fontFamily: 'serif', fontSize: '14px', fontWeight: 'bold', letterSpacing: '3px', textTransform: 'uppercase', cursor: 'pointer', backdropFilter: 'blur(4px)' }}>
           {sceneState === 'CHAOS' ? 'Assemble Tree' : 'Disperse'}
        </button>
      </div>

      {/* UI - AI Status */}
      <div style={{ position: 'absolute', top: '20px', left: '50%', transform: 'translateX(-50%)', color: aiStatus.includes('ERROR') ? '#FF0000' : 'rgba(255, 215, 0, 0.4)', fontSize: '10px', letterSpacing: '2px', zIndex: 10, background: 'rgba(0,0,0,0.5)', padding: '4px 8px', borderRadius: '4px' }}>
        {aiStatus}
      </div>
    </div>
  );
}