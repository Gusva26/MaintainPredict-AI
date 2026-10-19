import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { OrderView } from '@/components/technician/OrderView';

/**
 * Regresión de H-K1: subir una foto NO debe completar la orden.
 *
 * El fallo original llamaba a `PUT /api/orders/:id/complete` desde el
 * `onUploaded` de `PhotoUpload`, así que el técnico podía cerrar la orden sin
 * los 6 pasos del checklist. Ahora la foto se acumula y solo viaja en el mismo
 * `PUT /complete` que dispara el checklist.
 */

const state = vi.hoisted(() => ({ apiPut: vi.fn(), order: null as any }));

vi.mock('swr', () => ({
  default: () => ({ data: { data: { items: [state.order] } }, isLoading: false, mutate: vi.fn() }),
}));

vi.mock('@/lib/hooks/useSession', () => ({
  useSession: () => ({ session: { id: 2, email: 'tec1@mp.ai', name: 'Carlos Técnico', role: 'technician' } }),
}));

vi.mock('@/lib/api/client', () => ({
  fetcher: vi.fn(),
  apiPut: state.apiPut,
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

state.order = {
  orderId: 159,
  status: 'approved',
  priority: 'high',
  scheduledDate: '2026-10-20T08:00:00.000Z',
  notes: null,
  equipment: { name: 'Bomba centrífuga', location: 'Sala A' },
};

describe('OrderView — foto y checklist', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    state.apiPut.mockReset();
    state.apiPut.mockResolvedValue({});
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { url: '/uploads/foto.png' } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    (globalThis.URL as any).createObjectURL = vi.fn(() => 'blob:preview');
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  function subirFoto(container: HTMLElement) {
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    const file = new File(['contenido'], 'foto.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [file] } });
  }

  it('subir una foto no completa la orden', async () => {
    const { container } = render(<OrderView />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir checklist' }));

    subirFoto(container);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByAltText('Previsualización')).toBeInTheDocument());
    expect(state.apiPut).not.toHaveBeenCalled();
  });

  it('al completar el checklist envía las notas y la foto pendiente', async () => {
    const { container } = render(<OrderView />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir checklist' }));

    subirFoto(container);
    await waitFor(() => expect(screen.getByAltText('Previsualización')).toBeInTheDocument());

    const pasos = screen.getAllByRole('checkbox');
    expect(pasos).toHaveLength(6);
    for (const paso of pasos) fireEvent.click(paso);

    fireEvent.click(screen.getByRole('button', { name: 'Completar orden' }));

    await waitFor(() => expect(state.apiPut).toHaveBeenCalledTimes(1));
    expect(state.apiPut).toHaveBeenCalledWith('/api/orders/159/complete', {
      notes: 'Checklist 6/6 · ',
      photos: ['/uploads/foto.png'],
    });
  });

  it('inicia la intervención de una orden aprobada (in_progress)', async () => {
    render(<OrderView />);
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar intervención' }));
    await waitFor(() => expect(state.apiPut).toHaveBeenCalledWith('/api/orders/159/start'));
  });
});
