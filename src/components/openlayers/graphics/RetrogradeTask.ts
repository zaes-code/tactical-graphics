import openlayersAdapter from "../openlayersAdapter";
import {getLabel, getPaintFunction, TacticalGraphicName} from '@zaes/tactical-graphics';
import Feature from 'ol/Feature';
import {
    createBaseFeature,
    createFeature,
    createHandleFeature,
    retroGradeTaskStyleFunc
} from '../openlayerStyles';
import {MultiPoint} from "ol/geom";
import type {StyleFunction} from 'ol/style/Style';
import {asStyleFunction} from '../paintToOpenLayers';
import LineString from "ol/geom/LineString";
import {LineGraphic, pivotCoordinate, visiblePathHandles} from '../controllers/LineGraphicController';
import {assignRole, readGraphicLabels, writeGraphicProperties} from '../graphicProperties';


export class RetrogradeTask implements LineGraphic {
    rotation: number = 0;
    size: number = 1;
    /**
     * Which side of the drawn line the cane hangs on. User intent, so it is stamped and
     * replayed — and expressed relative to the line's bearing, so it survives rotation.
     * @see GeometryService.getCaneArrow
     */
    mirrored: boolean = false;

    /** @see TacticalGraphicHandler.setMirrored */
    setMirrored(mirrored: boolean) {
        if (mirrored === this.mirrored) return;
        this.mirrored = mirrored;
        this.updateGeometry();
        this.publish();
    }
    name: TacticalGraphicName;

    base: Feature<LineString> = <Feature<LineString>>createBaseFeature();
    graphic: Feature = createFeature();
    labels: Feature = assignRole(new Feature<MultiPoint>(), 'label');
    handles: Feature = <Feature<MultiPoint>>createHandleFeature();

    features: Feature[] = [];
    symbolId: string = '';
    /** @see LineGraphic.hidesStartHandle — set by LineGraphicController. */
    hidesStartHandle?: boolean;

    /**
     * @param style the paint to attach, for a graphic that draws this shape with its own.
     *
     * **344000 pursuit is why this is a parameter.** It is a cane arrow — a straight run with
     * a half circle hooked off its end — and it edits like one: three placed points, every
     * one a plain vertex. The only thing it does not share is the paint, since its arrowhead
     * carries a crossbar the seven retrograde tasks have none of. Copying this holder to
     * change one line would have made the *editing* a fact stated twice, which is the drift
     * that had pursuit behaving unlike its siblings in the first place.
     * (User's report, 2026-09-06.) @see pursuitStyleFunc
     */
    constructor(name: TacticalGraphicName, size: number, drawingResolution?: number, style?: StyleFunction) {
        this.name = name;
        this.size = size;
        if (drawingResolution !== undefined) {
            this.graphic.set('drawingResolution', drawingResolution);
        }
        this.setSymbolId('');
        this.graphic.setStyle(style ?? retroGradeTaskStyleFunc(getLabel(name)));
        /*
         * **A separate label paint, for the graphics whose letter is not in their line work.**
         *
         * The seven retrograde arrows draw their own letter inside the graphic paint, so this
         * holder never had a label feature worth styling and did not style one. 344000 pursuit
         * does not: its paint cuts the gap for the "P" and something else has to put the
         * letter in it. Moved onto this holder without that, it drew a run with a hole in the
         * middle and no label at all. (User's report, 2026-09-06.)
         *
         * `getPaintFunction(name).label` is the library's own statement of which graphics have
         * one — the same field MapLibre's `paintTacticalGraphic` reads to decide the identical
         * question, which is why the letter was never missing on that engine. Asked rather
         * than listed, so a graphic that grows a label paint later needs no edit here.
         * @see paintTacticalGraphic, pursuitPaint
         */
        /*
         * **Styled either way, because an unstyled feature is not an invisible one.** An
         * OpenLayers feature with no style falls back to the library default — a 5 px circle,
         * white at 40% inside a #3399CC stroke — and it draws that at every coordinate of
         * whatever geometry it holds. This feature held none until 2026-09-06, so the missing
         * style cost nothing; giving it the generator's label points put a small hollow blue
         * dot on the arc of all seven cane arrows, outside edit mode and in every screenshot.
         * (User's report, 2026-09-06.) An explicit empty style says "draws nothing" and means
         * it.
         */
        const labelPaint = getPaintFunction(name)?.label;
        this.labels.setStyle(labelPaint ? asStyleFunction(labelPaint, name) : () => []);
    }

    updateGeometry = () => {
        let tacticalGraphic = openlayersAdapter.getTacticalGraphic(
            this.name,
            this.base,
            {size: this.size, mirrored: this.mirrored}
        );
        if (!tacticalGraphic) return;

        let {graphic, handles, labels} = tacticalGraphic;

        this.graphic.setGeometry(graphic);
        let handleCoords = (handles as MultiPoint).getCoordinates();

        /*
         * **Every published grip, because every one is a point the operator placed.**
         *
         * This used to peel `handleCoords[0]` off into `offsetHandle` - the mirror handle,
         * whose only job was turning the symbol over - and publish the rest. Point 3 states
         * which side the arc falls on as of 2026-09-06, so there is nothing left to flip and
         * all three anchor points are ordinary shape grips. A legacy two-point base publishes
         * the two it has. @see RetrogradeTask.generateHandles
         */
        this.handles.setGeometry(new MultiPoint(visiblePathHandles(handleCoords, pivotCoordinate(this.name, this.base.getGeometry()?.getCoordinates()), this.hidesStartHandle)));
        // Only meaningful for a graphic that has a label paint; harmless for the rest, whose
        // label feature carries no style and so draws nothing whatever geometry it holds.
        this.labels.setGeometry(labels);
        // Persist the *effective* meter value, not the viewport factor it came from.
        // `size` starts life as `20 x drawingResolution`, but what the generator actually
        // consumed is a distance in meters — and that is what a snapshot can carry and a
        // restore can replay without knowing anything about zoom. Stamped on every
        // rebuild, not just on a width drag, so a graphic the user never touched still
        // describes itself.
        this.publish();
    };


    getBaseGraphicFeature = (): Feature<LineString> => {
        return this.base;
    }

    setSymbolId = (symbolId: string) => {
        this.symbolId = symbolId;
        this.getFeatures().forEach(feature => {
            feature.set('symbolId', this.symbolId);
        })
    }

    setBaseFeature(base: Feature<LineString>) {
        this.base.setGeometry(base.getGeometry());
        this.updateGeometry();
    }

    setOffset(offset: number) {
        this.size = offset;
        this.updateGeometry();
        // `size` here is the width the user dragged, not a construction-time constant,
        // so it has to be saved. Persisted as `decorationSize` — it sizes the drawn
        // decoration, and is not a reach from any center. @see TacticalGraphicProperties.
        this.publish();
    }

    /** Republishes the amplifiers with the geometry state beside them. */
    private publish() {
        /*
         * **`mirrored` only while the base cannot say it itself.**
         *
         * A three-point base states the arc's side by where point 3 is, so stamping the flag
         * beside it would be a second copy of the same fact and the two would drift. A base
         * saved before 2026-09-06 has two points and nothing else that carries the side, so
         * it keeps the flag until an edit grows its third point.
         *
         * `decorationSize` stays either way: it sizes the arrowhead, which is a screen
         * distance with nothing in the anchor points to recover it from.
         */
        const statesItsOwnSide = (this.base.getGeometry()?.getCoordinates()?.length ?? 0) >= 3;
        /*
         * **Dropped from the bag, not merely left out of the write.** `readGraphicLabels`
         * returns everything stamped on the feature, geometry inputs included, so a `mirrored`
         * written during the two-point half of the draw comes straight back in on the next
         * publish and re-stamps itself forever. Omitting it from the second argument is not
         * enough; it has to be taken out of the first. (Measured: every cane arrow still saved
         * `mirrored` after a clean three-click draw.)
         */
        const stamped = {...readGraphicLabels(this.graphic)};
        if (statesItsOwnSide) delete (stamped as {mirrored?: boolean}).mirrored;
        writeGraphicProperties(this.getFeatures(), this.name, stamped, {
            decorationSize: this.size,
            ...(statesItsOwnSide ? {} : {mirrored: this.mirrored}),
        });
    }

    getFeatures(): Feature[] {
        return [this.graphic, this.handles, this.labels, this.base];
    }

}