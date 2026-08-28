/**
 * # Which graphics report a radius, and which deliberately do not
 *
 * `RADIUS_GRAPHICS` drives **two** things that must never disagree: the `radius` field
 * on the Feature Properties dialog, and the hashed live read-out drawn under the cursor
 * during a resize. `MissionTaskGraphicBase.refreshMeasure` gates on the same list the
 * dialog reads, precisely so a graphic cannot report a distance in one place and not the
 * other — and MapLibre reads that list too, so all three answers come from one source.
 *
 * The case worth pinning is the **exclusion**. Movement to contact is sized by a radius
 * like every circular area here, so it looks like it belongs on the list; it does not,
 * because it is a badge rather than an area and FM 1-02.2 table 5-10 draws it with no
 * amplifier at all. A distance is not one of the things that symbol says.
 */
import {fromLonLat} from 'ol/proj';
import {LineString} from 'ol/geom';
import {TacticalGraphicName, hasRadiusReadout} from '@zaes/tactical-graphics';
import {getController} from './controllerRegistry';
import {getGraphicFields} from './graphicFieldRegistry';

const RESOLUTION = 100;
const CENTER = fromLonLat([-0.1, 51.5]);

/** Drops the graphic, arms the read-out the way a resize drag does, and looks. */
function measureAfterResizeGesture(name: TacticalGraphicName) {
    const controller = getController(name, RESOLUTION) as unknown as {
        graphic: {
            updateGeom: (o: {center: number[]; size?: number}) => void;
            showMeasure?: (active: boolean, anchor?: number[]) => void;
            measure: {getGeometry: () => LineString | undefined};
        };
    };
    controller.graphic.updateGeom({center: CENTER, size: 5000});
    controller.graphic.showMeasure?.(true, [CENTER[0] + 5000, CENTER[1]]);
    return controller.graphic.measure.getGeometry();
}

describe('the radius read-out', () => {
    it('is off for movement to contact, in the dialog and under the cursor alike', () => {
        expect(hasRadiusReadout(TacticalGraphicName.MovementToContact)).toBe(false);
        expect(getGraphicFields(TacticalGraphicName.MovementToContact).radius).toBe(false);
        // Armed exactly as a resize drag arms it, and it still draws nothing.
        expect(measureAfterResizeGesture(TacticalGraphicName.MovementToContact)).toBeUndefined();
    });

    it('is still on for the circular areas, which are measured by their radius', () => {
        expect(hasRadiusReadout(TacticalGraphicName.FreeFireAreaCircular)).toBe(true);
        expect(getGraphicFields(TacticalGraphicName.FreeFireAreaCircular).radius).toBe(true);
        expect(measureAfterResizeGesture(TacticalGraphicName.FreeFireAreaCircular)).toBeDefined();
    });

    it('is off for advance to contact, which is amplified by T and W/W1 instead', () => {
        expect(hasRadiusReadout(TacticalGraphicName.AdvanceToContact)).toBe(false);
        const fields = getGraphicFields(TacticalGraphicName.AdvanceToContact);
        expect(fields.radius).toBe(false);
        expect(fields.identifier1).toBe(true);
        expect(fields.dtg1).toBe(true);
        expect(fields.dtg2).toBe(true);
    });

    it('keeps the dialog and the read-out reading the same list', () => {
        // The invariant, across every registered graphic — not just the three above.
        for (const name of Object.values(TacticalGraphicName)) {
            expect(getGraphicFields(name).radius).toBe(hasRadiusReadout(name));
        }
    });
});
