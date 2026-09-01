'use client'

export function MapControls({
  onZoomIn,
  onZoomOut,
  onRecenter,
  onToggleLayers,
  layersVisible,
}: {
  onZoomIn: () => void
  onZoomOut: () => void
  onRecenter: () => void
  onToggleLayers: () => void
  layersVisible: boolean
}) {
  return (
    <div
      className="z-hud"
      style={{
        position: 'absolute',
        right: 10,
        bottom: 88,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        pointerEvents: 'auto',
      }}
    >
      <button type="button" className="map-control-btn" onClick={onZoomIn} title="Zoom in" aria-label="Zoom in">
        +
      </button>
      <button type="button" className="map-control-btn" onClick={onZoomOut} title="Zoom out" aria-label="Zoom out">
        −
      </button>
      <button type="button" className="map-control-btn map-control-btn-wide" onClick={onRecenter} title="Recenter map">
        RECENTER
      </button>
      {/* <button
        type="button"
        className={`map-control-btn map-control-btn-wide ${layersVisible ? 'map-control-btn-active' : ''}`}
        onClick={onToggleLayers}
        title="Toggle city layers"
      >
        LAYERS
      </button> */}
    </div>
  )
}
