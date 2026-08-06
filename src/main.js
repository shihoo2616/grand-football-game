import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import "./style.css";

await RAPIER.init();

// ==========================================================
// 기본 설정
// ==========================================================

const FIELD_WIDTH = 30;
const FIELD_LENGTH = 50;

const GOAL_WIDTH = 7.32;
const GOAL_HEIGHT = 2.44;
const GOAL_DEPTH = 2.3;

const BALL_RADIUS = 0.11;
const BALL_MASS = 0.43;

const BODY_Y = 0.88;
const FIXED_STEP = 1 / 120;
const MATCH_TIME = 90;

const PLAYER_SPEED = 6.4;
const DASH_SPEED = 9.1;

const scene = new THREE.Scene();

scene.background = new THREE.Color(0x061326);
scene.fog = new THREE.FogExp2(0x061326, 0.007);

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  300
);

camera.position.set(0, 14, 30);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: "high-performance"
});

renderer.setSize(window.innerWidth, window.innerHeight);

renderer.setPixelRatio(
  Math.min(window.devicePixelRatio, 2)
);

renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

document.body.prepend(renderer.domElement);

const clock = new THREE.Clock();

const world = new RAPIER.World({
  x: 0,
  y: -9.81,
  z: 0
});

world.timestep = FIXED_STEP;

// ==========================================================
// UI
// ==========================================================

const $ = selector => document.querySelector(selector);

const UI = {
  loading: $("#loading"),

  playerScore: $("#player-score"),
  cpuScore: $("#cpu-score"),
  timer: $("#timer"),

  difficulty: $("#difficulty"),

  staminaFill: $("#stamina-fill"),
  staminaValue: $("#stamina-value"),

  powerFill: $("#power-fill"),
  powerValue: $("#power-value"),

  possession: $("#possession"),
  tackle: $("#tackle-state"),

  cpuState: $("#cpu-state"),
  keeperState: $("#keeper-state"),

  ballSpeed: $("#ball-speed"),
  crowdCount: $("#crowd-count"),

  message: $("#message"),

  endScreen: $("#end-screen"),
  result: $("#result"),
  finalScore: $("#final-score"),

  restart: $("#restart-button")
};

let difficulty = UI.difficulty.value;

UI.difficulty.addEventListener("change", () => {
  difficulty = UI.difficulty.value;

  const labels = {
    easy: "쉬움",
    normal: "보통",
    hard: "어려움"
  };

  showMessage(`CPU ${labels[difficulty]}`, 900);
});

UI.restart.addEventListener("click", () => {
  location.reload();
});

// ==========================================================
// 재질과 조명
// ==========================================================

function standardMaterial(
  color,
  roughness = 0.7,
  metalness = 0
) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness
  });
}

function glowMaterial(color, intensity = 2) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.3,
    metalness: 0.12
  });
}

scene.add(
  new THREE.HemisphereLight(
    0xa4d6ff,
    0x07130d,
    1.25
  )
);

const moon = new THREE.DirectionalLight(
  0x8fbfff,
  1.1
);

moon.position.set(-35, 45, 20);
scene.add(moon);

const mainLight = new THREE.DirectionalLight(
  0xffffff,
  3.3
);

mainLight.position.set(-16, 34, 18);
mainLight.castShadow = true;

mainLight.shadow.mapSize.set(2048, 2048);
mainLight.shadow.camera.left = -38;
mainLight.shadow.camera.right = 38;
mainLight.shadow.camera.top = 42;
mainLight.shadow.camera.bottom = -42;
mainLight.shadow.bias = -0.00025;

scene.add(mainLight);

// ==========================================================
// 경기장
// ==========================================================

const crowdGroups = [];
const ledBoards = [];

let crowdCount = 0;

function createPitchTexture() {
  const canvas = document.createElement("canvas");

  canvas.width = 900;
  canvas.height = 1500;

  const context = canvas.getContext("2d");

  for (let row = 0; row < 12; row++) {
    context.fillStyle =
      row % 2 === 0
        ? "#126f39"
        : "#198448";

    context.fillRect(
      0,
      row * 125,
      canvas.width,
      125
    );
  }

  context.strokeStyle = "#f5fff5";
  context.fillStyle = "#f5fff5";
  context.lineWidth = 7;

  const margin = 13;

  context.strokeRect(
    margin,
    margin,
    900 - margin * 2,
    1500 - margin * 2
  );

  context.beginPath();
  context.moveTo(margin, 750);
  context.lineTo(900 - margin, 750);
  context.stroke();

  context.beginPath();
  context.arc(450, 750, 135, 0, Math.PI * 2);
  context.stroke();

  context.beginPath();
  context.arc(450, 750, 8, 0, Math.PI * 2);
  context.fill();

  const penaltyWidth = 390;
  const penaltyDepth = 155;

  context.strokeRect(
    450 - penaltyWidth / 2,
    margin,
    penaltyWidth,
    penaltyDepth
  );

  context.strokeRect(
    450 - penaltyWidth / 2,
    1500 - margin - penaltyDepth,
    penaltyWidth,
    penaltyDepth
  );

  const goalAreaWidth = 210;
  const goalAreaDepth = 64;

  context.strokeRect(
    450 - goalAreaWidth / 2,
    margin,
    goalAreaWidth,
    goalAreaDepth
  );

  context.strokeRect(
    450 - goalAreaWidth / 2,
    1500 - margin - goalAreaDepth,
    goalAreaWidth,
    goalAreaDepth
  );

  context.beginPath();
  context.arc(450, 180, 7, 0, Math.PI * 2);
  context.fill();

  context.beginPath();
  context.arc(450, 1320, 7, 0, Math.PI * 2);
  context.fill();

  const texture = new THREE.CanvasTexture(canvas);

  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy =
    renderer.capabilities.getMaxAnisotropy();

  return texture;
}

function createGoal(side) {
  const group = new THREE.Group();
  const white = standardMaterial(0xffffff, 0.25, 0.15);

  const postGeometry = new THREE.CylinderGeometry(
    0.07,
    0.07,
    GOAL_HEIGHT,
    16
  );

  for (const x of [
    -GOAL_WIDTH / 2,
    GOAL_WIDTH / 2
  ]) {
    const post = new THREE.Mesh(postGeometry, white);

    post.position.set(x, GOAL_HEIGHT / 2, 0);
    post.castShadow = true;

    group.add(post);
  }

  const crossbar = new THREE.Mesh(
    new THREE.CylinderGeometry(
      0.07,
      0.07,
      GOAL_WIDTH,
      16
    ),
    white
  );

  crossbar.rotation.z = Math.PI / 2;
  crossbar.position.y = GOAL_HEIGHT;
  crossbar.castShadow = true;

  group.add(crossbar);

  const net = new THREE.Mesh(
    new THREE.BoxGeometry(
      GOAL_WIDTH,
      GOAL_HEIGHT,
      GOAL_DEPTH,
      18,
      7,
      6
    ),
    new THREE.MeshBasicMaterial({
      color: 0xeaf6ff,
      wireframe: true,
      transparent: true,
      opacity: 0.22
    })
  );

  net.position.set(
    0,
    GOAL_HEIGHT / 2,
    side * GOAL_DEPTH / 2
  );

  group.add(net);

  group.position.z = side * FIELD_LENGTH / 2;

  scene.add(group);
}

function randomCrowdColor() {
  const colors = [
    0x1976d2,
    0xe53935,
    0xffffff,
    0xffca28,
    0x43a047,
    0x8e24aa,
    0xf4511e,
    0x263238,
    0x00acc1,
    0xec407a
  ];

  return new THREE.Color(
    colors[Math.floor(Math.random() * colors.length)]
  );
}

function createCrowdLine({
  sideType,
  side,
  offset,
  height,
  tier,
  length
}) {
  const count = sideType === "long"
    ? 125 + tier * 24
    : 95 + tier * 20;

  const mesh = new THREE.InstancedMesh(
    new THREE.CapsuleGeometry(0.15, 0.4, 3, 5),

    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.9,
      vertexColors: true
    }),

    count
  );

  const dummy = new THREE.Object3D();

  for (let i = 0; i < count; i++) {
    if (sideType === "long") {
      dummy.position.set(
        side * (
          offset +
          THREE.MathUtils.randFloat(-0.65, 0.65)
        ),

        height + THREE.MathUtils.randFloat(0.58, 0.76),

        THREE.MathUtils.randFloat(-length, length)
      );

      dummy.rotation.y =
        side < 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      dummy.position.set(
        THREE.MathUtils.randFloat(-length, length),

        height + THREE.MathUtils.randFloat(0.58, 0.76),

        side * (
          offset +
          THREE.MathUtils.randFloat(-0.65, 0.65)
        )
      );

      dummy.rotation.y =
        side < 0 ? 0 : Math.PI;
    }

    dummy.scale.set(
      THREE.MathUtils.randFloat(0.48, 0.61),
      THREE.MathUtils.randFloat(0.86, 1.16),
      THREE.MathUtils.randFloat(0.48, 0.61)
    );

    dummy.updateMatrix();

    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, randomCrowdColor());
  }

  mesh.instanceMatrix.needsUpdate = true;

  if (mesh.instanceColor) {
    mesh.instanceColor.needsUpdate = true;
  }

  scene.add(mesh);

  crowdGroups.push({
    mesh,
    phase: Math.random() * Math.PI * 2,
    intensity: 0.02
  });

  crowdCount += count;
}

function createGrandstands() {
  const tierData = [
    {
      rows: 6,
      baseX: 18.2,
      baseZ: 29.2,
      y: 0.55,
      step: 1.18,
      color: 0x192631
    },
    {
      rows: 6,
      baseX: 25.6,
      baseZ: 36,
      y: 5.15,
      step: 1.25,
      color: 0x243542
    },
    {
      rows: 5,
      baseX: 33.2,
      baseZ: 43,
      y: 9.85,
      step: 1.32,
      color: 0x101c27
    }
  ];

  tierData.forEach((tier, tierIndex) => {
    const standMaterial = standardMaterial(
      tier.color,
      0.9
    );

    for (let row = 0; row < tier.rows; row++) {
      const y = tier.y + row * 0.73;
      const xOffset = tier.baseX + row * tier.step;
      const zOffset = tier.baseZ + row * tier.step;

      for (const side of [-1, 1]) {
        const longStand = new THREE.Mesh(
          new THREE.BoxGeometry(
            2.35,
            0.66,
            66 + tierIndex * 6
          ),
          standMaterial
        );

        longStand.position.set(side * xOffset, y, 0);
        longStand.castShadow = true;
        longStand.receiveShadow = true;

        scene.add(longStand);

        createCrowdLine({
          sideType: "long",
          side,
          offset: xOffset,
          height: y,
          tier: tierIndex,
          length: 30 + tierIndex * 2
        });

        const endStand = new THREE.Mesh(
          new THREE.BoxGeometry(
            43 + tierIndex * 8,
            0.66,
            2.35
          ),
          standMaterial
        );

        endStand.position.set(0, y, side * zOffset);
        endStand.castShadow = true;
        endStand.receiveShadow = true;

        scene.add(endStand);

        createCrowdLine({
          sideType: "end",
          side,
          offset: zOffset,
          height: y,
          tier: tierIndex,
          length: 20 + tierIndex * 3
        });
      }
    }
  });
}

function createRoof() {
  const roofMaterial = new THREE.MeshStandardMaterial({
    color: 0x172b3d,
    roughness: 0.3,
    metalness: 0.72,
    transparent: true,
    opacity: 0.96
  });

  for (const x of [-38, 38]) {
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(17, 0.55, 88),
      roofMaterial
    );

    roof.position.set(x, 18.4, 0);
    roof.rotation.z = x < 0 ? -0.09 : 0.09;
    roof.castShadow = true;

    scene.add(roof);
  }

  for (const z of [-48, 48]) {
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(65, 0.55, 17),
      roofMaterial
    );

    roof.position.set(0, 18.4, z);
    roof.rotation.x = z < 0 ? 0.09 : -0.09;
    roof.castShadow = true;

    scene.add(roof);
  }

  const stripMaterial = glowMaterial(0x29b6f6, 2.8);

  for (const x of [-30.2, 30.2]) {
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.18, 77),
      stripMaterial
    );

    strip.position.set(x, 18.2, 0);
    scene.add(strip);
  }

  for (const z of [-39.8, 39.8]) {
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(58, 0.18, 0.18),
      stripMaterial
    );

    strip.position.set(0, 18.2, z);
    scene.add(strip);
  }
}

function createArches() {
  const steel = standardMaterial(
    0x607d8b,
    0.25,
    0.88
  );

  for (const z of [-38, -19, 0, 19, 38]) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-45, 3, z),
      new THREE.Vector3(-27, 19, z),
      new THREE.Vector3(0, 24, z),
      new THREE.Vector3(27, 19, z),
      new THREE.Vector3(45, 3, z)
    ]);

    const arch = new THREE.Mesh(
      new THREE.TubeGeometry(
        curve,
        48,
        0.18,
        8,
        false
      ),
      steel
    );

    arch.castShadow = true;
    scene.add(arch);
  }
}

function createLEDAdvertising() {
  const colors = [
    0x0277bd,
    0x00acc1,
    0x1565c0,
    0x6a1b9a
  ];

  for (const x of [-15.75, 15.75]) {
    for (let z = -22; z <= 22; z += 4.6) {
      const color =
        colors[Math.floor(Math.random() * colors.length)];

      const board = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.78, 4.25),
        glowMaterial(color, 1.7)
      );

      board.position.set(x, 0.43, z);

      scene.add(board);
      ledBoards.push(board);
    }
  }

  for (const z of [-25.75, 25.75]) {
    for (let x = -12; x <= 12; x += 4.6) {
      const color =
        colors[Math.floor(Math.random() * colors.length)];

      const board = new THREE.Mesh(
        new THREE.BoxGeometry(4.25, 0.78, 0.16),
        glowMaterial(color, 1.7)
      );

      board.position.set(x, 0.43, z);

      scene.add(board);
      ledBoards.push(board);
    }
  }
}

function createFloodlights() {
  const poleMaterial = standardMaterial(
    0x546e7a,
    0.25,
    0.88
  );

  const positions = [
    [-28, -34],
    [28, -34],
    [-28, 34],
    [28, 34]
  ];

  for (const [x, z] of positions) {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(
        0.16,
        0.28,
        20,
        10
      ),
      poleMaterial
    );

    pole.position.set(x, 10, z);
    scene.add(pole);

    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(5.5, 2.6, 0.35),
      glowMaterial(0xf0faff, 5)
    );

    panel.position.set(x, 20.2, z);
    panel.lookAt(0, 1, 0);

    scene.add(panel);

    const spot = new THREE.SpotLight(
      0xeaf6ff,
      1000,
      100,
      Math.PI / 5,
      0.7,
      1.4
    );

    spot.position.set(x, 19.5, z);
    spot.target.position.set(0, 0, 0);

    scene.add(spot, spot.target);
  }
}

function createScoreboards() {
  for (const z of [-53, 53]) {
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(14, 6.5, 0.8),
      standardMaterial(0x020508, 0.25, 0.72)
    );

    frame.position.set(0, 15, z);
    scene.add(frame);

    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(12.5, 5),
      glowMaterial(0x075a87, 2.2)
    );

    screen.position.set(
      0,
      15,
      z + (z < 0 ? 0.42 : -0.42)
    );

    screen.rotation.y = z < 0 ? Math.PI : 0;

    scene.add(screen);
  }
}

function createStadium() {
  const outside = new THREE.Mesh(
    new THREE.CircleGeometry(110, 128),
    standardMaterial(0x040a0d, 1)
  );

  outside.rotation.x = -Math.PI / 2;
  outside.position.y = -0.13;
  outside.receiveShadow = true;

  scene.add(outside);

  const platform = new THREE.Mesh(
    new THREE.BoxGeometry(38, 0.25, 58),
    standardMaterial(0x132a20, 0.95)
  );

  platform.position.y = -0.14;
  platform.receiveShadow = true;

  scene.add(platform);

  const pitch = new THREE.Mesh(
    new THREE.PlaneGeometry(
      FIELD_WIDTH,
      FIELD_LENGTH
    ),

    new THREE.MeshStandardMaterial({
      map: createPitchTexture(),
      roughness: 0.96
    })
  );

  pitch.rotation.x = -Math.PI / 2;
  pitch.position.y = 0.006;
  pitch.receiveShadow = true;

  scene.add(pitch);

  createGoal(-1);
  createGoal(1);

  createLEDAdvertising();
  createGrandstands();
  createRoof();
  createArches();
  createFloodlights();
  createScoreboards();
}

// ==========================================================
// 경기장 물리
// ==========================================================

function addCuboid(
  halfWidth,
  halfHeight,
  halfDepth,
  x,
  y,
  z,
  friction = 0.7,
  restitution = 0.25
) {
  world.createCollider(
    RAPIER.ColliderDesc
      .cuboid(halfWidth, halfHeight, halfDepth)
      .setTranslation(x, y, z)
      .setFriction(friction)
      .setRestitution(restitution)
  );
}

function addCylinder(
  halfHeight,
  radius,
  x,
  y,
  z
) {
  world.createCollider(
    RAPIER.ColliderDesc
      .cylinder(halfHeight, radius)
      .setTranslation(x, y, z)
      .setFriction(0.35)
      .setRestitution(0.65)
  );
}

function createGoalPhysics(side) {
  const goalZ = side * FIELD_LENGTH / 2;

  const backZ =
    side * (FIELD_LENGTH / 2 + GOAL_DEPTH);

  for (const x of [
    -GOAL_WIDTH / 2,
    GOAL_WIDTH / 2
  ]) {
    addCylinder(
      GOAL_HEIGHT / 2,
      0.07,
      x,
      GOAL_HEIGHT / 2,
      goalZ
    );
  }

  addCuboid(
    GOAL_WIDTH / 2,
    0.07,
    0.07,
    0,
    GOAL_HEIGHT,
    goalZ,
    0.35,
    0.65
  );

  addCuboid(
    GOAL_WIDTH / 2,
    GOAL_HEIGHT / 2,
    0.035,
    0,
    GOAL_HEIGHT / 2,
    backZ,
    0.25,
    0.08
  );

  for (const x of [
    -GOAL_WIDTH / 2,
    GOAL_WIDTH / 2
  ]) {
    addCuboid(
      0.035,
      GOAL_HEIGHT / 2,
      GOAL_DEPTH / 2,
      x,
      GOAL_HEIGHT / 2,
      goalZ + side * GOAL_DEPTH / 2,
      0.25,
      0.08
    );
  }
}

function createFieldPhysics() {
  addCuboid(
    18,
    0.1,
    29,
    0,
    -0.1,
    0,
    0.78,
    0.36
  );

  addCuboid(0.08, 2.5, 25, -15, 2.5, 0);
  addCuboid(0.08, 2.5, 25, 15, 2.5, 0);

  const halfSegment =
    (FIELD_WIDTH - GOAL_WIDTH) / 4;

  const centerX =
    (FIELD_WIDTH + GOAL_WIDTH) / 4;

  for (const z of [-25, 25]) {
    addCuboid(
      halfSegment,
      3,
      0.08,
      -centerX,
      3,
      z
    );

    addCuboid(
      halfSegment,
      3,
      0.08,
      centerX,
      3,
      z
    );
  }

  createGoalPhysics(-1);
  createGoalPhysics(1);
}

// ==========================================================
// 선수 모델
// ==========================================================

function createHuman(
  shirtColor,
  shortsColor,
  goalkeeper = false
) {
  const human = new THREE.Group();

  const shirt = standardMaterial(shirtColor, 0.62);
  const shorts = standardMaterial(shortsColor, 0.68);
  const skin = standardMaterial(0xd79a72, 0.72);
  const shoes = standardMaterial(0x101010, 0.45);

  const torso = new THREE.Mesh(
    new THREE.CapsuleGeometry(
      goalkeeper ? 0.53 : 0.48,
      goalkeeper ? 0.78 : 0.72,
      6,
      12
    ),
    shirt
  );

  torso.position.y = 2.25;
  torso.scale.z = 0.66;
  torso.castShadow = true;

  human.add(torso);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.34, 18, 14),
    skin
  );

  head.position.y = 3.38;
  head.castShadow = true;

  human.add(head);

  const pants = new THREE.Mesh(
    new THREE.BoxGeometry(0.94, 0.49, 0.58),
    shorts
  );

  pants.position.y = 1.55;
  pants.castShadow = true;

  human.add(pants);

  function createLimb(x, y, isLeg) {
    const pivot = new THREE.Group();

    pivot.position.set(x, y, 0);

    const limb = new THREE.Mesh(
      new THREE.CapsuleGeometry(
        isLeg ? 0.16 : goalkeeper ? 0.14 : 0.12,
        isLeg ? 0.66 : 0.5,
        4,
        8
      ),
      isLeg ? shorts : shirt
    );

    limb.position.y = isLeg ? -0.48 : -0.38;
    limb.castShadow = true;

    pivot.add(limb);

    if (isLeg) {
      const shoe = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.18, 0.52),
        shoes
      );

      shoe.position.set(0, -1.02, 0.12);
      pivot.add(shoe);
    } else if (goalkeeper) {
      const glove = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, 0.2, 0.18),
        standardMaterial(0xffffff, 0.5)
      );

      glove.position.y = -0.83;
      pivot.add(glove);
    }

    return pivot;
  }

  const leftLeg = createLimb(-0.25, 1.5, true);
  const rightLeg = createLimb(0.25, 1.5, true);

  const leftArm = createLimb(-0.69, 2.75, false);
  const rightArm = createLimb(0.69, 2.75, false);

  human.add(leftLeg, rightLeg, leftArm, rightArm);

  human.scale.setScalar(goalkeeper ? 0.53 : 0.5);

  human.userData = {
    leftLeg,
    rightLeg,
    leftArm,
    rightArm,

    velocity: new THREE.Vector3(),
    moveVelocity: new THREE.Vector3(),
    direction: new THREE.Vector3(0, 0, -1),

    stamina: 100,
    walkTime: 0,

    kickAnimation: 0,
    tackleAnimation: 0,

    diveAnimation: 0,
    diveDirection: 0,

    tackleCooldown: 0,
    goalkeeper
  };

  return human;
}

function animateHuman(human, delta) {
  const data = human.userData;
  const speed = data.velocity.length();

  data.walkTime +=
    delta * Math.max(speed, 1) * 1.7;

  const swing =
    speed > 0.2
      ? Math.sin(data.walkTime) *
        Math.min(0.75, speed * 0.1)
      : 0;

  data.leftLeg.rotation.x = swing;
  data.rightLeg.rotation.x = -swing;

  data.leftArm.rotation.x = -swing * 0.72;
  data.rightArm.rotation.x = swing * 0.72;

  if (data.goalkeeper && data.diveAnimation <= 0) {
    data.leftArm.rotation.z = -0.22;
    data.rightArm.rotation.z = 0.22;
  }

  if (data.kickAnimation > 0) {
    data.kickAnimation = Math.max(
      0,
      data.kickAnimation - delta
    );

    const progress =
      1 - data.kickAnimation / 0.34;

    data.rightLeg.rotation.x =
      -Math.sin(progress * Math.PI) * 1.4;
  }

  if (data.tackleAnimation > 0) {
    data.tackleAnimation = Math.max(
      0,
      data.tackleAnimation - delta
    );

    human.rotation.z =
      Math.sin(
        (1 - data.tackleAnimation / 0.4) *
        Math.PI
      ) * 0.24;
  } else if (data.diveAnimation <= 0) {
    human.rotation.z *= 0.82;
  }

  if (data.diveAnimation > 0) {
    data.diveAnimation = Math.max(
      0,
      data.diveAnimation - delta
    );

    const progress =
      1 - data.diveAnimation / 0.62;

    human.rotation.z =
      -data.diveDirection *
      Math.sin(progress * Math.PI) *
      1.15;

    data.leftArm.rotation.z =
      -data.diveDirection * 1.45;

    data.rightArm.rotation.z =
      -data.diveDirection * 1.45;
  }
}

// ==========================================================
// 월드 개체
// ==========================================================

createStadium();
createFieldPhysics();

UI.crowdCount.textContent =
  crowdCount.toLocaleString();

const player = createHuman(0x1976d2, 0xffffff);
const cpu = createHuman(0xe53935, 0x151515);

const cpuKeeper = createHuman(
  0xffd600,
  0x111111,
  true
);

const playerKeeper = createHuman(
  0x00c853,
  0x102018,
  true
);

scene.add(player, cpu, cpuKeeper, playerKeeper);

function createKinematicBody(x, z, goalkeeper = false) {
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc
      .kinematicPositionBased()
      .setTranslation(x, BODY_Y, z)
  );

  world.createCollider(
    RAPIER.ColliderDesc
      .capsule(
        goalkeeper ? 0.6 : 0.54,
        goalkeeper ? 0.42 : 0.34
      )
      .setFriction(0.55)
      .setRestitution(goalkeeper ? 0.08 : 0.03),
    body
  );

  return body;
}

const playerBody = createKinematicBody(0, 13);
const cpuBody = createKinematicBody(0, -13);

const cpuKeeperBody = createKinematicBody(
  0,
  -23.1,
  true
);

const playerKeeperBody = createKinematicBody(
  0,
  23.1,
  true
);

// ==========================================================
// 공
// ==========================================================

const ball = new THREE.Mesh(
  new THREE.SphereGeometry(BALL_RADIUS, 32, 24),

  new THREE.MeshStandardMaterial({
    color: 0xf7f7f7,
    roughness: 0.42
  })
);

ball.castShadow = true;
ball.receiveShadow = true;

scene.add(ball);

const patches = new THREE.Group();

for (let i = 0; i < 8; i++) {
  const patch = new THREE.Mesh(
    new THREE.CircleGeometry(0.025, 5),
    new THREE.MeshBasicMaterial({
      color: 0x111111,
      side: THREE.DoubleSide
    })
  );

  const phi = Math.acos(-1 + (2 * i) / 8);
  const theta = Math.sqrt(8 * Math.PI) * phi;

  patch.position.setFromSphericalCoords(
    BALL_RADIUS + 0.001,
    phi,
    theta
  );

  patch.lookAt(0, 0, 0);
  patch.rotateY(Math.PI);

  patches.add(patch);
}

ball.add(patches);

const ballBody = world.createRigidBody(
  RAPIER.RigidBodyDesc
    .dynamic()
    .setTranslation(0, BALL_RADIUS + 0.02, 0)
    .setLinearDamping(0.025)
    .setAngularDamping(0.035)
    .setCcdEnabled(true)
    .setCanSleep(true)
);

world.createCollider(
  RAPIER.ColliderDesc
    .ball(BALL_RADIUS)
    .setMass(BALL_MASS)
    .setFriction(0.7)
    .setRestitution(0.46),
  ballBody
);

const possessionRing = new THREE.Mesh(
  new THREE.RingGeometry(0.43, 0.51, 40),

  new THREE.MeshBasicMaterial({
    color: 0x42a5f5,
    transparent: true,
    opacity: 0.82,
    side: THREE.DoubleSide
  })
);

possessionRing.rotation.x = -Math.PI / 2;
possessionRing.visible = false;

scene.add(possessionRing);

// ==========================================================
// 입력
// ==========================================================

const keys = new Set();

let shootCharge = 0;
let shootReleased = false;

window.addEventListener("keydown", event => {
  const controlled = [
    "KeyW",
    "KeyA",
    "KeyS",
    "KeyD",
    "KeyM",
    "KeyJ",
    "Space"
  ];

  if (controlled.includes(event.code)) {
    event.preventDefault();
  }

  if (
    event.code === "KeyJ" &&
    !keys.has("KeyJ")
  ) {
    startPlayerTackle();
  }

  keys.add(event.code);
});

window.addEventListener("keyup", event => {
  keys.delete(event.code);

  if (event.code === "Space") {
    shootReleased = true;
  }
});

window.addEventListener("blur", () => {
  keys.clear();
  shootCharge = 0;
  shootReleased = false;
});

// ==========================================================
// 게임 상태
// ==========================================================

const DIFFICULTY = {
  easy: {
    speed: 4.5,
    sprint: 5.7,
    acceleration: 7,
    reaction: 0.34,
    accuracy: 1.8,
    tackleChance: 0.07,
    keeperSpeed: 5.2,
    keeperReaction: 0.26,
    keeperReach: 1.05
  },

  normal: {
    speed: 5.1,
    sprint: 6.5,
    acceleration: 9,
    reaction: 0.22,
    accuracy: 1.05,
    tackleChance: 0.12,
    keeperSpeed: 6.2,
    keeperReaction: 0.18,
    keeperReach: 1.2
  },

  hard: {
    speed: 5.7,
    sprint: 7.2,
    acceleration: 12,
    reaction: 0.14,
    accuracy: 0.55,
    tackleChance: 0.19,
    keeperSpeed: 7.2,
    keeperReaction: 0.11,
    keeperReach: 1.35
  }
};

let playerScore = 0;
let cpuScore = 0;

let remainingTime = MATCH_TIME;
let gameRunning = true;
let goalPause = false;

let accumulator = 0;
let previousBallZ = 0;
let messageTimeout = null;

const possession = {
  owner: null,
  lockTimer: 0,
  touchPhase: 0
};

const cpuAI = {
  state: "defend",
  label: "수비 위치 유지",

  target: new THREE.Vector3(),
  velocity: new THREE.Vector3(),

  decisionTimer: 0,
  actionTimer: 0,

  shotCooldown: 0.8,
  tackleCooldown: 1,
  stunTimer: 0,

  lane: 0,
  stamina: 100
};

function createKeeperAI(side, body, human) {
  return {
    side,
    body,
    human,

    label: "위치 선정",

    velocity: new THREE.Vector3(),

    targetX: 0,
    targetZ: side * 23.1,

    reactionTimer: 0,
    catchCooldown: 0,

    diveTimer: 0,

    holding: false,
    holdTimer: 0
  };
}

const cpuKeeperAI = createKeeperAI(
  -1,
  cpuKeeperBody,
  cpuKeeper
);

const playerKeeperAI = createKeeperAI(
  1,
  playerKeeperBody,
  playerKeeper
);

// ==========================================================
// 유틸리티
// ==========================================================

function bodyPosition(body) {
  const position = body.translation();

  return new THREE.Vector3(
    position.x,
    position.y,
    position.z
  );
}

function horizontalDistance(a, b) {
  return Math.hypot(
    a.x - b.x,
    a.z - b.z
  );
}

function lerpAngle(current, target, amount) {
  let difference =
    (target - current + Math.PI) %
      (Math.PI * 2) -
    Math.PI;

  if (difference < -Math.PI) {
    difference += Math.PI * 2;
  }

  return current + difference * Math.min(1, amount);
}

function rotateToward(human, direction, delta, speed) {
  if (direction.lengthSq() < 0.001) {
    return;
  }

  human.rotation.y = lerpAngle(
    human.rotation.y,
    Math.atan2(direction.x, direction.z),
    delta * speed
  );
}

function moveKinematic(
  body,
  velocity,
  delta,
  bounds = null
) {
  const position = body.translation();

  const minX = bounds?.minX ?? -14.55;
  const maxX = bounds?.maxX ?? 14.55;

  const minZ = bounds?.minZ ?? -24.5;
  const maxZ = bounds?.maxZ ?? 24.5;

  const x = THREE.MathUtils.clamp(
    position.x + velocity.x * delta,
    minX,
    maxX
  );

  const z = THREE.MathUtils.clamp(
    position.z + velocity.z * delta,
    minZ,
    maxZ
  );

  body.setNextKinematicTranslation({
    x,
    y: BODY_Y,
    z
  });
}

function resetBody(body, x, z) {
  body.setTranslation(
    {
      x,
      y: BODY_Y,
      z
    },
    true
  );

  body.setNextKinematicTranslation({
    x,
    y: BODY_Y,
    z
  });
}

// ==========================================================
// 플레이어
// ==========================================================

function updatePlayer(delta) {
  const movement = new THREE.Vector3();

  if (keys.has("KeyW")) movement.z -= 1;
  if (keys.has("KeyS")) movement.z += 1;
  if (keys.has("KeyA")) movement.x -= 1;
  if (keys.has("KeyD")) movement.x += 1;

  const data = player.userData;

  const dashing =
    keys.has("KeyM") &&
    data.stamina > 0 &&
    movement.lengthSq() > 0;

  let speed = dashing ? DASH_SPEED : PLAYER_SPEED;

  if (possession.owner === "player" && dashing) {
    speed *= 0.95;
  }

  if (dashing) {
    data.stamina = Math.max(
      0,
      data.stamina - 24 * delta
    );
  } else {
    data.stamina = Math.min(
      100,
      data.stamina + 13 * delta
    );
  }

  if (data.tackleAnimation > 0) {
    movement.copy(data.direction);
    speed = 10.7;
  }

  if (movement.lengthSq() > 0) {
    movement.normalize();

    data.direction
      .lerp(movement, Math.min(1, delta * 15))
      .normalize();

    data.moveVelocity.copy(
      movement.multiplyScalar(speed)
    );

    data.velocity.copy(data.moveVelocity);

    rotateToward(
      player,
      data.direction,
      delta,
      15
    );
  } else {
    data.moveVelocity.set(0, 0, 0);

    data.velocity.multiplyScalar(
      Math.pow(0.002, delta)
    );
  }

  moveKinematic(
    playerBody,
    data.moveVelocity,
    delta
  );

  data.tackleCooldown = Math.max(
    0,
    data.tackleCooldown - delta
  );
}

// ==========================================================
// 드리블
// ==========================================================

function releasePossession(lock = 0.2) {
  possession.owner = null;
  possession.lockTimer = lock;
}

function acquirePossession(owner) {
  possession.owner = owner;

  possessionRing.material.color.set(
    owner === "player"
      ? 0x42a5f5
      : 0xff5252
  );
}

function updatePossession(delta) {
  possession.lockTimer = Math.max(
    0,
    possession.lockTimer - delta
  );

  possession.touchPhase += delta * 8.5;

  if (
    cpuKeeperAI.holding ||
    playerKeeperAI.holding
  ) {
    return;
  }

  const ballPosition = bodyPosition(ballBody);
  const playerPosition = bodyPosition(playerBody);
  const cpuPosition = bodyPosition(cpuBody);

  if (possession.owner) {
    const ownerPosition =
      possession.owner === "player"
        ? playerPosition
        : cpuPosition;

    const distance = horizontalDistance(
      ownerPosition,
      ballPosition
    );

    if (
      distance > 1.7 ||
      ballPosition.y > 0.92
    ) {
      releasePossession(0.14);
      return;
    }

    applyDribbleControl(
      possession.owner,
      delta
    );

    return;
  }

  if (
    possession.lockTimer > 0 ||
    ballPosition.y > 0.52
  ) {
    return;
  }

  const velocity = ballBody.linvel();

  if (Math.hypot(velocity.x, velocity.z) > 10.5) {
    return;
  }

  const playerDistance = horizontalDistance(
    playerPosition,
    ballPosition
  );

  const cpuDistance = horizontalDistance(
    cpuPosition,
    ballPosition
  );

  if (
    playerDistance < 0.86 &&
    playerDistance < cpuDistance + 0.1
  ) {
    acquirePossession("player");
  } else if (cpuDistance < 0.86) {
    acquirePossession("cpu");
  }
}

function applyDribbleControl(owner, delta) {
  const isPlayer = owner === "player";

  const actorBody = isPlayer ? playerBody : cpuBody;
  const actor = isPlayer ? player : cpu;

  const actorVelocity = isPlayer
    ? player.userData.moveVelocity
    : cpuAI.velocity;

  const actorPosition = bodyPosition(actorBody);
  const actorSpeed = actorVelocity.length();

  const direction = actor.userData.direction
    .clone()
    .setY(0);

  if (direction.lengthSq() < 0.001) {
    direction.set(0, 0, isPlayer ? -1 : 1);
  }

  direction.normalize();

  const side = new THREE.Vector3(
    direction.z,
    0,
    -direction.x
  );

  const forwardDistance =
    0.61 +
    THREE.MathUtils.clamp(
      actorSpeed * 0.022,
      0,
      0.17
    );

  const footTouch =
    actorSpeed > 0.8
      ? Math.sin(possession.touchPhase) * 0.065
      : 0;

  const target = actorPosition
    .clone()
    .addScaledVector(direction, forwardDistance)
    .addScaledVector(side, footTouch);

  target.y = BALL_RADIUS + 0.02;

  const ballPosition = bodyPosition(ballBody);
  const velocity = ballBody.linvel();

  const currentVelocity = new THREE.Vector3(
    velocity.x,
    velocity.y,
    velocity.z
  );

  const error = target.sub(ballPosition);

  const desiredVelocity = new THREE.Vector3(
    error.x * 19 + actorVelocity.x * 0.96,

    THREE.MathUtils.clamp(
      error.y * 12,
      -1.5,
      1.8
    ),

    error.z * 19 + actorVelocity.z * 0.96
  );

  desiredVelocity.clampLength(
    0,
    Math.max(9, actorSpeed + 3.7)
  );

  const change = desiredVelocity
    .sub(currentVelocity)
    .clampLength(0, 42 * delta);

  ballBody.applyImpulse(
    {
      x: change.x * BALL_MASS,
      y: change.y * BALL_MASS,
      z: change.z * BALL_MASS
    },
    true
  );
}

// ==========================================================
// CPU AI
// ==========================================================

function setCpuState(state, label) {
  cpuAI.state = state;
  cpuAI.label = label;
}

function planCpu() {
  const settings = DIFFICULTY[difficulty];

  const cpuPosition = bodyPosition(cpuBody);
  const playerPosition = bodyPosition(playerBody);
  const ballPosition = bodyPosition(ballBody);

  if (possession.owner === "cpu") {
    if (
      ballPosition.z > 11 &&
      cpuAI.shotCooldown <= 0
    ) {
      setCpuState("shoot", "슛 준비");

      cpuAI.actionTimer =
        difficulty === "easy"
          ? 0.65
          : difficulty === "normal"
            ? 0.5
            : 0.38;

      return;
    }

    if (
      Math.abs(cpuAI.lane) < 0.1 ||
      Math.random() < 0.16
    ) {
      cpuAI.lane =
        (playerPosition.x > cpuPosition.x ? -1 : 1) *
        THREE.MathUtils.randFloat(3, 7);
    }

    cpuAI.target.set(
      THREE.MathUtils.lerp(
        cpuPosition.x,
        cpuAI.lane,
        0.62
      ),
      0,
      Math.min(21.5, cpuPosition.z + 7)
    );

    setCpuState("dribble", "공격 드리블");
    return;
  }

  if (possession.owner === "player") {
    const distance = horizontalDistance(
      playerPosition,
      cpuPosition
    );

    if (
      distance < 1.3 &&
      cpuAI.tackleCooldown <= 0 &&
      Math.random() < settings.tackleChance
    ) {
      setCpuState("tackle", "태클 시도");

      cpuAI.actionTimer = 0.32;
      cpuAI.tackleCooldown = 2.8;

      return;
    }

    const ownGoal = new THREE.Vector3(0, 0, -24);

    const direction = playerPosition
      .clone()
      .sub(ownGoal)
      .setY(0)
      .normalize();

    cpuAI.target.copy(
      ownGoal.addScaledVector(direction, 7.8)
    );

    cpuAI.target.x = THREE.MathUtils.lerp(
      cpuAI.target.x,
      playerPosition.x,
      0.58
    );

    setCpuState("block", "진로 차단");
    return;
  }

  const cpuBallDistance = horizontalDistance(
    cpuPosition,
    ballPosition
  );

  const playerBallDistance = horizontalDistance(
    playerPosition,
    ballPosition
  );

  if (
    ballPosition.z < -5 ||
    cpuBallDistance < playerBallDistance - 0.25
  ) {
    cpuAI.target.set(
      ballPosition.x,
      0,
      ballPosition.z - 0.64
    );

    setCpuState("approach", "공 접근");
  } else {
    cpuAI.target.set(
      THREE.MathUtils.clamp(
        ballPosition.x * 0.42,
        -5.5,
        5.5
      ),
      0,
      THREE.MathUtils.clamp(
        ballPosition.z - 9,
        -17,
        -7
      )
    );

    setCpuState("defend", "수비 위치 유지");
  }
}

function updateCpu(delta) {
  const settings = DIFFICULTY[difficulty];

  cpuAI.decisionTimer -= delta;
  cpuAI.actionTimer -= delta;

  cpuAI.shotCooldown -= delta;
  cpuAI.tackleCooldown -= delta;
  cpuAI.stunTimer -= delta;

  if (cpuAI.stunTimer > 0) {
    setCpuState("stunned", "태클에 걸림");

    cpuAI.velocity.multiplyScalar(
      Math.pow(0.01, delta)
    );

    cpu.userData.velocity.copy(cpuAI.velocity);

    moveKinematic(cpuBody, cpuAI.velocity, delta);

    return;
  }

  if (cpuAI.state === "shoot") {
    cpuAI.velocity.multiplyScalar(
      Math.pow(0.02, delta)
    );

    if (cpuAI.actionTimer <= 0) {
      if (possession.owner === "cpu") {
        cpuShoot();
      }

      cpuAI.shotCooldown = 1.7;
      cpuAI.decisionTimer = 0;

      setCpuState("recover", "공격 복귀");
    }

    cpu.userData.velocity.copy(cpuAI.velocity);

    moveKinematic(cpuBody, cpuAI.velocity, delta);

    return;
  }

  if (cpuAI.state === "tackle") {
    const direction = bodyPosition(ballBody)
      .sub(bodyPosition(cpuBody))
      .setY(0)
      .normalize();

    cpuAI.velocity.copy(
      direction.multiplyScalar(7.7)
    );

    cpu.userData.tackleAnimation = 0.4;
    cpu.userData.velocity.copy(cpuAI.velocity);

    moveKinematic(cpuBody, cpuAI.velocity, delta);

    if (cpuAI.actionTimer <= 0) {
      const distance = horizontalDistance(
        bodyPosition(cpuBody),
        bodyPosition(ballBody)
      );

      if (distance < 1.08) {
        releasePossession(0.22);

        ballBody.applyImpulse(
          {
            x: direction.x * 1.3,
            y: 0.3,
            z: direction.z * 1.3
          },
          true
        );
      }

      cpuAI.decisionTimer = 0;
      setCpuState("recover", "태클 후 복귀");
    }

    return;
  }

  if (cpuAI.decisionTimer <= 0) {
    planCpu();

    cpuAI.decisionTimer =
      settings.reaction *
      THREE.MathUtils.randFloat(0.85, 1.2);
  }

  const cpuPosition = bodyPosition(cpuBody);

  const toTarget = cpuAI.target
    .clone()
    .sub(cpuPosition)
    .setY(0);

  const distance = toTarget.length();

  let speed = settings.speed;

  if (
    cpuAI.state === "approach" &&
    bodyPosition(ballBody).z < -8 &&
    cpuAI.stamina > 0
  ) {
    speed = settings.sprint;

    cpuAI.stamina = Math.max(
      0,
      cpuAI.stamina - 17 * delta
    );
  } else {
    cpuAI.stamina = Math.min(
      100,
      cpuAI.stamina + 9 * delta
    );
  }

  if (distance < 1.2) {
    speed *= THREE.MathUtils.clamp(
      distance / 1.2,
      0,
      1
    );
  }

  const targetVelocity = new THREE.Vector3();

  if (distance > 0.05) {
    targetVelocity.copy(
      toTarget.normalize().multiplyScalar(speed)
    );
  }

  const difference = targetVelocity
    .clone()
    .sub(cpuAI.velocity)
    .clampLength(
      0,
      settings.acceleration * delta
    );

  cpuAI.velocity.add(difference);
  cpu.userData.velocity.copy(cpuAI.velocity);

  if (cpuAI.velocity.lengthSq() > 0.05) {
    cpu.userData.direction
      .lerp(
        cpuAI.velocity.clone().normalize(),
        Math.min(1, delta * 7)
      )
      .normalize();

    rotateToward(
      cpu,
      cpu.userData.direction,
      delta,
      9
    );
  }

  moveKinematic(cpuBody, cpuAI.velocity, delta);
}

// ==========================================================
// 골키퍼 AI
// ==========================================================

function updateKeeper(keeperAI, delta) {
  const settings = DIFFICULTY[difficulty];

  keeperAI.reactionTimer -= delta;
  keeperAI.catchCooldown -= delta;
  keeperAI.diveTimer -= delta;

  const side = keeperAI.side;
  const keeperPosition = bodyPosition(keeperAI.body);
  const ballPosition = bodyPosition(ballBody);

  const rawVelocity = ballBody.linvel();

  const ballVelocity = new THREE.Vector3(
    rawVelocity.x,
    rawVelocity.y,
    rawVelocity.z
  );

  if (keeperAI.holding) {
    keeperAI.label = "공 캐칭";
    keeperAI.holdTimer -= delta;

    keeperAI.velocity.set(0, 0, 0);
    keeperAI.human.userData.velocity.set(0, 0, 0);

    const facing = new THREE.Vector3(0, 0, -side);

    const heldPosition = keeperPosition
      .clone()
      .addScaledVector(facing, 0.48);

    heldPosition.y = 0.72;

    ballBody.setTranslation(
      {
        x: heldPosition.x,
        y: heldPosition.y,
        z: heldPosition.z
      },
      true
    );

    ballBody.setLinvel(
      { x: 0, y: 0, z: 0 },
      true
    );

    ballBody.setAngvel(
      { x: 0, y: 0, z: 0 },
      true
    );

    if (keeperAI.holdTimer <= 0) {
      keeperClear(keeperAI);
    }

    return;
  }

  const movingTowardGoal =
    side < 0
      ? ballVelocity.z < -1
      : ballVelocity.z > 1;

  const inKeeperZone =
    side < 0
      ? ballPosition.z < -17
      : ballPosition.z > 17;

  const distanceToBall = horizontalDistance(
    keeperPosition,
    ballPosition
  );

  if (
    inKeeperZone &&
    distanceToBall < settings.keeperReach &&
    ballPosition.y < 1.75 &&
    keeperAI.catchCooldown <= 0
  ) {
    releasePossession(0.6);

    if (ballVelocity.length() < 17) {
      keeperCatch(keeperAI);
    } else {
      keeperParry(keeperAI);
    }

    return;
  }

  if (keeperAI.reactionTimer <= 0) {
    keeperAI.reactionTimer =
      settings.keeperReaction;

    const goalZ = side * 25;

    let predictedX = ballPosition.x;

    if (
      movingTowardGoal &&
      Math.abs(ballVelocity.z) > 0.2
    ) {
      const time =
        (goalZ - ballPosition.z) /
        ballVelocity.z;

      if (time > 0 && time < 3) {
        predictedX =
          ballPosition.x +
          ballVelocity.x * time;
      }
    }

    predictedX = THREE.MathUtils.clamp(
      predictedX,
      -GOAL_WIDTH / 2 + 0.45,
      GOAL_WIDTH / 2 - 0.45
    );

    if (!inKeeperZone) {
      predictedX *= 0.58;
    }

    keeperAI.targetX = predictedX;

    const approach = THREE.MathUtils.clamp(
      (22 - Math.abs(ballPosition.z)) * 0.08,
      0,
      1.45
    );

    keeperAI.targetZ =
      side * (23.15 - approach);

    const dangerousShot =
      movingTowardGoal &&
      Math.abs(ballVelocity.z) > 8 &&
      inKeeperZone;

    if (
      dangerousShot &&
      Math.abs(predictedX - keeperPosition.x) > 0.75 &&
      keeperAI.diveTimer <= 0
    ) {
      keeperAI.label = "다이빙 선방";
      keeperAI.diveTimer = 0.62;

      keeperAI.human.userData.diveAnimation = 0.62;

      keeperAI.human.userData.diveDirection =
        Math.sign(predictedX - keeperPosition.x) || 1;
    } else {
      keeperAI.label =
        inKeeperZone
          ? "공 추적"
          : "위치 선정";
    }
  }

  const target = new THREE.Vector3(
    keeperAI.targetX,
    0,
    keeperAI.targetZ
  );

  const direction = target
    .sub(keeperPosition)
    .setY(0);

  const distance = direction.length();

  const speed =
    settings.keeperSpeed *
    (keeperAI.diveTimer > 0 ? 1.65 : 1);

  const targetVelocity = new THREE.Vector3();

  if (distance > 0.05) {
    targetVelocity.copy(
      direction
        .normalize()
        .multiplyScalar(
          Math.min(speed, distance * 8)
        )
    );
  }

  keeperAI.velocity.lerp(
    targetVelocity,
    Math.min(1, delta * 14)
  );

  keeperAI.human.userData.velocity.copy(
    keeperAI.velocity
  );

  const faceBall = ballPosition
    .clone()
    .sub(keeperPosition)
    .setY(0);

  if (faceBall.lengthSq() > 0) {
    keeperAI.human.userData.direction
      .lerp(
        faceBall.normalize(),
        Math.min(1, delta * 8)
      )
      .normalize();

    rotateToward(
      keeperAI.human,
      keeperAI.human.userData.direction,
      delta,
      11
    );
  }

  const bounds =
    side < 0
      ? {
          minX: -GOAL_WIDTH / 2 + 0.3,
          maxX: GOAL_WIDTH / 2 - 0.3,
          minZ: -24.25,
          maxZ: -20.6
        }
      : {
          minX: -GOAL_WIDTH / 2 + 0.3,
          maxX: GOAL_WIDTH / 2 - 0.3,
          minZ: 20.6,
          maxZ: 24.25
        };

  moveKinematic(
    keeperAI.body,
    keeperAI.velocity,
    delta,
    bounds
  );
}

function keeperCatch(keeperAI) {
  keeperAI.holding = true;

  keeperAI.holdTimer =
    THREE.MathUtils.randFloat(0.75, 1.15);

  keeperAI.catchCooldown = 1.5;
  keeperAI.label = "공 캐칭";

  keeperAI.velocity.set(0, 0, 0);

  releasePossession(1);
}

function keeperParry(keeperAI) {
  const ballPosition = bodyPosition(ballBody);

  const outward = new THREE.Vector3(
    ballPosition.x >= 0 ? 0.65 : -0.65,
    0.18,
    -keeperAI.side
  ).normalize();

  ballBody.setLinvel(
    {
      x: outward.x * 9,
      y: 3.2,
      z: outward.z * 9
    },
    true
  );

  keeperAI.catchCooldown = 0.8;
  keeperAI.diveTimer = 0.62;
  keeperAI.label = "펀칭 선방";

  keeperAI.human.userData.diveAnimation = 0.62;

  keeperAI.human.userData.diveDirection =
    ballPosition.x >=
    bodyPosition(keeperAI.body).x
      ? 1
      : -1;
}

function keeperClear(keeperAI) {
  keeperAI.holding = false;
  keeperAI.catchCooldown = 1;
  keeperAI.label = "공 걷어내기";

  const position = bodyPosition(keeperAI.body);

  ballBody.setTranslation(
    {
      x: position.x,
      y: BALL_RADIUS + 0.04,
      z: position.z - keeperAI.side * 0.75
    },
    true
  );

  const direction = new THREE.Vector3(
    THREE.MathUtils.randFloat(-0.22, 0.22),
    0.2,
    -keeperAI.side
  ).normalize();

  kickBall(direction, 18);

  keeperAI.human.userData.kickAnimation = 0.34;
}

// ==========================================================
// 슛과 태클
// ==========================================================

function kickBall(direction, speed, sideSpin = 0) {
  ballBody.wakeUp();

  ballBody.setLinvel(
    { x: 0, y: 0, z: 0 },
    true
  );

  const impulse = BALL_MASS * speed;

  ballBody.applyImpulse(
    {
      x: direction.x * impulse,
      y: direction.y * impulse,
      z: direction.z * impulse
    },
    true
  );

  ballBody.applyTorqueImpulse(
    {
      x: -direction.z * 0.1,
      y: sideSpin,
      z: direction.x * 0.1
    },
    true
  );
}

function updatePlayerShot(delta) {
  if (keys.has("Space")) {
    shootCharge = Math.min(
      1,
      shootCharge + delta * 0.72
    );
  }

  if (!shootReleased) {
    return;
  }

  shootReleased = false;

  const playerPosition = bodyPosition(playerBody);
  const ballPosition = bodyPosition(ballBody);

  const canShoot =
    possession.owner === "player" ||
    (
      horizontalDistance(
        playerPosition,
        ballPosition
      ) < 0.98 &&
      ballPosition.y < 0.8
    );

  if (canShoot) {
    const direction =
      player.userData.direction.clone();

    direction.y =
      0.035 + shootCharge * 0.14;

    direction.normalize();

    releasePossession(0.42);

    kickBall(
      direction,
      14 + shootCharge * 17,
      THREE.MathUtils.clamp(
        player.userData.moveVelocity.x * 0.005,
        -0.045,
        0.045
      )
    );

    player.userData.kickAnimation = 0.34;
  }

  shootCharge = 0;
}

function cpuShoot() {
  const settings = DIFFICULTY[difficulty];
  const ballPosition = bodyPosition(ballBody);

  const target = new THREE.Vector3(
    THREE.MathUtils.randFloat(
      -GOAL_WIDTH / 2 + 0.45,
      GOAL_WIDTH / 2 - 0.45
    ) +
    THREE.MathUtils.randFloat(
      -settings.accuracy,
      settings.accuracy
    ),

    THREE.MathUtils.randFloat(0.3, 0.9),

    FIELD_LENGTH / 2 + 0.5
  );

  const direction = target
    .sub(ballPosition)
    .normalize();

  const speed =
    difficulty === "easy"
      ? 16
      : difficulty === "normal"
        ? 19
        : 22;

  releasePossession(0.42);

  kickBall(
    direction,
    speed,
    THREE.MathUtils.randFloat(-0.035, 0.035)
  );

  cpu.userData.kickAnimation = 0.34;
}

function startPlayerTackle() {
  if (
    !gameRunning ||
    goalPause ||
    player.userData.tackleCooldown > 0
  ) {
    return;
  }

  player.userData.tackleCooldown = 2.1;
  player.userData.tackleAnimation = 0.4;

  const playerPosition = bodyPosition(playerBody);
  const cpuPosition = bodyPosition(cpuBody);
  const ballPosition = bodyPosition(ballBody);

  const direction =
    player.userData.direction.clone().normalize();

  if (
    horizontalDistance(
      playerPosition,
      ballPosition
    ) < 1.12
  ) {
    releasePossession(0.2);

    ballBody.applyImpulse(
      {
        x: direction.x * 2.4,
        y: 0.52,
        z: direction.z * 2.4
      },
      true
    );
  }

  if (
    horizontalDistance(
      playerPosition,
      cpuPosition
    ) < 1.12
  ) {
    cpuAI.stunTimer = 0.68;
    cpuAI.velocity.set(0, 0, 0);

    if (possession.owner === "cpu") {
      releasePossession(0.16);
    }
  }
}

// ==========================================================
// 골 판정
// ==========================================================

function checkGoal() {
  if (goalPause) {
    return;
  }

  const position = ballBody.translation();

  const inside =
    Math.abs(position.x) <
      GOAL_WIDTH / 2 - BALL_RADIUS &&
    position.y <
      GOAL_HEIGHT - BALL_RADIUS;

  if (inside) {
    if (
      previousBallZ >= -25 &&
      position.z < -25
    ) {
      playerScore++;
      handleGoal("GOAL!", 0x42a5f5);
    } else if (
      previousBallZ <= 25 &&
      position.z > 25
    ) {
      cpuScore++;
      handleGoal("CPU GOAL!", 0xff5252);
    }
  }

  previousBallZ = position.z;
}

const effects = [];

function createCelebration(color) {
  for (let i = 0; i < 100; i++) {
    const particle = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.08, 0.08),

      new THREE.MeshBasicMaterial({
        color: i % 3 === 0 ? 0xffffff : color,
        transparent: true
      })
    );

    particle.position.set(
      THREE.MathUtils.randFloat(-7, 7),
      THREE.MathUtils.randFloat(1, 7),
      ball.position.z > 0 ? 23 : -23
    );

    scene.add(particle);

    effects.push({
      mesh: particle,

      velocity: new THREE.Vector3(
        THREE.MathUtils.randFloat(-6, 6),
        THREE.MathUtils.randFloat(3, 10),
        THREE.MathUtils.randFloat(-4, 4)
      ),

      life: 1.6
    });
  }
}

function updateEffects(delta) {
  for (let index = effects.length - 1; index >= 0; index--) {
    const effect = effects[index];

    effect.life -= delta;
    effect.velocity.y -= 8 * delta;

    effect.mesh.position.addScaledVector(
      effect.velocity,
      delta
    );

    effect.mesh.rotation.x += delta * 8;
    effect.mesh.rotation.z += delta * 6;

    effect.mesh.material.opacity = Math.max(
      0,
      effect.life / 1.6
    );

    if (effect.life <= 0) {
      scene.remove(effect.mesh);

      effect.mesh.geometry.dispose();
      effect.mesh.material.dispose();

      effects.splice(index, 1);
    }
  }
}

function handleGoal(text, color) {
  if (goalPause) {
    return;
  }

  goalPause = true;

  releasePossession(1);

  cpuKeeperAI.holding = false;
  playerKeeperAI.holding = false;

  ballBody.setLinvel(
    { x: 0, y: 0, z: 0 },
    true
  );

  ballBody.setAngvel(
    { x: 0, y: 0, z: 0 },
    true
  );

  updateScore();
  showMessage(text, 1600);
  createCelebration(color);

  window.setTimeout(() => {
    resetPositions();
    goalPause = false;
  }, 1800);
}

// ==========================================================
// 리셋과 동기화
// ==========================================================

function resetKeeper(keeperAI) {
  keeperAI.label = "위치 선정";

  keeperAI.velocity.set(0, 0, 0);

  keeperAI.targetX = 0;
  keeperAI.targetZ = keeperAI.side * 23.1;

  keeperAI.reactionTimer = 0;
  keeperAI.catchCooldown = 0.7;
  keeperAI.diveTimer = 0;

  keeperAI.holding = false;
  keeperAI.holdTimer = 0;

  keeperAI.human.userData.velocity.set(0, 0, 0);
  keeperAI.human.userData.diveAnimation = 0;

  keeperAI.human.rotation.z = 0;
}

function resetPositions() {
  resetBody(playerBody, 0, 13);
  resetBody(cpuBody, 0, -13);

  resetBody(cpuKeeperBody, 0, -23.1);
  resetBody(playerKeeperBody, 0, 23.1);

  ballBody.setTranslation(
    {
      x: 0,
      y: BALL_RADIUS + 0.02,
      z: 0
    },
    true
  );

  ballBody.setRotation(
    {
      x: 0,
      y: 0,
      z: 0,
      w: 1
    },
    true
  );

  ballBody.setLinvel(
    { x: 0, y: 0, z: 0 },
    true
  );

  ballBody.setAngvel(
    { x: 0, y: 0, z: 0 },
    true
  );

  player.userData.direction.set(0, 0, -1);
  player.userData.moveVelocity.set(0, 0, 0);

  cpu.userData.direction.set(0, 0, 1);

  player.rotation.set(0, Math.PI, 0);
  cpu.rotation.set(0, 0, 0);

  cpuKeeper.rotation.set(0, 0, 0);
  playerKeeper.rotation.set(0, Math.PI, 0);

  cpuAI.target.set(0, 0, -9);
  cpuAI.velocity.set(0, 0, 0);

  cpuAI.state = "defend";
  cpuAI.label = "수비 위치 유지";

  cpuAI.decisionTimer = 0;
  cpuAI.shotCooldown = 0.8;
  cpuAI.tackleCooldown = 1;
  cpuAI.stunTimer = 0;

  resetKeeper(cpuKeeperAI);
  resetKeeper(playerKeeperAI);

  releasePossession(0.65);

  shootCharge = 0;
  shootReleased = false;
  previousBallZ = 0;

  syncGraphics();
}

function syncHuman(human, body) {
  const position = body.translation();

  human.position.set(
    position.x,
    -0.18,
    position.z
  );
}

function syncGraphics() {
  const position = ballBody.translation();
  const rotation = ballBody.rotation();

  ball.position.set(
    position.x,
    position.y,
    position.z
  );

  ball.quaternion.set(
    rotation.x,
    rotation.y,
    rotation.z,
    rotation.w
  );

  syncHuman(player, playerBody);
  syncHuman(cpu, cpuBody);

  syncHuman(cpuKeeper, cpuKeeperBody);
  syncHuman(playerKeeper, playerKeeperBody);

  if (possession.owner) {
    const ownerPosition =
      possession.owner === "player"
        ? playerBody.translation()
        : cpuBody.translation();

    possessionRing.position.set(
      ownerPosition.x,
      0.025,
      ownerPosition.z
    );

    possessionRing.visible = true;
  } else {
    possessionRing.visible = false;
  }
}

// ==========================================================
// 카메라, UI, 경기 종료
// ==========================================================

function updateCamera(delta) {
  const desired = new THREE.Vector3(
    player.position.x * 0.34,
    13.8,
    THREE.MathUtils.clamp(
      player.position.z + 17.5,
      -9,
      31.5
    )
  );

  camera.position.lerp(
    desired,
    1 - Math.pow(0.002, delta)
  );

  const target = player.position
    .clone()
    .lerp(ball.position, 0.48);

  target.y = 0.75;
  target.z -= 3.2;

  camera.lookAt(target);
}

function animateStadium(time) {
  for (const crowd of crowdGroups) {
    crowd.mesh.position.y =
      Math.sin(time * 2.25 + crowd.phase) *
      crowd.intensity;
  }

  for (let i = 0; i < ledBoards.length; i++) {
    ledBoards[i].material.emissiveIntensity =
      1.5 +
      Math.sin(time * 2 + i * 0.35) * 0.25;
  }

  possessionRing.rotation.z += 0.012;
}

function updateScore() {
  UI.playerScore.textContent = playerScore;
  UI.cpuScore.textContent = cpuScore;
}

function showMessage(text, duration) {
  clearTimeout(messageTimeout);

  UI.message.textContent = text;
  UI.message.classList.add("show");

  messageTimeout = window.setTimeout(() => {
    UI.message.classList.remove("show");
  }, duration);
}

function updateUI() {
  const seconds = Math.max(
    0,
    Math.ceil(remainingTime)
  );

  UI.timer.textContent = seconds;

  UI.timer.style.color =
    seconds <= 10 ? "#ff5252" : "#ffffff";

  const stamina = player.userData.stamina;

  UI.staminaFill.style.width = `${stamina}%`;
  UI.staminaValue.textContent = Math.round(stamina);

  const power = Math.round(shootCharge * 100);

  UI.powerFill.style.width = `${power}%`;
  UI.powerValue.textContent = `${power}%`;

  if (cpuKeeperAI.holding) {
    UI.possession.textContent = "상대 골키퍼";
    UI.possession.style.color = "#ffd740";
  } else if (playerKeeperAI.holding) {
    UI.possession.textContent = "우리 골키퍼";
    UI.possession.style.color = "#69f0ae";
  } else if (possession.owner === "player") {
    UI.possession.textContent = "PLAYER";
    UI.possession.style.color = "#64b5f6";
  } else if (possession.owner === "cpu") {
    UI.possession.textContent = "CPU";
    UI.possession.style.color = "#ff5252";
  } else {
    UI.possession.textContent = "경합 중";
    UI.possession.style.color = "#cfd8dc";
  }

  const tackleCooldown =
    player.userData.tackleCooldown;

  UI.tackle.textContent =
    tackleCooldown <= 0
      ? "준비됨"
      : `${tackleCooldown.toFixed(1)}초`;

  UI.tackle.style.color =
    tackleCooldown <= 0
      ? "#69f0ae"
      : "#ffca28";

  UI.cpuState.textContent = cpuAI.label;
  UI.keeperState.textContent = cpuKeeperAI.label;

  const velocity = ballBody.linvel();

  UI.ballSpeed.textContent = Math.hypot(
    velocity.x,
    velocity.y,
    velocity.z
  ).toFixed(1);
}

function endGame() {
  if (!gameRunning) {
    return;
  }

  gameRunning = false;

  releasePossession(10);

  cpuKeeperAI.holding = false;
  playerKeeperAI.holding = false;

  ballBody.setLinvel(
    { x: 0, y: 0, z: 0 },
    true
  );

  let result;
  let color;

  if (playerScore > cpuScore) {
    result = "승리!";
    color = "#69f0ae";
  } else if (playerScore < cpuScore) {
    result = "패배!";
    color = "#ff5252";
  } else {
    result = "무승부!";
    color = "#ffd740";
  }

  UI.result.textContent = result;
  UI.result.style.color = color;

  UI.finalScore.textContent =
    `${playerScore} : ${cpuScore}`;

  UI.endScreen.style.display = "grid";
}

// ==========================================================
// 게임 루프
// ==========================================================

function updatePhysics(delta) {
  accumulator += delta;

  accumulator = Math.min(
    accumulator,
    FIXED_STEP * 8
  );

  while (accumulator >= FIXED_STEP) {
    updatePlayer(FIXED_STEP);
    updateCpu(FIXED_STEP);

    updateKeeper(cpuKeeperAI, FIXED_STEP);
    updateKeeper(playerKeeperAI, FIXED_STEP);

    updatePlayerShot(FIXED_STEP);
    updatePossession(FIXED_STEP);

    world.step();
    checkGoal();

    accumulator -= FIXED_STEP;
  }

  syncGraphics();
}

resetPositions();
updateScore();

requestAnimationFrame(() => {
  UI.loading.classList.add("hidden");

  window.setTimeout(() => {
    UI.loading.remove();
  }, 550);

  showMessage("KICK OFF!", 1300);
});

function animate() {
  requestAnimationFrame(animate);

  const delta = Math.min(
    clock.getDelta(),
    0.05
  );

  if (gameRunning && !goalPause) {
    remainingTime -= delta;

    if (remainingTime <= 0) {
      remainingTime = 0;
      endGame();
    } else {
      updatePhysics(delta);
    }
  } else {
    syncGraphics();
  }

  animateHuman(player, delta);
  animateHuman(cpu, delta);

  animateHuman(cpuKeeper, delta);
  animateHuman(playerKeeper, delta);

  updateEffects(delta);
  updateCamera(delta);
  updateUI();

  animateStadium(
    performance.now() * 0.001
  );

  renderer.render(scene, camera);
}

animate();

window.addEventListener("resize", () => {
  camera.aspect =
    window.innerWidth / window.innerHeight;

  camera.updateProjectionMatrix();

  renderer.setSize(
    window.innerWidth,
    window.innerHeight
  );

  renderer.setPixelRatio(
    Math.min(window.devicePixelRatio, 2)
  );
});