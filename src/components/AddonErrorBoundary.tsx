import React from 'react';
import {Box, Button, Typography} from '@mui/material';

interface Props {
    /** What failed, for the message: an engine's or a tool's label. */
    label: string;
    children: React.ReactNode;
}

interface State {
    error: Error | null;
}

/**
 * Catches an add-on that fails to load or to render, so the rest of the demo keeps working.
 *
 * An add-on is loaded lazily, and a lazy import can fail: the dev server re-bundles its
 * dependencies when it finds a new one and answers stale requests with a 504. Without a
 * boundary that failure unmounts the whole app. **Retry reloads the page** because
 * `React.lazy` keeps a rejected import and would only throw it again.
 * @see demoAddons.ts
 */
class AddonErrorBoundary extends React.Component<Props, State> {
    state: State = {error: null};

    static getDerivedStateFromError(error: Error): State {
        return {error};
    }

    componentDidCatch(error: Error): void {
        console.error(`${this.props.label} failed:`, error);
    }

    render(): React.ReactNode {
        const {error} = this.state;
        if (!error) return this.props.children;
        return (
            <Box role="alert" sx={{p: 2, display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'flex-start', bgcolor: 'background.paper'}}>
                <Typography variant="subtitle1">{this.props.label} failed to load.</Typography>
                <Typography variant="body2" color="text.secondary" sx={{fontFamily: 'monospace', whiteSpace: 'pre-wrap'}}>{error.message}</Typography>
                <Button variant="contained" size="small" onClick={() => window.location.reload()}>Retry</Button>
            </Box>
        );
    }
}

export default AddonErrorBoundary;
