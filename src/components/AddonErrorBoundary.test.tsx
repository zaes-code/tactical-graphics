import React from 'react';
import {render, screen} from '@testing-library/react';
import AddonErrorBoundary from './AddonErrorBoundary';

describe('AddonErrorBoundary', () => {
    it('shows a failed lazy add-on in place of the app going blank', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const Broken = React.lazy(() => Promise.reject(new Error('Failed to fetch dynamically imported module')));
        render(
            <div>
                <span>rest of the demo</span>
                <AddonErrorBoundary label="Cesium 3D">
                    <React.Suspense fallback={null}>
                        <Broken/>
                    </React.Suspense>
                </AddonErrorBoundary>
            </div>,
        );
        expect((await screen.findByRole('alert')).textContent).toContain('Cesium 3D failed to load.');
        expect(screen.getByText(/dynamically imported module/)).toBeTruthy();
        expect(screen.getByRole('button', {name: 'Retry'})).toBeTruthy();
        expect(screen.getByText('rest of the demo')).toBeTruthy();
    });

    it('renders its children when nothing fails', () => {
        render(<AddonErrorBoundary label="NVG"><span>panel</span></AddonErrorBoundary>);
        expect(screen.getByText('panel')).toBeTruthy();
    });
});
