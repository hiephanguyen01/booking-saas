import { createServer } from 'node:http';

const tenant = {
  id: 'tenant-e2e',
  name: 'Bookify E2E Studio',
  slug: 'bookify-e2e',
  vertical: 'studio',
  defaultLocale: 'vi',
  live: true,
  themeConfig: {
    colors: { primary: '#0ea5e9', accent: '#f97316', background: '#ffffff' },
    seo: { title: 'Bookify E2E Studio', description: 'Storefront integration fixture' },
  },
};

const types = [
  {
    id: 'type-studio',
    name: 'Studio',
    slug: 'studio',
    icon: null,
    unitLabel: 'giờ',
    sortOrder: 0,
    requiresIdentityVerification: false,
    attributeSchema: [],
  },
];

const server = createServer((request, response) => {
  response.setHeader('content-type', 'application/json; charset=utf-8');
  if (request.url === '/healthz') return response.end(JSON.stringify({ status: 'ok' }));
  if (request.url === '/public/tenant') return response.end(JSON.stringify(tenant));
  if (request.url === '/public/listing-types') return response.end(JSON.stringify(types));
  if (request.url?.startsWith('/public/listings')) return response.end(JSON.stringify([]));
  response.statusCode = 404;
  response.end(JSON.stringify({ error: 'not found' }));
});

server.listen(4010, '127.0.0.1');
