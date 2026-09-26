import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export const MAPS = {
  alpine: {
    name: "Alpine Pass",
    coordinates: "46.53° N · 12.14° E",
    sky: 0x97b7c7,
    fog: 0x9eb9c5,
    ground: 0x59634a,
    mountain: 0x697e79,
    water: 0x3a7782,
    light: 0xffeccb,
    exposure: 1.05,
  },
  desert: {
    name: "Desert Run",
    coordinates: "36.24° N · 116.82° W",
    sky: 0xc39880,
    fog: 0xcc9d79,
    ground: 0xa97d54,
    mountain: 0x986650,
    water: 0xbc9466,
    light: 0xffbe78,
    exposure: 1.0,
  },
  night: {
    name: "Midnight City",
    coordinates: "35.67° N · 139.65° E",
    sky: 0x111c33,
    fog: 0x192c46,
    ground: 0x273747,
    mountain: 0x263c51,
    water: 0x172d43,
    light: 0x9fbbff,
    exposure: 0.95,
  },
};
const rand = (a, b) => a + Math.random() * (b - a);
const dummy = new THREE.Object3D();
const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const material = (color, roughness = 0.9, metalness = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });
function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(boxGeometry, mat);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  m.receiveShadow = true;
  return m;
}
function roadAt(s) {
  return Math.sin(s * 0.0017) * 24 + Math.sin(s * 0.0041) * 7;
}

function batchStatic(group) {
  group.updateMatrixWorld(true);
  const batches = new Map();
  group.traverse((m) => {
    if (!m.isMesh || Array.isArray(m.material)) return;
    const key = m.material.uuid;
    if (!batches.has(key))
      batches.set(key, { material: m.material, geometries: [], shadow: false });
    const batch = batches.get(key);
    batch.geometries.push(m.geometry.clone().applyMatrix4(m.matrixWorld));
    batch.shadow ||= m.castShadow;
  });
  group.clear();
  for (const b of batches.values()) {
    const geometry = mergeGeometries(b.geometries);
    if (!geometry) continue;
    const mesh = new THREE.Mesh(geometry, b.material);
    mesh.castShadow = b.shadow;
    mesh.receiveShadow = true;
    mesh.userData.generatedGeometry = true;
    group.add(mesh);
    for (const g of b.geometries) g.dispose();
  }
}

export class World {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(43, 1, 0.1, 2600);
    this.scene.fog = new THREE.FogExp2(0x9eb9c5, 0.00165);
    this.ambient = new THREE.HemisphereLight(0xe1f4ff, 0x464a39, 2.1);
    this.scene.add(this.ambient);
    this.sun = new THREE.DirectionalLight(0xffeccb, 3.2);
    this.sun.position.set(-65, 95, -45);
    this.sun.castShadow = true;
    Object.assign(this.sun.shadow.camera, {
      left: -45,
      right: 45,
      top: 45,
      bottom: -45,
      near: 1,
      far: 230,
    });
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.025;
    this.scene.add(this.sun);
    this.fill = new THREE.DirectionalLight(0xa4d1e9, 1.1);
    this.fill.position.set(15, 10, 15);
    this.scene.add(this.fill);
    this.models = {};
    this.traffic = [];
    this.segments = [];
    this.mountains = [];
    this.distance = 0;
    this.map = "alpine";
    this.playerX = 1.8;
    this.previewAngle = 0;
    this.previewTarget = 0;
    this.cameraMode = 0;
    this.groundMat = material(0x59634a);
    this.mountainMat = material(0x697e79);
    this.snowMat = material(0xccd3cb);
    this.waterMat = new THREE.MeshStandardMaterial({
      color: 0x3a7782,
      roughness: 0.3,
      metalness: 0.4,
    });
    this.railMat = material(0x95a0a0, 0.42, 0.65);
    this.lineMat = material(0xe6e2cc);
    this.yellowMat = material(0xd6c26b);
    this.darkMat = material(0x292d2c);
    this.neonMat = new THREE.MeshBasicMaterial({ color: 0x81f6f4 });
    this.resize();
    new ResizeObserver(() => this.resize()).observe(container);
  }
  async load() {
    const draco = new DRACOLoader();
    draco.setDecoderPath("/draco/");
    const loader = new GLTFLoader();
    loader.setDRACOLoader(draco);
    const names = {
      gt: "gt",
      suv: "suv",
      sedan: "sedan",
      truck: "truck",
      race: "race",
      pine: "nature/pine-tall",
      road: "city/road",
      building: "city/building",
      cone: "props/cone",
    };
    await Promise.all(
      Object.entries(names).map(async ([key, path]) => {
        const gltf = await loader.loadAsync(`/models/${path}.glb`);
        this.models[key] = gltf.scene;
        gltf.scene.traverse((m) => {
          if (m.isMesh) {
            m.castShadow = true;
            m.receiveShadow = true;
          }
        });
      }),
    );
    const hdr = await new HDRLoader().loadAsync(
      "/textures/venice_sunset_1k.hdr",
    );
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromEquirectangular(hdr).texture;
    hdr.dispose();
    pmrem.dispose();
    this.buildSky();
    this.buildTerrain();
    this.buildRoad();
    this.buildTrees();
    this.buildCity();
    this.buildSigns();
    this.buildHazards();
    this.setCar("gt", "#b8c8ba");
    this.setMap("alpine");
    this.flames = new THREE.Group();
    const flameGeo = new THREE.ConeGeometry(0.16, 1.1, 10);
    for (const x of [-0.3, 0.3]) {
      const flame = new THREE.Mesh(
        flameGeo,
        new THREE.MeshBasicMaterial({
          color: 0x53cfff,
          transparent: true,
          opacity: 0.7,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      flame.rotation.x = Math.PI / 2;
      flame.position.set(x, 0.4, 2.65);
      this.flames.add(flame);
    }
    this.scene.add(this.flames);
    this.flames.visible = false;
    this.setTraffic(14);
    this.ready = true;
    this.update(0, 0, 0, true);
    draco.dispose();
  }
  resize() {
    const { width, height } = this.container.getBoundingClientRect();
    if (!width || !height) return;
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
  buildSky() {
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(0x6d99b2) },
        bottom: { value: new THREE.Color(0xd1d6ce) },
        night: { value: 0 },
      },
      vertexShader:
        "varying vec3 vPos;void main(){vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
      fragmentShader:
        "varying vec3 vPos;uniform vec3 top;uniform vec3 bottom;uniform float night;void main(){float h=normalize(vPos).y;vec3 c=mix(bottom,top,smoothstep(-0.03,0.7,h));float glow=pow(max(0.0,dot(normalize(vPos),normalize(vec3(-0.4,0.22,-0.7)))),55.0);c+=vec3(1.0,0.7,0.4)*glow*0.23*(1.0-night);gl_FragColor=vec4(c,1.0);}",
    });
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(1800, 32, 20),
      this.skyMat,
    );
    this.scene.add(this.sky);
    const starGeo = new THREE.BufferGeometry(),
      positions = [];
    for (let i = 0; i < 550; i++) {
      const v = new THREE.Vector3(rand(-1, 1), rand(0.2, 1), rand(-1, 1))
        .normalize()
        .multiplyScalar(1300);
      positions.push(...v.toArray());
    }
    starGeo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    this.stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({
        color: 0xdbe8ff,
        size: 1.6,
        sizeAttenuation: false,
        transparent: true,
        opacity: 0.8,
      }),
    );
    this.scene.add(this.stars);
  }
  buildTerrain() {
    this.ground = box(2300, 1, 2600, this.groundMat, 0, -4, -700);
    this.scene.add(this.ground);
    this.water = new THREE.Mesh(
      new THREE.PlaneGeometry(680, 2000, 1, 1),
      this.waterMat,
    );
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.set(380, -2.6, -750);
    this.scene.add(this.water);
    // Ridged height-field terrain: continuous mountain ranges rather than repeated cones.
    const geo = new THREE.PlaneGeometry(2800, 1600, 180, 110);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = [];
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i),
        z = pos.getZ(i) - 1020;
      const ridge = Math.pow(
        Math.abs(
          Math.sin(x * 0.0038 + 1.3) + 0.42 * Math.sin(x * 0.0093 - 0.7),
        ),
        1.25,
      );
      const envelope = Math.sin(
        Math.max(0, Math.min(1, (-z - 190) / 1350)) * Math.PI * 0.85,
      );
      const detail =
        Math.sin(x * 0.023 + z * 0.016) * Math.cos(z * 0.029 - x * 0.007) * 18 +
        Math.sin(x * 0.059 - z * 0.03) * 5;
      const h = Math.max(
        -4,
        (70 + ridge * 235) * Math.max(0, envelope) + detail - 25,
      );
      pos.setXYZ(i, x, h, z);
      const snowLine = 240 + Math.sin(x * 0.035) * 25;
      const c = new THREE.Color(
        h > snowLine ? 0xb5c2bf : h > 165 ? 0x6c807f : 0x416058,
      );
      c.multiplyScalar(
        0.82 +
          Math.sin(x * 0.045 + z * 0.02) * 0.085 +
          Math.cos(x * 0.013 - z * 0.03) * 0.09,
      );
      colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    this.terrainMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 1,
      metalness: 0,
    });
    const terrain = new THREE.Mesh(geo, this.terrainMat);
    this.scene.add(terrain);
    this.mountains.push(terrain);
    this.rocks = [];
    const rockGeo = new THREE.DodecahedronGeometry(1, 1);
    for (let i = 0; i < 60; i++) {
      const rock = new THREE.Mesh(
        rockGeo,
        i % 3 === 0 ? this.mountainMat : this.groundMat,
      );
      const side = i % 2 ? 1 : -1;
      rock.scale.set(rand(2, 8), rand(2, 6), rand(3, 9));
      rock.userData = { s: rand(0, 850), x: side * rand(13, 50) };
      rock.position.set(rock.userData.x, -0.8, -rock.userData.s);
      this.scene.add(rock);
      this.rocks.push(rock);
    }
  }
  buildRoad() {
    const textureCanvas = document.createElement("canvas");
    textureCanvas.width = textureCanvas.height = 256;
    const ctx = textureCanvas.getContext("2d");
    const img = ctx.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) {
      const a = rand(55, 79);
      img.data[i] = a;
      img.data[i + 1] = a + 2;
      img.data[i + 2] = a + 3;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(textureCanvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 6);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    this.asphaltMat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.89,
      color: 0xb4bdc0,
    });
    const roadBounds = new THREE.Box3().setFromObject(this.models.road);
    const roadSize = roadBounds.getSize(new THREE.Vector3());
    for (let i = 0; i < 30; i++) {
      const segment = new THREE.Group();
      segment.userData.index = i;
      const road = this.models.road.clone();
      road.scale.set(18 / roadSize.x, 0.2 / roadSize.y, 32 / roadSize.z);
      road.position.y = -0.23;
      segment.add(road);
      segment.add(box(15.5, 0.1, 32.15, this.asphaltMat, 0, -0.04, 0));
      segment.add(box(21, 0.2, 32.2, this.groundMat, 0, -0.25, 0));
      for (const x of [-7.15, 7.15])
        segment.add(box(0.13, 0.015, 32.1, this.lineMat, x, 0.021, 0));
      for (const x of [-0.12, 0.12])
        segment.add(box(0.085, 0.02, 32.1, this.yellowMat, x, 0.027, 0));
      for (const x of [-3.6, 3.6])
        for (let j = 0; j < 4; j++)
          segment.add(
            box(0.12, 0.02, 3.1, this.lineMat, x, 0.027, -12 + j * 8),
          );
      for (const x of [-8.4, 8.4]) {
        segment.add(box(0.13, 0.24, 32.2, this.railMat, x, 0.75, 0));
        segment.add(box(0.15, 0.08, 32.2, this.railMat, x, 0.94, 0));
        for (let j = 0; j < 4; j++) {
          segment.add(box(0.12, 0.8, 0.12, this.railMat, x, 0.39, j * 8 - 12));
          segment.add(box(0.17, 0.12, 0.1, this.lineMat, x, 0.85, j * 8 - 12));
        }
      }
      batchStatic(segment);
      this.scene.add(segment);
      this.segments.push(segment);
    }
  }
  buildTrees() {
    const original = this.models.pine;
    original.updateMatrixWorld(true);
    const geos = [];
    original.traverse((m) => {
      if (m.isMesh) {
        const g = m.geometry.clone().applyMatrix4(m.matrixWorld);
        const color = new THREE.Color(
          m.material.name.includes("leaf") ? 0x234d40 : 0x665342,
        );
        const values = [];
        for (let i = 0; i < g.attributes.position.count; i++)
          values.push(color.r, color.g, color.b);
        g.setAttribute("color", new THREE.Float32BufferAttribute(values, 3));
        geos.push(g);
      }
    });
    const treeGeo = mergeGeometries(geos);
    treeGeo.computeBoundingBox();
    const height = treeGeo.boundingBox.max.y - treeGeo.boundingBox.min.y;
    treeGeo.translate(0, -treeGeo.boundingBox.min.y, 0);
    treeGeo.scale(1 / height, 1 / height, 1 / height);
    this.treeMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 1,
    });
    this.trees = new THREE.InstancedMesh(treeGeo, this.treeMat, 550);
    this.trees.castShadow = true;
    this.trees.receiveShadow = true;
    this.trees.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.trees.frustumCulled = false;
    this.treeData = [];
    for (let i = 0; i < 550; i++) {
      this.treeData.push({
        s: rand(0, 960),
        x: (i % 4 ? -1 : 1) * rand(12, 100),
        scale: rand(7, 18),
        rot: rand(0, 6.28),
      });
      this.trees.setColorAt(i, new THREE.Color().setScalar(rand(0.68, 1.13)));
    }
    this.scene.add(this.trees);
    this.cacti = new THREE.Group();
    const cactusMat = material(0x546447);
    this.cactusData = [];
    for (let i = 0; i < 45; i++) {
      const c = new THREE.Group();
      c.add(box(0.6, 4, 0.6, cactusMat, 0, 2));
      c.add(box(2, 0.5, 0.5, cactusMat, 0.6, 2.7));
      c.add(box(0.5, 1.5, 0.5, cactusMat, 1.35, 3.2));
      const data = { s: rand(0, 960), x: (i % 2 ? -1 : 1) * rand(13, 55) };
      c.userData = data;
      this.cacti.add(c);
    }
    this.scene.add(this.cacti);
  }
  buildCity() {
    this.city = new THREE.Group();
    this.cityData = [];
    const building = this.models.building;
    const bounds = new THREE.Box3().setFromObject(building),
      size = bounds.getSize(new THREE.Vector3());
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x1b2c40,
      metalness: 0.55,
      roughness: 0.3,
    });
    const windowMats = [
      new THREE.MeshBasicMaterial({ color: 0x4ab8c7 }),
      new THREE.MeshBasicMaterial({ color: 0xcfc0a2 }),
      new THREE.MeshBasicMaterial({ color: 0x5c83b8 }),
    ];
    for (let i = 0; i < 50; i++) {
      const group = new THREE.Group();
      const h = rand(16, 85),
        w = rand(10, 20),
        d = rand(10, 22);
      const model = building.clone();
      model.scale.set(w / size.x, h / size.y, d / size.z);
      group.add(model);
      group.add(box(w, h, d, glassMat, 0, h / 2, 0));
      for (let j = 2; j < h; j += 3.7) {
        group.add(box(w + 0.05, 0.5, d + 0.05, windowMats[i % 3], 0, j, 0));
      }
      if (i % 7 === 0)
        group.add(box(w + 0.2, 0.8, d + 0.2, this.neonMat, 0, h + 0.2, 0));
      const data = {
        s: Math.floor(i / 2) * 37 + 50,
        x: (i % 2 ? -1 : 1) * rand(28, 85),
      };
      group.userData = data;
      batchStatic(group);
      this.city.add(group);
    }
    this.scene.add(this.city);
    this.lamps = new THREE.Group();
    const lampMat = material(0x596978, 0.5, 0.6);
    for (let i = 0; i < 24; i++) {
      const group = new THREE.Group();
      const x = i % 2 ? 9 : -9;
      group.add(box(0.16, 8, 0.16, lampMat, 0, 4));
      group.add(box(3, 0.14, 0.18, lampMat, x < 0 ? 1.5 : -1.5, 8));
      const bulb = box(
        1.4,
        0.04,
        0.5,
        new THREE.MeshBasicMaterial({ color: 0xe4f1ff }),
        x < 0 ? 2 : -2,
        7.9,
      );
      group.add(bulb);
      group.userData = { s: i * 40, x };
      this.lamps.add(group);
    }
    this.scene.add(this.lamps);
    this.headlights = [];
    for (const x of [-0.64, 0.64]) {
      const light = new THREE.SpotLight(0xddeeff, 24, 100, 0.32, 0.5, 1);
      light.position.set(x, 0.6, -1.8);
      light.target.position.set(x, 0.1, -50);
      this.scene.add(light, light.target);
      this.headlights.push(light);
    }
  }
  buildSigns() {
    this.signs = [];
    for (let i = 0; i < 4; i++) {
      const group = new THREE.Group();
      group.add(box(0.22, 8, 0.22, this.railMat, -9, 4));
      group.add(box(0.22, 8, 0.22, this.railMat, 9, 4));
      group.add(box(18.5, 0.24, 0.24, this.railMat, 0, 7.9));
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 160;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#245e55";
      ctx.fillRect(0, 0, 512, 160);
      ctx.strokeStyle = "#b7d1bd";
      ctx.lineWidth = 5;
      ctx.strokeRect(8, 8, 496, 144);
      ctx.fillStyle = "#edf4e6";
      ctx.font = "bold 40px Arial";
      ctx.textAlign = "center";
      ctx.fillText(i % 2 ? "NORTHBOUND" : "HORIZON HIGHWAY", 256, 66);
      ctx.font = "26px Arial";
      ctx.fillText("↑   A P E X     /     01   ↑", 256, 121);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(9, 2.8),
        new THREE.MeshStandardMaterial({
          map: tex,
          roughness: 0.8,
          side: THREE.DoubleSide,
        }),
      );
      sign.position.set(0, 7.4, 0.15);
      group.add(sign);
      group.userData.s = i * 240 + 150;
      this.scene.add(group);
      this.signs.push(group);
    }
  }
  buildHazards() {
    this.hazards = [];
    const coneBox = new THREE.Box3().setFromObject(this.models.cone);
    const coneHeight = coneBox.getSize(new THREE.Vector3()).y;
    for (let i = 0; i < 2; i++) {
      const group = new THREE.Group();
      for (const [x, z] of [
        [-1.15, 0],
        [1.15, 0],
        [-0.9, 3],
        [0.9, 3],
      ]) {
        const cone = this.models.cone.clone();
        cone.scale.setScalar(0.8 / coneHeight);
        cone.position.set(x, 0.02, z);
        group.add(cone);
      }
      const canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 32;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#f3e5c9";
      ctx.fillRect(0, 0, 128, 32);
      ctx.fillStyle = "#ec6e22";
      for (let j = -32; j < 160; j += 32) {
        ctx.beginPath();
        ctx.moveTo(j, 0);
        ctx.lineTo(j + 16, 0);
        ctx.lineTo(j + 48, 32);
        ctx.lineTo(j + 32, 32);
        ctx.fill();
      }
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const board = box(
        2,
        0.5,
        0.16,
        new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }),
        0,
        0.65,
        0,
      );
      group.add(board);
      for (const x of [-0.7, 0.7])
        group.add(box(0.12, 0.7, 0.12, this.railMat, x, 0.35, 0));
      group.userData = {
        s: 750 + i * 780,
        lane: i ? 0 : 3,
        hit: false,
        warned: false,
      };
      batchStatic(group);
      this.scene.add(group);
      this.hazards.push(group);
    }
  }
  resetHazards() {
    this.hazards.forEach((h, i) => {
      Object.assign(h.userData, {
        s: 750 + i * 780,
        lane: i ? 0 : 3,
        hit: false,
        warned: false,
      });
      h.visible = false;
    });
  }
  updateHazards(distance, preview) {
    const origin = roadAt(distance);
    for (const h of this.hazards) {
      const d = h.userData;
      let ahead = d.s - distance;
      if (ahead < -40) {
        d.s = distance + Math.max(500, 1300 - distance * 0.04);
        d.lane = Math.floor(rand(0, 4));
        d.hit = false;
        d.warned = false;
        ahead = d.s - distance;
      }
      h.visible = !preview && ahead < 700;
      h.position.set(
        [-5.4, -1.8, 1.8, 5.4][d.lane] + roadAt(d.s) - origin,
        0,
        -ahead,
      );
    }
  }
  disposeCar(car) {
    car.traverse((m) => {
      if (m.isMesh) {
        if (m.userData.generatedGeometry) m.geometry.dispose();
        if (Array.isArray(m.material))
          m.material.forEach((mat) => mat.dispose());
        else m.material.dispose();
      }
    });
    this.scene.remove(car);
  }
  prepareCar(key, color) {
    const car = new THREE.Group();
    const model = this.models[key].clone(true);
    model.traverse((m) => {
      if (!m.isMesh) return;
      m.material = m.material.clone();
      if (m.name === "body" || m.material.name?.startsWith("paint")) {
        if (key === "gt" && m.name !== "body") return;
        m.material = new THREE.MeshPhysicalMaterial({
          color,
          metalness: 0.78,
          roughness: 0.28,
          clearcoat: 1,
          clearcoatRoughness: 0.12,
        });
      }
      if (m.material.name?.includes("Glass") || m.material.name === "window") {
        m.material = new THREE.MeshPhysicalMaterial({
          color: 0x18272e,
          metalness: 0.35,
          roughness: 0.13,
          clearcoat: 1,
        });
      }
      if (["metal_gray", "metal_chrome"].includes(m.material.name)) {
        m.material.color.set(0x6b7478);
        m.material.metalness = 1;
        m.material.roughness = 0.25;
      }
      if (m.material.name === "Tires") {
        m.material.color.set(0x131619);
        m.material.metalness = 0;
        m.material.roughness = 0.9;
      }
      if (m.name === "lights_red" || m.material.name === "lightBack") {
        m.material = new THREE.MeshStandardMaterial({
          color: 0xe82014,
          emissive: 0xff1b08,
          emissiveIntensity: 1.4,
        });
      }
      if (m.name === "lights" || m.material.name === "lightFront") {
        m.material.emissive = new THREE.Color(0xffefd0);
        m.material.emissiveIntensity = 0.7;
      }
      m.castShadow = true;
    });
    const bounds = new THREE.Box3().setFromObject(model),
      size = bounds.getSize(new THREE.Vector3());
    const targetLength = key === "truck" ? 6.5 : key === "suv" ? 4.8 : 4.55;
    const scale = targetLength / size.z;
    model.scale.multiplyScalar(scale);
    const scaledBounds = new THREE.Box3().setFromObject(model);
    const center = scaledBounds.getCenter(new THREE.Vector3());
    model.position.set(-center.x, -scaledBounds.min.y + 0.045, -center.z);
    if (key !== "gt") {
      batchStatic(model);
      model.position.set(0, 0, 0);
      model.scale.setScalar(1);
      model.rotation.set(0, 0, 0);
    }
    car.add(model);
    // Soft contact shadow, supplementing directional real-time shadows.
    if (!this.shadowTexture) {
      const c = document.createElement("canvas");
      c.width = c.height = 128;
      const ctx = c.getContext("2d");
      const gradient = ctx.createRadialGradient(64, 64, 15, 64, 64, 62);
      gradient.addColorStop(0, "rgba(0,0,0,.6)");
      gradient.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 128, 128);
      this.shadowTexture = new THREE.CanvasTexture(c);
    }
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(3.7, targetLength + 1.3),
      new THREE.MeshBasicMaterial({
        map: this.shadowTexture,
        transparent: true,
        depthWrite: false,
      }),
    );
    shadow.userData.generatedGeometry = true;
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.035;
    car.add(shadow);
    car.userData.model = model;
    return car;
  }
  setCar(key, color) {
    if (this.player) this.disposeCar(this.player);
    this.carKey = key;
    this.paint = color;
    this.player = this.prepareCar(key, color);
    this.scene.add(this.player);
    this.wheels = [];
    this.player.traverse((m) => {
      if (
        [
          "wheel_fl",
          "wheel_fr",
          "wheel_rl",
          "wheel_rr",
          "wheel_backLeft",
          "wheel_backRight",
          "wheel_frontLeft",
          "wheel_frontRight",
        ].includes(m.name)
      )
        this.wheels.push(m);
    });
    this.player.position.set(this.playerX, 0, 0);
  }
  setTraffic(count) {
    for (const car of this.traffic) this.disposeCar(car);
    this.traffic = [];
    const colors = [
      "#b59c7a",
      "#8399a6",
      "#a7b1ac",
      "#984c42",
      "#425769",
      "#bbbdaf",
    ];
    for (let i = 0; i < count; i++) {
      const key = ["suv", "sedan", "truck", "sedan"][i % 4];
      const car = this.prepareCar(key, colors[i % colors.length]);
      car.userData = {
        ...car.userData,
        key,
        lane: i % 4,
        s: 85 + i * 49,
        speed: rand(15, 24),
        passed: false,
      };
      car.rotation.y = i % 4 < 2 ? Math.PI : 0;
      this.scene.add(car);
      this.traffic.push(car);
    }
  }
  setMap(key) {
    this.map = key;
    const m = MAPS[key];
    this.scene.fog.color.set(m.fog);
    this.scene.fog.density = key === "night" ? 0.0028 : 0.0016;
    this.renderer.toneMappingExposure = m.exposure;
    this.skyMat.uniforms.top.value.set(
      key === "night" ? 0x071023 : key === "desert" ? 0x926775 : 0x6d9cae,
    );
    this.skyMat.uniforms.bottom.value.set(
      key === "night" ? 0x3a4a68 : key === "desert" ? 0xf2c293 : 0xd4d9ce,
    );
    this.skyMat.uniforms.night.value = key === "night" ? 1 : 0;
    this.groundMat.color.set(m.ground);
    this.mountainMat.color.set(m.mountain);
    this.waterMat.color.set(m.water);
    this.sun.color.set(m.light);
    this.sun.intensity = key === "night" ? 0.5 : 2.7;
    this.ambient.intensity = key === "night" ? 0.8 : 1.6;
    this.terrainMat.color.set(key === "desert" ? 0xd9ad7b : 0xffffff);
    this.fill.intensity = key === "night" ? 1 : 1.1;
    this.scene.environmentIntensity = key === "night" ? 0.3 : 1;
    this.trees.visible = key === "alpine";
    this.cacti.visible = key === "desert";
    this.city.visible = key === "night";
    this.stars.visible = key === "night";
    for (const mt of this.mountains) mt.visible = key !== "night";
    this.water.visible = key !== "desert";
    this.lamps.visible = key === "night";
    for (const l of this.headlights) l.visible = key === "night";
    this.asphaltMat.roughness = key === "night" ? 0.42 : 0.89;
  }
  setQuality(quality) {
    this.renderer.setPixelRatio(
      Math.min(
        devicePixelRatio,
        quality === "high" ? 1.8 : quality === "medium" ? 1.3 : 1,
      ),
    );
    this.renderer.shadowMap.enabled = quality !== "low";
    this.resize();
  }
  cycleCamera(preview = false) {
    if (preview) {
      this.previewTarget = (this.previewTarget + 1) % 3;
    } else this.cameraMode = (this.cameraMode + 1) % 3;
  }
  placeScenery(distance) {
    const offset = roadAt(distance);
    const place = (obj, s, x) => {
      const ahead = ((((s - distance) % 960) + 960) % 960) - 70;
      obj.position.set(
        x + roadAt(distance + ahead) - offset,
        obj.position.y,
        -ahead,
      );
    };
    for (const rock of this.rocks)
      place(rock, rock.userData.s, rock.userData.x);
    for (const c of this.cacti.children) place(c, c.userData.s, c.userData.x);
    for (const c of this.city.children) place(c, c.userData.s, c.userData.x);
    for (const c of this.lamps.children) place(c, c.userData.s, c.userData.x);
    for (const c of this.signs) place(c, c.userData.s, 0);
    for (let i = 0; i < this.treeData.length; i++) {
      const t = this.treeData[i];
      const ahead = ((((t.s - distance) % 960) + 960) % 960) - 70;
      dummy.position.set(t.x + roadAt(distance + ahead) - offset, -0.3, -ahead);
      dummy.rotation.set(0, t.rot, 0);
      dummy.scale.setScalar(t.scale);
      dummy.updateMatrix();
      this.trees.setMatrixAt(i, dummy.matrix);
    }
    this.trees.instanceMatrix.needsUpdate = true;
  }
  update(dt, distance, speed, preview = false, steer = 0, boost = false) {
    if (!this.player) return;
    this.distance = distance;
    const origin = roadAt(distance);
    for (let i = 0; i < this.segments.length; i++) {
      const s = (Math.floor(distance / 32) + i - 2) * 32;
      const ahead = s - distance;
      const x = roadAt(s) - origin;
      const slope = (roadAt(s + 16) - roadAt(s - 16)) / 32;
      const seg = this.segments[i];
      seg.position.set(x, 0, -ahead);
      seg.rotation.y = -Math.atan(slope);
    }
    this.placeScenery(distance);
    this.updateHazards(distance, preview);
    this.player.scale.setScalar(preview ? 1.12 : 1);
    this.player.position.x = preview ? 1.8 : this.playerX;
    this.player.position.y =
      Math.sin(performance.now() * 0.014) * (speed / 300) * 0.014;
    this.player.rotation.y = THREE.MathUtils.lerp(
      this.player.rotation.y,
      preview ? -0.04 : -steer * 0.075,
      Math.min(1, dt * 8),
    );
    this.player.rotation.z = THREE.MathUtils.lerp(
      this.player.rotation.z,
      -steer * 0.017,
      Math.min(1, dt * 6),
    );
    if (!preview)
      for (const wheel of this.wheels)
        wheel.rotation.x -= (dt * speed) / 3.6 / 0.34;
    for (const light of this.headlights) {
      light.position.x =
        this.player.position.x +
        (this.headlights.indexOf(light) === 0 ? -0.64 : 0.64);
      light.target.position.x = light.position.x;
    }
    if (preview) {
      const poses = [
        { pos: [6.7, 2.65, 6.9], look: [-3.8, 0.8, -1.7] },
        { pos: [9, 3, -10], look: [-1, 1, 1.3] },
        { pos: [-8, 3.3, 9], look: [3.5, 1, -2] },
      ];
      const p = poses[this.previewTarget];
      const mobile = this.camera.aspect < 1.25;
      const pos = new THREE.Vector3(...p.pos);
      const look = new THREE.Vector3(...p.look);
      if (mobile) {
        pos.set(10, 5.8, 13);
        look.set(-2.6, 1.2, -1.6);
        if (this.previewTarget === 1) pos.set(11, 4, -10);
        if (this.previewTarget === 2) pos.set(-8, 5, 12);
      }
      this.camera.position.lerp(pos, dt ? Math.min(1, dt * 2) : 1);
      this.camera.lookAt(look);
      this.camera.fov = 43;
    } else {
      const modes = [
        { y: 3.7, z: 8.8, lookY: 0.75, lookZ: -30 },
        { y: 1.05, z: -0.65, lookY: 1, lookZ: -65 },
        { y: 6.7, z: 13.5, lookY: 0.2, lookZ: -35 },
      ];
      const c = modes[this.cameraMode];
      this.player.visible = this.cameraMode !== 1;
      const target = new THREE.Vector3(this.playerX * 0.65, c.y, c.z);
      this.camera.position.lerp(target, Math.min(1, dt * 7));
      const shake = boost ? Math.sin(performance.now() * 0.1) * 0.016 : 0;
      this.camera.position.y += shake;
      this.camera.lookAt(
        this.playerX * 0.65 + roadAt(distance + 60) - origin,
        c.lookY,
        c.lookZ,
      );
      this.camera.fov = THREE.MathUtils.lerp(
        this.camera.fov,
        boost ? 69 : 58 + speed * 0.025,
        Math.min(1, dt * 4),
      );
    }
    if (this.flames) {
      this.flames.visible = boost && !preview && this.cameraMode !== 1;
      this.flames.position.x = this.playerX;
      this.flames.scale.z = 0.85 + Math.random() * 0.45;
    }
    if (preview) this.player.visible = true;
    this.camera.updateProjectionMatrix();
  }
  updateTraffic(dt, distance, speed, preview = false) {
    const origin = roadAt(distance);
    for (const car of this.traffic) {
      const d = car.userData;
      if (!preview) {
        d.s += d.lane < 2 ? -d.speed * dt : d.speed * dt;
        for (const h of this.hazards)
          if (h.userData.lane === d.lane && Math.abs(h.userData.s - d.s) < 25)
            d.lane = d.lane ^ 1;
      }
      let ahead = d.s - distance;
      if (ahead < -25) {
        d.s = distance + rand(350, 650);
        d.lane = Math.floor(rand(0, 4));
        d.passed = false;
        d.hit = false;
        d.speed = rand(15, 25);
        ahead = d.s - distance;
        car.rotation.y = d.lane < 2 ? Math.PI : 0;
      }
      const laneX = [-5.4, -1.8, 1.8, 5.4][d.lane];
      car.position.set(laneX + roadAt(d.s) - origin, 0.02, -ahead);
      car.rotation.y =
        (d.lane < 2 ? Math.PI : 0) -
        Math.atan((roadAt(d.s + 1) - roadAt(d.s - 1)) / 2);
      car.visible = ahead < 800;
    }
  }
  render() {
    this.renderer.render(this.scene, this.camera);
  }
  thumbnails() {
    const oldSize = this.renderer.getSize(new THREE.Vector2());
    const oldRatio = this.renderer.getPixelRatio();
    const oldPos = this.camera.position.clone();
    const oldAspect = this.camera.aspect;
    const oldQuat = this.camera.quaternion.clone();
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(560, 250, false);
    this.camera.aspect = 560 / 250;
    this.camera.position.set(7, 5.7, 14);
    this.camera.lookAt(-1, 2, -75);
    this.camera.updateProjectionMatrix();
    this.player.visible = false;
    const thumbs = {};
    for (const key of Object.keys(MAPS)) {
      this.setMap(key);
      this.render();
      thumbs[key] = this.renderer.domElement.toDataURL("image/webp", 0.86);
    }
    this.setMap("alpine");
    this.player.visible = true;
    this.camera.position.copy(oldPos);
    this.camera.quaternion.copy(oldQuat);
    this.camera.aspect = oldAspect;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(oldRatio);
    this.renderer.setSize(oldSize.x, oldSize.y, false);
    return thumbs;
  }
}
