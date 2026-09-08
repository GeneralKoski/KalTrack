import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TagStato } from '@admin/components/TagStato';

describe('TagStato', () => {
    it('scrive lo stato in italiano', () => {
        render(<TagStato stato="pending" />);

        expect(screen.getByText('In attesa')).toBeDefined();
    });

    it('mostra com\'e\' arrivato uno stato che non conosce', () => {
        // Meglio la parola inglese di un trattino: cosi' si vede che il
        // server ne ha aggiunto uno, invece di credere che manchi.
        render(<TagStato stato="archived" />);

        expect(screen.getByText('archived')).toBeDefined();
    });
});
