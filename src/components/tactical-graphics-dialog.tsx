import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Feature, Map} from 'ol';
import {Circle, Geometry, GeometryCollection, LineString, MultiLineString, MultiPoint, Point, Polygon} from 'ol/geom';
import {Draw} from 'ol/interaction';
import Draggable from 'react-draggable';
import {
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControl,
    InputLabel,
    MenuItem,
    OutlinedInput,
    Paper,
    Select,
    SelectChangeEvent,
} from '@mui/material';
import {Coordinate} from 'ol/coordinate';
import VectorSource from 'ol/source/Vector';
import VectorLayer from 'ol/layer/Vector';
import Style from 'ol/style/Style';
import {getColorByHostility} from './openlayers/openlayerStyles';
import {TacticalGraphicsManager} from './openlayers/TacticalGraphicsManager';
import {GraphicLabels, GraphicLinkRegistry, RangeFanConfig} from '../utils/graphicLinkRegistry';
import {readGraphicLabels, writeGraphicProperties} from './openlayers/graphicProperties';
import {
    getDisplayName,
    RangeFanBand,
    RouteDirection,
    TacticalGraphicConfidence,
    TacticalGraphicEchelon,
    TacticalGraphicHostility,
    TacticalGraphicName,
    TacticalGraphicStatus
} from '@zaes/tactical-graphics';
import {getGraphicFields} from "./openlayers/graphicFieldRegistry";

/**
 * Sensible starter config when a user opens the range-fan editor on a
 * freshly-drawn fan (or one that doesn't yet have a stored config).
 *
 * Defaults: a single 1km band; for the sector, ±45° around the drawn
 * bearing — but the dialog has no access to that bearing here, so we
 * leave azimuths undefined and the geometry generator computes the
 * defaults from the controller's `rotation`.
 *
 * Range values are stored in **kilometers** to match the dialog's UX;
 * the geometry generator multiplies by 1000 when calling turf.
 */
function defaultRangeFanConfig(): RangeFanConfig {
    return {
        bands: [{range: 1}],
    };
}

const DTG_MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

function nowDtg(): string {
    const d = new Date();
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    return `${dd}${hh}${mm}Z${DTG_MONTHS[d.getUTCMonth()]}${d.getUTCFullYear()}`;
}

/** Convert DTG string (e.g. "101430ZAPR2026") to datetime-local value ("2026-04-10T14:30"). */
function dtgToDateTimeLocal(dtg: string): string {
    const m = dtg.match(/^(\d{2})(\d{2})(\d{2})Z([A-Z]{3})(\d{4})$/);
    if (!m) return '';
    const [, dd, hh, min, mon, yyyy] = m;
    const monthIdx = DTG_MONTHS.indexOf(mon);
    if (monthIdx < 0) return '';
    const month = String(monthIdx + 1).padStart(2, '0');
    return `${yyyy}-${month}-${dd}T${hh}:${min}`;
}

/** Convert datetime-local value ("2026-04-10T14:30") to DTG string ("101430ZAPR2026"). */
function dateTimeLocalToDtg(value: string): string {
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
    if (!m) return '';
    const [, yyyy, month, dd, hh, min] = m;
    const mon = DTG_MONTHS[parseInt(month, 10) - 1];
    return `${dd}${hh}${min}Z${mon}${yyyy}`;
}

interface TacticalGraphicsDialogProps {
    map: Map;
    tacticalGraphicsManager: TacticalGraphicsManager;
}

const hostilityOptions = Object.values(TacticalGraphicHostility);
const echelonOptions = Object.values(TacticalGraphicEchelon);
const statusOptions = Object.values(TacticalGraphicStatus);
const confidenceOptions = Object.values(TacticalGraphicConfidence);

interface TacticalGraphicProperties {
    echelon: TacticalGraphicEchelon;
    labels: GraphicLabels
}

const TacticalGraphicsDialog: React.FC<TacticalGraphicsDialogProps> = ({map, tacticalGraphicsManager}) => {
    const [selectedFeature, setSelectedFeature] = useState<Feature | any | null>(null);
    const [dialogPosition, setDialogPosition] = useState({x: 0, y: 0});
    const [isDragging, setIsDragging] = useState(false);
    const defaultProperties = {
        echelon: TacticalGraphicEchelon.brigade,
        identifier: '',
        labels: {label: '', hostility: TacticalGraphicHostility.friend}
    };
    const [pendingChanges, setPendingChanges] = useState<TacticalGraphicProperties>(defaultProperties);
    const [currentProperties, setCurrentProperties] = useState<TacticalGraphicProperties>(defaultProperties);
    const paperRef = useRef<HTMLDivElement | null>(null);
    const lineRef = useRef<SVGLineElement | null>(null);

    // Open dialog on feature click
    useEffect(() => {
        if (!map) return;

        const handleClick = (evt: any) => {
            if (tacticalGraphicsManager.isDrawing()) {
                console.debug('Skipping modal — drawing still active');
                return;
            }

            const activeInteractions = map.getInteractions().getArray();
            const hasActiveDraw = activeInteractions.some(i => i instanceof Draw);
            if (hasActiveDraw) return;

            if (Date.now() < tacticalGraphicsManager.lastDrawEndedAt) {
                console.debug('Skipping modal — click suppressed right after draw');
                return;
            }
            // short delay to let drawend finish
            setTimeout(() => {
                const feature = map.forEachFeatureAtPixel(evt.pixel, f => f);
                if (feature) {
                    setSelectedFeature(feature);

                    const graphicLabels = readGraphicLabels(feature);
                    const fields = getGraphicFields(feature.get('graphicName') as TacticalGraphicName);

                    // Build labels containing only fields enabled for this graphic type.
                    // This prevents disabled fields from accumulating stale values.
                    const filteredLabels: GraphicLabels = {
                        // label is required on the type; default to '' so it never renders as "undefined"
                        label: fields.identifier1 ? (graphicLabels.label ?? '') : '',
                        // hostility is always kept — it drives stroke/fill color even when not shown.
                        // Defaulted so the MUI Select never starts undefined and then flips from
                        // uncontrolled to controlled once the user picks a value.
                        hostility: graphicLabels.hostility ?? TacticalGraphicHostility.friend,
                    };
                    if (fields.identifier2) {
                        filteredLabels.countryCode = graphicLabels.countryCode ?? '';
                        filteredLabels.secondId = graphicLabels.secondId ?? '';
                        filteredLabels.secondCountryCode = graphicLabels.secondCountryCode ?? '';
                    }
                    if (fields.hostility) filteredLabels.confidence = graphicLabels.confidence;
                    // Defaulted for the same uncontrolled->controlled reason as hostility above.
                    // `present` is what dashStyle() already assumed for an unset status.
                    if (fields.status) filteredLabels.status = graphicLabels.status ?? TacticalGraphicStatus.present;
                    if (fields.direction) filteredLabels.direction = graphicLabels.direction;
                    if (fields.dtg1) filteredLabels.startDate = graphicLabels.startDate ?? nowDtg();
                    if (fields.dtg2) filteredLabels.endDate = graphicLabels.endDate ?? nowDtg();
                    if (fields.width) filteredLabels.width = graphicLabels.width;
                    if (fields.altitude1) filteredLabels.minAltitude = graphicLabels.minAltitude;
                    if (fields.altitude2) filteredLabels.maxAltitude = graphicLabels.maxAltitude;
                    if (fields.weapon) filteredLabels.weapon = graphicLabels.weapon ?? '';
                    if (fields.grids) {
                        filteredLabels.secondId = graphicLabels.secondId ?? '';
                        filteredLabels.grid = graphicLabels.grid;
                    }
                    if (fields.rangeFan) {
                        if (graphicLabels.rangeFan) {
                            filteredLabels.rangeFan = graphicLabels.rangeFan;
                        } else {
                            // First time opening the editor on this fan —
                            // seed a single band at the drawn radius so
                            // hitting OK doesn't snap the geometry to the
                            // 1km fallback. graphicSize is stamped in
                            // projected meters by the controller; convert
                            // to km (one decimal) for the editor.
                            const drawnSize = feature.get('graphicSize') as number | undefined;
                            const initialKm =
                                typeof drawnSize === 'number' && drawnSize > 0
                                    ? Math.max(0.1, Math.round((drawnSize / 1000) * 10) / 10)
                                    : 1;
                            filteredLabels.rangeFan = {bands: [{range: initialKm}]};
                        }
                    }

                    let curr = {
                        identifier: feature.get('customName') || '',
                        echelon: feature.get('echelon') || '',
                        countryCode: feature.get('countryCode') || '',
                        secondIdentifier: feature.get('secondIdentifier') || '',
                        secondCountryCode: feature.get('secondCountryCode') || '',
                        labels: filteredLabels,
                    }
                    setCurrentProperties(curr);
                    setPendingChanges(curr);

                    setDialogPosition({x: 0, y: 0});
                } else {
                    setSelectedFeature(null);
                }
            }, 50); // 50ms is enough to wait for drawend
        };

        map.on('singleclick', handleClick);
        return () => {
            map.un('singleclick', handleClick);
        };
    }, [map]);

    // ---- Update line between dialog and feature ----
    const updateLine = () => {
        if (!selectedFeature || !map || !lineRef.current || !paperRef.current) return;

        const geometry = selectedFeature.getGeometry();
        if (!(geometry instanceof Geometry)) return;

        const anchorCoord = getAnchorCoordinate(geometry);
        if (!anchorCoord) return;

        const pixel = map.getPixelFromCoordinate(anchorCoord);
        if (!pixel) return;

        const mapRect = map.getTargetElement().getBoundingClientRect();
        const dialogRect = paperRef.current.getBoundingClientRect();

        const x1 = mapRect.left + pixel[0];
        const y1 = mapRect.top + pixel[1];
        const x2 = dialogRect.left + dialogRect.width / 2;
        const y2 = dialogRect.top + dialogRect.height / 2;

        // cone width control (in pixels)
        const spread = 30;
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const leftX = x2 + Math.cos(angle + Math.PI / 2) * spread;
        const leftY = y2 + Math.sin(angle + Math.PI / 2) * spread;
        const rightX = x2 + Math.cos(angle - Math.PI / 2) * spread;
        const rightY = y2 + Math.sin(angle - Math.PI / 2) * spread;

        const polygon = `${x1},${y1} ${leftX},${leftY} ${rightX},${rightY}`;
        lineRef.current.setAttribute('points', polygon);
    };

    const getAnchorCoordinate = (geometry: Geometry): Coordinate | undefined => {
        if (!geometry) return;

        switch (geometry.getType()) {
            case 'Point':
                return (geometry as Point).getCoordinates();
            case 'LineString':
                return (geometry as LineString).getCoordinates().at(-1);
            case 'Polygon':
                return (geometry as Polygon).getCoordinates()[0]?.at(-1);
            case 'MultiPoint':
                return (geometry as MultiPoint).getCoordinates().at(-1);
            case 'MultiLineString': {
                const lines = (geometry as MultiLineString).getCoordinates();
                return lines.at(-1)?.at(-1);
            }
            case 'GeometryCollection': {
                const geoms = (geometry as GeometryCollection).getGeometries();
                for (const g of geoms) {
                    if (g instanceof Circle) return g.getCenter();
                    const coord = getAnchorCoordinate(g);
                    if (coord) return coord;
                }
                break;
            }
            case 'Circle':
                return (geometry as Circle).getCenter();
        }
        return undefined;
    };

    useEffect(() => {
        if (!selectedFeature) return;
        requestAnimationFrame(updateLine);
        window.addEventListener('resize', updateLine);
        return () => window.removeEventListener('resize', updateLine);
    }, [selectedFeature]);

    useEffect(() => {
        if (!isDragging) return;
        const id = setInterval(() => requestAnimationFrame(updateLine), 16);
        return () => clearInterval(id);
    }, [isDragging]);

    const applyChanges = () => {
        if (!selectedFeature || !map) return;

        const symbolId = selectedFeature.get('symbolId');
        if (!symbolId) return;

        const color = getColorByHostility(pendingChanges.labels.hostility ?? TacticalGraphicHostility.unknown);

        const vectorLayers = map
            .getLayers()
            .getArray()
            .filter((l): l is VectorLayer<VectorSource> => l instanceof VectorLayer && !!l.getSource());

        for (const layer of vectorLayers) {
            const source = layer.getSource();
            if (!source) continue;

            let findFeatures = source.getFeatures().filter(feat => feat.get('symbolId') === symbolId);
            if (findFeatures.length < 1) continue;

            findFeatures.forEach(findFeature => {
                findFeature.set('hostility', pendingChanges.labels.hostility);
                findFeature.set('echelon', pendingChanges.echelon);
                findFeature.set('hostilityColor', color);
                // Persist the amplifiers on the feature itself, under the same key
                // the style functions read. Graphics whose holder has no setLabel
                // (Block, Retrograde, …) depend on this write alone.
                writeGraphicProperties(
                    [findFeature],
                    findFeature.get('graphicName') as TacticalGraphicName,
                    pendingChanges.labels,
                );
                const styleLike = findFeature.getStyle?.();
                let resolvedStyle: Style | undefined;

                if (!styleLike) {
                    resolvedStyle = undefined;
                } else if (Array.isArray(styleLike)) {
                    resolvedStyle = styleLike[0];
                } else if (typeof styleLike === 'function') {
                    resolvedStyle = undefined;
                } else {
                    resolvedStyle = styleLike;
                }

                if (resolvedStyle instanceof Style) {
                    resolvedStyle.getStroke?.()?.setColor(color);
                    resolvedStyle.getFill?.()?.setColor(`${color}44`);
                }

                const graphicObj = GraphicLinkRegistry.getFromFeature(findFeature);
                graphicObj?.setLabel?.(pendingChanges.labels);

                setCurrentProperties((prev: TacticalGraphicProperties) => ({
                    ...prev,
                    labels: pendingChanges.labels,
                    echelon: pendingChanges.echelon,
                }));

                findFeature.changed();
            });
        }

        setSelectedFeature(null);
    };

    const cancelChanges = () => {
        setPendingChanges({...currentProperties});

        setSelectedFeature(null);
    };

    const DraggablePaper = useMemo(
        () => (props: any) =>
            (
                <Draggable
                    nodeRef={paperRef}
                    handle="#draggable-dialog-title"
                    position={dialogPosition}
                    onStart={() => setIsDragging(true)}
                    onStop={(e, data) => {
                        setIsDragging(false);
                        setDialogPosition({x: data.x, y: data.y});
                        requestAnimationFrame(updateLine);
                    }}
                >
                    <Paper ref={paperRef} {...props} />
                </Draggable>
            ),
        [dialogPosition],
    );

    if (!selectedFeature) return null;

    const hasChanges = JSON.stringify(pendingChanges) !== JSON.stringify(currentProperties);

    return (
        <>
            {/* Red line connecting feature to modal */}
            <svg
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    width: '100vw',
                    height: '100vh',
                    pointerEvents: 'none',
                    zIndex: 1000,
                }}
            >
                <defs>
                    <linearGradient id="coneGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="grey" stopOpacity="0.6"/>
                        <stop offset="100%" stopColor="grey" stopOpacity="0"/>
                    </linearGradient>
                </defs>

                <polygon ref={lineRef as any} fill="url(#coneGradient)"/>
            </svg>

            <Dialog open hideBackdrop keepMounted PaperComponent={DraggablePaper} disableEnforceFocus
                    onClose={cancelChanges}>
                <DialogTitle id="draggable-dialog-title" sx={{cursor: 'move'}}>
                    Feature Properties
                    {selectedFeature.get('graphicName') && (
                        <Box component="span" sx={{
                            display: 'block',
                            fontSize: '0.75rem',
                            fontWeight: 400,
                            color: 'text.secondary',
                            mt: 0.25,
                            textTransform: 'capitalize',
                        }}>
                            {getDisplayName(selectedFeature.get('graphicName') as TacticalGraphicName)}
                        </Box>
                    )}
                </DialogTitle>

                <DialogContent>
                    {(() => {
                        const fields = getGraphicFields(selectedFeature.get('graphicName') as TacticalGraphicName);
                        return (
                            <>
                                {!fields.identifier1 &&  !fields.identifier2 && !fields.dtg1 && !fields.dtg2 && !fields.width && !fields.altitude1 && !fields.altitude2 && !fields.grids && !fields.weapon && !fields.rangeFan &&(
                                    <Box sx={{minWidth: 180, mt: 1}}>
                                        <InputLabel>No editable fields for this graphic type.</InputLabel>
                                    </Box>
                                )}

                                {fields.identifier1 && (
                                    <Box sx={{minWidth: 180, mt: 1}}>
                                        <FormControl fullWidth variant="outlined">
                                            <InputLabel htmlFor="name-input">Name</InputLabel>
                                            <OutlinedInput
                                                id="name-input"
                                                label="Name"
                                                value={pendingChanges.labels.label}
                                                onChange={e =>
                                                    setPendingChanges(prev => ({
                                                        ...prev,
                                                        labels: {...prev.labels, label: e.target.value},
                                                    }))
                                                }
                                            />
                                        </FormControl>
                                    </Box>
                                )}

                                {fields.identifier2 && (
                                    <>
                                        <Box sx={{minWidth: 180, mt: 1}}>
                                            <FormControl fullWidth variant="outlined">
                                                <InputLabel htmlFor="country-code-input">Country Code</InputLabel>
                                                <OutlinedInput
                                                    id="country-code-input"
                                                    label="Country Code"
                                                    value={pendingChanges.labels.countryCode ?? ''}
                                                    onChange={e =>
                                                        setPendingChanges(prev => ({
                                                            ...prev,
                                                            labels: {...prev.labels, countryCode: e.target.value},
                                                        }))
                                                    }
                                                />
                                            </FormControl>
                                        </Box>
                                        <Box sx={{minWidth: 180, mt: 1}}>
                                            <FormControl fullWidth variant="outlined">
                                                <InputLabel htmlFor="second-id-input">Second ID</InputLabel>
                                                <OutlinedInput
                                                    id="second-id-input"
                                                    label="Second ID"
                                                    value={pendingChanges.labels.secondId ?? ''}
                                                    onChange={e =>
                                                        setPendingChanges(prev => ({
                                                            ...prev,
                                                            labels: {...prev.labels, secondId: e.target.value},
                                                        }))
                                                    }
                                                />
                                            </FormControl>
                                        </Box>
                                        <Box sx={{minWidth: 180, mt: 1}}>
                                            <FormControl fullWidth variant="outlined">
                                                <InputLabel htmlFor="second-country-code-input">Other Country Code</InputLabel>
                                                <OutlinedInput
                                                    id="second-country-code-input"
                                                    label="Other Country Code"
                                                    value={pendingChanges.labels.secondCountryCode ?? ''}
                                                    onChange={e =>
                                                        setPendingChanges(prev => ({
                                                            ...prev,
                                                            labels: {...prev.labels, secondCountryCode: e.target.value},
                                                        }))
                                                    }
                                                />
                                            </FormControl>
                                        </Box>
                                    </>
                                )}

                                {fields.hostility && (
                                    <Box sx={{minWidth: 180, mt: 1}}>
                                        <FormControl fullWidth>
                                            <InputLabel>Hostility</InputLabel>
                                            <Select
                                                value={pendingChanges.labels.hostility}
                                                label="Hostility"
                                                onChange={(e: SelectChangeEvent<TacticalGraphicHostility>) =>
                                                    setPendingChanges(prev => ({
                                                        ...prev,
                                                        labels: {...prev.labels, hostility: e.target.value},
                                                    }))
                                                }
                                            >
                                                {hostilityOptions.map(h => (
                                                    <MenuItem key={h} value={h}>{h}</MenuItem>
                                                ))}
                                            </Select>
                                        </FormControl>
                                    </Box>
                                )}

                                {fields.hostility && pendingChanges.labels.hostility === TacticalGraphicHostility.hostileFaker && (
                                    <Box sx={{minWidth: 180, mt: 1}}>
                                        <FormControl fullWidth>
                                            <InputLabel>Confidence</InputLabel>
                                            {/* `?? ''` keeps the Select controlled from the first render.
                                                Confidence stays undefined in the data — dashStyle() only
                                                dashes when it is explicitly `suspected`. */}
                                            <Select
                                                value={pendingChanges.labels.confidence ?? ''}
                                                label="Confidence"
                                                onChange={(e: SelectChangeEvent<TacticalGraphicConfidence>) =>
                                                    setPendingChanges(prev => ({
                                                        ...prev,
                                                        labels: {
                                                            ...prev.labels,
                                                            confidence: e.target.value as TacticalGraphicConfidence,
                                                        },
                                                    }))
                                                }
                                            >
                                                {confidenceOptions.map(h => (
                                                    <MenuItem key={h} value={h}>{h}</MenuItem>
                                                ))}
                                            </Select>
                                        </FormControl>
                                    </Box>
                                )}

                                {fields.status && (
                                    <Box sx={{minWidth: 180, mt: 1}}>
                                        <FormControl fullWidth>
                                            <InputLabel>Status</InputLabel>
                                            <Select
                                                value={pendingChanges.labels.status}
                                                label="Status"
                                                onChange={(e: SelectChangeEvent<TacticalGraphicStatus>) =>
                                                    setPendingChanges(prev => ({
                                                        ...prev,
                                                        labels: {...prev.labels, status: e.target.value},
                                                    }))
                                                }
                                            >
                                                {statusOptions.map(h => (
                                                    <MenuItem key={h} value={h}>{h}</MenuItem>
                                                ))}
                                            </Select>
                                        </FormControl>
                                    </Box>
                                )}

                                {fields.echelon && (
                                    <Box sx={{minWidth: 180, mt: 1}}>
                                        <FormControl fullWidth>
                                            <InputLabel>Echelon</InputLabel>
                                            <Select
                                                value={pendingChanges.echelon}
                                                label="Echelon"
                                                onChange={(e: SelectChangeEvent<TacticalGraphicEchelon>) =>
                                                    setPendingChanges(prev => ({...prev, echelon: e.target.value}))
                                                }
                                            >
                                                {echelonOptions.map(h => (
                                                    <MenuItem key={h} value={h}>{h}</MenuItem>
                                                ))}
                                            </Select>
                                        </FormControl>
                                    </Box>
                                )}

                                {fields.direction && (
                                    <Box sx={{minWidth: 180, mt: 1}}>
                                        <FormControl fullWidth>
                                            <InputLabel>Direction</InputLabel>
                                            {/* `?? ''` keeps the Select controlled from the first render. */}
                                            <Select
                                                value={pendingChanges.labels.direction ?? ''}
                                                label="Direction"
                                                onChange={(e: SelectChangeEvent<RouteDirection>) =>
                                                    setPendingChanges(prev => ({
                                                        ...prev,
                                                        labels: {...prev.labels, direction: e.target.value},
                                                    }))
                                                }
                                            >
                                                {Object.values(RouteDirection).map(h => (
                                                    <MenuItem key={h} value={h}>{h}</MenuItem>
                                                ))}
                                            </Select>
                                        </FormControl>
                                    </Box>
                                )}

                                {fields.dtg1 && (
                                    <Box sx={{minWidth: 180, mt: 1}}>
                                        <FormControl fullWidth variant="outlined">
                                            <InputLabel htmlFor="starttime-input" shrink>Start Time (UTC)</InputLabel>
                                            <OutlinedInput
                                                id="starttime-input"
                                                label="Start Time (UTC)"
                                                type="datetime-local"
                                                notched
                                                value={dtgToDateTimeLocal(pendingChanges.labels.startDate ?? '')}
                                                onChange={e => {
                                                    const dtg = dateTimeLocalToDtg(e.target.value);
                                                    setPendingChanges(prev => ({
                                                        ...prev,
                                                        labels: {...prev.labels, startDate: dtg || undefined},
                                                    }));
                                                }}
                                            />
                                        </FormControl>
                                    </Box>
                                )}

                                {fields.dtg2 && (
                                    <Box sx={{minWidth: 180, mt: 1}}>
                                        <FormControl fullWidth variant="outlined">
                                            <InputLabel htmlFor="endtime-input" shrink>End Time (UTC)</InputLabel>
                                            <OutlinedInput
                                                id="endtime-input"
                                                label="End Time (UTC)"
                                                type="datetime-local"
                                                notched
                                                value={dtgToDateTimeLocal(pendingChanges.labels.endDate ?? '')}
                                                onChange={e => {
                                                    const dtg = dateTimeLocalToDtg(e.target.value);
                                                    setPendingChanges(prev => ({
                                                        ...prev,
                                                        labels: {...prev.labels, endDate: dtg || undefined},
                                                    }));
                                                }}
                                            />
                                        </FormControl>
                                    </Box>
                                )}

                                {fields.width && (
                                    <Box sx={{minWidth: 180, mt: 1}}>
                                        <FormControl fullWidth variant="outlined">
                                            <InputLabel htmlFor="width-input">Width</InputLabel>
                                            <OutlinedInput
                                                id="width-input"
                                                label="Width"
                                                inputProps={{inputMode: 'numeric'}}
                                                value={pendingChanges.labels.width ?? ''}
                                                onChange={e => {
                                                    const v = e.target.value.replace(/[^0-9]/g, '');
                                                    setPendingChanges(prev => ({
                                                        ...prev,
                                                        labels: {...prev.labels, width: v},
                                                    }));
                                                }}
                                            />
                                        </FormControl>
                                    </Box>
                                )}

                                {fields.altitude1 && (
                                    <Box sx={{minWidth: 180, mt: 1}}>
                                        <FormControl fullWidth variant="outlined">
                                            <InputLabel htmlFor="min-altitude-input">Minimum Altitude</InputLabel>
                                            <OutlinedInput
                                                id="min-altitude-input"
                                                label="Minimum Altitude"
                                                inputProps={{inputMode: 'numeric'}}
                                                value={pendingChanges.labels.minAltitude ?? ''}
                                                onChange={e => {
                                                    const v = e.target.value.replace(/[^0-9]/g, '');
                                                    setPendingChanges(prev => ({
                                                        ...prev,
                                                        labels: {...prev.labels, minAltitude: v},
                                                    }));
                                                }}
                                            />
                                        </FormControl>
                                    </Box>
                                )}

                                {fields.altitude2 && (
                                    <Box sx={{minWidth: 180, mt: 1}}>
                                        <FormControl fullWidth variant="outlined">
                                            <InputLabel htmlFor="max-altitude-input">Maximum Altitude</InputLabel>
                                            <OutlinedInput
                                                id="max-altitude-input"
                                                label="Maximum Altitude"
                                                inputProps={{inputMode: 'numeric'}}
                                                value={pendingChanges.labels.maxAltitude ?? ''}
                                                onChange={e => {
                                                    const v = e.target.value.replace(/[^0-9]/g, '');
                                                    setPendingChanges(prev => ({
                                                        ...prev,
                                                        labels: {...prev.labels, maxAltitude: v},
                                                    }));
                                                }}
                                            />
                                        </FormControl>
                                    </Box>
                                )}

                                {fields.weapon && (
                                    <Box sx={{minWidth: 180, mt: 1}}>
                                        <FormControl fullWidth variant="outlined">
                                            <InputLabel htmlFor="weapon-input">Weapon</InputLabel>
                                            <OutlinedInput
                                                id="weapon-input"
                                                label="Weapon"
                                                value={pendingChanges.labels.weapon ?? ''}
                                                onChange={e =>
                                                    setPendingChanges(prev => ({
                                                        ...prev,
                                                        labels: {...prev.labels, weapon: e.target.value},
                                                    }))
                                                }
                                            />
                                        </FormControl>
                                    </Box>
                                )}

                                {fields.grids && (
                                    <>
                                        <Box sx={{minWidth: 180, mt: 1}}>
                                            <FormControl fullWidth variant="outlined">
                                                <InputLabel htmlFor="unit-input">Unit Name</InputLabel>
                                                <OutlinedInput
                                                    id="unit-input"
                                                    label="Unit Name"
                                                    value={pendingChanges.labels.secondId ?? ''}
                                                    onChange={e =>
                                                        setPendingChanges(prev => ({
                                                            ...prev,
                                                            labels: {...prev.labels, secondId: e.target.value},
                                                        }))
                                                    }
                                                />
                                            </FormControl>
                                        </Box>
                                        <Box sx={{minWidth: 180, mt: 1}}>
                                            <FormControl fullWidth variant="outlined">
                                                <InputLabel htmlFor="grid-input">Grids</InputLabel>
                                                <OutlinedInput
                                                    id="grid-input"
                                                    label="Grids"
                                                    value={pendingChanges.labels.grid ?? ''}
                                                    onChange={e =>
                                                        setPendingChanges(prev => ({
                                                            ...prev,
                                                            labels: {...prev.labels, grid: e.target.value},
                                                        }))
                                                    }
                                                />
                                            </FormControl>
                                        </Box>
                                    </>
                                )}

                                {fields.rangeFan && (() => {
                                    const config = pendingChanges.labels.rangeFan ?? defaultRangeFanConfig();
                                    const bands = config.bands ?? [];
                                    const isSector = selectedFeature.get('graphicName') === TacticalGraphicName.WeaponSensorRangeFanSector;

                                    const updateConfig = (next: RangeFanConfig) => {
                                        setPendingChanges(prev => ({
                                            ...prev,
                                            labels: {...prev.labels, rangeFan: next},
                                        }));
                                    };
                                    const updateBand = (index: number, patch: Partial<RangeFanBand>) => {
                                        const nextBands = bands.map((b, i) => i === index ? {...b, ...patch} : b);
                                        updateConfig({...config, bands: nextBands});
                                    };
                                    const addBand = () => {
                                        const last = bands.length > 0 ? bands[bands.length - 1] : undefined;
                                        // Step up by 1 km from the last band so the new ring
                                        // is visibly outside the existing one. Carry over the
                                        // last band's azimuths (sector) so the typical
                                        // "extend the same wedge to a longer range" flow
                                        // needs zero typing.
                                        const nextBand: RangeFanBand = {
                                            range: Math.max(1, (last?.range ?? 0) + 1),
                                            ...(isSector && last
                                                ? {
                                                      leftAzimuthDeg: last.leftAzimuthDeg,
                                                      rightAzimuthDeg: last.rightAzimuthDeg,
                                                  }
                                                : {}),
                                        };
                                        updateConfig({...config, bands: [...bands, nextBand]});
                                    };
                                    const removeBand = (index: number) => {
                                        if (bands.length <= 1) return; // keep at least one band
                                        updateConfig({...config, bands: bands.filter((_, i) => i !== index)});
                                    };
                                    const parseAzimuthInput = (raw: string): number | undefined => {
                                        const v = raw.replace(/[^0-9.\-]/g, '');
                                        if (v === '' || v === '-' || v === '.') return undefined;
                                        const n = parseFloat(v);
                                        return Number.isFinite(n) ? n : undefined;
                                    };

                                    return (
                                        <>
                                            <Box sx={{minWidth: 180, mt: 2, mb: 1, fontWeight: 'bold'}}>Range Bands</Box>
                                            {bands.map((band, i) => (
                                                <Box key={i} sx={{
                                                    mt: 1,
                                                    p: 1,
                                                    border: '1px solid rgba(255,255,255,0.12)',
                                                    borderRadius: 1,
                                                }}>
                                                    <Box sx={{display: 'flex', gap: 1, alignItems: 'flex-start'}}>
                                                        <FormControl variant="outlined" sx={{flex: 1, minWidth: 90}}>
                                                            <InputLabel htmlFor={`band-range-${i}`}>Range (km)</InputLabel>
                                                            <OutlinedInput
                                                                id={`band-range-${i}`}
                                                                label="Range (km)"
                                                                type="number"
                                                                inputProps={{step: 0.1, min: 0, inputMode: 'decimal'}}
                                                                value={band.range ?? ''}
                                                                onChange={e => {
                                                                    const v = e.target.value;
                                                                    if (v === '') {
                                                                        updateBand(i, {range: 0});
                                                                        return;
                                                                    }
                                                                    const km = parseFloat(v);
                                                                    if (Number.isFinite(km)) {
                                                                        updateBand(i, {range: km});
                                                                    }
                                                                }}
                                                            />
                                                        </FormControl>
                                                        <FormControl variant="outlined" sx={{flex: 1, minWidth: 90}}>
                                                            <InputLabel htmlFor={`band-alt-${i}`}>Altitude</InputLabel>
                                                            <OutlinedInput
                                                                id={`band-alt-${i}`}
                                                                label="Altitude"
                                                                value={band.altitude ?? ''}
                                                                onChange={e => updateBand(i, {altitude: e.target.value})}
                                                            />
                                                        </FormControl>
                                                        <FormControl variant="outlined" sx={{flex: 1, minWidth: 90}}>
                                                            <InputLabel htmlFor={`band-label-${i}`}>Label</InputLabel>
                                                            <OutlinedInput
                                                                id={`band-label-${i}`}
                                                                label="Label"
                                                                value={band.label ?? ''}
                                                                onChange={e => updateBand(i, {label: e.target.value})}
                                                            />
                                                        </FormControl>
                                                        <Button
                                                            size="small"
                                                            color="inherit"
                                                            onClick={() => removeBand(i)}
                                                            disabled={bands.length <= 1}
                                                            sx={{minWidth: 40, mt: 1}}
                                                        >
                                                            ×
                                                        </Button>
                                                    </Box>
                                                    {isSector && (
                                                        <Box sx={{display: 'flex', gap: 1, mt: 1, alignItems: 'flex-start'}}>
                                                            <FormControl variant="outlined" sx={{flex: 1, minWidth: 90}}>
                                                                <InputLabel htmlFor={`band-left-az-${i}`}>Left Az (° from N)</InputLabel>
                                                                <OutlinedInput
                                                                    id={`band-left-az-${i}`}
                                                                    label="Left Az (° from N)"
                                                                    inputProps={{inputMode: 'decimal'}}
                                                                    value={band.leftAzimuthDeg !== undefined ? String(band.leftAzimuthDeg) : ''}
                                                                    onChange={e => updateBand(i, {leftAzimuthDeg: parseAzimuthInput(e.target.value)})}
                                                                />
                                                            </FormControl>
                                                            <FormControl variant="outlined" sx={{flex: 1, minWidth: 90}}>
                                                                <InputLabel htmlFor={`band-right-az-${i}`}>Right Az (° from N)</InputLabel>
                                                                <OutlinedInput
                                                                    id={`band-right-az-${i}`}
                                                                    label="Right Az (° from N)"
                                                                    inputProps={{inputMode: 'decimal'}}
                                                                    value={band.rightAzimuthDeg !== undefined ? String(band.rightAzimuthDeg) : ''}
                                                                    onChange={e => updateBand(i, {rightAzimuthDeg: parseAzimuthInput(e.target.value)})}
                                                                />
                                                            </FormControl>
                                                        </Box>
                                                    )}
                                                </Box>
                                            ))}
                                            <Box sx={{mt: 1}}>
                                                <Button size="small" variant="outlined" onClick={addBand}>
                                                    + Add Band
                                                </Button>
                                            </Box>

                                            {isSector && (
                                                <Box sx={{minWidth: 180, mt: 2}}>
                                                    <FormControl fullWidth variant="outlined">
                                                        <InputLabel htmlFor="center-azimuth-input">Center Azimuth (° from N)</InputLabel>
                                                        <OutlinedInput
                                                            id="center-azimuth-input"
                                                            label="Center Azimuth (° from N)"
                                                            inputProps={{inputMode: 'decimal'}}
                                                            value={config.centerAzimuthDeg !== undefined ? String(config.centerAzimuthDeg) : ''}
                                                            onChange={e => updateConfig({
                                                                ...config,
                                                                centerAzimuthDeg: parseAzimuthInput(e.target.value),
                                                            })}
                                                        />
                                                    </FormControl>
                                                </Box>
                                            )}
                                        </>
                                    );
                                })()}
                            </>
                        );
                    })()}
                </DialogContent>

                <DialogActions>
                    <Button onClick={applyChanges} variant="contained" disabled={!hasChanges}>
                        OK
                    </Button>
                    <Button onClick={cancelChanges} color="inherit">
                        Cancel
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
};

export default TacticalGraphicsDialog;
