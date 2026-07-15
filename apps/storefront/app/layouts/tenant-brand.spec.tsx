import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TenantBrand } from './tenant-brand';

describe('TenantBrand', () => {
  it('renders the tenant logo with the tenant name as alternative text', () => {
    const html = renderToStaticMarkup(
      <TenantBrand name="Studio One" logoUrl="https://cdn.example/studio-one.svg" />,
    );

    expect(html).toContain('src="https://cdn.example/studio-one.svg"');
    expect(html).toContain('alt="Studio One"');
  });

  it('falls back to the tenant name when no logo is configured', () => {
    const html = renderToStaticMarkup(<TenantBrand name="Studio One" logoUrl={null} />);

    expect(html).toContain('Studio One');
    expect(html).not.toContain('<img');
  });
});
