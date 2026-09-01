import * as THREE from 'three'
import { lerpAngle } from './routeGeometry'

export interface PuckState {
  x: number
  z: number
  psi: number
  moving: boolean
  tunnelDim: number
}

export interface NavigationPuck {
  group: THREE.Group
  update: (state: PuckState, dt: number, time: number) => void
  dispose: () => void
}

export function createNavigationPuck(): NavigationPuck {
  const group = new THREE.Group()
  group.scale.setScalar(1.28)

  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  })
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(3.5, 28), shadowMat)
  shadow.rotation.x = -Math.PI / 2
  shadow.position.y = 0.04
  group.add(shadow)

  const haloMat = new THREE.MeshBasicMaterial({
    color: 0x00d9ff,
    transparent: true,
    opacity: 0.42,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  })
  const halo = new THREE.Mesh(new THREE.CircleGeometry(3.25, 32), haloMat)
  halo.rotation.x = -Math.PI / 2
  halo.position.y = 0.09
  group.add(halo)

  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x236087,
    emissive: 0x0089ad,
    emissiveIntensity: 0.55,
    metalness: 0.48,
    roughness: 0.38,
    transparent: true,
    opacity: 1,
    fog: false,
  })

  const cabinMat = new THREE.MeshStandardMaterial({
    color: 0xa8e5f2,
    emissive: 0x275a6b,
    emissiveIntensity: 0.38,
    metalness: 0.22,
    roughness: 0.25,
    transparent: true,
    opacity: 0.88,
    fog: false,
  })
  const wheelMat = new THREE.MeshStandardMaterial({
    color: 0x06090d,
    roughness: 0.8,
    metalness: 0.15,
    transparent: true,
    opacity: 1,
    fog: false,
  })
  const lightMat = new THREE.MeshBasicMaterial({
    color: 0xc9f7ff,
    transparent: true,
    opacity: 0.95,
    toneMapped: false,
  })
  const tailMat = new THREE.MeshBasicMaterial({
    color: 0xff365f,
    transparent: true,
    opacity: 0.85,
    toneMapped: false,
  })
  const accentMat = new THREE.MeshBasicMaterial({
    color: 0xf59e0b,
    transparent: true,
    opacity: 0.85,
    toneMapped: false,
  })

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.65, 5.2), bodyMat)
  chassis.position.y = 0.68
  chassis.castShadow = true
  group.add(chassis)

  const hood = new THREE.Mesh(new THREE.BoxGeometry(2.55, 0.42, 1.65), bodyMat)
  hood.position.set(0, 1.08, 1.68)
  hood.castShadow = true
  group.add(hood)

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.18, 1.05, 2.35), cabinMat)
  cabin.position.set(0, 1.45, -0.18)
  cabin.scale.set(0.92, 1, 0.88)
  cabin.rotation.x = -0.045
  cabin.castShadow = true
  group.add(cabin)

  const bumperFront = new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.22, 0.18), bodyMat)
  bumperFront.position.set(0, 0.55, 2.68)
  group.add(bumperFront)
  const bumperRear = bumperFront.clone()
  bumperRear.position.z = -2.68
  group.add(bumperRear)

  const wheelGeometry = new THREE.CylinderGeometry(0.48, 0.48, 0.38, 14)
  for (const x of [-1.48, 1.48]) {
    for (const z of [-1.62, 1.62]) {
      const wheel = new THREE.Mesh(wheelGeometry, wheelMat)
      wheel.rotation.z = Math.PI / 2
      wheel.position.set(x, 0.52, z)
      wheel.castShadow = true
      group.add(wheel)
    }
  }

  const lightGeometry = new THREE.BoxGeometry(0.48, 0.22, 0.12)
  for (const x of [-0.85, 0.85]) {
    const headlight = new THREE.Mesh(lightGeometry, lightMat)
    headlight.position.set(x, 0.88, 2.78)
    group.add(headlight)

    const tailLight = new THREE.Mesh(lightGeometry, tailMat)
    tailLight.position.set(x, 0.82, -2.78)
    group.add(tailLight)
  }

  const accentGeometry = new THREE.BoxGeometry(0.12, 0.18, 0.72)
  for (const x of [-1.43, 1.43]) {
    const accent = new THREE.Mesh(accentGeometry, accentMat)
    accent.position.set(x, 0.86, 0.15)
    group.add(accent)
  }

  // Map render stack: city 0–2, tunnel 8–16, telemetry 18–22,
  // DRISHTI ribbon 24–25, car 30–32.
  group.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    child.renderOrder = child === shadow || child === halo ? 30 : 32
  })

  let smoothX = 0
  let smoothZ = 0
  let smoothPsi = 0
  let smoothDim = 1
  let initialized = false

  const disposables: THREE.Material[] = [
    shadowMat,
    haloMat,
    bodyMat,
    cabinMat,
    wheelMat,
    lightMat,
    tailMat,
    accentMat,
  ]
  const geometries: THREE.BufferGeometry[] = [
    shadow.geometry,
    halo.geometry,
    chassis.geometry,
    hood.geometry,
    cabin.geometry,
    bumperFront.geometry,
    wheelGeometry,
    lightGeometry,
    accentGeometry,
  ]

  return {
    group,
    update(state: PuckState, dt: number, time: number) {
      const t = Math.min(1, dt * 8)
      if (!initialized) {
        smoothX = state.x
        smoothZ = state.z
        smoothPsi = state.psi
        initialized = true
      } else {
        smoothX += (state.x - smoothX) * t
        smoothZ += (state.z - smoothZ) * t
        smoothPsi = lerpAngle(smoothPsi, state.psi, t)
      }

      group.position.set(smoothX, 0.14, smoothZ)
      group.rotation.y = -smoothPsi + Math.PI / 2

      const breathe = state.moving ? 1 : 0.85 + Math.sin(time * 2.2) * 0.08
      smoothDim += (state.tunnelDim - smoothDim) * Math.min(1, dt * 4.5)
      const dim = smoothDim
      haloMat.opacity = 0.14 + 0.32 * breathe * dim
      bodyMat.emissiveIntensity = 0.12 + 0.34 * dim
      bodyMat.opacity = 0.62 + 0.38 * dim
      cabinMat.emissiveIntensity = 0.1 + 0.24 * dim
      cabinMat.opacity = 0.58 + 0.3 * dim
      shadowMat.opacity = 0.15 + 0.25 * dim
      lightMat.opacity = 0.38 + 0.57 * dim
      tailMat.opacity = 0.32 + 0.53 * dim
      accentMat.opacity = 0.25 + 0.6 * dim
    },
    dispose() {
      geometries.forEach((g) => g.dispose())
      disposables.forEach((m) => m.dispose())
    },
  }
}
