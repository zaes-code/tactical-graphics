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
    Paper,
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

import {InteractionType} from './openlayers/TacticalGraphicsManager';
import {getDisplayName, TacticalGraphicName} from '@zaes-code/tactical-graphics';
import {GRAPHIC_CATEGORIES, TacticalGraphicCategory} from '@zaes-code/tactical-graphics';

interface Props {
    onDrawTacticalGraphics(): void;
    onShapeChange(name: TacticalGraphicName): void;
    onReset(): void;
    onDrawSamples(): void;
    onClearAll(): void;
    interactionMode: InteractionType;
    isRotating: boolean;
    isResizing: boolean;
    isModifying: boolean;
    isRepositioning: boolean;
    defaultShape: TacticalGraphicName;
    onToggleInteraction(mode: InteractionType): void;
}

interface GraphicOption {
    label: string;
    value: TacticalGraphicName;
    category: string;
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

const LS_CATEGORIES = 'tg_enabledCategories';

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

const ALL_OPTIONS: GraphicOption[] = Object.values(TacticalGraphicName)
    .map(val => ({
        label: getDisplayName(val),
        value: val,
        category: GRAPHIC_CATEGORIES[val] ?? 'Other',
        isNew: NEW_GRAPHICS.has(val),
    }))
    .sort((a, b) => {
        const ai = CATEGORY_ORDER.indexOf(a.category as TacticalGraphicCategory);
        const bi = CATEGORY_ORDER.indexOf(b.category as TacticalGraphicCategory);
        const order = (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        return order !== 0 ? order : a.label.localeCompare(b.label);
    });

const MapControls: React.FC<Props> = ({
    onDrawTacticalGraphics,
    onShapeChange,
    onReset,
    onDrawSamples,
    onClearAll,
    interactionMode,
    onToggleInteraction,
    defaultShape,
}) => {
    const [selected, setSelected] = useState<GraphicOption | null>(
        ALL_OPTIONS.find(o => o.value === defaultShape) ?? null
    );
    const [search, setSearch] = useState('');
    const [filterOpen, setFilterOpen] = useState(false);
    const [enabledCategories, setEnabledCategories] = useState<Set<TacticalGraphicCategory>>(loadEnabledCategories);
    const listRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        localStorage.setItem(LS_CATEGORIES, JSON.stringify(Array.from(enabledCategories)));
    }, [enabledCategories]);

    const visibleOptions = useMemo(
        () => ALL_OPTIONS.filter(o => enabledCategories.has(o.category as TacticalGraphicCategory)),
        [enabledCategories]
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

    const isDrawing = interactionMode === InteractionType.drawing;

    const activeEditMode: string | null = (() => {
        switch (interactionMode) {
            case InteractionType.rotate:    return 'rotate';
            case InteractionType.resize:    return 'resize';
            case InteractionType.translate: return 'translate';
            case InteractionType.modify:    return 'modify';
            default: return null;
        }
    })();

    const handleEditMode = (_: React.MouseEvent<HTMLElement>, newMode: string | null) => {
        if (newMode === null || newMode === activeEditMode) {
            onToggleInteraction(InteractionType.view);
        } else {
            switch (newMode) {
                case 'rotate':    onToggleInteraction(InteractionType.rotate); break;
                case 'resize':    onToggleInteraction(InteractionType.resize); break;
                case 'translate': onToggleInteraction(InteractionType.translate); break;
                case 'modify':    onToggleInteraction(InteractionType.modify); break;
            }
        }
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
                <Typography sx={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: 'primary.main',
                    flexGrow: 1,
                }}>
                    Tactical Graphics
                </Typography>
                <Tooltip title={hiddenCategoryCount > 0 ? `Filter categories (${hiddenCategoryCount} hidden)` : 'Filter categories'}>
                    <IconButton
                        size="small"
                        onClick={() => setFilterOpen(true)}
                        sx={{color: hiddenCategoryCount > 0 ? 'primary.main' : 'text.secondary', '&:hover': {color: 'primary.main'}}}
                    >
                        <Badge
                            badgeContent={hiddenCategoryCount > 0 ? hiddenCategoryCount : null}
                            color="primary"
                            sx={{'& .MuiBadge-badge': {fontSize: '0.55rem', minWidth: 14, height: 14, p: '0 3px'}}}
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

                {/* Draw button */}
                <Box
                    component="button"
                    onClick={onDrawTacticalGraphics}
                    disabled={!selected}
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
                        cursor: selected ? 'pointer' : 'not-allowed',
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
                        sx={{width: '100%', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)'}}
                    >
                        <Tooltip title="Rotate">
                            <ToggleButton value="rotate" sx={{py: 0.75}}>
                                <RotateLeftIcon sx={{fontSize: 16}}/>
                            </ToggleButton>
                        </Tooltip>
                        <Tooltip title="Resize">
                            <ToggleButton value="resize" sx={{py: 0.75}}>
                                <ZoomOutMapIcon sx={{fontSize: 16}}/>
                            </ToggleButton>
                        </Tooltip>
                        <Tooltip title="Drag / Reposition">
                            <ToggleButton value="translate" sx={{py: 0.75}}>
                                <OpenWithIcon sx={{fontSize: 16}}/>
                            </ToggleButton>
                        </Tooltip>
                        <Tooltip title="Modify vertices">
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
                    <Box sx={{display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 0.75}}>
                        <Box
                            component="button"
                            onClick={onDrawSamples}
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
            </Box>
        </Paper>

        {/* Category filter modal */}
        <Dialog
            open={filterOpen}
            onClose={() => setFilterOpen(false)}
            maxWidth="xs"
            fullWidth
            PaperProps={{sx: {borderRadius: 1}}}
        >
            <DialogTitle sx={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1, pr: 1}}>
                <Typography sx={{fontSize: '0.875rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase'}}>
                    Filter Categories
                </Typography>
                <IconButton onClick={() => setFilterOpen(false)} size="small" sx={{color: 'text.secondary', '&:hover': {color: 'text.primary'}}}>
                    <CloseIcon fontSize="small"/>
                </IconButton>
            </DialogTitle>

            <Divider/>

            <DialogContent sx={{pt: 1.5, pb: 2}}>
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
        TacticalGraphicName.TacticalFix, TacticalGraphicName.TacticalTurn,
        TacticalGraphicName.AttackByFire, TacticalGraphicName.Destroy, TacticalGraphicName.Neutralize,
        TacticalGraphicName.SupportByFire, TacticalGraphicName.Suppress, TacticalGraphicName.Interdict,
        TacticalGraphicName.FollowAndAssume, TacticalGraphicName.FollowAndSupport,
        TacticalGraphicName.Exfiltrate,
        TacticalGraphicName.ReliefInPlace,
    ];
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
