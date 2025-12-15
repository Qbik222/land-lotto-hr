"use strict";

import * as THREE from 'three';

// Game Glass 3D Scene (Three.js)
function initGameGlass() {
  const canvas = document.getElementById('gameGlass');
  if (!canvas) return;

  // Розміри відповідають видимій синій області на фоні (glass.png)
  // Синя область менша за розмір канвасу через відступи
  const containerRadius = 330; // Радіус сфери контейнера (підігнано під фон)
  const ballRadius = 45; // ~90px diameter
  const ballCount = 40; // Кількість кульок
  const balls = [];

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
    antialias: true
  });
  renderer.setSize(760, 760);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setClearColor(0x000000, 0); // Прозорий фон
  renderer.shadowMap.enabled = true; // Увімкнути shadow maps
  renderer.shadowMap.type = THREE.PCFSoftShadowMap; // М'які тіні

  // Освітлення
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.9); // Збільшено для більш яскравого білого
  scene.add(ambientLight);

  // Directional light для тіней та об'ємності
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
  directionalLight.position.set(0.5, 1, 0.8);
  directionalLight.castShadow = true; // Дозволити світлу створювати тіні
  
  // Налаштування shadow camera для directional light
  directionalLight.shadow.mapSize.width = 2048;
  directionalLight.shadow.mapSize.height = 2048;
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
    opacity: 0.4, // Напівпрозорість для відповідності фону
    side: THREE.DoubleSide,
    metalness: 0.3,
    roughness: 0.4
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

  // Функція для створення текстури з числом
  function createNumberTexture(number) {
    const canvas = document.createElement('canvas');
    const size = 512; // Розмір текстури (більший для кращої якості)
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    // Білий фон
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    
    // Текст з числом - зменшений розмір шрифту
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 100px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(number.toString(), size / 2, size / 2);
    
    // Створюємо текстуру з canvas
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  // Геометрія для кульок (спільна для всіх)
  const sphereGeometry = new THREE.SphereGeometry(ballRadius, 16, 16);

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
    sphere.castShadow = true; // Дозволити кульці створювати тіні
    sphere.receiveShadow = true; // Дозволити кульці отримувати тіні
    scene.add(sphere);

    balls.push({
      mesh: sphere,
      x: x,
      y: y,
      z: z,
      vx: vx,
      vy: vy,
      vz: vz
    });
  }

  // Фізика та оновлення позицій кульок
  function updateBalls(deltaTime) {
    const damping = 0.999; // Невелике згасання для стабільності
    const gravity = 0.5; // Гравітація вниз по Y
    const maxSafeRadius = containerRadius - ballRadius - 0.1; // Безпечний радіус з невеликим запасом
    const bottomThreshold = ballRadius * 1.5; // Поріг для визначення "на дні" (нижня частина сфери)

    for (let i = 0; i < balls.length; i++) {
      const ball = balls[i];

      // Оновлення позиції
      ball.x += ball.vx * deltaTime;
      ball.y += ball.vy * deltaTime;
      ball.z += ball.vz * deltaTime;

      // Перевірка чи кулька на дні (нижня частина сфери)
      const distanceFromCenter = Math.sqrt(ball.x * ball.x + ball.y * ball.y + ball.z * ball.z);
      const isOnBottom = ball.y < -containerRadius * 0.3 && distanceFromCenter > containerRadius * 0.7;
      
      // Гравітація до низу канвасу (по осі Y вниз) - тільки якщо кулька не на дні
      if (!isOnBottom) {
        ball.vy -= gravity * deltaTime;
      } else {
        // Якщо кулька на дні - не застосовуємо гравітацію і застосовуємо сильне тертя
        const bottomFriction = 0.7; // Дуже сильне тертя для кульок на дні
        ball.vx *= bottomFriction;
        ball.vy *= bottomFriction;
        ball.vz *= bottomFriction;
        
        // Якщо швидкість дуже мала - повністю зупиняємо
        const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy + ball.vz * ball.vz);
        if (speed < 0.05) {
          ball.vx = 0;
          ball.vy = 0;
          ball.vz = 0;
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

      // Застосувати згасання (тільки якщо кулька не на дні)
      if (!isOnBottom) {
        ball.vx *= damping;
        ball.vy *= damping;
        ball.vz *= damping;
      }

      // Оновити позицію меша в Three.js
      ball.mesh.position.set(ball.x, ball.y, ball.z);
    }
  }

  // Анімаційний цикл
  let lastTime = performance.now();
  function animate(currentTime) {
    const deltaTime = Math.min((currentTime - lastTime) / 16.67, 2); // Обмежити deltaTime для стабільності
    lastTime = currentTime;

    updateBalls(deltaTime);
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  // Handle window resize
  function handleResize() {
    const width = Math.min(760, window.innerWidth);
    const height = width;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  window.addEventListener('resize', handleResize);
  handleResize();

  // Запуск анімації
  requestAnimationFrame(animate);
}

// Виклик функції ініціалізації канви
initGameGlass();
