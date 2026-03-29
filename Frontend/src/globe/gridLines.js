/**
 * SOLARIS — Holographic Grid Lines
 * Lat/lon grid overlay for the globe
 */
import * as THREE from 'three';

export function createGridLines(parent) {
  const group = new THREE.Group();
  const radius = 1.002;
  const material = new THREE.LineBasicMaterial({
    color: 0x00aadd,
    transparent: true,
    opacity: 0.08,
    depthWrite: false,
  });

  // Latitude lines every 15 degrees
  for (let lat = -75; lat <= 75; lat += 15) {
    const phi = (90 - lat) * Math.PI / 180;
    const points = [];
    for (let i = 0; i <= 128; i++) {
      const theta = (i / 128) * Math.PI * 2;
      points.push(new THREE.Vector3(
        radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.cos(phi),
        radius * Math.sin(phi) * Math.sin(theta),
      ));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    group.add(new THREE.Line(geo, material));
  }

  // Longitude lines every 15 degrees
  for (let lon = 0; lon < 360; lon += 15) {
    const theta = lon * Math.PI / 180;
    const points = [];
    for (let i = 0; i <= 128; i++) {
      const phi = (i / 128) * Math.PI;
      points.push(new THREE.Vector3(
        radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.cos(phi),
        radius * Math.sin(phi) * Math.sin(theta),
      ));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    group.add(new THREE.Line(geo, material));
  }


  // Group is added to earth.group by main.js

  return {
    group,
    update(dt) {
      // Grid rotates with earth — handled by parent
    },
  };
}
