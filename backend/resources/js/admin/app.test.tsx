import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminApp } from '@admin/app';

describe('AdminApp', () => {
    it('monta i provider e disegna qualcosa', () => {
        render(<AdminApp />);

        expect(screen.getByText('Gestionale KalTrack')).toBeDefined();
    });
});
