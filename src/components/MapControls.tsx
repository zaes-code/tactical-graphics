import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
    Badge,
    Box,
    Button,
    Checkbox,
    Chip,
    Dialog,
    DialogContent,
    DialogTitle,
    Divider,
    FormControlLabel,
    FormGroup,
    IconButton,
    InputAdornment,
    MenuItem,
    Paper,
    Select,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Tooltip,
    Typography,
} from '@mui/material';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import RotateLeftIcon from '@mui/icons-material/RotateLeft';
import OpenWithIcon from '@mui/icons-material/OpenWith';
import ZoomOutMapIcon from '@mui/icons-material/ZoomOutMap';
import EditIcon from '@mui/icons-material/Edit';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import GridViewIcon from '@mui/icons-material/GridView';
import CloseIcon from '@mui/icons-material/Close';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import FileUploadIcon from '@mui/icons-material/FileUpload';

import type {EditMode} from '@zaes/tactical-graphics';
import type {MapEngineCapabilities} from './mapEngine';
import {getDisplayName, TacticalGraphicHostility, TacticalGraphicName} from '@zaes/tactical-graphics';
import {GRAPHIC_CATEGORIES, TacticalGraphicCategory} from '@zaes/tactical-graphics';
import {getSpecifications, TacticalGraphicSpecification} from '@zaes/tactical-graphics';

interface Props {
    onDrawTacticalGraphics(): void;
    onShapeChange(name: TacticalGraphicName): void;
    onReset(): void;
    /** Hostility applied to every sample that accepts one; undefined = leave default. */
    onDrawSamples(hostility?: TacticalGraphicHostility): void;
    onClearAll(): void;
    /** Downloads every graphic on the map as a .geojson file. */
    onExportGeoJson(): void;
    /** Replaces everything on the map with the graphics in `file`. */
    onImportGeoJson(file: File): void;
    interactionMode: EditMode;
    isRotating: boolean;
    isResizing: boolean;
    isModifying: boolean;
    isRepositioning: boolean;
    defaultShape: TacticalGraphicName;
    onToggleInteraction(mode: EditMode): void;
    /**
     * What the live engine can actually do.
     *
     * The panel **grays** what an engine does not support and puts the reason on the
     * tooltip, rather than hiding it. A missing control reads as a different app; a
     * live control that silently does nothing is worse still. A disabled one with
     * "MapLibre has no draw interaction yet" is the honest version, and it makes the
     * state of the port visible from the UI. @see mapEngine.ts
     */
    capabilities: MapEngineCapabilities;
}

interface GraphicOption {
    label: string;
    value: TacticalGraphicName;
    category: string;
    /** The specifications that define this graphic — FM 1-02.2, APP-06, or both. */
    specifications: readonly TacticalGraphicSpecification[];
    isNew?: boolean;
}

// Graphics added in the latest batch — highlighted yellow for easy testing
const NEW_GRAPHICS = new Set<TacticalGraphicName>([
    /*TacticalGraphicName.Infiltration,
    TacticalGraphicName.MovementToContact,
    TacticalGraphicName.FrontalAttack,
    // TacticalGraphicName.FlankAttack,
    TacticalGraphicName.TurningMovement,
    TacticalGraphicName.Pursuit,
    TacticalGraphicName.Envelopment,
    // TacticalGraphicName.DoubleEnvelopment,
    TacticalGraphicName.MobileDefense,
    TacticalGraphicName.Ambush,
    TacticalGraphicName.ReliefInPlace,
    TacticalGraphicName.LimitedAccessArea,
    TacticalGraphicName.MovingConvoy,
    TacticalGraphicName.HaltedConvoy,
    // TacticalGraphicName.TargetReferencePoint,
    // TacticalGraphicName.PointTarget,
    TacticalGraphicName.LinearTarget,
    TacticalGraphicName.FinalProtectiveFire,
    TacticalGraphicName.LinearSmokeTarget,
    TacticalGraphicName.SmokeObscurantPresent,
    TacticalGraphicName.SmokeObscurantPlanned,
    TacticalGraphicName.GroupOrSeriesOfTargets,
    // TacticalGraphicName.SeriesOfTargets,
    // TacticalGraphicName.FireSupportStation,
    TacticalGraphicName.WeaponSensorRangeFanCircular,
    TacticalGraphicName.WeaponSensorRangeFanSector,
    TacticalGraphicName.AttackByFire,
    TacticalGraphicName.Destroy,
    TacticalGraphicName.Exfiltrate,
    TacticalGraphicName.FollowAndAssume,
    TacticalGraphicName.FollowAndSupport,
    TacticalGraphicName.Interdict,
    TacticalGraphicName.Neutralize,
    TacticalGraphicName.SupportByFire,
    TacticalGraphicName.Suppress,*/
]);

const CATEGORY_ORDER: string[] = Object.values(TacticalGraphicCategory);
const ALL_CATEGORIES: TacticalGraphicCategory[] = Object.values(TacticalGraphicCategory);

const ALL_SPECIFICATIONS: TacticalGraphicSpecification[] = Object.values(TacticalGraphicSpecification);

/**
 * How the panel filters by standard.
 *
 * Exclusive choices rather than a checkbox per specification, and the last three
 * are a genuine partition: every graphic is in both catalogues, or in exactly one.
 *
 * It was three options while every graphic in the registry was in FM 1-02.2 — an
 * "FM 1-02.2" tick box hid nothing then and read as broken. Now that NATO defines
 * seven the manual does not, both "only" halves are worth asking for.
 */
type SpecificationFilter = 'all' | 'both' | 'fmOnly' | 'app6Only';

const SPECIFICATION_FILTERS: {value: SpecificationFilter; label: string; help: string}[] = [
    {value: 'all', label: 'All', help: 'Every graphic in the registry'},
    {value: 'both', label: 'Both', help: 'Defined by FM 1-02.2 and NATO APP-06 alike'},
    {value: 'fmOnly', label: 'FM only', help: 'FM 1-02.2 defines these and APP-06 does not'},
    {value: 'app6Only', label: 'APP-06 only', help: 'NATO APP-06 defines these and FM 1-02.2 does not'},
];

function matchesSpecificationFilter(option: GraphicOption, filter: SpecificationFilter): boolean {
    if (filter === 'all') return true;
    const inApp6 = option.specifications.includes(TacticalGraphicSpecification.APP6);
    const inFm = option.specifications.includes(TacticalGraphicSpecification.FM1_02_2);
    if (filter === 'both') return inApp6 && inFm;
    if (filter === 'fmOnly') return inFm && !inApp6;
    return inApp6 && !inFm;
}

const LS_CATEGORIES = 'tg_enabledCategories';
const LS_SPECIFICATION_FILTER = 'tg_specificationFilter';

function loadEnabledCategories(): Set<TacticalGraphicCategory> {
    try {
        const raw = localStorage.getItem(LS_CATEGORIES);
        if (raw) {
            const parsed: unknown = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                const valid = (parsed as string[]).filter(c =>
                    ALL_CATEGORIES.includes(c as TacticalGraphicCategory)
                ) as TacticalGraphicCategory[];
                if (valid.length > 0) return new Set(valid);
            }
        }
    } catch {}
    return new Set(ALL_CATEGORIES);
}

function loadSpecificationFilter(): SpecificationFilter {
    try {
        const raw = localStorage.getItem(LS_SPECIFICATION_FILTER);
        if (raw && SPECIFICATION_FILTERS.some(f => f.value === raw)) return raw as SpecificationFilter;
    } catch {}
    return 'all';
}

const ALL_OPTIONS: GraphicOption[] = Object.values(TacticalGraphicName)
    .map(val => ({
        label: getDisplayName(val),
        value: val,
        category: GRAPHIC_CATEGORIES[val] ?? 'Other',
        specifications: getSpecifications(val),
        isNew: NEW_GRAPHICS.has(val),
    }))
    .sort((a, b) => {
        const ai = CATEGORY_ORDER.indexOf(a.category as TacticalGraphicCategory);
        const bi = CATEGORY_ORDER.indexOf(b.category as TacticalGraphicCategory);
        const order = (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        return order !== 0 ? order : a.label.localeCompare(b.label);
    });

const MapControls: React.FC<Props> = ({
    capabilities,
    onDrawTacticalGraphics,
    onShapeChange,
    onReset,
    onDrawSamples,
    onClearAll,
    onExportGeoJson,
    onImportGeoJson,
    interactionMode,
    onToggleInteraction,
    defaultShape,
}) => {
    // Hostility applied to the sample sweep. '' = leave every sample at its
    // default, which is the normal gallery view.
    const [sampleHostility, setSampleHostility] = useState<TacticalGraphicHostility | ''>('');

    const [selected, setSelected] = useState<GraphicOption | null>(
        ALL_OPTIONS.find(o => o.value === defaultShape) ?? null
    );
    const [search, setSearch] = useState('');
    const [filterOpen, setFilterOpen] = useState(false);
    const [enabledCategories, setEnabledCategories] = useState<Set<TacticalGraphicCategory>>(loadEnabledCategories);
    const [specificationFilter, setSpecificationFilter] = useState<SpecificationFilter>(loadSpecificationFilter);
    const listRef = useRef<HTMLDivElement>(null);
    /** The hidden file input the Import button clicks on the user's behalf. */
    const importInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        localStorage.setItem(LS_CATEGORIES, JSON.stringify(Array.from(enabledCategories)));
    }, [enabledCategories]);

    useEffect(() => {
        localStorage.setItem(LS_SPECIFICATION_FILTER, specificationFilter);
    }, [specificationFilter]);

    const visibleOptions = useMemo(
        () => ALL_OPTIONS.filter(o =>
            enabledCategories.has(o.category as TacticalGraphicCategory) &&
            matchesSpecificationFilter(o, specificationFilter)
        ),
        [enabledCategories, specificationFilter]
    );

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return visibleOptions;
        return visibleOptions.filter(o =>
            o.label.toLowerCase().includes(q) ||
            o.category.toLowerCase().includes(q)
        );
    }, [search, visibleOptions]);

    const hiddenCategoryCount = ALL_CATEGORIES.length - enabledCategories.size;
    /** Graphics the two filters are hiding between them — what the badge counts. */
    const hiddenGraphicCount = ALL_OPTIONS.length - visibleOptions.length;

    // Group filtered options by category, preserving CATEGORY_ORDER
    const groups = useMemo(() => {
        const map = new Map<string, GraphicOption[]>();
        for (const opt of filtered) {
            if (!map.has(opt.category)) map.set(opt.category, []);
            map.get(opt.category)!.push(opt);
        }
        return Array.from(map.entries());
    }, [filtered]);

    const handleSelect = (opt: GraphicOption) => {
        setSelected(opt);
        onShapeChange(opt.value);
    };

    const isDrawing = interactionMode === 'drawing';

    // **The button values are the modes.** They used to be strings this panel mapped on
    // and off a numeric enum through two switch blocks; `EditMode` is a string union, so
    // the toggle group's own value is already the answer.
    const EDIT_BUTTONS: EditMode[] = ['rotate', 'resize', 'translate', 'modify'];
    const activeEditMode = EDIT_BUTTONS.includes(interactionMode) ? interactionMode : null;

    const handleEditMode = (_: React.MouseEvent<HTMLElement>, newMode: string | null) => {
        // Re-pressing the selected button clears it, which is what a toggle group means
        // by handing back the mode that is already active.
        onToggleInteraction(newMode === null || newMode === activeEditMode ? 'view' : (newMode as EditMode));
    };

    const pointHint = selected ? getPointHint(selected.value) : null;

    return (
        <>
        <Paper
            elevation={0}
            sx={{
                position: 'absolute',
                top: 12,
                left: 12,
                zIndex: 1000,
                width: 300,
                maxHeight: 'calc(100vh - 80px)',
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: 'background.paper',
                borderRadius: 1.5,
                overflow: 'hidden',
            }}
        >
            {/* Header */}
            <Box sx={{
                px: 1.5, py: 1,
                borderBottom: 1,
                borderColor: 'divider',
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                flexShrink: 0,
            }}>
                <Box sx={{flexGrow: 1, minWidth: 0}}>
                    <Typography sx={{
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        color: 'primary.main',
                    }}>
                        Tactical Graphics
                    </Typography>
                    {/*
                     * The two standards this library implements. Worth stating in the
                     * header rather than burying in the filter: which catalogue a symbol
                     * comes from is the first thing a NATO user asks, and until now the
                     * app only ever claimed FM 1-02.2 by implication.
                     */}
                    <Typography sx={{fontSize: '0.6rem', letterSpacing: '0.06em', color: 'text.secondary', mt: 0.15}}>
                        {specificationFilter === 'fmOnly'
                            ? `${TacticalGraphicSpecification.FM1_02_2} only`
                            : specificationFilter === 'app6Only'
                                ? `${TacticalGraphicSpecification.APP6} only`
                                : ALL_SPECIFICATIONS.join(' · ')}
                    </Typography>
                </Box>
                <Tooltip title={hiddenGraphicCount > 0 ? `Filter graphics (${hiddenGraphicCount} hidden)` : 'Filter graphics'}>
                    <IconButton
                        size="small"
                        onClick={() => setFilterOpen(true)}
                        sx={{color: hiddenGraphicCount > 0 ? 'primary.main' : 'text.secondary', '&:hover': {color: 'primary.main'}}}
                    >
                        {/*
                         * A dot, not a count. Filtering to APP-06 hides 7 and filtering
                         * to FM-only hides 208, so a numeric badge renders "99+" for a
                         * filter that is working exactly as asked. The list already
                         * states how many graphics survive; the badge only needs to say
                         * that a filter is on.
                         */}
                        <Badge
                            variant="dot"
                            invisible={hiddenGraphicCount === 0}
                            color="primary"
                            sx={{'& .MuiBadge-badge': {minWidth: 6, height: 6}}}
                        >
                            <FilterAltIcon fontSize="small"/>
                        </Badge>
                    </IconButton>
                </Tooltip>
                <Tooltip title="Reset all graphics">
                    <IconButton size="small" onClick={onReset} sx={{color: 'text.secondary', '&:hover': {color: 'error.main'}}}>
                        <RestartAltIcon fontSize="small"/>
                    </IconButton>
                </Tooltip>
            </Box>

            <Box sx={{p: 1.5, pb: 1, flexShrink: 0}}>
                {/* Search input */}
                <TextField
                    size="small"
                    fullWidth
                    placeholder="Filter graphics…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    InputProps={{
                        startAdornment: (
                            <InputAdornment position="start">
                                <SearchIcon sx={{fontSize: 16, color: 'text.secondary'}}/>
                            </InputAdornment>
                        ),
                        endAdornment: search ? (
                            <InputAdornment position="end">
                                <IconButton size="small" onClick={() => setSearch('')} sx={{color: 'text.secondary', p: 0.25}}>
                                    <ClearIcon sx={{fontSize: 14}}/>
                                </IconButton>
                            </InputAdornment>
                        ) : null,
                        sx: {fontSize: '0.8rem'},
                    }}
                />

                {/* Result count */}
                <Typography sx={{fontSize: '0.65rem', color: 'text.secondary', mt: 0.5, px: 0.25}}>
                    {filtered.length} graphic{filtered.length !== 1 ? 's' : ''}
                    {search && ` matching "${search}"`}
                </Typography>
            </Box>

            {/* Scrollable graphics list */}
            <Box
                ref={listRef}
                sx={{
                    flex: 1,
                    overflowY: 'auto',
                    '&::-webkit-scrollbar': {width: 4},
                    '&::-webkit-scrollbar-track': {background: 'transparent'},
                    '&::-webkit-scrollbar-thumb': {background: 'divider', borderRadius: 2},
                }}
            >
                {groups.map(([category, options]) => (
                    <Box key={category}>
                        {/* Category header */}
                        <Box sx={{
                            px: 1.5,
                            py: 0.5,
                            position: 'sticky',
                            top: 0,
                            zIndex: 1,
                            backgroundColor: 'background.default',
                            borderBottom: 1,
                            borderColor: 'divider',
                        }}>
                            <Typography sx={{
                                fontSize: '0.62rem',
                                fontWeight: 700,
                                letterSpacing: '0.1em',
                                textTransform: 'uppercase',
                                color: 'text.secondary',
                            }}>
                                {category}
                                <Box component="span" sx={{color: 'text.disabled', fontWeight: 400, ml: 0.75}}>
                                    ({options.length})
                                </Box>
                            </Typography>
                        </Box>

                        {/* Items */}
                        {options.map(opt => {
                            const isSelected = selected?.value === opt.value;
                            return (
                                <Box
                                    key={opt.value}
                                    onClick={() => handleSelect(opt)}
                                    sx={{
                                        px: 1.5,
                                        py: '5px',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 0.75,
                                        backgroundColor: isSelected
                                            ? (theme) => theme.palette.mode === 'dark' ? '#0d2818' : '#dafbe1'
                                            : 'transparent',
                                        borderLeft: isSelected ? '2px solid' : '2px solid transparent',
                                        borderLeftColor: isSelected ? 'primary.main' : 'transparent',
                                        '&:hover': {
                                            backgroundColor: isSelected
                                                ? (theme) => theme.palette.mode === 'dark' ? '#0d2818' : '#dafbe1'
                                                : 'action.hover',
                                        },
                                    }}
                                >
                                    <Typography sx={{
                                        fontSize: '0.78rem',
                                        flexGrow: 1,
                                        color: opt.isNew ? '#ff5900' : isSelected ? 'text.primary' : 'text.primary',
                                        fontWeight: isSelected ? 600 : 400,
                                        lineHeight: 1.3,
                                    }}>
                                        {opt.label}
                                    </Typography>
                                    {opt.isNew && (
                                        <Typography sx={{
                                            fontSize: '0.55rem',
                                            fontWeight: 700,
                                            color: '#ff5900',
                                            opacity: 0.75,
                                            letterSpacing: '0.05em',
                                        }}>
                                            NEW
                                        </Typography>
                                    )}
                                </Box>
                            );
                        })}
                    </Box>
                ))}

                {filtered.length === 0 && (
                    <Box sx={{px: 2, py: 3, textAlign: 'center'}}>
                        <Typography sx={{fontSize: '0.78rem', color: 'text.disabled'}}>
                            No graphics match "{search}"
                        </Typography>
                    </Box>
                )}
            </Box>

            {/* Selected graphic info + actions */}
            <Box sx={{
                borderTop: 1,
                borderColor: 'divider',
                p: 1.5,
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
            }}>
                {/* Selected name + chips */}
                {selected ? (
                    <Box>
                        <Typography sx={{
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            color: selected.isNew ? '#ffd700' : 'text.primary',
                            mb: 0.5,
                        }}>
                            {selected.label}
                        </Typography>
                        <Box sx={{display: 'flex', gap: 0.5, flexWrap: 'wrap'}}>
                            {selected.isNew && (
                                <Chip label="NEW" size="small" sx={{
                                    fontSize: '0.6rem', fontWeight: 700, height: 18,
                                    backgroundColor: '#3a2e00', color: '#ffd700', border: '1px solid #9a7700',
                                }}/>
                            )}
                            {pointHint && (
                                <Chip
                                    icon={<InfoOutlinedIcon sx={{fontSize: '0.7rem !important'}}/>}
                                    label={pointHint}
                                    size="small"
                                    sx={{
                                        fontSize: '0.65rem', height: 18,
                                        backgroundColor: 'action.selected',
                                        color: 'text.secondary',
                                        border: 1,
                                        borderColor: 'divider',
                                        '& .MuiChip-icon': {color: 'text.secondary'},
                                    }}
                                />
                            )}
                        </Box>
                    </Box>
                ) : (
                    <Typography sx={{fontSize: '0.75rem', color: 'text.disabled'}}>
                        Select a graphic from the list above
                    </Typography>
                )}

                {/* Draw button — disabled outright on an engine with no draw interaction. */}
                {/*
                  * The `span` is required, not decorative: MUI's Tooltip listens to its
                  * child's events, and a disabled button fires none — so without a
                  * wrapper the tooltip explaining *why* it is disabled never appears,
                  * which is the one case it exists for.
                  */}
                <Tooltip title={capabilities.draw ? '' : capabilities.unsupportedReason ?? ''} placement="top">
                <Box component="span" sx={{display: 'block', width: '100%'}}>
                <Box
                    component="button"
                    onClick={onDrawTacticalGraphics}
                    disabled={!selected || !capabilities.draw}
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 0.75,
                        width: '100%',
                        py: 0.875,
                        px: 1.5,
                        border: 'none',
                        borderRadius: 1,
                        cursor: selected && capabilities.draw ? 'pointer' : 'not-allowed',
                        backgroundColor: isDrawing ? 'transparent' : 'primary.dark',
                        color: isDrawing ? 'primary.main' : '#ffffff',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        letterSpacing: '0.04em',
                        outline: isDrawing ? '1px solid' : 'none',
                        outlineColor: isDrawing ? 'primary.main' : 'transparent',
                        transition: 'background-color 0.15s',
                        '&:hover:not(:disabled)': {
                            backgroundColor: isDrawing
                                ? (theme) => theme.palette.mode === 'dark' ? '#112b1a' : '#ccffd8'
                                : 'primary.main',
                        },
                        '&:disabled': {opacity: 0.4},
                    }}
                >
                    <AddCircleOutlineIcon sx={{fontSize: 16}}/>
                    {isDrawing ? 'Drawing… (click to place points)' : 'Add Graphic'}
                </Box>
                </Box>
                </Tooltip>

                <Divider/>

                {/* Edit mode toggle */}
                <Box>
                    <Typography sx={{
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        color: 'text.secondary',
                        mb: 0.5,
                    }}>
                        Edit Mode
                    </Typography>
                    <ToggleButtonGroup
                        exclusive
                        value={activeEditMode}
                        onChange={handleEditMode}
                        size="small"
                        disabled={!capabilities.edit}
                        sx={{width: '100%', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)'}}
                    >
                        <Tooltip title={capabilities.edit ? 'Rotate' : capabilities.unsupportedReason ?? ''}>
                            <ToggleButton value="rotate" sx={{py: 0.75}}>
                                <RotateLeftIcon sx={{fontSize: 16}}/>
                            </ToggleButton>
                        </Tooltip>
                        <Tooltip title={capabilities.edit ? 'Resize' : capabilities.unsupportedReason ?? ''}>
                            <ToggleButton value="resize" sx={{py: 0.75}}>
                                <ZoomOutMapIcon sx={{fontSize: 16}}/>
                            </ToggleButton>
                        </Tooltip>
                        <Tooltip title={capabilities.edit ? 'Drag / Reposition' : capabilities.unsupportedReason ?? ''}>
                            <ToggleButton value="translate" sx={{py: 0.75}}>
                                <OpenWithIcon sx={{fontSize: 16}}/>
                            </ToggleButton>
                        </Tooltip>
                        <Tooltip title={capabilities.edit ? 'Edit' : capabilities.unsupportedReason ?? ''}>
                            <ToggleButton value="modify" sx={{py: 0.75}}>
                                <EditIcon sx={{fontSize: 16}}/>
                            </ToggleButton>
                        </Tooltip>
                    </ToggleButtonGroup>
                </Box>

                <Divider/>

                {/* Sample gallery — draws one of every proven graphic for a visual sweep */}
                <Box>
                    <Typography sx={{
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        color: 'text.secondary',
                        mb: 0.5,
                    }}>
                        Sample Gallery
                    </Typography>
                    {/* Draw the whole catalog at one hostility — a one-click check
                        that hostility rendering works everywhere it should. Graphics
                        without the field are drawn unchanged. */}
                    <Select
                        value={sampleHostility}
                        onChange={e => setSampleHostility(e.target.value as TacticalGraphicHostility | '')}
                        displayEmpty
                        size="small"
                        fullWidth
                        sx={{mb: 0.75, fontSize: '0.72rem'}}
                    >
                        <MenuItem value="" sx={{fontSize: '0.72rem'}}>Default hostility</MenuItem>
                        {Object.values(TacticalGraphicHostility).map(h => (
                            <MenuItem key={h} value={h} sx={{fontSize: '0.72rem'}}>{h}</MenuItem>
                        ))}
                    </Select>
                    <Box sx={{display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 0.75}}>
                        <Box
                            component="button"
                            onClick={() => onDrawSamples(sampleHostility || undefined)}
                            sx={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5,
                                py: 0.75, border: 1, borderColor: 'divider', borderRadius: 1, cursor: 'pointer',
                                backgroundColor: 'action.hover', color: 'text.primary',
                                fontSize: '0.72rem', fontWeight: 600,
                                '&:hover': {backgroundColor: 'primary.main', color: '#fff'},
                            }}
                        >
                            <GridViewIcon sx={{fontSize: 15}}/>
                            Draw all samples
                        </Box>
                        <Box
                            component="button"
                            onClick={onClearAll}
                            sx={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                py: 0.75, border: 1, borderColor: 'divider', borderRadius: 1, cursor: 'pointer',
                                backgroundColor: 'transparent', color: 'text.secondary',
                                fontSize: '0.72rem', fontWeight: 600,
                                '&:hover': {backgroundColor: 'error.main', color: '#fff', borderColor: 'error.main'},
                            }}
                        >
                            Clear all
                        </Box>
                    </Box>
                </Box>

                {/* Save / load. Deliberately a file rather than localStorage: the point is
                    to be able to open the GeoJSON and see exactly what persisted. */}
                <Box>
                    <Typography sx={{
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        color: 'text.secondary',
                        mb: 0.5,
                    }}>
                        Graphics Layer
                    </Typography>
                    <Box sx={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.75}}>
                        <Box
                            component="button"
                            onClick={onExportGeoJson}
                            sx={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5,
                                py: 0.75, border: 1, borderColor: 'divider', borderRadius: 1, cursor: 'pointer',
                                backgroundColor: 'action.hover', color: 'text.primary',
                                fontSize: '0.72rem', fontWeight: 600,
                                '&:hover': {backgroundColor: 'primary.main', color: '#fff'},
                            }}
                        >
                            <FileDownloadIcon sx={{fontSize: 15}}/>
                            Export
                        </Box>
                        <Box
                            component="button"
                            onClick={() => importInputRef.current?.click()}
                            sx={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5,
                                py: 0.75, border: 1, borderColor: 'divider', borderRadius: 1, cursor: 'pointer',
                                backgroundColor: 'action.hover', color: 'text.primary',
                                fontSize: '0.72rem', fontWeight: 600,
                                '&:hover': {backgroundColor: 'primary.main', color: '#fff'},
                            }}
                        >
                            <FileUploadIcon sx={{fontSize: 15}}/>
                            Import
                        </Box>
                    </Box>
                    <input
                        ref={importInputRef}
                        type="file"
                        accept=".geojson,.json,application/geo+json,application/json"
                        style={{display: 'none'}}
                        onChange={e => {
                            const file = e.target.files?.[0];
                            // Reset first, or picking the same file twice fires no change event.
                            e.target.value = '';
                            if (file) onImportGeoJson(file);
                        }}
                    />
                </Box>
            </Box>
        </Paper>

        {/* Specification + category filter modal */}
        <Dialog
            open={filterOpen}
            onClose={() => setFilterOpen(false)}
            maxWidth="xs"
            fullWidth
            PaperProps={{sx: {borderRadius: 1}}}
        >
            <DialogTitle sx={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1, pr: 1}}>
                <Typography sx={{fontSize: '0.875rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase'}}>
                    Filter Graphics
                </Typography>
                <IconButton onClick={() => setFilterOpen(false)} size="small" sx={{color: 'text.secondary', '&:hover': {color: 'text.primary'}}}>
                    <CloseIcon fontSize="small"/>
                </IconButton>
            </DialogTitle>

            <Divider/>

            <DialogContent sx={{pt: 1.5, pb: 2}}>
                <Typography sx={{fontSize: '0.7rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary', mb: 0.5}}>
                    Specification
                </Typography>
                <ToggleButtonGroup
                    size="small"
                    exclusive
                    fullWidth
                    value={specificationFilter}
                    onChange={(_, next) => {
                        // MUI hands back null when the active button is clicked again;
                        // keep the current filter rather than dropping to no selection.
                        if (next) setSpecificationFilter(next as SpecificationFilter);
                    }}
                    sx={{mb: 1}}
                >
                    {SPECIFICATION_FILTERS.map(({value, label, help}) => {
                        const count = ALL_OPTIONS.filter(o => matchesSpecificationFilter(o, value)).length;
                        return (
                            <Tooltip key={value} title={help}>
                                <ToggleButton value={value} sx={{fontSize: '0.68rem', py: 0.4, textTransform: 'none'}}>
                                    {label}
                                    <Box component="span" sx={{ml: 0.5, fontSize: '0.6rem', color: 'text.disabled'}}>
                                        {count}
                                    </Box>
                                </ToggleButton>
                            </Tooltip>
                        );
                    })}
                </ToggleButtonGroup>

                <Divider sx={{my: 1}}/>

                <Typography sx={{fontSize: '0.7rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary', mb: 0.5}}>
                    Category
                </Typography>
                <Box sx={{display: 'flex', gap: 1, mb: 1.5}}>
                    <Button
                        size="small"
                        variant="outlined"
                        onClick={() => setEnabledCategories(new Set(ALL_CATEGORIES))}
                        sx={{fontSize: '0.7rem', py: 0.25, borderColor: 'primary.dark', color: 'primary.main'}}
                    >
                        Select All
                    </Button>
                    <Button
                        size="small"
                        variant="outlined"
                        onClick={() => setEnabledCategories(new Set())}
                        sx={{fontSize: '0.7rem', py: 0.25, borderColor: 'divider', color: 'text.secondary'}}
                    >
                        Deselect All
                    </Button>
                </Box>
                <FormGroup>
                    {ALL_CATEGORIES.map(cat => {
                        const count = ALL_OPTIONS.filter(o => o.category === cat).length;
                        return (
                            <FormControlLabel
                                key={cat}
                                control={
                                    <Checkbox
                                        size="small"
                                        checked={enabledCategories.has(cat)}
                                        onChange={(_, checked) => {
                                            setEnabledCategories(prev => {
                                                const next = new Set(prev);
                                                if (checked) next.add(cat); else next.delete(cat);
                                                return next;
                                            });
                                        }}
                                        sx={{py: 0.25, color: 'text.disabled', '&.Mui-checked': {color: 'primary.main'}}}
                                    />
                                }
                                label={
                                    <Typography sx={{fontSize: '0.78rem', color: 'text.primary', lineHeight: 1.4}}>
                                        {cat}
                                        <Box component="span" sx={{ml: 0.75, fontSize: '0.65rem', color: 'text.disabled'}}>
                                            ({count})
                                        </Box>
                                    </Typography>
                                }
                            />
                        );
                    })}
                </FormGroup>
            </DialogContent>
        </Dialog>
        </>
    );
};

/** Returns a human-readable point-count hint for a graphic. */
function getPointHint(name: TacticalGraphicName): string | null {
    const twoPoint: TacticalGraphicName[] = [
        TacticalGraphicName.Bridge, TacticalGraphicName.Gap, TacticalGraphicName.AssaultCrossing,
        TacticalGraphicName.FordEasy, TacticalGraphicName.FordDifficult,
        TacticalGraphicName.TacticalBlock, TacticalGraphicName.Breach, TacticalGraphicName.Bypass,
        TacticalGraphicName.Canalize, TacticalGraphicName.Clear, TacticalGraphicName.TacticalDisrupt,
        TacticalGraphicName.Penetration, TacticalGraphicName.Exploitation,
        TacticalGraphicName.Delay, TacticalGraphicName.Withdraw, TacticalGraphicName.WithdrawUnderPressure,
        TacticalGraphicName.Disengage,
        TacticalGraphicName.Retirement,
        TacticalGraphicName.ForwardPassageOfLines, TacticalGraphicName.RearwardPassageOfLines,
        TacticalGraphicName.FerryCrossing, TacticalGraphicName.PassageLane,
        TacticalGraphicName.TacticalFix,
        // Table 5-19 obstacle effects — drawn exactly like the mission tasks above.
        TacticalGraphicName.Block, TacticalGraphicName.Disrupt, TacticalGraphicName.Fix,
        TacticalGraphicName.AttackByFire, TacticalGraphicName.SupportByFire,
        TacticalGraphicName.Exfiltrate,
        TacticalGraphicName.ReliefInPlace,
    ];
    // Placed, not drawn: one click drops a fixed-size badge.
    const onePoint: TacticalGraphicName[] = [
        TacticalGraphicName.Destroy, TacticalGraphicName.Interdict,
        TacticalGraphicName.Neutralize, TacticalGraphicName.Suppress,
    ];
    if (onePoint.includes(name)) return '1 point (click to place)';
    if (twoPoint.includes(name)) return '2 points';
    if (name === TacticalGraphicName.FieldsOfFire) return '3 points';
    // if (name === TacticalGraphicName.SearchArea) return '3 points';

    if (name.endsWith('Irregular') || name.endsWith('Rectangular') ||
        name === TacticalGraphicName.LimitedAccessArea ||
        name === TacticalGraphicName.SmokeObscurant ||
        name === TacticalGraphicName.GroupOrSeriesOfTargets) {
        return '3+ points (polygon)';
    }
    if (name.endsWith('Circular') ||
        name === TacticalGraphicName.Secure || name === TacticalGraphicName.Isolate ||
        name === TacticalGraphicName.AreaDefense ||
        name === TacticalGraphicName.Ambush ||
        name === TacticalGraphicName.MovementToContact ||
        name === TacticalGraphicName.Pursuit ||
        name === TacticalGraphicName.FightingPosition ||
        name === TacticalGraphicName.BaseDefenseZone ||
        name === TacticalGraphicName.TacticalTurn ||
        name === TacticalGraphicName.Turn ||
        name === TacticalGraphicName.Envelopment ||
        name === TacticalGraphicName.WeaponSensorRangeFanSector ||
        name === TacticalGraphicName.WeaponSensorRangeFanCircular// ||
        // name === TacticalGraphicName.TargetReferencePoint ||
        // name === TacticalGraphicName.PointTarget ||
        /*name === TacticalGraphicName.FireSupportStation*/) {
        return '2 points (center → edge)';
    }
    return null;
}

export default MapControls;
