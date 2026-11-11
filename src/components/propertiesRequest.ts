/**
 * # Opening the properties dialog without a click on the map
 *
 * A click on a graphic selects it for editing, so the dialog opens from the Properties
 * button on the selection box instead. That button lives above the map, outside every
 * engine's view, while each view mounts its own dialog with its own source. This joins the
 * two: the button asks for a graphic by its engine id, and whichever dialog is mounted opens
 * for it. @see EditAffordances, FeaturePropertiesSource.selectionFor
 */

type Listener = (id: string) => void;

const listeners = new Set<Listener>();

/** Opens the properties dialog for the graphic with engine id `id`. */
export function requestProperties(id: string): void {
    for (const listener of listeners) listener(id);
}

/** Called with each requested id. Returns an unsubscribe. */
export function onPropertiesRequest(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}
