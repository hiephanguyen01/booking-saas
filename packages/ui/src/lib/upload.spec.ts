import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  removedImageValue,
  uploadedImageValue,
  validateImageUpload,
} from '../components/form/image-upload';
import { presignAndPut } from './upload';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('presignAndPut', () => {
  it('presigns, uploads the file, and returns the persisted URL', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            uploadUrl: 'https://storage.example.com/upload',
            key: 'partners/document.png',
            publicUrl: 'https://cdn.example.com/partners/document.png',
            expiresInSec: 300,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const file = new File(['image'], 'document.png', { type: 'image/png' });

    await expect(
      presignAndPut(file, { target: 'partners', presignEndpoint: '/uploads/presign' }),
    ).resolves.toEqual({
      key: 'partners/document.png',
      publicUrl: 'https://cdn.example.com/partners/document.png',
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/uploads/presign',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ target: 'partners', contentType: 'image/png' }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://storage.example.com/upload',
      expect.objectContaining({ method: 'PUT', body: file }),
    );
  });

  it('surfaces presign and storage failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ message: 'Không thể cấp quyền tải lên.' }), {
          status: 429,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    const file = new File(['image'], 'document.png', { type: 'image/png' });
    await expect(presignAndPut(file, { target: 'partners' })).rejects.toThrow(
      'Không thể cấp quyền tải lên.',
    );

    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              uploadUrl: 'https://storage.example.com/upload',
              key: 'partners/document.png',
              publicUrl: 'https://cdn.example.com/partners/document.png',
              expiresInSec: 300,
            }),
            { status: 200 },
          ),
        )
        .mockResolvedValueOnce(new Response(null, { status: 500 })),
    );
    await expect(presignAndPut(file, { target: 'partners' })).rejects.toThrow(
      'Tải tệp lên thất bại (500)',
    );
  });
});

describe('validateImageUpload', () => {
  it('accepts supported images and rejects invalid MIME types or oversized files', () => {
    const accept = ['image/png'];
    expect(
      validateImageUpload(new File(['ok'], 'ok.png', { type: 'image/png' }), accept, 1),
    ).toBeUndefined();
    expect(
      validateImageUpload(
        new File(['pdf'], 'document.pdf', { type: 'application/pdf' }),
        accept,
        1,
      ),
    ).toContain('Định dạng không hỗ trợ');
    expect(
      validateImageUpload(
        new File([new Uint8Array(1024 * 1024 + 1)], 'large.png', { type: 'image/png' }),
        accept,
        1,
      ),
    ).toBe('Tệp vượt quá 1MB');
  });
});

describe('image upload values', () => {
  it('replaces a single image and removes the selected image', () => {
    expect(
      uploadedImageValue(
        ['https://cdn.example.com/old.png'],
        false,
        'https://cdn.example.com/new.png',
      ),
    ).toBe('https://cdn.example.com/new.png');
    expect(removedImageValue(['https://cdn.example.com/new.png'], false, 0)).toBe('');
  });

  it('appends and removes images in multiple mode', () => {
    expect(uploadedImageValue(['one'], true, 'two')).toEqual(['one', 'two']);
    expect(removedImageValue(['one', 'two'], true, 0)).toEqual(['two']);
  });
});
