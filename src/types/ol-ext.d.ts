declare module 'ol-ext/interaction/Transform' {
    import {default as BaseInteraction} from 'ol/interaction/Interaction';
    import Feature from 'ol/Feature';
    import {Vector as VectorLayer} from 'ol/layer';
    import {Style} from 'ol/style';
    import Collection from 'ol/Collection';

    export interface TransformOptions {
        features?: Collection<Feature>;
        layers?: VectorLayer<any>[];
        style?: Style;
        translateFeature?: boolean;
        scale?: boolean;
        rotate?: boolean;
        stretch?: boolean;
        keepAspectRatio?: boolean;
        enableRotatedTransform?: boolean;
    }

    export default class Transform extends BaseInteraction {
        constructor(options?: TransformOptions);
    }
}
