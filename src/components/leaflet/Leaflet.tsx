import {useEffect, useRef, useState} from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type {Feature, Position} from 'geojson';
import MapControls from '../MapControls';
import {InteractionType} from '../openlayers/TacticalGraphicsManager';
import {
    getLabel,
    renderTacticalGraphic,
    TacticalGraphicName,
    toFeatureCollection,
} from '@zaes/tactical-graphics';

/**
 * Leaflet demo tab — a reference for consuming the library with Leaflet.
 *
 * The library is renderer-agnostic: `renderTacticalGraphic()` returns GeoJSON,
 * and `toFeatureCollection()` hands it to any GeoJSON consumer. Here that is
 * `L.geoJSON`. Click to drop points, double-click to finish; the drawn geometry
 * is fed to the selected graphic and the result is drawn on the map.
 */
export default function LeafletMap() {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<L.Map | null>(null);
    const graphicsLayer = useRef<L.LayerGroup | null>(null); // finished graphics
    const previewLayer = useRef<L.LayerGroup | null>(null); // in-progress draw
    const drawPoints = useRef<L.LatLng[]>([]);
    const drawing = useRef(false);
    const lastClickAt = useRef(0);
    const selectedShape = useRef<TacticalGraphicName>(TacticalGraphicName.MainAxisOfAdvance);
    const [interactionMode, setInteractionMode] = useState<InteractionType>(InteractionType.view);
    const [hint, setHint] = useState('');

    useEffect(() => {
        if (!containerRef.current || mapRef.current) return;
        const map = L.map(containerRef.current, {center: [25, -80], zoom: 5, doubleClickZoom: false});
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap contributors',
        }).addTo(map);
        graphicsLayer.current = L.layerGroup().addTo(map);
        previewLayer.current = L.layerGroup().addTo(map);
        map.on('click', onMapClick);
        // Leaflet mis-sizes when its container was hidden/resized at mount.
        setTimeout(() => map.invalidateSize(), 0);
        mapRef.current = map;

        return () => {
            map.remove();
            mapRef.current = null;
        };
    }, []);

    const onMapClick = (e: L.LeafletMouseEvent) => {
        if (!drawing.current) return;
        // Detect a double-click by timing (Leaflet's own dblclick event is
        // unreliable to drive from automation). Two clicks within 300 ms finish
        // the draw; the first of the pair is kept as the final vertex.
        const now = Date.now();
        if (now - lastClickAt.current < 300) {
            lastClickAt.current = 0;
            finishDraw();
            return;
        }
        lastClickAt.current = now;
        drawPoints.current.push(e.latlng);
        redrawPreview();
    };

    const redrawPreview = () => {
        const layer = previewLayer.current;
        if (!layer) return;
        layer.clearLayers();
        const pts = drawPoints.current;
        pts.forEach(p => L.circleMarker(p, {radius: 4, color: '#1976d2', fillOpacity: 1}).addTo(layer));
        if (pts.length >= 2) L.polyline(pts, {color: '#1976d2', weight: 2, dashArray: '4 4'}).addTo(layer);
    };

    const startDraw = () => {
        drawPoints.current = [];
        drawing.current = true;
        lastClickAt.current = 0;
        setInteractionMode(InteractionType.drawing);
        setHint('Click to add points · double-click to finish');
        previewLayer.current?.clearLayers();
    };

    const finishDraw = () => {
        if (!drawing.current) return;
        drawing.current = false;
        setInteractionMode(InteractionType.view);
        setHint('');
        const pts = drawPoints.current;
        previewLayer.current?.clearLayers();
        if (pts.length < 1) return;
        // GeoJSON is [lon, lat]; Leaflet's LatLng is {lat, lng}.
        renderSelected(pts.map(p => [p.lng, p.lat]));
    };

    const featureFor = (
        name: TacticalGraphicName,
        geometry: Feature['geometry'],
        extra: Record<string, unknown> = {},
    ): Feature => ({
        type: 'Feature',
        geometry,
        properties: {tacticalGraphic: {name, ...extra}},
    });

    // Metres between two [lon, lat] points (haversine) and the bearing from the
    // first to the second, in degrees. Point/mission-task graphics need a size
    // (radius, in metres) and rotation; we take them from a second click when
    // the user drags one out, and fall back to a visible default otherwise.
    const metresBetween = ([lo1, la1]: Position, [lo2, la2]: Position): number => {
        const R = 6_371_000;
        const toRad = (d: number) => (d * Math.PI) / 180;
        const dLat = toRad(la2 - la1);
        const dLon = toRad(lo2 - lo1);
        const a =
            Math.sin(dLat / 2) ** 2 + Math.cos(toRad(la1)) * Math.cos(toRad(la2)) * Math.sin(dLon / 2) ** 2;
        return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
    };
    const bearing = ([lo1, la1]: Position, [lo2, la2]: Position): number => {
        const toRad = (d: number) => (d * Math.PI) / 180;
        const y = Math.sin(toRad(lo2 - lo1)) * Math.cos(toRad(la2));
        const x =
            Math.cos(toRad(la1)) * Math.sin(toRad(la2)) -
            Math.sin(toRad(la1)) * Math.cos(toRad(la2)) * Math.cos(toRad(lo2 - lo1));
        return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
    };

    const renderSelected = (coords: Position[]) => {
        const name = selectedShape.current;
        try {
            let render;
            try {
                render = renderTacticalGraphic(featureFor(name, {type: 'LineString', coordinates: coords}));
            } catch (e) {
                // The library says which base geometry it wanted; give it that.
                const kind = /expects a (Point|Polygon)/.exec((e as Error).message)?.[1];
                if (kind === 'Point') {
                    // Radius/rotation from a second click if the user dragged one
                    // out; otherwise a default that is visible at typical zoom.
                    const size = coords.length >= 2 ? metresBetween(coords[0], coords[1]) : 40_000;
                    const rotation = coords.length >= 2 ? bearing(coords[0], coords[1]) : 0;
                    render = renderTacticalGraphic(
                        featureFor(name, {type: 'Point', coordinates: coords[0]}, {size, rotation}),
                    );
                } else if (kind === 'Polygon') {
                    const ring = [...coords];
                    const [f, l] = [ring[0], ring[ring.length - 1]];
                    if (f[0] !== l[0] || f[1] !== l[1]) ring.push(f); // close the ring
                    render = renderTacticalGraphic(featureFor(name, {type: 'Polygon', coordinates: [ring]}));
                } else {
                    throw e;
                }
            }
            drawGraphic(render.graphic, render.labels, name);
        } catch (e) {
            setHint((e as Error).message);
            setTimeout(() => setHint(''), 4000);
        }
    };

    const drawGraphic = (graphic: Feature, labels: Feature, name: TacticalGraphicName) => {
        const layer = graphicsLayer.current;
        if (!layer) return;
        L.geoJSON(toFeatureCollection({graphic, labels, handles: labels, base: graphic, name}, ['graphic']), {
            style: {color: '#0b1fd8', weight: 3},
            pointToLayer: (_f, latlng) => L.circleMarker(latlng, {radius: 3, color: '#0b1fd8'}),
        }).addTo(layer);

        // Optional doctrinal label at each anchor point (e.g. "PL", "RIP").
        const text = getLabel(name);
        if (text && labels.geometry.type === 'MultiPoint') {
            for (const [lon, lat] of labels.geometry.coordinates) {
                L.marker([lat, lon], {
                    interactive: false,
                    icon: L.divIcon({
                        className: '',
                        html: `<span style="font:bold 14px sans-serif;color:#0b1fd8;text-shadow:0 0 2px #fff,0 0 2px #fff">${text}</span>`,
                    }),
                }).addTo(layer);
            }
        }
    };

    const reset = () => graphicsLayer.current?.clearLayers();

    return (
        <div style={{position: 'relative', width: '100%', height: '100%'}}>
            <div ref={containerRef} style={{position: 'absolute', inset: 0}}/>
            {hint && (
                <div
                    style={{
                        position: 'absolute',
                        top: 8,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        zIndex: 1000,
                        background: 'rgba(0,0,0,0.75)',
                        color: '#fff',
                        padding: '4px 12px',
                        borderRadius: 4,
                        font: '13px sans-serif',
                        pointerEvents: 'none',
                    }}
                >
                    {hint}
                </div>
            )}
            <MapControls
                onDrawTacticalGraphics={startDraw}
                onToggleInteraction={setInteractionMode}
                onShapeChange={value => (selectedShape.current = value)}
                onReset={reset}
                interactionMode={interactionMode}
                isRotating={false}
                isResizing={false}
                isRepositioning={false}
                isModifying={false}
                defaultShape={selectedShape.current}
            />
        </div>
    );
}
