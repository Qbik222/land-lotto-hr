"use strict";

import * as THREE from 'three';

// Визначення мобільного пристрою
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
const isLowPowerDevice = isMobile && (navigator.hardwareConcurrency <= 4 || window.innerWidth < 768);

// Кеш текстур чисел (10-99)
const numberTextureCache = new Map();


// Ініціалізація сцени та отримання контролеру вітру
const windController = initGameGlass();

// Game Glass 3D Scene (Three.js)
function initGameGlass() {
  const canvas = document.getElementById('gameGlass');
  if (!canvas) return;

  // Розміри відповідають видимій синій області на фоні (glass.png)
  const containerRadius = 330;
  const ballRadius = 35;
  const ballCount = isLowPowerDevice ? 40 : 80; // Менше кульок на слабких пристроях
  const balls = [];

  // Стан анімації вітру
  let windActive = false;
  const windStrength = 4.0; // Сила вітру (збільшено вдвічі)
  const windStreamRadius = 120; // Радіус струї вітру (збільшено для ширшого ефекту)
  const windTurbulence = 10.5; // Сила турбулентності (розкидання в сторони)
  const windDirection = { x: 0, y: 1, z: 0 }; // Вітер дме знизу вгору (по Y)
  
  // Стан великої кульки "WIN"
  let winBall = null;
  let winBallFadeInStartTime = null;
  const winBallFadeInDuration = 1500; // Тривалість fade-in в мілісекундах (1.5 секунди)

  // Three.js setup
  const scene = new THREE.Scene();
  scene.background = null; // Прозорий фон

  // Налаштування камери для бічного огляду (горизонтально, збоку)
  // Розраховуємо відстань камери, щоб вся сфера була видима
  const fov = 50; // field of view в градусах
  const containerDiameter = containerRadius * 2;
  const cameraDistance = (containerDiameter / 2) / Math.tan((fov * Math.PI / 180) / 2) + 85;
  
  const camera = new THREE.PerspectiveCamera(
    fov, // field of view
    1,   // aspect ratio (буде оновлено при resize)
    60,  // near - ближча межа
    2000 // far - дальня межа
  );
  
  // Розміщуємо камеру збоку (на осі X) і трохи зверху для бічного огляду
  // Камера дивиться на центр сцени збоку горизонтально
  camera.position.set(cameraDistance, 0, 0); // Збоку і трохи зверху
  camera.lookAt(0, 0, 0); // Дивимося на центр сцени

  const renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    alpha: true,
    antialias: !isMobile, // Вимкнути антиаліасинг на мобільних
    powerPreference: isMobile ? 'low-power' : 'high-performance',
    preserveDrawingBuffer: false // Важливо для iOS - не зберігати буфер між кадрами
  });
  renderer.setSize(760, 760);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2)); // Обмеження DPR
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = true; // Явно вмикаємо автоочищення
  renderer.shadowMap.enabled = !isLowPowerDevice; // Вимкнути тіні на слабких пристроях
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  
  // Обробка втрати WebGL контексту (важливо для iOS)
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    console.warn('WebGL context lost. Scene will be restored when context is available.');
  }, false);
  
  canvas.addEventListener('webglcontextrestored', () => {
    console.log('WebGL context restored. Reloading page for clean state.');
    window.location.reload();
  }, false);

  // Освітлення
  const ambientLight = new THREE.AmbientLight(0xffffff, isLowPowerDevice ? 1.1 : 0.9);
  scene.add(ambientLight);

  // Directional light для тіней та об'ємності
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
  directionalLight.position.set(0.5, 1, 0.8);
  directionalLight.castShadow = !isLowPowerDevice;
  
  // Налаштування shadow camera (менші текстури на мобільних)
  const shadowMapSize = isMobile ? 512 : 2048;
  directionalLight.shadow.mapSize.width = shadowMapSize;
  directionalLight.shadow.mapSize.height = shadowMapSize;
  directionalLight.shadow.camera.near = 0.5;
  directionalLight.shadow.camera.far = 1000;
  directionalLight.shadow.camera.left = -500;
  directionalLight.shadow.camera.right = 500;
  directionalLight.shadow.camera.top = 500;
  directionalLight.shadow.camera.bottom = -500;
  directionalLight.shadow.bias = -0.0001;
  
  scene.add(directionalLight);

  // Створення візуального контейнера (сфера)
  const containerGeometry = new THREE.SphereGeometry(
    containerRadius,
    64, // сегменти по ширині
    64  // сегменти по висоті
  );
  
  // Матеріал для контейнера (синій, як на фоні)
  const containerMaterial = new THREE.MeshStandardMaterial({
    color: 0x4A90E2, // Синій колір, схожий на фон
    transparent: true,
    opacity: 0.15, // Напівпрозорість для відповідності фону
    side: THREE.DoubleSide,
    metalness: 0.1,
    roughness: 0.2
  });

  const containerMesh = new THREE.Mesh(containerGeometry, containerMaterial);
  containerMesh.receiveShadow = true; // Дозволити отримувати тіні
  scene.add(containerMesh);

  // Функція перевірки, чи кулька повністю всередині сферичного контейнера (3D)
  function isBallInsideSphere(x, y, z, ballRadius, containerRadius) {
    const distanceFromCenter = Math.sqrt(x * x + y * y + z * z);
    return distanceFromCenter + ballRadius <= containerRadius;
  }

  // Створення 10 кульок з випадковими позиціями та швидкостями
  // X, Z - горизонтальна площина, Y - вертикальна вісь (вгору/вниз)
  const maxSafeRadius = containerRadius - ballRadius; // Максимальна відстань від центру для кульки

  // Функція для створення текстури з числом (з кешуванням)
  // Використовуємо окремий canvas для кожної текстури - це надійніше на iOS
  function createNumberTexture(number) {
    // Перевіряємо кеш
    if (numberTextureCache.has(number)) {
      return numberTextureCache.get(number);
    }
    
    try {
      const size = isMobile ? 256 : 512;
      
      // Створюємо окремий canvas для цієї текстури
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        console.error('Canvas 2D context is not available');
        const fallbackTexture = new THREE.DataTexture(
          new Uint8Array(size * size * 4).fill(255), size, size, THREE.RGBAFormat
        );
        fallbackTexture.needsUpdate = true;
        numberTextureCache.set(number, fallbackTexture);
        return fallbackTexture;
      }
      
      // Білий фон
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size, size);
      
      // Текст з числом (масштабований розмір шрифту)
      const fontSize = isMobile ? 60 : 80;
      ctx.fillStyle = '#000000';
      ctx.font = `bold ${fontSize}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(number.toString(), size / 2, size / 2);
      
      // Використовуємо CanvasTexture - надійніше на iOS
      const texture = new THREE.CanvasTexture(canvas);
      texture.needsUpdate = true;
      
      // Зберігаємо в кеш
      numberTextureCache.set(number, texture);
      
      return texture;
    } catch (error) {
      console.error('Error creating number texture:', error);
      const size = isMobile ? 256 : 512;
      const fallbackTexture = new THREE.DataTexture(
        new Uint8Array(size * size * 4).fill(255), size, size, THREE.RGBAFormat
      );
      fallbackTexture.needsUpdate = true;
      return fallbackTexture;
    }
  }

  // Функція для створення текстури з текстом "WIN"
  function createWinTexture() {
    try {
      // Адаптивний розмір текстури
      const size = isMobile ? 512 : 1024;
      
      // Створюємо окремий canvas для WIN текстури
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        console.error('Canvas 2D context is not available');
        // Fallback: фіолетова текстура
        const data = new Uint8Array(size * size * 4);
        for (let i = 0; i < size * size; i++) {
          data[i * 4] = 139;
          data[i * 4 + 1] = 92;
          data[i * 4 + 2] = 246;
          data[i * 4 + 3] = 255;
        }
        const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
        texture.needsUpdate = true;
        return texture;
      }
      
      const centerX = size / 2;
      const centerY = size / 2;
      
      // Коефіцієнт масштабування відносно базового розміру 1024px
      const scale = size / 1024;
      
      const gradient = ctx.createLinearGradient(0, 0, size, size);
      gradient.addColorStop(0, '#1e1b4b');  
      gradient.addColorStop(0.25, '#4f46e5');
      gradient.addColorStop(0.5, '#8b5cf6');  
      gradient.addColorStop(0.75, '#c026d3'); 
      gradient.addColorStop(1, '#ec4899');    
      
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);
      
      // Білий еліпс в центрі - вертикально витягнутий для компенсації UV-mapping на сфері
      const circleRadiusX = size * 0.05;
      const circleRadiusY = size * 0.095;
      
      // Функція для малювання еліпса з fallback
      const drawEllipse = (x, y, radiusX, radiusY) => {
        ctx.beginPath();
        if (ctx.ellipse) {
          ctx.ellipse(x, y, radiusX, radiusY, 0, 0, Math.PI * 2);
        } else {
          ctx.save();
          ctx.translate(x, y);
          ctx.scale(radiusX / radiusY, 1);
          ctx.arc(0, 0, radiusY, 0, Math.PI * 2);
          ctx.restore();
        }
      };
      
      // Зовнішня біла обводка (масштабовані значення)
      drawEllipse(centerX, centerY, circleRadiusX + 12 * scale, circleRadiusY + 18 * scale);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 6 * scale;
      ctx.stroke();
      
      // Ще одна зовнішня обводка (тонша)
      drawEllipse(centerX, centerY, circleRadiusX + 20 * scale, circleRadiusY + 28 * scale);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 3 * scale;
      ctx.stroke();
      
      // Білий еліпс (заливка)
      drawEllipse(centerX, centerY, circleRadiusX, circleRadiusY);
      ctx.fillStyle = '#f0f0f0';
      ctx.fill();
      
      // Текст "WIN" (масштабований розмір шрифту)
      const fontSize = Math.round(30 * scale);
      ctx.fillStyle = '#000000';
      ctx.font = `400 ${fontSize}px "Lilita One", Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('WIN', centerX, centerY);
      
      // Використовуємо CanvasTexture - надійніше на iOS
      const texture = new THREE.CanvasTexture(canvas);
      texture.needsUpdate = true;
      return texture;
    } catch (error) {
      console.error('Error creating WIN texture:', error);
      const size = isMobile ? 512 : 1024;
      // Fallback: фіолетова текстура
      const data = new Uint8Array(size * size * 4);
      for (let i = 0; i < size * size; i++) {
        data[i * 4] = 139;
        data[i * 4 + 1] = 92;
        data[i * 4 + 2] = 246;
        data[i * 4 + 3] = 255;
      }
      const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
      texture.needsUpdate = true;
      return texture;
    }
  }

  // Функція для створення великої кульки "WIN" в центрі
  async function createWinBall() {
    // Завантажуємо шрифт перед створенням текстури
    try {
      await document.fonts.load('400 75px "Lilita One"');
    } catch (e) {
      console.log('Font loading failed, using fallback');
    }
    
    // Створюємо велику кульку (85% від радіусу контейнера)
    // Малі кулі залишаються на сцені
    const winBallRadius = containerRadius * 0.85;
    const winGeometry = new THREE.SphereGeometry(winBallRadius, 64, 64);
    const winTexture = createWinTexture();
    
    const winMaterial = new THREE.MeshStandardMaterial({
      map: winTexture,
      color: 0xffffff,
      roughness: 0.2,   // Гладка поверхня
      metalness: 0.1,   // Легкий металевий відблиск
      side: THREE.FrontSide // Рендеримо тільки зовнішню сторону
    });
    
    const winMesh = new THREE.Mesh(winGeometry, winMaterial);
    winMesh.position.set(0, 0, 0); // Чітко по центру сфери
    winMesh.scale.set(0.01, 0.01, 0.01); // Починаємо з мінімального розміру (майже невидима)
    winMesh.rotation.y = -Math.PI; // Початкове обертання -180° (буде анімовано до 0°)
    winMesh.castShadow = true;
    winMesh.receiveShadow = true;
    winMesh.visible = true;
    
    // Додаємо кульку до сцени
    scene.add(winMesh);
    
    // Запускаємо анімацію появи (scale animation)
    winBallFadeInStartTime = performance.now();
    
    return winMesh;
  }

  // Геометрія для кульок (спільна для всіх)
  const sphereGeometry = new THREE.SphereGeometry(ballRadius, 16, 16);

  // Флаг для відкладеного створення кульок (вирішує проблему артефактів на iOS)
  let ballsCreated = false;

  // Функція для початкового створення кульок
  function createInitialBalls() {
    if (ballsCreated) return;
    ballsCreated = true;
    createNewBalls();
  }

  // Старий код створення кульок - тепер викликається через createNewBalls()
  // Залишаємо для сумісності, але не виконуємо при ініціалізації
  /*
  for (let i = 0; i < ballCount; i++) {
    // Генеруємо випадкове двохзначне число (10-99)
    const randomNumber = Math.floor(Math.random() * 90) + 10;
    
    // Створюємо текстуру з числом
    const numberTexture = createNumberTexture(randomNumber);
    
    // Створюємо матеріал для цієї кульки з текстурою
    // Використовуємо MeshStandardMaterial для об'ємного вигляду з тінями
    const sphereMaterial = new THREE.MeshStandardMaterial({
      map: numberTexture,
      color: 0xffffff,
      roughness: 0.1, // Низька шорсткість для більш гладкого вигляду
      metalness: 0.0 // Немає металевості для чистого білого
    });
    let attempts = 0;
    let x, y, z;
    let validPosition = false;

    // Спробувати знайти позицію без перетину з іншими кульками та в межах сферичного контейнера
    // Кульки спавняться у верхній частині сфери, щоб впасти вниз
    while (!validPosition && attempts < 500) {
      // Генеруємо випадкову позицію всередині сфери (у верхній половині)
      // Використовуємо сферичні координати
      const theta = Math.random() * Math.PI * 2; // Азимутальний кут (0-2π)
      const phi = Math.random() * Math.PI * 0.3; // Полярний кут (0-π/3, тобто верхня частина)
      const r = Math.random() * maxSafeRadius * 0.8; // Відстань від центру
      
      x = r * Math.sin(phi) * Math.cos(theta);
      y = r * Math.cos(phi); // Y - вертикальна вісь (вгору)
      z = r * Math.sin(phi) * Math.sin(theta);

      // Перевірка, що кулька повністю всередині сферичного контейнера
      if (!isBallInsideSphere(x, y, z, ballRadius, containerRadius)) {
        attempts++;
        continue;
      }

      // Перевірка колізій з існуючими кульками
      validPosition = true;
      for (let j = 0; j < balls.length; j++) {
        const dx = x - balls[j].x;
        const dy = y - balls[j].y;
        const dz = z - balls[j].z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < ballRadius * 2) {
          validPosition = false;
          break;
        }
      }
      attempts++;
    }

    // Якщо не вдалося знайти вільну позицію, розмістити кульку в безпечній зоні зверху сфери
    if (!validPosition) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.3;
      const r = maxSafeRadius * 0.5;
      x = r * Math.sin(phi) * Math.cos(theta);
      y = r * Math.cos(phi);
      z = r * Math.sin(phi) * Math.sin(theta);
    }

    // Фінальна перевірка та корекція позиції (3D сфера)
    const distanceFromCenter = Math.sqrt(x * x + y * y + z * z);
    if (distanceFromCenter + ballRadius > containerRadius) {
      const safeRadius = containerRadius - ballRadius - 1;
      const scale = safeRadius / distanceFromCenter;
      x *= scale;
      y *= scale;
      z *= scale;
    }

    // Додати випадкову початкову швидкість (горизонтальну, вертикальна буде від гравітації)
    const speed = 0.3 + Math.random() * 0.7;
    const angle = Math.random() * Math.PI * 2;
    const vx = Math.cos(angle) * speed;
    const vz = Math.sin(angle) * speed;
    const vy = -0.1 - Math.random() * 0.2; // Невелика початкова швидкість вниз

    // Створити меш (об'єкт) для кульки
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    sphere.position.set(x, y, z);
    sphere.castShadow = !isLowPowerDevice;
    sphere.receiveShadow = !isLowPowerDevice;
    scene.add(sphere);

    balls.push({
      mesh: sphere,
      x: x,
      y: y,
      z: z,
      vx: vx,
      vy: vy,
      vz: vz,
      // Кутові швидкості для обертання навколо осей
      rotX: 0,
      rotY: 0,
      rotZ: 0,
      // Відстеження попереднього стану для визначення моменту приземлення
      wasOnBottom: false,
      previousVy: vy
    });
  }
  */

  // Фізика та оновлення позицій кульок
  function updateBalls(deltaTime) {
    const damping = 0.999; // Невелике згасання для стабільності
    const gravity = 0.5; // Гравітація вниз по Y
    const maxSafeRadius = containerRadius - ballRadius - 0.1; // Безпечний радіус з невеликим запасом
    const bottomThreshold = ballRadius * 1.5; // Поріг для визначення "на дні" (нижня частина сфери)

    // Оновлення анімації появи (scale) для великої кульки "WIN"
    if (winBall !== null && winBallFadeInStartTime !== null) {
      const currentTime = performance.now();
      const elapsed = currentTime - winBallFadeInStartTime;
      const progress = Math.min(1, elapsed / winBallFadeInDuration);
      
      // Використовуємо easeOutElastic для пружинного ефекту (як кулька "вистрибує")
      let easedProgress;
      if (progress === 0) {
        easedProgress = 0;
      } else if (progress === 1) {
        easedProgress = 1;
      } else {
        // easeOutBack - невеликий "перестріл" і повернення
        const c1 = 1.70158;
        const c3 = c1 + 1;
        easedProgress = 1 + c3 * Math.pow(progress - 1, 3) + c1 * Math.pow(progress - 1, 2);
      }
      
      // Плавно збільшуємо масштаб від 0.01 до 1
      const newScale = 0.01 + (easedProgress * 0.99);
      winBall.scale.set(newScale, newScale, newScale);
      
      // Обертання від -180° до 0° навколо осі Y
      const rotationY = -Math.PI + (easedProgress * Math.PI); // від -π (-180°) до 0
      winBall.rotation.y = rotationY;
      
      // Якщо анімація завершена
      if (progress >= 1) {
        winBall.scale.set(1, 1, 1);
        winBall.rotation.y = 0;
        winBallFadeInStartTime = null;
      }
    }

    // Видаляємо кульки, які стали занадто маленькими (сховалися в центр)
    for (let i = balls.length - 1; i >= 0; i--) {
      const ball = balls[i];
      const currentScale = ball.mesh.scale.x;
      if (currentScale < 0.05) {
        scene.remove(ball.mesh);
        if (ball.mesh.material.map) {
          ball.mesh.material.map.dispose();
        }
        ball.mesh.material.dispose();
        balls.splice(i, 1);
      }
    }

    for (let i = 0; i < balls.length; i++) {
      const ball = balls[i];
      
      // Якщо winBall існує - притягуємо малі кулі до центру
      if (winBall !== null) {
        const pullStrength = 0.03; // Сила притягування (вдвічі повільніше)
        const shrinkSpeed = 0.008; // Швидкість зменшення (вдвічі повільніше)
        
        // Напрямок до центру
        const distanceFromCenter = Math.sqrt(ball.x * ball.x + ball.y * ball.y + ball.z * ball.z);
        if (distanceFromCenter > 1) {
          const nx = -ball.x / distanceFromCenter;
          const ny = -ball.y / distanceFromCenter;
          const nz = -ball.z / distanceFromCenter;
          
          // Притягуємо до центру
          ball.vx += nx * pullStrength * deltaTime * 60;
          ball.vy += ny * pullStrength * deltaTime * 60;
          ball.vz += nz * pullStrength * deltaTime * 60;
          
          // Сильне згасання для плавного руху
          ball.vx *= 0.95;
          ball.vy *= 0.95;
          ball.vz *= 0.95;
        }
        
        // Зменшуємо розмір кульки
        const currentScale = ball.mesh.scale.x;
        const newScale = Math.max(0.01, currentScale - shrinkSpeed * deltaTime);
        ball.mesh.scale.set(newScale, newScale, newScale);
        
        // Оновлення позиції
        ball.x += ball.vx * deltaTime;
        ball.y += ball.vy * deltaTime;
        ball.z += ball.vz * deltaTime;
        
        // Оновлюємо позицію меша
        ball.mesh.position.set(ball.x, ball.y, ball.z);
        
        continue; // Пропускаємо решту фізики
      }

      // Оновлення позиції
      ball.x += ball.vx * deltaTime;
      ball.y += ball.vy * deltaTime;
      ball.z += ball.vz * deltaTime;

      // Перевірка чи кулька на дні (нижня частина сфери)
      const distanceFromCenter = Math.sqrt(ball.x * ball.x + ball.y * ball.y + ball.z * ball.z);
      const isOnBottom = ball.y < -containerRadius * 0.3 && distanceFromCenter > containerRadius * 0.7;
      
      // Визначення моменту приземлення (кулька тільки що досягла дна)
      const justLanded = isOnBottom && !ball.wasOnBottom && ball.previousVy < 0;
      
      // Застосування вітру (якщо активний)
      if (windActive) {
        // Вітер дме з центру низу до верху з турбулентністю
        const distanceFromCenterXZ = Math.sqrt(ball.x * ball.x + ball.z * ball.z);
        
        // Інтенсивність вітру - ширша зона впливу
        const distanceNormalized = distanceFromCenterXZ / windStreamRadius;
        const windIntensityXZ = Math.max(0, Math.exp(-distanceNormalized * distanceNormalized * 1.5));
        
        // Сила вітру залежить від вертикальної позиції
        const windIntensityY = Math.max(0, 1 - (ball.y + containerRadius) / (containerRadius * 2));
        
        // Комбінована інтенсивність вітру
        const windIntensity = windIntensityXZ * windIntensityY;
        
        // Вітер дме вгору (по Y)
        const windForceY = windDirection.y * windStrength * windIntensity;
        
        // Нормалізована висота кульки (0 = низ, 1 = верх)
        const normalizedHeight = (ball.y + containerRadius) / (containerRadius * 2);
        
        // ТУРБУЛЕНТНІСТЬ - випадкове розкидання в сторони
        // Використовуємо sin/cos з часом для створення хаотичного руху
        const time = performance.now() * 0.001;
        const turbulenceX = Math.sin(time * 3 + ball.x * 0.1 + i * 1.7) * windTurbulence;
        const turbulenceZ = Math.cos(time * 2.5 + ball.z * 0.1 + i * 2.3) * windTurbulence;
        
        // Застосовуємо турбулентність (сильніша в середині висоти)
        const turbulenceIntensity = Math.sin(normalizedHeight * Math.PI) * windIntensity;
        ball.vx += turbulenceX * turbulenceIntensity * deltaTime;
        ball.vz += turbulenceZ * turbulenceIntensity * deltaTime;
        
        // Слабке притягування до центру в нижній частині
        if (distanceFromCenterXZ > 0.1 && normalizedHeight < 0.4) {
          const pullToCenterStrength = 0.2 * windIntensityY;
          const pullX = (-ball.x / distanceFromCenterXZ) * pullToCenterStrength;
          const pullZ = (-ball.z / distanceFromCenterXZ) * pullToCenterStrength;
          
          ball.vx += pullX * deltaTime;
          ball.vz += pullZ * deltaTime;
        }
        
        // Заокруглення вітру біля верху сфери
        // Коли кулька наближається до верху, вітер починає розходитися в сторони
        if (normalizedHeight > 0.5 && distanceFromCenterXZ > 0.1) {
          // Сила розходження збільшується з висотою
          const spreadIntensity = Math.pow((normalizedHeight - 0.5) * 2, 2); // Квадратична залежність для плавності
          
          // Напрямок від центру (відхилення від центру)
          const spreadDirectionX = ball.x / distanceFromCenterXZ;
          const spreadDirectionZ = ball.z / distanceFromCenterXZ;
          
          // Сила розходження залежить від інтенсивності вітру та висоти
          const spreadStrength = windIntensity * spreadIntensity * 1.5;
          
          // Застосовуємо силу розходження
          ball.vx += spreadDirectionX * spreadStrength * deltaTime;
          ball.vz += spreadDirectionZ * spreadStrength * deltaTime;
          
          // Зменшуємо вертикальну силу вітру вгорі для плавного переходу
          const verticalReduction = 1 - spreadIntensity * 0.5;
          ball.vy += windForceY * verticalReduction * deltaTime;
        } else {
          // Застосовуємо силу вітру строго вгору (в нижній та середній частині)
          ball.vy += windForceY * deltaTime;
        }
      }
      
      // Гравітація до низу канвасу (по осі Y вниз) - тільки якщо кулька не на дні і вітер не активний
      if (!isOnBottom && !windActive) {
        ball.vy -= gravity * deltaTime;
      } else if (!isOnBottom && windActive) {
        // Якщо вітер активний, гравітація слабша
        ball.vy -= gravity * 0.3 * deltaTime;
      } else {
        // Якщо кулька на дні - не застосовуємо гравітацію
        // Застосовуємо сильне тертя тільки якщо вітер не активний
        if (!windActive) {
          const bottomFriction = 0.7; // Дуже сильне тертя для кульок на дні
          ball.vx *= bottomFriction;
          ball.vy *= bottomFriction;
          ball.vz *= bottomFriction;
          
          // Резке зменшення обертання в момент приземлення
          if (justLanded) {
            const landingRotationDamping = 0.3; // Сильне зменшення обертання при приземленні
            ball.rotX *= landingRotationDamping;
            ball.rotY *= landingRotationDamping;
            ball.rotZ *= landingRotationDamping;
          } else {
            // Постійне зменшення обертання на дні (тертя об поверхню)
            const rotationFriction = 0.85; // Тертя для обертання на дні
            ball.rotX *= rotationFriction;
            ball.rotY *= rotationFriction;
            ball.rotZ *= rotationFriction;
          }
          
          // Якщо швидкість дуже мала - повністю зупиняємо
          const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy + ball.vz * ball.vz);
          if (speed < 0.05) {
            ball.vx = 0;
            ball.vy = 0;
            ball.vz = 0;
            // Також зупиняємо обертання, якщо кулька повністю зупинилася
            const rotationSpeed = Math.sqrt(ball.rotX * ball.rotX + ball.rotY * ball.rotY + ball.rotZ * ball.rotZ);
            if (rotationSpeed < 0.01) {
              ball.rotX = 0;
              ball.rotY = 0;
              ball.rotZ = 0;
            }
          }
        }
      }

      // Колізія зі сферичною стінкою контейнера (3D)
      const collisionRadius = containerRadius - ballRadius;
      
      if (distanceFromCenter > collisionRadius) {
        // Обчислюємо нормаль до стінки (напрямок від центру до кульки в 3D)
        const normalX = ball.x / distanceFromCenter;
        const normalY = ball.y / distanceFromCenter;
        const normalZ = ball.z / distanceFromCenter;
        
        // Корекція позиції - повертаємо кульку всередину сфери
        ball.x = normalX * collisionRadius;
        ball.y = normalY * collisionRadius;
        ball.z = normalZ * collisionRadius;
        
        // Відбиття швидкості від стінки (тільки якщо не на дні)
        if (!isOnBottom) {
          const outwardVelocity = ball.vx * normalX + ball.vy * normalY + ball.vz * normalZ;
          
          if (outwardVelocity > 0) {
            ball.vx -= 2 * outwardVelocity * normalX;
            ball.vy -= 2 * outwardVelocity * normalY;
            ball.vz -= 2 * outwardVelocity * normalZ;
            
            const bounceDamping = 0.9;
            ball.vx *= bounceDamping;
            ball.vy *= bounceDamping;
            ball.vz *= bounceDamping;
          }
        } else {
          // На дні - зупиняємо швидкість назовні від стінки
          const outwardVelocity = ball.vx * normalX + ball.vy * normalY + ball.vz * normalZ;
          if (outwardVelocity > 0) {
            ball.vx -= outwardVelocity * normalX;
            ball.vy -= outwardVelocity * normalY;
            ball.vz -= outwardVelocity * normalZ;
          }
        }
      }

      // ДОДАТКОВА перевірка - якщо кулька все ще за межами (на випадок помилок)
      const finalDistance = Math.sqrt(ball.x * ball.x + ball.y * ball.y + ball.z * ball.z);
      if (finalDistance + ballRadius > containerRadius) {
        const scale = maxSafeRadius / finalDistance;
        ball.x *= scale;
        ball.y *= scale;
        ball.z *= scale;
        // Зупинити швидкість, якщо кулька намагається вийти
        const normalX = ball.x / finalDistance;
        const normalY = ball.y / finalDistance;
        const normalZ = ball.z / finalDistance;
        const outwardSpeed = ball.vx * normalX + ball.vy * normalY + ball.vz * normalZ;
        if (outwardSpeed > 0) {
          ball.vx -= outwardSpeed * normalX;
          ball.vy -= outwardSpeed * normalY;
          ball.vz -= outwardSpeed * normalZ;
        }
      }

      // Колізії між кульками
      for (let j = i + 1; j < balls.length; j++) {
        const otherBall = balls[j];
        const dx = ball.x - otherBall.x;
        const dy = ball.y - otherBall.y;
        const dz = ball.z - otherBall.z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const minDistance = ballRadius * 2; // Мінімальна відстань між центрами кульок

        // Завжди розділяємо кульки, якщо вони занадто близько
        if (distance < minDistance && distance > 0.001) {
          // Нормалізуємо вектор напрямку
          const nx = dx / distance;
          const ny = dy / distance;
          const nz = dz / distance;

          // Обчислюємо перетин (overlap)
          const overlap = minDistance - distance;
          
          // Сильне розділення - розсуваємо кульки, щоб вони не перетиналися
          // Використовуємо більший коефіцієнт для швидшого розділення
          const separationStrength = 1.2; // Трохи більше 1.0 для гарантованого розділення
          const separationX = nx * overlap * 0.5 * separationStrength;
          const separationY = ny * overlap * 0.5 * separationStrength;
          const separationZ = nz * overlap * 0.5 * separationStrength;
          
          ball.x += separationX;
          ball.y += separationY;
          ball.z += separationZ;
          otherBall.x -= separationX;
          otherBall.y -= separationY;
          otherBall.z -= separationZ;

          // Перевірка чи обидві кульки на дні
          const otherDistanceFromCenter = Math.sqrt(otherBall.x * otherBall.x + otherBall.y * otherBall.y + otherBall.z * otherBall.z);
          const otherIsOnBottom = otherBall.y < -containerRadius * 0.3 && otherDistanceFromCenter > containerRadius * 0.7;
          const bothOnBottom = isOnBottom && otherIsOnBottom;

          // Відносна швидкість для відбиття
          const relativeVx = ball.vx - otherBall.vx;
          const relativeVy = ball.vy - otherBall.vy;
          const relativeVz = ball.vz - otherBall.vz;

          // Швидкість уздовж нормалі
          const speedAlongNormal = relativeVx * nx + relativeVy * ny + relativeVz * nz;

          // Відбиття тільки якщо кульки рухаються одна до одної
          if (speedAlongNormal > 0) {
            // Якщо обидві кульки на дні - мінімальне відбиття (практично зупиняємо)
            let restitution = 0.8; // Коефіцієнт відновлення за замовчуванням
            if (bothOnBottom) {
              restitution = 0.1; // Дуже малий коефіцієнт відновлення на дні
            }
            
            const impulse = (1 + restitution) * speedAlongNormal / 2;
            
            ball.vx -= impulse * nx;
            // Якщо на дні - не відбиваємо вертикальну швидкість (Y)
            if (!isOnBottom) {
              ball.vy -= impulse * ny;
            }
            ball.vz -= impulse * nz;
            
            otherBall.vx += impulse * nx;
            // Якщо на дні - не відбиваємо вертикальну швидкість (Y)
            if (!otherIsOnBottom) {
              otherBall.vy += impulse * ny;
            }
            otherBall.vz += impulse * nz;
            
            // Додаткове згасання на дні - майже повна зупинка
            if (bothOnBottom) {
              ball.vx *= 0.5;
              ball.vy *= 0.5;
              ball.vz *= 0.5;
              otherBall.vx *= 0.5;
              otherBall.vy *= 0.5;
              otherBall.vz *= 0.5;
              
              // Якщо швидкість дуже мала - повністю зупиняємо
              const ballSpeed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy + ball.vz * ball.vz);
              const otherBallSpeed = Math.sqrt(otherBall.vx * otherBall.vx + otherBall.vy * otherBall.vy + otherBall.vz * otherBall.vz);
              
              if (ballSpeed < 0.05) {
                ball.vx = 0;
                ball.vy = 0;
                ball.vz = 0;
              }
              if (otherBallSpeed < 0.05) {
                otherBall.vx = 0;
                otherBall.vy = 0;
                otherBall.vz = 0;
              }
            }
          }
        }
      }

      // ФІНАЛЬНА перевірка після всіх обчислень - гарантуємо, що кулька всередині сферичного контейнера (3D)
      const finalCheckDistance = Math.sqrt(ball.x * ball.x + ball.y * ball.y + ball.z * ball.z);
      if (finalCheckDistance + ballRadius > containerRadius) {
        const safeRadius = containerRadius - ballRadius - 0.1;
        const scale = safeRadius / finalCheckDistance;
        ball.x *= scale;
        ball.y *= scale;
        ball.z *= scale;
        
        // Зупинити рух назовні від стінки
        const normalX = ball.x / finalCheckDistance;
        const normalY = ball.y / finalCheckDistance;
        const normalZ = ball.z / finalCheckDistance;
        const outwardSpeed = ball.vx * normalX + ball.vy * normalY + ball.vz * normalZ;
        if (outwardSpeed > 0) {
          ball.vx -= outwardSpeed * normalX;
          ball.vy -= outwardSpeed * normalY;
          ball.vz -= outwardSpeed * normalZ;
        }
      }

      // Застосувати згасання (тільки якщо кулька не на дні або вітер активний)
      if (!isOnBottom || windActive) {
        ball.vx *= damping;
        ball.vy *= damping;
        ball.vz *= damping;
      }

      // Обчислення кутової швидкості на основі лінійної швидкості
      // Для сфери, що котиться: кутова швидкість = лінійна швидкість / радіус
      // Обертання навколо різних осей залежить від напрямку руху
      const linearSpeed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy + ball.vz * ball.vz);
      
      if (linearSpeed > 0.001) {
        // Кутова швидкість навколо кожної осі залежить від напрямку руху
        // Для сфери, що котиться без ковзання:
        // - Рух по X обертає навколо Z та Y
        // - Рух по Y обертає навколо X та Z
        // - Рух по Z обертає навколо Y та X
        const angularSpeed = linearSpeed / ballRadius; // Радіани на секунду
        
        // Обертання навколо осі X (пропорційно до руху по Y та Z)
        // Використовуємо векторний добуток для правильного напрямку обертання
        const rotXSpeed = (ball.vz - ball.vy * 0.3) / ballRadius;
        
        // Обертання навколо осі Y (пропорційно до руху по X та Z)
        const rotYSpeed = (ball.vx - ball.vz * 0.3) / ballRadius;
        
        // Обертання навколо осі Z (пропорційно до руху по X та Y)
        const rotZSpeed = (ball.vy - ball.vx * 0.3) / ballRadius;
        
        // Оновлюємо кути обертання
        ball.rotX += rotXSpeed * deltaTime;
        ball.rotY += rotYSpeed * deltaTime;
        ball.rotZ += rotZSpeed * deltaTime;
        
        // Застосувати згасання до кутової швидкості
        if (!isOnBottom || windActive) {
          ball.rotX *= damping;
          ball.rotY *= damping;
          ball.rotZ *= damping;
        } else {
          // Якщо кулька на дні і вітер не активний - сильніше згасання обертання
          const bottomRotationDamping = 0.85; // Сильніше згасання обертання на дні
          ball.rotX *= bottomRotationDamping;
          ball.rotY *= bottomRotationDamping;
          ball.rotZ *= bottomRotationDamping;
        }
      } else {
        // Якщо кулька майже не рухається, зменшуємо обертання
        ball.rotX *= 0.95;
        ball.rotY *= 0.95;
        ball.rotZ *= 0.95;
      }
      
      // Оновити стан для наступного кадру
      ball.wasOnBottom = isOnBottom;
      ball.previousVy = ball.vy;

      // Оновити позицію та обертання меша в Three.js
      ball.mesh.position.set(ball.x, ball.y, ball.z);
      ball.mesh.rotation.x = ball.rotX;
      ball.mesh.rotation.y = ball.rotY;
      ball.mesh.rotation.z = ball.rotZ;
    }
  }

  // Анімаційний цикл
  let lastTime = performance.now();
  let frameCount = 0;
  
  function animate(currentTime) {
    const deltaTime = Math.min((currentTime - lastTime) / 16.67, 2); // Обмежити deltaTime для стабільності
    lastTime = currentTime;
    frameCount++;

    // Примусово очищаємо буфери перед кожним рендером
    renderer.clear(true, true, true);
    
    updateBalls(deltaTime);
    renderer.render(scene, camera);
    
    // Створюємо кульки після 10-го чистого кадру для уникнення артефактів на iOS
    if (!ballsCreated && frameCount >= 10) {
        console.log(frameCount)
      createInitialBalls();
    }
    
    requestAnimationFrame(animate);
  }

  // Handle window resize
  function handleResize() {
    // Використовуємо canvas.parentElement для визначення доступного розміру
    const containerWidth = canvas.parentElement ? canvas.parentElement.clientWidth : window.innerWidth;
    const width = Math.min(760, containerWidth, window.innerWidth);
    const height = width;

    
    
    // Оновлюємо розмір renderer
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    
    // Оновлюємо стилі canvas для правильного відображення
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
  }

  window.addEventListener('resize', handleResize);
  // Додаємо orientationchange для мобільних пристроїв
  window.addEventListener('orientationchange', () => {
    // Затримка для коректного оновлення розмірів після зміни орієнтації
    setTimeout(handleResize, 100);
  });
  
  // Початковий виклик з невеликою затримкою для Android
  setTimeout(handleResize, 50);
  handleResize();

  // Запуск анімації
  requestAnimationFrame(animate);
  
  // Функція для створення великої кульки "WIN"
  async function showWinBall() {
    // Якщо кулька вже існує, не створюємо нову
    if (winBall !== null) {
      return;
    }
    
    winBall = await createWinBall();
  }
  
  // Функція для створення нових кульок
  function createNewBalls() {
    for (let i = 0; i < ballCount; i++) {
      const randomNumber = Math.floor(Math.random() * 90) + 10;
      const numberTexture = createNumberTexture(randomNumber);
      
      const sphereMaterial = new THREE.MeshStandardMaterial({
        map: numberTexture,
        color: 0xffffff,
        roughness: 0.1,
        metalness: 0.0
      });
      
      let attempts = 0;
      let x, y, z;
      let validPosition = false;

      while (!validPosition && attempts < 500) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI * 0.3;
        const r = Math.random() * maxSafeRadius * 0.8;
        
        x = r * Math.sin(phi) * Math.cos(theta);
        y = r * Math.cos(phi);
        z = r * Math.sin(phi) * Math.sin(theta);

        if (!isBallInsideSphere(x, y, z, ballRadius, containerRadius)) {
          attempts++;
          continue;
        }

        validPosition = true;
        for (let j = 0; j < balls.length; j++) {
          const dx = x - balls[j].x;
          const dy = y - balls[j].y;
          const dz = z - balls[j].z;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (dist < ballRadius * 2) {
            validPosition = false;
            break;
          }
        }
        attempts++;
      }

      if (!validPosition) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI * 0.3;
        const r = maxSafeRadius * 0.5;
        x = r * Math.sin(phi) * Math.cos(theta);
        y = r * Math.cos(phi);
        z = r * Math.sin(phi) * Math.sin(theta);
      }

      const distanceFromCenter = Math.sqrt(x * x + y * y + z * z);
      if (distanceFromCenter + ballRadius > containerRadius) {
        const safeRadius = containerRadius - ballRadius - 1;
        const scale = safeRadius / distanceFromCenter;
        x *= scale;
        y *= scale;
        z *= scale;
      }

      const speed = 0.3 + Math.random() * 0.7;
      const angle = Math.random() * Math.PI * 2;
      const vx = Math.cos(angle) * speed;
      const vz = Math.sin(angle) * speed;
      const vy = -0.1 - Math.random() * 0.2;

      const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
      sphere.position.set(x, y, z);
      sphere.castShadow = !isLowPowerDevice;
      sphere.receiveShadow = !isLowPowerDevice;
      scene.add(sphere);

      balls.push({
        mesh: sphere,
        x: x,
        y: y,
        z: z,
        vx: vx,
        vy: vy,
        vz: vz,
        rotX: 0,
        rotY: 0,
        rotZ: 0,
        wasOnBottom: false,
        previousVy: vy
      });
    }
  }
  
  // Функція для скидання сцени до дефолтного стану
  function resetScene() {
    // Видаляємо winBall якщо існує
     console.log('resetScene');
    if (winBall !== null) {
      scene.remove(winBall);
      if (winBall.material.map) {
        winBall.material.map.dispose();
      }
      winBall.material.dispose();
      winBall.geometry.dispose();
      winBall = null;
      winBallFadeInStartTime = null;
    }
    
    // Видаляємо всі існуючі кульки
    for (let i = 0; i < balls.length; i++) {
      const ball = balls[i];
      scene.remove(ball.mesh);
      if (ball.mesh.material.map) {
        ball.mesh.material.map.dispose();
      }
      ball.mesh.material.dispose();
    }
    balls.length = 0;
    
    // Вимикаємо вітер
    windActive = false;
    
    // Створюємо нові кульки
    createNewBalls();
  }
  
  // Функція для запуску послідовності анімацій виграшу
  async function playWinSequence(popupAttr = 'winPopup', amount = null, currency = '€') {
    // 1. Вмикаємо вітер (трясіння кульок)
    windActive = true;
    
    // 2. Через 2000мс показуємо кульку WIN
    await new Promise(resolve => setTimeout(resolve, 2000));
    windActive = false;
    await showWinBall();
    
    // 3. Чекаємо завершення анімації появи кульки + 300мс
    await new Promise(resolve => setTimeout(resolve, winBallFadeInDuration + 300));
    
    // 4. Показуємо попап
    openPopupByAttr(popupAttr, amount, currency);
    
    // 5. Скидаємо сцену до дефолтного стану
    resetScene();
  }
  
  // Повертаємо функції для керування
  return {
    toggleWind: () => {
      windActive = !windActive;
      return windActive;
    },
    isWindActive: () => windActive,
    showWinBall: showWinBall,
    resetScene: resetScene,
    playWinSequence: playWinSequence
  };
}




// Popup functions
function openPopupByAttr(popupAttr, amount = null, currency = '€') {
    const overlay = document.querySelector('.overlay');
    const allPopups = document.querySelectorAll('.popup');
    const globalLink = document.getElementById('globalLink');
    
    if (!overlay) return;
    
    // Ховаємо всі попапи
    allPopups.forEach(p => {
        p.classList.remove('show');
        // p.style.display = 'none';
    });
    
    // Блокуємо скрол
    document.body.style.overflow = 'hidden';
    
    // Показуємо оверлей (прибираємо клас _opacity та додаємо show)
    overlay.classList.remove('_opacity');
    overlay.classList.add('show');
    
    // Знаходимо потрібний попап
    const targetPopup = document.querySelector(`.popup[data-popup="${popupAttr}"]`);
    if (targetPopup) {
        // Оновлюємо значення виграшу якщо передано
        if (amount !== null) {
            const prizeElement = targetPopup.querySelector('.popup__prize');
            if (prizeElement) {
                prizeElement.textContent = `${amount} ${currency}`;
            }
        }
        
        // // Показуємо попап
        // targetPopup.style.display = 'block';
        // Невелика затримка для анімації
        setTimeout(() => {
            targetPopup.classList.add('show');
        }, 10);
    }

    // Після показу другого попапу робимо посилання клікабельним на всю сторінку
    if (popupAttr === 'winPopup2' && globalLink) {
        globalLink.style.display = 'block';
    }
}

function closeAllPopups() {
    const overlay = document.querySelector('.overlay');
    const allPopups = document.querySelectorAll('.popup');
    
    if (!overlay) return;
    
    // Ховаємо всі попапи (прибираємо show для анімації)
    allPopups.forEach(p => {
        p.classList.remove('show');
    });
    
    // Ховаємо оверлей після завершення анімації попапу
    setTimeout(() => {
        overlay.classList.remove('show');
        overlay.classList.add('_opacity');
        allPopups.forEach(p => {
            p.classList.remove('show');
        });
        // Відновлюємо скрол
        document.body.style.overflow = 'auto';
    }, 300); // Час анімації
}

// Ініціалізація обробників попапів
function initPopups() {
    const overlay = document.querySelector('.overlay');
    if (!overlay) return;

    // Закриття по кліку на кнопку закриття
    document.querySelectorAll('.popup__close').forEach(closeBtn => {
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeAllPopups();
        });
    });

    // Закриття по кліку на оверлей (тільки якщо клік не на самому попапі)
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay || overlay.classList.contains('show')) {
            const openPopup = document.querySelector('.popup.show');
            if (openPopup && !openPopup.contains(e.target)) {
                closeAllPopups();
            }
        }
    });

    // Закриття по Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay.classList.contains('show')) {
            closeAllPopups();
        }
    });
}
initPopups();

// Кнопка всередині попапу з data-action="closePopup"
document.querySelectorAll('[data-action="closePopup"]').forEach(btn => {
  btn.addEventListener('click', (e) => {
      e.preventDefault();
      closeAllPopups();
  });
});



// Тестове меню
const menuBtn = document.querySelector(".menu-btn");
const menuTest = document.querySelector(".menu-test");

if (menuBtn && menuTest) {
    menuBtn.addEventListener("click", () => {
        menuTest.classList.toggle("hide");
    });
}

// Кнопка для вмикання/вимикання вітру
const windToggleBtn = document.getElementById('windToggleBtn');
if (windToggleBtn && windController) {
  windToggleBtn.addEventListener('click', () => {
    const isActive = windController.toggleWind();
    windToggleBtn.textContent = isActive ? 'Виключити вітер' : 'Тест вітру';
    windToggleBtn.style.background = isActive ? '#3AFFC3' : '#FF267E';
  });
}

// Кнопка для показу великої кульки "WIN"
const showWinBallBtn = document.getElementById('showWinBallBtn');
if (showWinBallBtn && windController && windController.showWinBall) {
  showWinBallBtn.addEventListener('click', () => {
    windController.showWinBall();
  });
}

// Кнопка для скидання сцени
const resetSceneBtn = document.getElementById('resetSceneBtn');
if (resetSceneBtn && windController && windController.resetScene) {
  resetSceneBtn.addEventListener('click', () => {
    windController.resetScene();
  });
}

// Кнопка для запуску WIN послідовності
const playWinSequenceBtn = document.getElementById('playWinSequenceBtn');
if (playWinSequenceBtn && windController && windController.playWinSequence) {
  playWinSequenceBtn.addEventListener('click', () => {
    const popupAttr = playWinSequenceBtn.getAttribute('data-popup') || 'winPopup';
    const amountAttr = playWinSequenceBtn.getAttribute('data-amount');
    const currencyAttr = playWinSequenceBtn.getAttribute('data-currency');
    const amount = amountAttr ? Number(amountAttr) : null;
    const currency = currencyAttr || '€';
    windController.playWinSequence(popupAttr, amount, currency);
  });
}

// Кнопка на головному екрані (land__btn) — запуск WIN послідовності з урахуванням кліків
const ctaPlayBtn = document.getElementById('ctaPlayBtn');
let ctaPlayClickCount = 0;

if (ctaPlayBtn && windController && windController.playWinSequence) {
  ctaPlayBtn.addEventListener('click', () => {
    ctaPlayBtn.style.pointerEvents = 'none';
    setTimeout(() => {
      ctaPlayBtn.style.pointerEvents = '';
    }, 5000);
    ctaPlayClickCount += 1; // рахуємо від 1

    // На 1-й клік показуємо перший попап, на 2-й — другий; далі чергуємо
    const isFirst = ctaPlayClickCount % 2 === 1;
    const popupAttr = isFirst ? 'winPopup' : 'winPopup2';
    const amount = isFirst ? 3000 : 500;
    const currency = isFirst ? '€' : 'FS';

    windController.playWinSequence(popupAttr, amount, currency);
  });
}

// Кнопки для тестування попапів
const popupTestButtons = document.querySelectorAll('.popup-test-btn');
popupTestButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        const popupAttr = btn.getAttribute('data-popup');
        const amountAttr = btn.getAttribute('data-amount');
        const currencyAttr = btn.getAttribute('data-currency');
        if (popupAttr) {
            const amount = amountAttr ? Number(amountAttr) : null;
            const currency = currencyAttr || '€';
            openPopupByAttr(popupAttr, amount, currency);
        }
    });
});

// Кнопка закриття всіх попапів
const popupCloseBtn = document.querySelector('.popup-test-btn-close');
if (popupCloseBtn) {
    popupCloseBtn.addEventListener('click', () => {
        closeAllPopups();
        const globalLink = document.getElementById('globalLink');
        if (globalLink) {
            globalLink.style.display = 'none';
        }
    });
}


