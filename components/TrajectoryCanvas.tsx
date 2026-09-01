'use client'

import { useRef, useState } from 'react'
import { CITY_BOUNDS } from '@/components/map/cityVisualConfig'
import { NavigationMap, type NavigationMapHandle } from '@/components/map/NavigationMap'
import { useSnapshot } from './useEngine'
import { CityBaseLayer } from './canvas/CityBaseLayer'
import { SyntheticRoadNetwork } from './canvas/SyntheticRoadNetwork'
import { BuildingLayer } from './canvas/BuildingLayer'
import { RoadLayer } from './canvas/RoadLayer'
import { TunnelLayer } from './canvas/TunnelLayer'
import { MapLabelsLayer } from './canvas/MapLabelsLayer'
import { BlackoutClock } from './canvas/BlackoutClock'
import { BaselineFailureBanner } from './canvas/BaselineFailureBanner'
import { DecisionStrip } from './canvas/DecisionStrip'
import { OffMapChip } from './canvas/OffMapChip'
import { ErrorChart } from './canvas/ErrorChart'
import { MapControls } from './mission/MapControls'

const PAD = 45
const SHOW_SVG_ROLLBACK = false

const VIEW = {
  x: CITY_BOUNDS.minX - PAD,
  y: -(CITY_BOUNDS.maxY + PAD),
  w: CITY_BOUNDS.maxX - CITY_BOUNDS.minX + PAD * 2,
  h: CITY_BOUNDS.maxY - CITY_BOUNDS.minY + PAD * 2,
}

/**
 * Hero trajectory panel. Three.js NavigationMap is the active renderer; SVG stack
 * kept behind SHOW_SVG_ROLLBACK for emergency fallback only.
 */
export function TrajectoryCanvas({
  children,
  overlay,
}: {
  children?: React.ReactNode
  /** Rendered above the scene; used for the field-orientation instrument. */
  overlay?: React.ReactNode
}) {
  const mapRef = useRef<NavigationMapHandle>(null)
  const [cityLayersVisible, setCityLayersVisible] = useState(true)
  const snap = useSnapshot()

  const denied = snap.navState === 'DR_ACTIVE'

  return (
    <div
      className="trajectory-map-mount"
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: 'var(--bg-panel)',
        border: '1px solid var(--border)',
        borderRadius: 4,
        overflow: 'hidden',
      }}
    >
      <NavigationMap ref={mapRef} cityLayersVisible={cityLayersVisible} />

      {SHOW_SVG_ROLLBACK && (
        <svg
          viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`}
          preserveAspectRatio="xMidYMid meet"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            display: 'block',
            pointerEvents: 'none',
            opacity: 0,
          }}
          aria-hidden
        >
          <g transform="scale(1,-1)">
            <CityBaseLayer />
            <SyntheticRoadNetwork visible={cityLayersVisible} />
            <BuildingLayer visible={cityLayersVisible} />
            <RoadLayer />
            <TunnelLayer />
            <MapLabelsLayer />
          </g>
        </svg>
      )}

      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: denied
            ? 'radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(130,22,22,0.34) 100%)'
            : 'radial-gradient(ellipse at center, rgba(0,0,0,0) 60%, rgba(0,0,0,0.32) 100%)',
          transition: 'background 500ms ease',
        }}
      />

      <MapControls
        onZoomIn={() => mapRef.current?.zoomIn()}
        onZoomOut={() => mapRef.current?.zoomOut()}
        onRecenter={() => mapRef.current?.recenter()}
        onToggleLayers={() => {
          setCityLayersVisible((v) => {
            const next = !v
            mapRef.current?.setCityVisible(next)
            return next
          })
        }}
        layersVisible={cityLayersVisible}
      />

      <Legend />
      {overlay}
      <BlackoutClock snap={snap} />
      <OffMapChip snap={snap} />
      <BaselineFailureBanner snap={snap} />

      <div className="trajectory-error-chart-slot">
        <ErrorChart snap={snap} width={220} height={120} inset />
      </div>

      <DecisionStrip snap={snap} />
      {children}
    </div>
  )
}

function Legend() {
  const items: [string, string][] = [
    ['GROUND TRUTH', 'var(--truth)'],
    ['DRISHTI', 'var(--drishti)'],
    ['NAIVE INS', 'var(--naive)'],
  ]
  return (
    <div
      style={{
        position: 'absolute',
        left: 12,
        bottom: 46,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      {items.map(([label, color]) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 14, height: 2.5, background: color, borderRadius: 1 }} />
          <span className="label" style={{ fontSize: 9 }}>
            {label}
          </span>
        </div>
      ))}
    </div>
  )
}
