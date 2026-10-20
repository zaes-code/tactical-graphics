import {TacticalGraphicName} from './type';

/**
 * The four graphics drawn as fields of fire's V: a vertex and two arrows, three anchor points.
 *
 * APP-06 has one, 140500, which draws a blade on the PT 1 to PT 2 leg. MIL-STD-2525E Change 1
 * (March 2025) made 140500 a grouping and coded the variants: 140501 Final Protective Fire
 * (Left), the same picture as 140500 and so the same graphic here; 140502 with the blade on the
 * other leg; 140503 Principal Direction of Fire, the plain V; and 140504 Secondary Direction of
 * Fire, the plain V dashed. They share the geometry, the handles and every edit rule.
 */
export const FIELD_OF_FIRE_GRAPHICS: readonly TacticalGraphicName[] = [
    TacticalGraphicName.FieldsOfFire,
    TacticalGraphicName.FinalProtectiveFireRight,
    TacticalGraphicName.PrincipalDirectionOfFire,
    TacticalGraphicName.SecondaryDirectionOfFire,
];

const FIELD_OF_FIRE = new Set<string>(FIELD_OF_FIRE_GRAPHICS);

/** Whether `name` is drawn as the fields-of-fire V. */
export function isFieldOfFire(name: TacticalGraphicName | string): boolean {
    return FIELD_OF_FIRE.has(name);
}

/**
 * Which leg carries the blade, by its far end's anchor point: 2 for the PT 1 to PT 2 leg, 3 for
 * the PT 1 to PT 3 leg. A graphic not listed has no blade.
 */
export const FIELD_OF_FIRE_BLADE: Readonly<Partial<Record<TacticalGraphicName, 2 | 3>>> = {
    [TacticalGraphicName.FieldsOfFire]: 2,
    [TacticalGraphicName.FinalProtectiveFireRight]: 3,
};
