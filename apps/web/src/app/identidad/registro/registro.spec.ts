import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { Registro } from './registro';

describe('Registro', () => {
  it('si el enlace del correo no sirve, ofrece pedir otro', () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({ verificado: '0' }) } },
        },
      ],
    });

    const fixture = TestBed.createComponent(Registro);
    fixture.detectChanges();
    const elemento = fixture.nativeElement as HTMLElement;

    // Antes decía "regístrate de nuevo", pero registrarse otra vez con el mismo
    // correo solo manda un aviso, sin enlace.
    expect(elemento.textContent).not.toContain('Regístrate de nuevo');
    expect(elemento.querySelector('a[href="/verificar-correo"]')).not.toBeNull();
  });
});
