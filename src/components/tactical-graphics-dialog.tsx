import React, {useEffect, useMemo, useRef, useState} from 'react';
import Draggable from 'react-draggable';
import {
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControl,
    FormControlLabel,
    InputLabel,
    MenuItem,
    OutlinedInput,
    Paper,
    Select,
    SelectChangeEvent,
    Switch,
    Typography,
} from '@mui/material';
import {formatDistance} from './openlayers/openlayerStyles';
import {ALTITUDE_UNIT_SUFFIX, AltitudeDatum, getAltitudeUnit} from '@zaes/tactical-graphics';
import {GraphicLabels, RangeFanConfig} from '../utils/graphicLinkRegistry';
import type {GraphicGeometryState} from './openlayers/graphicProperties';
import type {FeaturePropertiesSource, SelectedGraphic} from './featurePropertiesSource';
import {amplifiersHidden} from './amplifierVisibility';
import {dateTimeLocalToDtg, dtgToDateTimeLocal, nowDtg} from './dtg';
import {
    getDisplayName,
    RangeFanBand,
    RouteDirection,
    TacticalGraphicConfidence,
    TacticalGraphicEchelon,
    TacticalGraphicHostility,
    TacticalGraphicMineType,
    TacticalGraphicMobility,
    TacticalGraphicTerrain,
    TacticalGraphicName,
    TacticalGraphicStatus,
} from '@zaes/tactical-graphics';
import {getGraphicFields} from './openlayers/graphicFieldRegistry';

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
    // Metres, matching RangeFanBand.range as of 3.2.0 — this was 1 (km).
    return {
        bands: [{range: 1000}],
    };
}

/**
 * The amplifiers a graphic actually shows, seeded where the stored value is blank.
 *
 * Narrowing to the graphic's own field set is what stops a disabled input
 * accumulating a stale value that then renders — a country code typed on one
 * graphic and inherited by the next of a type that has no such field.
 *
 * Two of the defaults are load-bearing rather than cosmetic:
 *
 * - **`hostility` is always kept**, even when hidden, because it drives the stroke
 *   color. Defaulting to `unknown` means editing some other property on a graphic
 *   that never had an affiliation does not silently turn it friendly blue — and it
 *   keeps the MUI `Select` controlled from the first render rather than flipping
 *   uncontrolled to controlled.
 * - **`status` defaults to `present`**, which is what `amplifierDash` already
 *   assumed for an unset status.
 */
export function shownLabels(selection: SelectedGraphic): GraphicLabels {
    const stored = selection.labels;
    const fields = getGraphicFields(selection.graphicName);

    /*
     * **Only the fields this graphic supports, and an edit drops the rest.** (User's call,
     * 2026-08-31.)
     *
     * `writeGraphicProperties` replaces the amplifier bag rather than merging it, so a
     * value outside `getGraphicFields` does not survive a save. That is deliberate: the
     * registry is what a graphic carries, so a date on a symbol that declares none is
     * out-of-spec data, and normalising it away on the next edit is better than carrying
     * invisible state no control manages. A stale value nobody can see is exactly what
     * made the country code draw on four graphics whose plate has none.
     *
     * **Shape inputs are not at risk.** Every holder re-supplies its geometry state —
     * `radius`, `rotation`, `width`, `length` — as the fourth argument on the same call,
     * so replacing the label bag never touches the shape. @see writeGraphicProperties
     */
    const labels: GraphicLabels = {
        designation: fields.identifier1 ? (stored.designation ?? '') : '',
        hostility: stored.hostility ?? TacticalGraphicHostility.unknown,
    };

    if (fields.identifier2) labels.secondDesignation = stored.secondDesignation ?? '';
    if (fields.countryCodes) {
        labels.countryCode = stored.countryCode ?? '';
        // The second code belongs to the second designation, so it only exists where there
        // is one. @see the Country Code inputs below
        if (fields.identifier2) labels.secondCountryCode = stored.secondCountryCode ?? '';
    }
    if (fields.additionalInfo) labels.additionalInfo = stored.additionalInfo ?? '';
    // The three selectors that carry a stored value into the dialog rather than a string.
    // `mineType` was missing, so a mine area reopened with its own type not selected.
    if (fields.mineType) labels.mineType = stored.mineType;
    if (fields.mobility) labels.mobility = stored.mobility;
    if (fields.terrain) labels.terrain = stored.terrain;
    if (fields.hostility) labels.confidence = stored.confidence;
    if (fields.status) labels.status = stored.status ?? TacticalGraphicStatus.present;
    if (fields.direction) labels.direction = stored.direction;
    if (fields.dtg1) labels.startDate = stored.startDate ?? nowDtg();
    if (fields.dtg2) labels.endDate = stored.endDate ?? nowDtg();
    if (fields.altitude1) labels.minAltitude = stored.minAltitude;
    if (fields.altitude2) labels.maxAltitude = stored.maxAltitude;
    // One datum for both, since a floor and a ceiling measured from different things
    // would describe two different volumes. Shown whenever either altitude is.
    if (fields.altitude1 || fields.altitude2) labels.altitudeDatum = stored.altitudeDatum;
    if (fields.weapon) labels.weapon = stored.weapon ?? '';
    if (fields.grids) {
        labels.secondDesignation = stored.secondDesignation ?? '';
        labels.grid = stored.grid;
    }
    if (fields.rangeFan) {
        // First time opening the editor on this fan: seed a single band at the drawn
        // radius so pressing OK does not snap the geometry to the fallback. Both
        // `graphicSize` and a band's range are metres as of 3.2.0 — this divided by a
        // thousand, which was right while bands were kilometres and now seeds a fan a
        // thousand times too small. @see RangeFanBand.range
        labels.rangeFan = stored.rangeFan ?? {
            bands: [{range: selection.graphicSize && selection.graphicSize > 0 ? Math.round(selection.graphicSize) : 1000}],
        };
    }

    return labels;
}

interface TacticalGraphicsDialogProps {
    /**
     * The map half of the dialog — selection, anchoring and applying.
     *
     * The dialog used to take an OpenLayers `Map` and its manager directly, which
     * made ~580 lines of doctrinal form unreachable from any other renderer. Only
     * three things here are actually renderer knowledge, and they are that interface.
     * @see FeaturePropertiesSource
     */
    source: FeaturePropertiesSource;
}

const hostilityOptions = Object.values(TacticalGraphicHostility);
const echelonOptions = Object.values(TacticalGraphicEchelon);
const statusOptions = Object.values(TacticalGraphicStatus);
const confidenceOptions = Object.values(TacticalGraphicConfidence);

/** What the dialog is editing: the amplifier bag plus the echelon beside it. */
interface TacticalGraphicProperties {
    echelon: TacticalGraphicEchelon | string;
    labels: GraphicLabels;
}

/**
 * What to call the altitude input, given the datum it is measured from.
 *
 * **A flight level is not an altitude in the configured unit**, so offering "(FT)" beside
 * it would invite the wrong number: a user thinking in feet types 1500, and `FL1500`
 * means 150,000 ft. Under `FL` the field *is* the level — 150 — and the label says so.
 */
function altitudeFieldLabel(which: 'Minimum' | 'Maximum', datum: AltitudeDatum | undefined): string {
    if (datum === AltitudeDatum.flightLevel) return `${which} Flight Level`;
    return `${which} Altitude (${ALTITUDE_UNIT_SUFFIX[getAltitudeUnit()]})`;
}

const TacticalGraphicsDialog: React.FC<TacticalGraphicsDialogProps> = ({source}) => {
    /** Geometry read-outs (meters) for the selected graphic. @see readGraphicGeometryState */
    const [measured, setMeasured] = useState<GraphicGeometryState>({});
    const [selection, setSelection] = useState<SelectedGraphic | null>(null);
    const [dialogPosition, setDialogPosition] = useState({x: 0, y: 0});
    const [isDragging, setIsDragging] = useState(false);
    const defaultProperties = {
        echelon: TacticalGraphicEchelon.brigade,
        identifier: '',
        labels: {designation: '', hostility: TacticalGraphicHostility.unknown},
    };
    const [pendingChanges, setPendingChanges] = useState<TacticalGraphicProperties>(defaultProperties);
    /**
     * Whether the selected graphic is drawn name-only.
     *
     * Held apart from `pendingChanges` because it is not one of the amplifiers `OK` writes
     * back — the library keeps it off the graphic entirely, so this app owns it and applies
     * it the moment it is switched. @see amplifierVisibility
     */
    const [nameOnly, setNameOnly] = useState(false);
    /**
     * What it was when the dialog opened, so the toggle counts as a change.
     *
     * `nameOnly` is applied the moment it is switched, so comparing it against the store
     * says nothing — the store already agrees with it. Without this, flipping the toggle and
     * nothing else left `OK` disabled: the only way out of the dialog was Cancel, which
     * looks like it should undo the very thing that had already happened.
     */
    const [openedNameOnly, setOpenedNameOnly] = useState(false);
    const [currentProperties, setCurrentProperties] = useState<TacticalGraphicProperties>(defaultProperties);
    const paperRef = useRef<HTMLDivElement | null>(null);
    const lineRef = useRef<SVGLineElement | null>(null);

    // Open dialog on feature click
    useEffect(() => {
        return source.onSelect(next => {
            if (!next) {
                setSelection(null);
                return;
            }
            if (source.suppressed?.()) return;

            setSelection(next);
            // Read-only: the geometry inputs the user set by dragging. Kept out of
            // `pendingChanges` because nothing in this dialog can change them.
            setMeasured(next.measured);

            const curr = {
                echelon: next.echelon,
                labels: shownLabels(next),
            };
            setCurrentProperties(curr);
            setPendingChanges(curr);
            // View state, not an amplifier: it comes from this app's store rather than
            // from the graphic. @see amplifierVisibility
            setNameOnly(amplifiersHidden(next.id));
            setOpenedNameOnly(amplifiersHidden(next.id));
            setDialogPosition({x: 0, y: 0});
        });
    }, [source]);

    /**
     * Redraws the cone joining the dialog to the graphic it is editing.
     *
     * Page coordinates throughout: the cone is a viewport-level SVG, not a map
     * overlay, so it has to work in the space `getBoundingClientRect` reports in.
     * The source supplies the map end; everything after that is geometry.
     */
    const updateLine = () => {
        if (!selection || !lineRef.current || !paperRef.current) return;

        const anchor = source.anchorPixel(selection);
        if (!anchor) return;

        const dialogRect = paperRef.current.getBoundingClientRect();
        const [x1, y1] = anchor;
        const x2 = dialogRect.left + dialogRect.width / 2;
        const y2 = dialogRect.top + dialogRect.height / 2;

        // The cone's mouth, spread either side of the line at the dialog end.
        const spread = 30;
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const leftX = x2 + Math.cos(angle + Math.PI / 2) * spread;
        const leftY = y2 + Math.sin(angle + Math.PI / 2) * spread;
        const rightX = x2 + Math.cos(angle - Math.PI / 2) * spread;
        const rightY = y2 + Math.sin(angle - Math.PI / 2) * spread;

        lineRef.current.setAttribute('points', `${x1},${y1} ${leftX},${leftY} ${rightX},${rightY}`);
    };

    /**
     * Draws the cone when a graphic is selected, and keeps it attached while the
     * window is resized.
     *
     * A frame is skipped first: the dialog has to be laid out before its center can
     * be measured, and on the first render `getBoundingClientRect` reports zeroes.
     */
    useEffect(() => {
        if (!selection) return;
        requestAnimationFrame(updateLine);
        window.addEventListener('resize', updateLine);
        return () => window.removeEventListener('resize', updateLine);
        // eslint-disable-next-line
    }, [selection]);

    /**
     * While the dialog is being dragged, redraw every frame.
     *
     * `Draggable` reports its position only on drag *stop*, so nothing else would
     * move the cone until the user let go — and the line would visibly detach from
     * the dialog for the whole gesture.
     */
    useEffect(() => {
        if (!isDragging) return;
        const id = setInterval(() => requestAnimationFrame(updateLine), 16);
        return () => clearInterval(id);
        // eslint-disable-next-line
    }, [isDragging]);

    const applyChanges = () => {
        if (!selection) return;
        source.apply(selection, pendingChanges.labels, pendingChanges.echelon);
        setCurrentProperties(prev => ({
            ...prev,
            labels: pendingChanges.labels,
            echelon: pendingChanges.echelon,
        }));
        setSelection(null);
    };

    const cancelChanges = () => {
        setPendingChanges({...currentProperties});
        // The toggle took effect immediately, so cancelling has to undo it — otherwise the
        // one control that applied on the spot is also the one Cancel cannot take back.
        if (selection && nameOnly !== openedNameOnly) {
            source.setAmplifiersHidden(selection, openedNameOnly);
            setNameOnly(openedNameOnly);
        }
        setSelection(null);
    };

    const DraggablePaper = useMemo(
        () => (props: any) => (
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

    if (!selection) return null;

    // The toggle is a change like any other, even though it applies on the spot: `OK` has to
    // be reachable after switching it, and `Cancel` has to put it back.
    const hasChanges =
        JSON.stringify(pendingChanges) !== JSON.stringify(currentProperties) || nameOnly !== openedNameOnly;

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
                        <stop offset="0%" stopColor="gray" stopOpacity="0.6" />
                        <stop offset="100%" stopColor="gray" stopOpacity="0" />
                    </linearGradient>
                </defs>

                <polygon ref={lineRef as any} fill="url(#coneGradient)" />
            </svg>

            {/*
             * **The container must not eat the map.**
             *
             * `hideBackdrop` hides the scrim but not the full-viewport
             * `.MuiDialog-container` behind it, which keeps `pointer-events: auto` and
             * sits at z-index 1300 — over everything. So while this dialog was open the
             * map underneath took no clicks at all: no drawing, no selecting, and none
             * of the edit affordances, which is how this surfaced. A non-modal dialog
             * that deliberately leaves its host usable has to say so; the paper opts
             * back in so the form itself still works.
             */}
            <Dialog
                open
                hideBackdrop
                keepMounted
                PaperComponent={DraggablePaper}
                disableEnforceFocus
                sx={{
                    '& .MuiDialog-container': {pointerEvents: 'none'},
                    '& .MuiDialog-paper': {pointerEvents: 'auto'},
                }}
                onClose={cancelChanges}
            >
                <DialogTitle id="draggable-dialog-title" sx={{cursor: 'move'}}>
                    Feature Properties
                    {selection.graphicName && (
                        <Box
                            component="span"
                            sx={{
                                display: 'block',
                                fontSize: '0.75rem',
                                fontWeight: 400,
                                color: 'text.secondary',
                                mt: 0.25,
                                textTransform: 'capitalize',
                            }}
                        >
                            {getDisplayName(selection.graphicName)}
                        </Box>
                    )}
                </DialogTitle>

                <DialogContent>
                    {(() => {
                        const fields = getGraphicFields(selection.graphicName);
                        return (
                            <>
                                {/* Every flag, or the message contradicts a control rendered right below it.
                                    `hostility` and `status` were missing here while almost no graphic set
                                    them; now that hostility follows FM 1-02.2 Field N and is on for every
                                    control measure, leaving them out would print "no editable fields"
                                    above a hostility dropdown on most of the catalog. */}
                                {!fields.identifier1 &&
                                    !fields.identifier2 &&
                                    !fields.additionalInfo &&
                                    !fields.dtg1 &&
                                    !fields.dtg2 &&
                                    !fields.hostility &&
                                    !fields.status &&
                                    !fields.echelon &&
                                    !fields.direction &&
                                    !fields.width &&
                                    !fields.altitude1 &&
                                    !fields.altitude2 &&
                                    !fields.grids &&
                                    !fields.weapon &&
                                    !fields.rangeFan &&
                                    !fields.mineType &&
                                    !fields.mobility &&
                                    !fields.terrain && (
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
                                                value={pendingChanges.labels.designation}
                                                onChange={e =>
                                                    setPendingChanges(prev => ({
                                                        ...prev,
                                                        labels: {...prev.labels, designation: e.target.value},
                                                    }))
                                                }
                                            />
                                        </FormControl>
                                    </Box>
                                )}

                                {/* Field H. Several plates set it beside the designation rather than
                                    instead of it — the area generic reads `H  T` on one line — so it is
                                    its own control. @see TacticalGraphicProperties.additionalInfo */}
                                {fields.additionalInfo && (
                                    <Box sx={{minWidth: 180, mt: 1}}>
                                        <FormControl fullWidth variant="outlined">
                                            <InputLabel htmlFor="additional-info-input">Additional Information</InputLabel>
                                            <OutlinedInput
                                                id="additional-info-input"
                                                label="Additional Information"
                                                value={pendingChanges.labels.additionalInfo ?? ''}
                                                onChange={e =>
                                                    setPendingChanges(prev => ({
                                                        ...prev,
                                                        labels: {...prev.labels, additionalInfo: e.target.value},
                                                    }))
                                                }
                                            />
                                        </FormControl>
                                    </Box>
                                )}

                                {/*
                                 * **Two flags, not one, and the second code follows the second designation.**
                                 *
                                 * The country codes are their own field because they do not travel with
                                 * `identifier2`: final protective fire takes a second designation and no code at
                                 * all, and while the two shared a flag it was offered two boxes nothing would draw.
                                 *
                                 * But a code still *pairs* with a designation — `designation + countryCode` on the
                                 * top line, `secondDesignation + secondCountryCode` on the bottom — so a graphic
                                 * with one designation has one code. The fire-support areas are the case that
                                 * proves it: they carry `T2 ( AS )` and no second name, and rendering both boxes
                                 * put an "Other Country Code" on them that nothing would ever draw. Which is the
                                 * same defect the country-code split was made to fix, one level down.
                                 */}
                                {fields.countryCodes && (
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
                                )}
                                {fields.identifier2 && (
                                    <Box sx={{minWidth: 180, mt: 1}}>
                                        <FormControl fullWidth variant="outlined">
                                            <InputLabel htmlFor="second-id-input">Second ID</InputLabel>
                                            <OutlinedInput
                                                id="second-id-input"
                                                label="Second ID"
                                                value={pendingChanges.labels.secondDesignation ?? ''}
                                                onChange={e =>
                                                    setPendingChanges(prev => ({
                                                        ...prev,
                                                        labels: {...prev.labels, secondDesignation: e.target.value},
                                                    }))
                                                }
                                            />
                                        </FormControl>
                                    </Box>
                                )}
                                {fields.countryCodes && fields.identifier2 && (
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
                                )}

                                {/*
                                 * **Offered for every graphic, like hostility.** Any
                                 * graphic can carry amplifiers, and whether to show them
                                 * is a choice about this graphic on this map rather than
                                 * a property of the symbol — so there is no per-graphic
                                 * field flag deciding whether the control appears.
                                 * @see TacticalGraphicProperties.hideAmplifiers
                                 */}
                                <Box sx={{mt: 1}}>
                                    <FormControlLabel
                                        control={
                                            <Switch
                                                checked={nameOnly}
                                                onChange={(_e, checked) => {
                                                    // Applied immediately, and to this app's
                                                    // own store — it is not one of the
                                                    // amplifiers `OK` writes back.
                                                    setNameOnly(checked);
                                                    if (selection) source.setAmplifiersHidden(selection, checked);
                                                }}
                                            />
                                        }
                                        label="Name only — hide other amplifiers"
                                    />
                                </Box>

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
                                                    <MenuItem key={h} value={h}>
                                                        {h}
                                                    </MenuItem>
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
                                                    <MenuItem key={h} value={h}>
                                                        {h}
                                                    </MenuItem>
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
                                                    <MenuItem key={h} value={h}>
                                                        {h}
                                                    </MenuItem>
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
                                                onChange={(e: SelectChangeEvent<string>) =>
                                                    setPendingChanges(prev => ({...prev, echelon: e.target.value}))
                                                }
                                            >
                                                {echelonOptions.map(h => (
                                                    <MenuItem key={h} value={h}>
                                                        {h}
                                                    </MenuItem>
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
                                                    <MenuItem key={h} value={h}>
                                                        {h}
                                                    </MenuItem>
                                                ))}
                                            </Select>
                                        </FormControl>
                                    </Box>
                                )}

                                {fields.mineType && (
                                    <Box sx={{minWidth: 180, mt: 1}}>
                                        <FormControl fullWidth>
                                            <InputLabel>Mine type</InputLabel>
                                            {/* `?? ''` keeps the Select controlled from the first render. */}
                                            <Select
                                                value={pendingChanges.labels.mineType ?? ''}
                                                label="Mine type"
                                                onChange={(e: SelectChangeEvent<TacticalGraphicMineType>) =>
                                                    setPendingChanges(prev => ({
                                                        ...prev,
                                                        labels: {...prev.labels, mineType: e.target.value},
                                                    }))
                                                }
                                            >
                                                {(Object.values(TacticalGraphicMineType) as TacticalGraphicMineType[]).map(h => (
                                                    <MenuItem key={h} value={h}>
                                                        {h}
                                                    </MenuItem>
                                                ))}
                                            </Select>
                                        </FormControl>
                                    </Box>
                                )}

                                {/* APP-06 Table 8-24, the MOBILITY half. Offered on the three graphics
                                    its Remarks column names and nowhere else. */}
                                {fields.mobility && (
                                    <Box sx={{minWidth: 180, mt: 1}}>
                                        <FormControl fullWidth>
                                            <InputLabel>Sector 1 mobility</InputLabel>
                                            {/* `?? ''` keeps the Select controlled from the first render. */}
                                            <Select
                                                value={pendingChanges.labels.mobility ?? ''}
                                                label="Sector 1 mobility"
                                                onChange={(e: SelectChangeEvent<TacticalGraphicMobility>) =>
                                                    setPendingChanges(prev => ({
                                                        ...prev,
                                                        labels: {...prev.labels, mobility: e.target.value},
                                                    }))
                                                }
                                            >
                                                {(Object.values(TacticalGraphicMobility) as TacticalGraphicMobility[]).map(h => (
                                                    <MenuItem key={h} value={h}>
                                                        {h}
                                                    </MenuItem>
                                                ))}
                                            </Select>
                                        </FormControl>
                                    </Box>
                                )}

                                {/* APP-06 Table 8-25. Sets a word under the icon and, with it, the
                                    color the area is hatched in. */}
                                {fields.terrain && (
                                    <Box sx={{minWidth: 180, mt: 1}}>
                                        <FormControl fullWidth>
                                            <InputLabel>Sector 2 terrain</InputLabel>
                                            {/* `?? ''` keeps the Select controlled from the first render. */}
                                            <Select
                                                value={pendingChanges.labels.terrain ?? ''}
                                                label="Sector 2 terrain"
                                                onChange={(e: SelectChangeEvent<TacticalGraphicTerrain>) =>
                                                    setPendingChanges(prev => ({
                                                        ...prev,
                                                        labels: {...prev.labels, terrain: e.target.value},
                                                    }))
                                                }
                                            >
                                                {(Object.values(TacticalGraphicTerrain) as TacticalGraphicTerrain[]).map(h => (
                                                    <MenuItem key={h} value={h}>
                                                        {h}
                                                    </MenuItem>
                                                ))}
                                            </Select>
                                        </FormControl>
                                    </Box>
                                )}

                                {fields.dtg1 && (
                                    <Box sx={{minWidth: 180, mt: 1}}>
                                        <FormControl fullWidth variant="outlined">
                                            <InputLabel htmlFor="starttime-input" shrink>
                                                Start Time (UTC)
                                            </InputLabel>
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
                                            <InputLabel htmlFor="endtime-input" shrink>
                                                End Time (UTC)
                                            </InputLabel>
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

                                {/*
                                 * Width and radius are read-outs, not inputs: the user
                                 * sizes a graphic by dragging it, and the hashed measure
                                 * line reports the number live while they do. Showing
                                 * them here as text closes the loop — you can check the
                                 * figure you dragged to — without a second way to set it
                                 * that would have to be kept in step with the geometry.
                                 */}
                                {fields.width && measured.width !== undefined && (
                                    <Box sx={{minWidth: 180, mt: 1}}>
                                        <Typography variant="caption" color="text.secondary">
                                            Width
                                        </Typography>
                                        <Typography id="width-readout" variant="body2">
                                            {formatDistance(measured.width)}
                                        </Typography>
                                    </Box>
                                )}

                                {/*
                                 * **A width the geometry cannot supply is typed instead.**
                                 * The read-out above exists because width is normally
                                 * derived — the corridor is that wide on the map, and a
                                 * second way to set it would have to be kept in step. The
                                 * safe lane is the exception the rule did not anticipate:
                                 * APP-06 290600 letters `AM`, the symbol is a single line,
                                 * and the plate's Example prints `4.5M` beside a lane with
                                 * no drawn width at all. Nothing measures it, so the
                                 * read-out never rendered and the field the plate asks for
                                 * could not be filled in.
                                 *
                                 * Gated on the measurement being absent rather than on a
                                 * graphic name, so it stays one control: a graphic that
                                 * measures its width still shows the read-out and no input,
                                 * and the two can never both appear.
                                 */}
                                {fields.width && measured.width === undefined && (
                                    <Box sx={{minWidth: 180, mt: 1}}>
                                        <FormControl fullWidth variant="outlined">
                                            <InputLabel htmlFor="width-input">Width (m)</InputLabel>
                                            <OutlinedInput
                                                id="width-input"
                                                label="Width (m)"
                                                inputProps={{inputMode: 'decimal'}}
                                                value={pendingChanges.labels.width ?? ''}
                                                onChange={e => {
                                                    // A width may be fractional -- the plate
                                                    // writes 4.5M -- so this keeps one
                                                    // decimal point rather than digits only.
                                                    const cleaned = e.target.value.replace(/[^0-9.]/g, '');
                                                    const [whole, ...rest] = cleaned.split('.');
                                                    const text = rest.length ? `${whole}.${rest.join('')}` : whole;
                                                    setPendingChanges(prev => ({
                                                        ...prev,
                                                        labels: {
                                                            ...prev.labels,
                                                            width: text === '' || text === '.' ? undefined : Number(text),
                                                        },
                                                    }));
                                                }}
                                            />
                                        </FormControl>
                                    </Box>
                                )}

                                {fields.length && measured.length !== undefined && (
                                    <Box sx={{minWidth: 180, mt: 1}}>
                                        <Typography variant="caption" color="text.secondary">
                                            Length
                                        </Typography>
                                        <Typography id="length-readout" variant="body2">
                                            {formatDistance(measured.length)}
                                        </Typography>
                                    </Box>
                                )}

                                {/*
                                  * Amplifier AN. Shown alongside the other shape read-outs
                                  * and for the same reason: the attitude is what the edge
                                  * handle swings, so a typed box here would need keeping in
                                  * step with the gesture. Degrees, where the plate quotes
                                  * mils — the same angle, converted where a host wants it.
                                  */}
                                {fields.attitude && measured.rotation !== undefined && (
                                    <Box sx={{minWidth: 180, mt: 1}}>
                                        <Typography variant="caption" color="text.secondary">
                                            Attitude
                                        </Typography>
                                        <Typography id="attitude-readout" variant="body2">
                                            {`${Math.round(((measured.rotation % 360) + 360) % 360)}°`}
                                        </Typography>
                                    </Box>
                                )}

                                {fields.radius && measured.radius !== undefined && (
                                    <Box sx={{minWidth: 180, mt: 1}}>
                                        <Typography variant="caption" color="text.secondary">
                                            Radius
                                        </Typography>
                                        <Typography id="radius-readout" variant="body2">
                                            {formatDistance(measured.radius)}
                                        </Typography>
                                    </Box>
                                )}

                                {fields.altitude1 && (
                                    <Box sx={{minWidth: 180, mt: 1}}>
                                        <FormControl fullWidth variant="outlined">
                                            <InputLabel htmlFor="min-altitude-input">
                                                {altitudeFieldLabel('Minimum', pendingChanges.labels.altitudeDatum)}
                                            </InputLabel>
                                            <OutlinedInput
                                                id="min-altitude-input"
                                                label={altitudeFieldLabel('Minimum', pendingChanges.labels.altitudeDatum)}
                                                inputProps={{inputMode: 'numeric'}}
                                                value={pendingChanges.labels.minAltitude ?? ''}
                                                onChange={e => {
                                                    // Digits in, a number out: the field is
                                                    // numeric and so is the property, so the
                                                    // conversion belongs at this one edge
                                                    // rather than everywhere downstream.
                                                    // Empty clears it rather than storing 0.
                                                    const digits = e.target.value.replace(/[^0-9]/g, '');
                                                    setPendingChanges(prev => ({
                                                        ...prev,
                                                        labels: {...prev.labels, minAltitude: digits === '' ? undefined : Number(digits)},
                                                    }));
                                                }}
                                            />
                                        </FormControl>
                                    </Box>
                                )}

                                {fields.altitude2 && (
                                    <Box sx={{minWidth: 180, mt: 1}}>
                                        <FormControl fullWidth variant="outlined">
                                            <InputLabel htmlFor="max-altitude-input">
                                                {altitudeFieldLabel('Maximum', pendingChanges.labels.altitudeDatum)}
                                            </InputLabel>
                                            <OutlinedInput
                                                id="max-altitude-input"
                                                label={altitudeFieldLabel('Maximum', pendingChanges.labels.altitudeDatum)}
                                                inputProps={{inputMode: 'numeric'}}
                                                value={pendingChanges.labels.maxAltitude ?? ''}
                                                onChange={e => {
                                                    // Digits in, a number out: the field is
                                                    // numeric and so is the property, so the
                                                    // conversion belongs at this one edge
                                                    // rather than everywhere downstream.
                                                    // Empty clears it rather than storing 0.
                                                    const digits = e.target.value.replace(/[^0-9]/g, '');
                                                    setPendingChanges(prev => ({
                                                        ...prev,
                                                        labels: {...prev.labels, maxAltitude: digits === '' ? undefined : Number(digits)},
                                                    }));
                                                }}
                                            />
                                        </FormControl>
                                    </Box>
                                )}

                                {(fields.altitude1 || fields.altitude2) && (
                                    <Box sx={{minWidth: 180, mt: 1}}>
                                        <FormControl fullWidth variant="outlined">
                                            <InputLabel id="altitude-datum-label">Measured from</InputLabel>
                                            <Select
                                                labelId="altitude-datum-label"
                                                label="Measured from"
                                                value={pendingChanges.labels.altitudeDatum ?? ''}
                                                onChange={e => {
                                                    const v = e.target.value as AltitudeDatum | '';
                                                    setPendingChanges(prev => ({
                                                        ...prev,
                                                        labels: {...prev.labels, altitudeDatum: v === '' ? undefined : v},
                                                    }));
                                                }}
                                            >
                                                {/* Unset renders the bare number and its unit, which is what a
                                                    graphic that does not care about a datum should show. */}
                                                <MenuItem value="">(none)</MenuItem>
                                                <MenuItem value={AltitudeDatum.meanSeaLevel}>MSL — above mean sea level</MenuItem>
                                                <MenuItem value={AltitudeDatum.aboveGroundLevel}>AGL — above ground level</MenuItem>
                                                <MenuItem value={AltitudeDatum.flightLevel}>FL — flight level</MenuItem>
                                            </Select>
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

                                {/*
                                  * **Grids only.** This block used to carry a "Unit Name" box as well,
                                  * bound to `secondDesignation` — the airspace coordination areas were
                                  * the only graphics with grids, and that was the sole way to type their
                                  * second name.
                                  *
                                  * They now declare `identifier2` outright, because both publications
                                  * give them two name fields and merely letter it differently (APP-06
                                  * `T2`, FM `T1`). Keeping this one would put the same value on screen
                                  * twice under two labels, each overwriting the other.
                                  */}
                                {fields.grids && (
                                    <>
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

                                {fields.rangeFan &&
                                    (() => {
                                        const config = pendingChanges.labels.rangeFan ?? defaultRangeFanConfig();
                                        const bands = config.bands ?? [];
                                        const isSector = selection.graphicName === TacticalGraphicName.WeaponSensorRangeFanSector;

                                        const updateConfig = (next: RangeFanConfig) => {
                                            setPendingChanges(prev => ({
                                                ...prev,
                                                labels: {...prev.labels, rangeFan: next},
                                            }));
                                        };
                                        const updateBand = (index: number, patch: Partial<RangeFanBand>) => {
                                            const nextBands = bands.map((b, i) => (i === index ? {...b, ...patch} : b));
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
                                                // A kilometre step, in metres — bands are metres as of 3.2.0.
                                                range: Math.max(1000, (last?.range ?? 0) + 1000),
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
                                                    <Box
                                                        key={i}
                                                        sx={{
                                                            mt: 1,
                                                            p: 1,
                                                            border: '1px solid rgba(255,255,255,0.12)',
                                                            borderRadius: 1,
                                                        }}
                                                    >
                                                        <Box sx={{display: 'flex', gap: 1, alignItems: 'flex-start'}}>
                                                            <FormControl variant="outlined" sx={{flex: 1, minWidth: 90}}>
                                                                <InputLabel htmlFor={`band-range-${i}`}>Range (m)</InputLabel>
                                                                <OutlinedInput
                                                                    id={`band-range-${i}`}
                                                                    label="Range (m)"
                                                                    type="number"
                                                                    inputProps={{step: 100, min: 0, inputMode: 'numeric'}}
                                                                    value={band.range ?? ''}
                                                                    onChange={e => {
                                                                        const v = e.target.value;
                                                                        if (v === '') {
                                                                            updateBand(i, {range: 0});
                                                                            return;
                                                                        }
                                                                        const metres = parseFloat(v);
                                                                        if (Number.isFinite(metres)) {
                                                                            updateBand(i, {range: metres});
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
                                                                    onChange={e => {
                                                                        // Digits in, a number out — the same edge
                                                                        // conversion the graphic's own altitudes get.
                                                                        const digits = e.target.value.replace(/[^0-9]/g, '');
                                                                        updateBand(i, {altitude: digits === '' ? undefined : Number(digits)});
                                                                    }}
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
                                                                        onChange={e =>
                                                                            updateBand(i, {leftAzimuthDeg: parseAzimuthInput(e.target.value)})
                                                                        }
                                                                    />
                                                                </FormControl>
                                                                <FormControl variant="outlined" sx={{flex: 1, minWidth: 90}}>
                                                                    <InputLabel htmlFor={`band-right-az-${i}`}>Right Az (° from N)</InputLabel>
                                                                    <OutlinedInput
                                                                        id={`band-right-az-${i}`}
                                                                        label="Right Az (° from N)"
                                                                        inputProps={{inputMode: 'decimal'}}
                                                                        value={band.rightAzimuthDeg !== undefined ? String(band.rightAzimuthDeg) : ''}
                                                                        onChange={e =>
                                                                            updateBand(i, {rightAzimuthDeg: parseAzimuthInput(e.target.value)})
                                                                        }
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
                                                                onChange={e =>
                                                                    updateConfig({
                                                                        ...config,
                                                                        centerAzimuthDeg: parseAzimuthInput(e.target.value),
                                                                    })
                                                                }
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
