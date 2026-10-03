import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { Cuotas } from '../cuotas.service';
import { MorososPanel } from './morosos';

describe('MorososPanel', () => {
  // `value()` de un resource lanza en estado de error aunque tenga `defaultValue`.
  it('si la lista no carga, lo dice', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: Cuotas,
          useValue: { morosos: () => Promise.reject(new Error('la API no respondió')) },
        },
      ],
    });

    const fixture = TestBed.createComponent(MorososPanel);
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'No se pudieron cargar los socios con deuda',
    );
  });
});
